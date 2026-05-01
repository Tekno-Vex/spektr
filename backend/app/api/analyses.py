import json
import os
import uuid

import magic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.base import SessionLocal
from app.models.models import Analysis, AudioFile, Job
from app.services.storage import upload_file
from app.tasks import process_analysis
from app.services.auth import decode_token
import redis as sync_redis

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

def get_optional_user_id(request: Request) -> int | None:
    """Returns user_id from Bearer token, or None if not authenticated."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        payload = decode_token(auth[7:])
        return int(payload["sub"])
    except Exception:
        return None

@router.post("/analyses", summary="Create a new analysis")
def create_analysis(
    request: Request,
    title: str = Form(None),
    db: Session = Depends(get_db),
):
    user_id = get_optional_user_id(request)
    analysis = Analysis(title=title, status="pending", user_id=user_id)
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

@router.get("/analyses", summary="Get analysis history for current user")
def list_analyses(
    request: Request,
    cursor: int | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    user_id = get_optional_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    query = (
        db.query(Analysis)
        .filter(
            Analysis.user_id == user_id,
            Analysis.deleted_at.is_(None),
        )
        .order_by(Analysis.id.desc())
    )
    if cursor:
        query = query.filter(Analysis.id < cursor)
    rows = query.limit(limit + 1).all()

    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1].id if has_more else None

    items = [
        {
            "id": r.id,
            "title": r.title,
            "status": r.status,
            "is_public": r.is_public,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"items": items, "next_cursor": next_cursor}

@router.get("/analyses/{analysis_id}/results", summary="Get analysis results")
def get_results(analysis_id: int, db: Session = Depends(get_db)):
    # Try Redis cache first (fast)
    r = sync_redis.from_url(os.getenv("REDIS_URL", "redis://redis:6379"))
    cache_key = f"results:{analysis_id}"
    cached = r.get(cache_key)
    r.close()

    if cached:
        return {"source": "cache", "results": json.loads(cached)}

    # Fallback: query the database
    from app.models.models import AnalysisResult
    rows = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.analysis_id == analysis_id)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No results yet for this analysis")

    results = [
        {
            "audio_file_id": row.audio_file_id,
            "waveform": row.waveform,
            "spectrogram": row.spectrogram,
            "loudness": row.loudness,
            "frequency": row.frequency,
            "rms_curve": row.rms_curve,
            "stereo": row.stereo,
            "sections": row.sections,
        }
        for row in rows
    ]
    return {"source": "db", "results": results}


@router.get("/analyses/{analysis_id}/verdict", summary="Get AI verdict for an analysis")
def get_verdict(analysis_id: int, db: Session = Depends(get_db)):
    from app.models.models import AiVerdict
    row = (
        db.query(AiVerdict)
        .filter(AiVerdict.analysis_id == analysis_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="No AI verdict found for this analysis")
    if row.status != "completed":
        raise HTTPException(status_code=404, detail=f"AI verdict status: {row.status}")
    return {
        "status": row.status,
        "winner_label": row.winner_label,
        "confidence": row.confidence,
        "summary": row.summary,
        "per_version": row.per_version,
        "metric_interpretations": row.metric_interpretations,
        "model_used": row.model_used,
        "prompt_version": row.prompt_version,
    }


@router.get("/analyses/{analysis_id}/verdict/stream", summary="Stream AI verdict generation")
def stream_verdict(analysis_id: int, db: Session = Depends(get_db)):
    from app.models.models import AiVerdict, AnalysisResult, AudioFile
    from app.services.ai import stream_verdict_tokens

    # If verdict already exists and is completed, return it immediately as a single chunk
    existing = (
        db.query(AiVerdict)
        .filter(AiVerdict.analysis_id == analysis_id)
        .first()
    )
    if existing and existing.status == "completed" and existing.summary:
        payload = json.dumps({
            "winner_label": existing.winner_label,
            "confidence": existing.confidence,
            "summary": existing.summary,
            "per_version": existing.per_version,
            "metric_interpretations": existing.metric_interpretations,
        })
        return StreamingResponse(iter([payload]), media_type="text/plain")

    # Otherwise stream live from Gemini
    rows = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.analysis_id == analysis_id)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No results found for this analysis")

    audio_files = (
        db.query(AudioFile)
        .filter(AudioFile.analysis_id == analysis_id)
        .all()
    )
    labels = [str(af.label or f"File {i + 1}") for i, af in enumerate(audio_files)]
    results = [
        {
            "loudness": row.loudness,
            "stereo": row.stereo,
            "frequency": row.frequency,
            "spectrogram": row.spectrogram,
            "sections": row.sections,
        }
        for row in rows
    ]

    def token_generator():
        try:
            for chunk in stream_verdict_tokens(results, labels):
                yield chunk
        except Exception as e:
            yield f"[AI unavailable: {e}]"

    return StreamingResponse(token_generator(), media_type="text/plain")
