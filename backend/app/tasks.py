import gc
import json
import os
import time

import redis

from app.services.celery_app import celery_app

STAGES = [
    "Loading",
    "Waveform",
    "Spectrogram",
    "Loudness",
    "Frequency",
    "AI",
    "Done",
]

STAGE_PCT = {s: round(i * 100 / (len(STAGES) - 1)) for i, s in enumerate(STAGES)}


def _publish(r, channel: str, stage: str):
    r.publish(channel, json.dumps({"stage": stage, "pct": STAGE_PCT[stage]}))


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def process_analysis(self, analysis_id: int, job_id: int):
    from app.base import SessionLocal
    from app.models.models import AudioFile, AnalysisResult, AiVerdict, Job
    from app.services.downloader import download_file
    from app.services.audio import analyse_file

    r = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    db = SessionLocal()
    channel = f"analysis:{analysis_id}:progress"

    try:
        job = db.get(Job, job_id)
        if job is None:
            raise ValueError(f"Job {job_id} not found")
        job.status = "processing"  # type: ignore[assignment]
        db.commit()
        started_at = time.monotonic()

        audio_files = (
            db.query(AudioFile)
            .filter(AudioFile.analysis_id == analysis_id)
            .all()
        )

        _publish(r, channel, "Loading")

        all_results = []
        for audio_file in audio_files:
            data = download_file(str(audio_file.file_path))

            _publish(r, channel, "Waveform")
            result = analyse_file(data)  # data freed inside analyse_file
            gc.collect()

            _publish(r, channel, "Spectrogram")
            _publish(r, channel, "Loudness")
            _publish(r, channel, "Frequency")

            ar = AnalysisResult(
                analysis_id=analysis_id,
                audio_file_id=audio_file.id,
                waveform=result["waveform"],
                spectrogram=result["spectrogram"],
                loudness=result["loudness"],
                frequency=result["frequency"],
                rms_curve=result["rms_curve"],
                stereo=result["stereo"],
                sections=result["sections"],
            )
            db.add(ar)
            # Keep only a lightweight summary for AI verdict (not the full spectrogram)
            all_results.append({
                "loudness": result["loudness"],
                "frequency": result["frequency"],
                "stereo": result["stereo"],
                "sections": result["sections"],
                "waveform": result["waveform"],
                "rms_curve": result["rms_curve"],
                "spectrogram": result["spectrogram"],
            })
            gc.collect()

        db.commit()

        # Cache all results in Redis for 24 hours
        cache_key = f"results:{analysis_id}"
        r.setex(cache_key, 86400, json.dumps(all_results))

        # AI verdict stage — call Gemini once with all files' metrics
        _publish(r, channel, "AI")
        labels = [str(af.label or f"File {i + 1}") for i, af in enumerate(audio_files)]
        ai_verdict_row = AiVerdict(
            analysis_id=analysis_id,
            status="pending",
            prompt_version="v1",
            model_used="gemini-2.5-flash",
        )
        db.add(ai_verdict_row)
        db.commit()
        db.refresh(ai_verdict_row)

        try:
            from app.services.ai import generate_verdict
            verdict = generate_verdict(all_results, labels)
            ai_verdict_row.winner_label = verdict.winner_label  # type: ignore[assignment]
            ai_verdict_row.confidence = verdict.confidence  # type: ignore[assignment]
            ai_verdict_row.summary = verdict.summary  # type: ignore[assignment]
            ai_verdict_row.per_version = [v.model_dump() for v in verdict.versions]  # type: ignore[assignment]
            ai_verdict_row.metric_interpretations = verdict.metric_interpretations.model_dump()  # type: ignore[assignment]
            ai_verdict_row.output_length = len(verdict.summary)  # type: ignore[assignment]
            ai_verdict_row.status = "completed"  # type: ignore[assignment]
        except Exception as ai_err:
            ai_verdict_row.status = "ai_failed"  # type: ignore[assignment]
            ai_verdict_row.summary = str(ai_err)  # type: ignore[assignment]

        db.commit()

        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        job.duration_ms = elapsed_ms  # type: ignore[assignment]
        _publish(r, channel, "Done")
        
        job.status = "completed"  # type: ignore[assignment]
        db.commit()

    except Exception as exc:
        job = db.get(Job, job_id)
        if job is not None:
            job.status = "failed"  # type: ignore[assignment]
            job.error_msg = str(exc)  # type: ignore[assignment]
            db.commit()
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
    finally:
        db.close()
        r.close()