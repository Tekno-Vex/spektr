import numpy as np
from app.services.audio import (
    compute_waveform,
    compute_loudness,
    compute_frequency,
    compute_stereo,
    compute_sections,
    _sanitise,
)

SR = 22050

def sine_wave(freq=440, duration=6, sr=SR):
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return np.sin(2 * np.pi * freq * t).astype(np.float32)


def test_waveform_length():
    y = sine_wave()
    result = compute_waveform(y, n_points=2000)
    assert len(result) == 2000
    assert all(0.0 <= v <= 1.0 for v in result)


def test_loudness_dr14_sine():
    y = sine_wave()
    result = compute_loudness(y, SR)
    assert "dr14" in result
    assert "lufs" in result
    assert isinstance(result["dr14"], float)


def test_frequency_length():
    y = sine_wave()
    result = compute_frequency(y, SR)
    assert len(result["freqs_hz"]) == len(result["psd_db"])
    assert len(result["freqs_hz"]) <= 512


def test_stereo_mono_detection():
    y = sine_wave()
    result = compute_stereo(y)
    assert result["is_mono"] is True


def test_stereo_detection():
    left = sine_wave(440)
    right = sine_wave(880)
    y = np.stack([left, right])
    result = compute_stereo(y)
    assert result["is_mono"] is False
    assert -1.0 <= result["correlation"] <= 1.0


def test_sections_labels():
    y = sine_wave(duration=30)
    result = compute_sections(y, SR)
    assert len(result) > 0
    for s in result:
        assert s["label"] in ("quiet", "loud", "peak")


def test_sanitise_nan_inf():
    dirty = {"a": float("nan"), "b": float("inf"), "c": [float("-inf"), 1.0]}
    clean = _sanitise(dirty)
    assert clean["a"] is None
    assert clean["b"] is None
    assert clean["c"][0] is None
    assert clean["c"][1] == 1.0