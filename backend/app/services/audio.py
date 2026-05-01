import gc
import io
import math
import numpy as np
import librosa
import scipy.signal  # type: ignore[import-untyped]

SR_TARGET = 11025   # 11 kHz — halves RAM vs 22 kHz, still fine for comparison
N_FFT = 1024        # smaller FFT window — quarter the STFT memory
HOP = 256


def load_audio(data: bytes) -> tuple[np.ndarray, float]:
    """Load raw audio bytes into a numpy array at SR_TARGET."""
    y, sr = librosa.load(io.BytesIO(data), sr=SR_TARGET, mono=False)
    # y is shape (2, N) for stereo or (N,) for mono
    return y, sr


def to_mono(y: np.ndarray) -> np.ndarray:
    """Convert to mono by averaging channels."""
    if y.ndim == 2:
        return librosa.to_mono(y)
    return y


# ── 1. WAVEFORM ────────────────────────────────────────────────────────────────

def compute_waveform(y_mono: np.ndarray, n_points: int = 2000) -> list[float]:
    """
    RMS-chunk the signal into n_points buckets.
    Returns a list of floats between 0.0 and 1.0.
    This preserves peaks better than simple downsampling.
    """
    chunk_size = max(1, len(y_mono) // n_points)
    rms_vals = []
    for i in range(0, len(y_mono), chunk_size):
        chunk = y_mono[i : i + chunk_size]
        rms = float(np.sqrt(np.mean(chunk ** 2)))
        rms_vals.append(rms)
    rms_vals = rms_vals[:n_points]
    peak = max(rms_vals) if rms_vals else 1.0
    if peak == 0:
        peak = 1.0
    return [round(v / peak, 6) for v in rms_vals]


# ── 2. SPECTROGRAM ─────────────────────────────────────────────────────────────

def compute_spectrogram(y_mono: np.ndarray) -> dict:
    """
    Short-Time Fourier Transform converted to dB.
    Returns a 128×256 grid suitable for rendering as a heatmap.
    Also detects the high-frequency rolloff point (useful for spotting
    lossy-compressed files mastered as fake lossless).
    Reduced resolution vs original to stay within 512 MB RAM on free tier.
    """
    S = np.abs(librosa.stft(y_mono, n_fft=N_FFT, hop_length=HOP))
    S_db = librosa.amplitude_to_db(S, ref=np.max)

    freq_bins, time_frames = S_db.shape

    # Detect HF rolloff before downsampling
    mean_per_freq = S_db.mean(axis=1)
    rolloff_bin = int(np.argmax(mean_per_freq[::-1] > -80))
    rolloff_bin = freq_bins - rolloff_bin
    rolloff_hz = int(rolloff_bin * SR_TARGET / N_FFT)

    # Downsample to 128 freq bins × 256 time frames (quarter of original)
    fb = min(128, freq_bins)
    tf = min(256, time_frames)
    S_small = S_db[:fb, :tf].copy()

    # Free the large arrays immediately
    del S, S_db
    gc.collect()

    return {
        "data": S_small.tolist(),
        "shape": list(S_small.shape),
        "hf_rolloff_hz": rolloff_hz,
    }


# ── 3. LOUDNESS (DR14) ─────────────────────────────────────────────────────────

def compute_loudness(y_mono: np.ndarray, sr: float) -> dict:
    """
    DR14 Dynamic Range algorithm (industry standard for mastering engineers).
    Splits audio into 3-second blocks, computes RMS and peak per block,
    then: DR = avg_peak_dB - avg_rms_dB across all blocks.
    Also computes integrated LUFS (simplified), true peak dBTP, and crest factor.
    """
    block_size = int(sr) * 3
    rms_blocks = []
    peak_blocks = []

    for i in range(0, len(y_mono) - block_size + 1, block_size):
        block = y_mono[i : i + block_size]
        rms = float(np.sqrt(np.mean(block ** 2)))
        peak = float(np.max(np.abs(block)))
        if rms > 0:
            rms_blocks.append(rms)
            peak_blocks.append(peak)

    if not rms_blocks:
        return {"dr14": 0, "lufs": -99.0, "true_peak_dbtp": -99.0, "crest_factor": 0}

    avg_rms_db = 20 * math.log10(np.mean(rms_blocks))
    avg_peak_db = 20 * math.log10(np.mean(peak_blocks))
    dr14 = round(avg_peak_db - avg_rms_db, 2)

    # Integrated LUFS (K-weighted approximation — good enough for comparison)
    rms_total = float(np.sqrt(np.mean(y_mono ** 2)))
    lufs = round(-0.691 + 10 * math.log10(rms_total ** 2 + 1e-10), 2)

    # True peak (dBTP)
    true_peak = float(np.max(np.abs(y_mono)))
    true_peak_dbtp = round(20 * math.log10(true_peak + 1e-10), 2)

    # Crest factor
    rms_val = float(np.sqrt(np.mean(y_mono ** 2)))
    crest_factor = round(true_peak / (rms_val + 1e-10), 4)

    return {
        "dr14": dr14,
        "lufs": lufs,
        "true_peak_dbtp": true_peak_dbtp,
        "crest_factor": crest_factor,
    }


# ── 4. FREQUENCY RESPONSE ──────────────────────────────────────────────────────

def compute_frequency(y_mono: np.ndarray, sr: float) -> dict:
    """
    Welch's Power Spectral Density method.
    Much more stable than a single FFT snapshot — averages multiple overlapping
    windows. Returns 512 points normalized to 0 dB at 1 kHz reference.
    Also applies Savitzky-Golay smoothing (30ms window) for a clean curve.
    """
    freqs, psd = scipy.signal.welch(y_mono, fs=sr, nperseg=2048, noverlap=1024)

    # Normalize to 0 dB at 1 kHz
    ref_idx = int(np.argmin(np.abs(freqs - 1000)))
    ref_val = psd[ref_idx] if psd[ref_idx] > 0 else 1.0
    psd_db = 10 * np.log10(psd / ref_val + 1e-10)

    # Savitzky-Golay smoothing — window_length must be odd and < len(psd_db)
    sg_window = min(31, len(psd_db) if len(psd_db) % 2 == 1 else len(psd_db) - 1)
    psd_smooth = scipy.signal.savgol_filter(psd_db, window_length=sg_window, polyorder=3)

    # Downsample to 512 points
    n = min(512, len(freqs))
    idx = np.linspace(0, len(freqs) - 1, n, dtype=int)

    return {
        "freqs_hz": [round(float(freqs[i]), 2) for i in idx],
        "psd_db": [round(float(psd_smooth[i]), 4) for i in idx],
    }


# ── 5. RMS LOUDNESS CURVE ─────────────────────────────────────────────────────

def compute_rms_curve(y_mono: np.ndarray, sr: float) -> list[float]:
    """
    Short-time RMS in 20ms windows (frame-level loudness over time).
    Savitzky-Golay smoothed. Downsampled to 1000 points for transfer.
    """
    frame_length = int(sr * 0.020)   # 20ms
    hop_length = frame_length // 2

    rms = librosa.feature.rms(y=y_mono, frame_length=frame_length, hop_length=hop_length)[0]
    rms_db = 20 * np.log10(rms + 1e-10)

    sg_window = min(31, len(rms_db) if len(rms_db) % 2 == 1 else len(rms_db) - 1)
    if sg_window >= 4:
        rms_smooth = scipy.signal.savgol_filter(rms_db, window_length=sg_window, polyorder=3)
    else:
        rms_smooth = rms_db

    n = min(1000, len(rms_smooth))
    idx = np.linspace(0, len(rms_smooth) - 1, n, dtype=int)
    return [round(float(rms_smooth[i]), 4) for i in idx]


# ── 6. STEREO ANALYSIS ────────────────────────────────────────────────────────

def compute_stereo(y: np.ndarray) -> dict:
    """
    If stereo: compute mid/side RMS over time and phase correlation (-1 to +1).
    If mono: return is_mono=True.
    Stereo width metric: 1 - abs(correlation), range 0 (mono) to 1 (full stereo).
    """
    if y.ndim == 1 or (y.ndim == 2 and y.shape[0] == 1):
        return {"is_mono": True, "correlation": 1.0, "stereo_width": 0.0}

    left = y[0]
    right = y[1]
    mid = (left + right) / 2
    side = (left - right) / 2

    # Phase correlation
    l_norm = left / (np.std(left) + 1e-10)
    r_norm = right / (np.std(right) + 1e-10)
    correlation = round(float(np.mean(l_norm * r_norm)), 4)
    stereo_width = round(1.0 - abs(correlation), 4)

    # Mid/side RMS (downsampled to 500 points)
    def rms_curve(sig: np.ndarray, n: int = 500) -> list[float]:
        chunk = max(1, len(sig) // n)
        vals = []
        for i in range(0, len(sig), chunk):
            vals.append(round(float(np.sqrt(np.mean(sig[i:i+chunk] ** 2))), 6))
        return vals[:n]

    return {
        "is_mono": False,
        "correlation": correlation,
        "stereo_width": stereo_width,
        "mid_rms": rms_curve(mid),
        "side_rms": rms_curve(side),
    }


# ── 7. DYNAMIC SECTIONS ───────────────────────────────────────────────────────

def compute_sections(y_mono: np.ndarray, sr: float) -> list[dict]:
    """
    Label regions as quiet / load / peak based on RMS threshold.
    Uses the RMS per 3-second block (same blocks as DR14).
    Returns a list of {start_sec, end_sec, label} dicts.
    """
    block_size = int(sr) * 3
    sections = []
    rms_all = []

    for i in range(0, len(y_mono) - block_size + 1, block_size):
        block = y_mono[i : i + block_size]
        rms_all.append(float(np.sqrt(np.mean(block ** 2))))

    if not rms_all:
        return []

    rms_arr = np.array(rms_all)
    low_thresh = np.percentile(rms_arr, 25)
    high_thresh = np.percentile(rms_arr, 75)

    for idx, rms_val in enumerate(rms_all):
        if rms_val < low_thresh:
            label = "quiet"
        elif rms_val > high_thresh:
            label = "peak"
        else:
            label = "loud"
        sections.append({
            "start_sec": idx * 3,
            "end_sec": (idx + 1) * 3,
            "label": label,
            "rms": round(rms_val, 6),
        })

    return sections


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

def analyse_file(data: bytes) -> dict:
    """
    Run all algorithms on one audio file's raw bytes.
    Returns a dict with keys: waveform, spectrogram, loudness,
    frequency, rms_curve, stereo, sections.
    All NaN/Infinity values are replaced with None for safe JSON serialisation.
    Memory is freed aggressively between steps to stay within 512 MB on free tier.
    """
    y, sr = load_audio(data)
    # Free raw bytes immediately — no longer needed
    del data
    gc.collect()

    y_mono = to_mono(y)

    # Compute each metric then explicitly free intermediates
    waveform = compute_waveform(y_mono)
    spectrogram = compute_spectrogram(y_mono)
    gc.collect()

    loudness = compute_loudness(y_mono, sr)
    frequency = compute_frequency(y_mono, sr)
    rms_curve = compute_rms_curve(y_mono, sr)
    stereo = compute_stereo(y)
    sections = compute_sections(y_mono, sr)

    # Free audio arrays — results are already plain Python lists/dicts
    del y, y_mono
    gc.collect()

    result = {
        "waveform": waveform,
        "spectrogram": spectrogram,
        "loudness": loudness,
        "frequency": frequency,
        "rms_curve": rms_curve,
        "stereo": stereo,
        "sections": sections,
    }

    # Sanitise: replace NaN / Inf with None so JSON serialisation never breaks
    return _sanitise(result)


def _sanitise(obj):
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitise(v) for v in obj]
    return obj