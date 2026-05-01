from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, JSON, Index
from sqlalchemy.sql import func
from app.base import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Analysis(Base):
    __tablename__ = "analyses"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    title = Column(String, nullable=True)
    status = Column(String, default="pending")
    is_public = Column(String, default="false")
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_analyses_user_id", "user_id"),
        Index("ix_analyses_status", "status"),
    )

class AudioFile(Base):
    __tablename__ = "audio_files"
    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)
    label = Column(String, nullable=True)
    file_path = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_audio_files_analysis_id", "analysis_id"),
    )

class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)
    status = Column(String, default="pending")
    error_msg = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_jobs_analysis_id", "analysis_id"),
    )

class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False)
    audio_file_id = Column(Integer, ForeignKey("audio_files.id"), nullable=False)
    waveform = Column(JSON, nullable=True)
    spectrogram = Column(JSON, nullable=True)
    loudness = Column(JSON, nullable=True)
    frequency = Column(JSON, nullable=True)
    rms_curve = Column(JSON, nullable=True)
    stereo = Column(JSON, nullable=True)
    sections = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_analysis_results_analysis_id", "analysis_id"),
    )

class AiVerdict(Base):
    __tablename__ = "ai_verdicts"
    id = Column(Integer, primary_key=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False, unique=True)
    winner_label = Column(String, nullable=True)
    confidence = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    per_version = Column(JSON, nullable=True)
    metric_interpretations = Column(JSON, nullable=True)
    prompt_version = Column(String, nullable=True)
    model_used = Column(String, nullable=True)
    output_length = Column(Integer, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())