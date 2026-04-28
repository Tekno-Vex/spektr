import os
import uuid

import magic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.base import SessionLocal
from app.models.models import Analysis, AudioFile, Job
from app.services.storage import upload_file
from app.tasks import process_analysis

router = APIRouter(tags=["analyses"])

ALLOWED_MIME_TYPES = {
    "audio/mpeg",
    "audio/flac",
    "audio/x-flac",
    "audio/wav",
    "audio/x-wav",
    "audio/ogg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
}

MAX_FILE_SIZE = 200 * 1024 * 1024  # 200 MB
MAX_FILES_PER_ANALYSIS = 5


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/analyses", summary="Create a new analysis")
def create_analysis(title: str = Form(None), db: Session = Depends(get_db)):
    analysis = Analysis(title=title, status="pending")
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    return {"id": analysis.id, "status": analysis.status}


@router.post("/analyses/{analysis_id}/files", summary="Upload one audio file to an analysis")
async def upload_analysis_file(
    analysis_id: int,
    file: UploadFile = File(...),
    label: str = Form(None),
    db: Session = Depends(get_db),
):
    analysis = db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    existing_count = (
        db.query(AudioFile).filter(AudioFile.analysis_id == analysis_id).count()
    )
    if existing_count >= MAX_FILES_PER_ANALYSIS:
        raise HTTPException(
            status_code=422,
            detail=f"Maximum {MAX_FILES_PER_ANALYSIS} files per analysis",
        )

    data = await file.read()

    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 200 MB limit")

    mime_type = magic.from_buffer(data, mime=True)
    if mime_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid file type '{mime_type}'. Only audio files are accepted.",
        )

    ext = os.path.splitext(file.filename or "")[1].lower()
    storage_path = f"analyses/{analysis_id}/{uuid.uuid4()}{ext}"
    upload_file(storage_path, data, mime_type)

    audio_file = AudioFile(
        analysis_id=analysis_id,
        label=label,
        file_path=storage_path,
        mime_type=mime_type,
    )
    db.add(audio_file)
    db.commit()
    db.refresh(audio_file)

    return {
        "id": audio_file.id,
        "file_path": storage_path,
        "mime_type": mime_type,
        "label": label,
    }


@router.post("/analyses/{analysis_id}/process", summary="Enqueue processing job")
def start_processing(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.get(Analysis, analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    job = Job(analysis_id=analysis_id, status="pending")
    db.add(job)
    db.commit()
    db.refresh(job)

    process_analysis.delay(analysis_id, job.id)

    return {"job_id": job.id, "status": "pending"}


@router.get("/analyses/{analysis_id}/status", summary="Get latest job status")
def get_status(analysis_id: int, db: Session = Depends(get_db)):
    job = (
        db.query(Job)
        .filter(Job.analysis_id == analysis_id)
        .order_by(Job.id.desc())
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="No job found for this analysis")
    return {"job_id": job.id, "status": job.status, "error_msg": job.error_msg}
