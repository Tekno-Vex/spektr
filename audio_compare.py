"""
=============================================================
  AUDIO COMPARISON TOOL
  Compare original vs remaster vs remix - spectrogram style
=============================================================

HOW TO USE:
1. Install dependencies (run this once in your terminal/command prompt):
      pip install librosa matplotlib numpy soundfile scipy

2. Edit the FILES and LABELS section below with your actual audio file paths

3. Run:  python audio_compare.py

OUTPUT: Saves a "audio_comparison.png" image in the same folder
=============================================================
"""

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import librosa
import librosa.display
import os
import sys

# ─────────────────────────────────────────────────────────────
#  ✏️  EDIT THIS SECTION — point to your audio files
# ─────────────────────────────────────────────────────────────

FILES = [
    r"C:\Users\kathi\OneDrive\Documents\Songs\Motörhead - Ace of Spades.mp3",   # ← change these
    r"C:\Users\kathi\OneDrive\Documents\Songs\Motörhead - Ace of Spades (40th Anniversary Master).mp3",   # ← to your actual
]

LABELS = [
    "Deluxe",
    "40th Anniversary Master",
]

# How many seconds to analyze (None = full track, a number like 30 = first 30s)
ANALYZE_SECONDS = 60

# Output image filename
OUTPUT_FILE = "audio_comparison.png"

# ─────────────────────────────────────────────────────────────
#  Colors for each version (add more if you have more files)
# ─────────────────────────────────────────────────────────────
PALETTE = [
    "#FF4444",   # red
    "#44DD44",   # green
    "#4488FF",   # blue
    "#FFAA22",   # orange
    "#CC44FF",   # purple
    "#22DDDD",   # cyan
]

CMAPS = ["Reds", "Greens", "Blues", "Oranges", "Purples", "GnBu"]

# ─────────────────────────────────────────────────────────────


def load_audio(path, duration=None):
    """Load mono audio, trimming silence from ends."""
    if not os.path.exists(path):
        sys.exit(f"\n❌ File not found:\n   {path}\n   Please check the path in the FILES list.\n")
    print(f"  Loading: {os.path.basename(path)} ...", end=" ", flush=True)
    y, sr = librosa.load(path, sr=None, mono=True, duration=duration)
    y, _ = librosa.effects.trim(y, top_db=40)
    print(f"✓  ({len(y)/sr:.1f}s @ {sr}Hz)")
    return y, sr


def rms_loudness(y, sr, hop=512):
    """RMS energy over time in dB."""
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    db  = librosa.amplitude_to_db(rms, ref=1.0)
    times = librosa.times_like(rms, sr=sr, hop_length=hop)
    return times, db


def dynamic_range(y, sr):
    """Rough DR metric: difference between peak and average RMS (in dB)."""
    peak_db = librosa.amplitude_to_db(np.max(np.abs(y)), ref=1.0)
    rms_db  = librosa.amplitude_to_db(np.sqrt(np.mean(y**2)), ref=1.0)
    return round(peak_db - rms_db, 1)


def avg_spectrum(y, n_fft=4096):
    """Average frequency spectrum across the whole file."""
    S = np.abs(librosa.stft(y, n_fft=n_fft))
    avg = np.mean(S, axis=1)
    return avg


