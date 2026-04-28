from app.services.celery_app import celery_app
import redis, os, json

STAGES = [
    ("Loading",      10),
    ("Waveform",     25),
    ("Spectrogram",  45),
    ("Loudness",     65),
    ("Frequency",    80),
    ("AI",           95),
    ("Done",        100),
]

@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def process_analysis(self, analysis_id: int, job_id: int):
    from app.base import SessionLocal
    from app.models.models import Job
    import time

    r = redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    db = SessionLocal()
    channel = f"analysis:{analysis_id}:progress"

    try:
        job = db.get(Job, job_id)
        job.status = "processing"
        db.commit()

        for stage, pct in STAGES:
            r.publish(channel, json.dumps({"stage": stage, "pct": pct}))
            time.sleep(1)   # placeholder — real work goes here in later sprints

        job.status = "completed"
        db.commit()

    except Exception as exc:
        job = db.get(Job, job_id)
        job.status = "failed"
        job.error_msg = str(exc)
        db.commit()
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
    finally:
        db.close()
        r.close()