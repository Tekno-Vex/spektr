# Spektr — Architecture

## System Overview

```
Browser (React SPA)
  │
  ├── Static assets ──────────────────────► Vercel CDN
  │                                         (builds from /frontend on every push to main)
  │
  └── API + WebSocket calls ───────────────► Render Web Service (FastAPI, port 8000)
                                                │
                          ┌─────────────────────┼──────────────────────┐
                          │                     │                      │
                   Supabase Postgres       Render Redis          Celery Worker
                  (SQLAlchemy ORM,        (Celery broker,        (same Docker image,
                   Alembic migrations)     pub/sub cache,         separate process)
                                           JWT denylist)               │
                                                              ┌────────┴────────┐
                                                              │                 │
                                                       Supabase Storage    Google Gemini
                                                       (audio file blobs)  2.5 Flash API
                                                              │
                                                    librosa + numpy + scipy
                                                    (DSP: waveform, spectrogram,
                                                     loudness, frequency, stereo)
```

---

## Services (docker-compose)

| Service | Image | Port | Role |
|---|---|---|---|
| `frontend` | node:20-alpine | 5173 | Vite dev server (React SPA) |
| `backend` | python:3.12-slim | 8000 | FastAPI + Alembic migrations on startup |
| `worker` | python:3.12-slim | — | Celery worker (audio processing) |
| `postgres` | postgres:16-alpine | 5432 | Primary database (local dev only) |
| `redis` | redis:7-alpine | 6379 | Celery broker + pub/sub + JWT denylist |

In production: Postgres → Supabase, Redis → Render Key Value, Worker → Render Background Worker.

---

## Key Design Decisions

### Stateless JWT Authentication
Access tokens (15 min TTL) are stored in JavaScript memory — never in localStorage or cookies. Refresh tokens (7-day TTL) are stored in HttpOnly cookies so JavaScript cannot read them (XSS protection). On logout, the refresh token is added to a Redis denylist so it cannot be reused even if intercepted. This design is horizontally scalable — no server-side session state.

### Async Audio Processing with Celery
Audio DSP (librosa STFT, Welch PSD, RMS) and the Gemini API call take 20–120 seconds per file. Running this synchronously inside FastAPI would block the request for the full duration and time out clients. Instead, `POST /process` enqueues a Celery task (returns immediately with `job_id`), and the frontend subscribes to a WebSocket that streams live progress stages from a Redis pub/sub channel.

### DSP Pipeline Design
`analyse_file(data: bytes) → dict` is the single entry point. librosa loads the audio at 22 050 Hz. Independent functions then compute each metric in sequence. All `NaN` and `Inf` values (common in logarithmic DSP calculations on silent regions) are sanitised to `null` via `_sanitise()` before storage, so the frontend never receives JSON with invalid number literals.

### Cache-Aside Pattern for Results
After a Celery job completes, results are serialised to JSON and cached in Redis under `results:{analysis_id}` with a 24-hour TTL. `GET /analyses/{id}/results` checks Redis first and falls back to Postgres if the key is missing. Cache hits are sub-10ms; Postgres fallback adds ~80ms.

### Supabase Storage via httpx (not the Supabase Python client)
The `supabase` Python client conflicts with `httpx >= 0.25`, which FastAPI/Starlette require. Instead, `storage.py` and `downloader.py` call the Supabase Storage REST API directly via `httpx` with `Authorization: Bearer {SUPABASE_KEY}`.

### AI via Gemini 2.5 Flash with Structured Output
The Gemini prompt includes the computed DSP metrics as JSON context. The model is instructed to return a structured JSON verdict (scores, strengths, weaknesses per version, overall winner with reasoning). The output is validated against a Pydantic schema before being stored. AI failures are isolated — they set the verdict row to `ai_failed` without aborting the DSP results, so users always get their charts even if AI is unavailable.

### Database Indexing (Sprint 6)
Composite indexes were added on `analyses.user_id`, `analyses.status`, `audio_files.analysis_id`, `jobs.analysis_id`, and `analysis_results.analysis_id`. These turn full-table scans into index seeks for all common query patterns (load user's analyses list, load results for an analysis).

---

## Data Flow: Upload to Results

```
1. User drops files on UploadZone (react-dropzone)
        │
2. POST /api/v1/analyses          → Analysis row created (linked to user if logged in)
        │
3. POST /api/v1/analyses/{id}/files  × N
        │  → MIME type validated via python-magic (not filename extension)
        │  → File uploaded to Supabase Storage
        │  → AudioFile row created with storage path
        │
4. POST /api/v1/analyses/{id}/process
        │  → Job row created (status: pending)
        │  → Celery task enqueued to Redis broker
        │  → Returns immediately
        │
5. WebSocket /ws/analyses/{id}
        │  → Frontend subscribes to Redis pub/sub channel analysis:{id}:progress
        │  → Exponential back-off reconnect (up to 5 retries, 30s max delay)
        │
6. Celery worker picks up task:
        │  Loading  → download audio bytes from Supabase
        │  Waveform → 2 000-point RMS envelope
        │  Spectrogram → 256×512 dB STFT grid
        │  Loudness → DR14, LUFS, True Peak, Crest Factor
        │  Frequency → Welch PSD, S-G smoothed, 512 points
        │  AI → Gemini 2.5 Flash verdict (streaming)
        │  Done → save AnalysisResult rows, cache in Redis, publish Done event
        │
7. Frontend receives Done event via WebSocket
        → navigate to /results/{id}
        → GET /api/v1/analyses/{id}/results  (Redis cache hit, ~8ms)
        → Render charts (Recharts + D3 + Canvas)
```

---

## Database Schema

```
users
  id, email, hashed_password, created_at

analyses                                    (index: user_id, status)
  id, user_id → users, title, status, created_at

audio_files                                 (index: analysis_id)
  id, analysis_id → analyses, label, file_path, mime_type, created_at

jobs                                        (index: analysis_id)
  id, analysis_id → analyses, status, error_msg, duration_ms, created_at

analysis_results                            (index: analysis_id, audio_file_id)
  id, analysis_id → analyses, audio_file_id → audio_files
  waveform (JSON), spectrogram (JSON), loudness (JSON),
  frequency (JSON), rms_curve (JSON), stereo (JSON), sections (JSON)
  created_at
```

### Migration chain
```
1f35ee457180 (initial tables)
  → b2f3e8a1c9d4 (add mime_type to audio_files)
    → 9e87bf669ba7 (add analysis_results table)
      → c3a1f2e8d7b5 (add rms_curve column)
        → efb22115ecc5 (add indexes + duration_ms to jobs)
```