def plot_comparison(files, labels, duration, output):
    n = len(files)
    assert n >= 2, "Please provide at least 2 files to compare."
    assert n <= 6, "Max 6 files supported."

    print(f"\n🎵 Loading {n} audio files...")
    audios = [load_audio(f, duration) for f in files]

    # ── Figure layout ──────────────────────────────────────────
    dark = "#111111"
    plt.rcParams.update({
        "figure.facecolor": dark,
        "axes.facecolor":   "#1a1a1a",
        "axes.edgecolor":   "#444444",
        "text.color":       "#eeeeee",
        "axes.labelcolor":  "#cccccc",
        "xtick.color":      "#999999",
        "ytick.color":      "#999999",
        "grid.color":       "#333333",
        "font.family":      "monospace",
    })

    fig = plt.figure(figsize=(max(16, 6*n), 20), facecolor=dark)
    fig.suptitle("AUDIO VERSION COMPARISON", fontsize=18, fontweight="bold",
                 color="#ffffff", y=0.98)

    outer = gridspec.GridSpec(5, 1, figure=fig,
                              hspace=0.55,
                              height_ratios=[1, 0.6, 1.4, 1.2, 1.4])

    # ── Row 0: Waveforms ───────────────────────────────────────
    print("\n📊 Plotting waveforms...")
    ax_wave = fig.add_subplot(outer[0])
    ax_wave.set_title("WAVEFORMS", fontsize=11, color="#aaaaaa", pad=6, loc="left")
    for i, ((y, sr), label) in enumerate(zip(audios, labels)):
        times = np.linspace(0, len(y)/sr, len(y))
        # Downsample for speed
        step = max(1, len(times)//10000)
        ax_wave.plot(times[::step], y[::step],
                     color=PALETTE[i], alpha=0.75, linewidth=0.5,
                     label=label)
    ax_wave.set_xlabel("Time (s)")
    ax_wave.set_ylabel("Amplitude")
    ax_wave.set_ylim(-1.15, 1.15)
    ax_wave.legend(loc="upper right", fontsize=9,
                   facecolor="#222222", edgecolor="#555555")
    ax_wave.grid(True, alpha=0.2)

    # ── Row 1: Dynamic Range bar chart ─────────────────────────
    print("📊 Calculating dynamic range...")
    ax_dr = fig.add_subplot(outer[1])
    ax_dr.set_title("DYNAMIC RANGE  (higher = more dynamic = less compressed)",
                    fontsize=10, color="#aaaaaa", pad=6, loc="left")
    drs = [dynamic_range(y, sr) for y, sr in audios]
    bars = ax_dr.bar(labels, drs, color=PALETTE[:n], alpha=0.85, edgecolor="#555555")
    for bar, val in zip(bars, drs):
        ax_dr.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.3,
                   f"{val} dB", ha="center", va="bottom",
                   color="#ffffff", fontsize=10, fontweight="bold")
    ax_dr.set_ylabel("DR (dB)")
    ax_dr.set_ylim(0, max(drs) * 1.25)
    ax_dr.grid(True, axis="y", alpha=0.2)

    # ── Row 2: Individual Spectrograms ─────────────────────────
    print("📊 Generating spectrograms (this may take a moment)...")
    inner_spec = gridspec.GridSpecFromSubplotSpec(1, n, subplot_spec=outer[2],
                                                  wspace=0.08)
    vmin, vmax = -80, 0
    spec_imgs = []
    for i, ((y, sr), label, cmap) in enumerate(zip(audios, labels, CMAPS)):
        ax = fig.add_subplot(inner_spec[i])
        D = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=2048)),
                                    ref=np.max)
        img = librosa.display.specshow(D, sr=sr, x_axis="time", y_axis="log",
                                       ax=ax, cmap=cmap, vmin=vmin, vmax=vmax)
        ax.set_title(label, fontsize=9, color=PALETTE[i], pad=4)
        if i > 0:
            ax.set_ylabel("")
            ax.set_yticklabels([])
        else:
            ax.set_title("SPECTROGRAMS\n" + label, fontsize=9,
                         color=PALETTE[i], pad=4)
        spec_imgs.append(img)
    # shared colorbar
    fig.colorbar(spec_imgs[-1], ax=fig.axes[-n:], format="%+2.0f dB",
                 label="Loudness (dB)", pad=0.01)

    # ── Row 3: RMS Loudness over time ──────────────────────────
    print("📊 Plotting loudness curves...")
    ax_rms = fig.add_subplot(outer[3])
    ax_rms.set_title("RMS LOUDNESS OVER TIME  (closer to 0 dB = more compressed/louder)",
                     fontsize=10, color="#aaaaaa", pad=6, loc="left")
    for i, ((y, sr), label) in enumerate(zip(audios, labels)):
        t, db = rms_loudness(y, sr)
        # smooth
        window = max(1, len(db)//300)
        db_smooth = np.convolve(db, np.ones(window)/window, mode="same")
        ax_rms.plot(t, db_smooth, color=PALETTE[i], linewidth=1.2,
                    alpha=0.9, label=label)
    ax_rms.set_xlabel("Time (s)")
    ax_rms.set_ylabel("dB")
    ax_rms.set_ylim(-60, 3)
    ax_rms.legend(loc="lower right", fontsize=9,
                  facecolor="#222222", edgecolor="#555555")
    ax_rms.grid(True, alpha=0.2)

    # ── Row 4: Frequency Response overlay ─────────────────────
    print("📊 Plotting frequency response...")
    ax_freq = fig.add_subplot(outer[4])
    ax_freq.set_title("AVERAGE FREQUENCY RESPONSE  (shape shows EQ/mastering differences)",
                      fontsize=10, color="#aaaaaa", pad=6, loc="left")
    for i, ((y, sr), label) in enumerate(zip(audios, labels)):
        n_fft = 4096
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        avg   = avg_spectrum(y, n_fft=n_fft)
        avg_db = librosa.amplitude_to_db(avg, ref=np.max)
        mask = freqs >= 20
        ax_freq.semilogx(freqs[mask], avg_db[mask],
                         color=PALETTE[i], linewidth=1.6,
                         alpha=0.9, label=label)
    ax_freq.set_xlabel("Frequency (Hz)")
    ax_freq.set_ylabel("Relative dB")
    ax_freq.set_xlim(20, min(sr//2 for (_, sr) in audios))
    ax_freq.set_ylim(-50, 3)
    ax_freq.set_xticks([31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
    ax_freq.set_xticklabels(["31", "63", "125", "250", "500",
                              "1k", "2k", "4k", "8k", "16k"], fontsize=8)
    ax_freq.legend(loc="lower left", fontsize=9,
                   facecolor="#222222", edgecolor="#555555")
    ax_freq.grid(True, which="both", alpha=0.2)

    # ── Legend footer ──────────────────────────────────────────
    fig.text(0.5, 0.005,
             "Generated with audio_compare.py  •  librosa + matplotlib",
             ha="center", fontsize=8, color="#555555")

    print(f"\n💾 Saving image → {output}")
    plt.savefig(output, dpi=150, bbox_inches="tight", facecolor=dark)
    print(f"✅ Done! Open '{output}' to see your comparison.\n")


# ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    plot_comparison(FILES, LABELS, ANALYZE_SECONDS, OUTPUT_FILE)
