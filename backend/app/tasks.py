import json
import os

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
    from app.models.models import AudioFile, AnalysisResult, Job
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
            result = analyse_file(data)

            _publish(r, channel, "Spectrogram")
            _publish(r, channel, "Loudness")
            _publish(r, channel, "Frequency")
            _publish(r, channel, "AI")

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
            all_results.append(result)

        db.commit()

        # Cache all results in Redis for 24 hours
        cache_key = f"results:{analysis_id}"
        r.setex(cache_key, 86400, json.dumps(all_results))

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