import json
import os
import pathlib
from typing import Iterator

import google.generativeai as genai  # type: ignore[import-untyped]
from pydantic import BaseModel, ValidationError

# Load the versioned prompt template
_PROMPT_DIR = pathlib.Path(__file__).parent.parent / "prompts"
_PROMPT_V1 = (_PROMPT_DIR / "verdict_v1.txt").read_text()
PROMPT_VERSION = "v1"
MODEL_NAME = "gemini-2.5-flash"


def _get_client() -> genai.GenerativeModel:
    api_key = os.getenv("GEMINI_API_KEY", "")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(MODEL_NAME)


# ── Pydantic schema for validating the LLM output ────────────────────────────

class VersionVerdict(BaseModel):
    label: str
    score: int
    strengths: list[str]
    weaknesses: list[str]
    best_for: str


class MetricInterpretations(BaseModel):
    dynamic_range: str
    loudness: str
    frequency: str
    stereo: str


class VerdictSchema(BaseModel):
    winner_label: str
    confidence: str
    summary: str
    versions: list[VersionVerdict]
    metric_interpretations: MetricInterpretations


# ── Build the user message from computed results ──────────────────────────────

def _build_user_message(results: list[dict], labels: list[str]) -> str:
    lines = ["Here are the computed audio metrics for each version:\n"]
    for i, (result, label) in enumerate(zip(results, labels)):
        loudness = result.get("loudness", {})
        stereo = result.get("stereo", {})
        lines.append(f"--- {label} ---")
        lines.append(f"  DR14 (dynamic range): {loudness.get('dr14', 'N/A')}")
        lines.append(f"  Integrated LUFS: {loudness.get('lufs', 'N/A')} LUFS")
        lines.append(f"  True Peak: {loudness.get('true_peak_dbtp', 'N/A')} dBTP")
        lines.append(f"  Crest Factor: {loudness.get('crest_factor', 'N/A')}")
        lines.append(f"  Is Mono: {stereo.get('is_mono', 'N/A')}")
        lines.append(f"  Stereo Width: {stereo.get('stereo_width', 'N/A')}")
        lines.append(f"  Phase Correlation: {stereo.get('correlation', 'N/A')}")
        hf = result.get("spectrogram", {}).get("hf_rolloff_hz", "N/A")
        lines.append(f"  HF Rolloff: {hf} Hz")
        sections = result.get("sections", [])
        peak_count = sum(1 for s in sections if s.get("label") == "peak")
        quiet_count = sum(1 for s in sections if s.get("label") == "quiet")
        lines.append(f"  Dynamic sections: {peak_count} peak, {quiet_count} quiet out of {len(sections)} total")
        lines.append("")
    return "\n".join(lines)


# ── Generate verdict (non-streaming, for Celery task) ────────────────────────

def generate_verdict(results: list[dict], labels: list[str]) -> VerdictSchema:
    """
    Call Gemini and parse the response with Pydantic validation.
    Retries up to 2 times if the output is invalid JSON or fails schema validation.
    Raises ValueError if all retries fail.
    """
    client = _get_client()
    user_message = _build_user_message(results, labels)
    full_prompt = f"{_PROMPT_V1}\n\n{user_message}"

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = client.generate_content(full_prompt)
            raw = response.text.strip()
            # Strip accidental markdown fences
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            parsed = json.loads(raw)
            return VerdictSchema(**parsed)
        except (json.JSONDecodeError, ValidationError, Exception) as e:
            last_error = e
            continue

    raise ValueError(f"Gemini returned invalid output after 3 attempts: {last_error}")


# ── Stream verdict tokens (for FastAPI streaming endpoint) ───────────────────

def stream_verdict_tokens(results: list[dict], labels: list[str]) -> Iterator[str]:
    """
    Stream raw token chunks from Gemini.
    Each yielded value is a text chunk (may be partial word).
    """
    client = _get_client()
    user_message = _build_user_message(results, labels)
    full_prompt = f"{_PROMPT_V1}\n\n{user_message}"

    response = client.generate_content(full_prompt, stream=True)
    for chunk in response:
        if chunk.text:
            yield chunk.text