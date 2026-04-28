import os
from celery import Celery

celery_app = Celery(
    "spektr",
    broker=os.getenv("REDIS_URL", "redis://redis:6379"),
    backend=os.getenv("REDIS_URL", "redis://redis:6379"),
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"