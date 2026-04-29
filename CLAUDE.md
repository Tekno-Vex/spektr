# CLAUDE.md — Spektr Project Context

This file documents every architectural decision, known quirk, and implementation detail
accumulated across Sprint 0, Sprint 1, Sprint 2, and Sprint 3. Read this before making any changes.

---

## Project Purpose

Spektr is an audio version comparison platform. Users upload two or more audio files
(original, remaster, remix, etc.), the backend processes them with DSP algorithms, and
the frontend renders waveforms, spectrograms, and loudness metrics side by side.

---

## Repository Structure

```
spektr/
├── .github/workflows/ci.yml       # GitHub Actions — backend + frontend jobs
├── backend/
│   ├── alembic/                   # Migration scripts (run automatically on startup)
│   │   └── versions/              # One file per migration; chain via down_revision
│   ├── app/
│   │   ├── api/analyses.py        # All REST endpoints
│   │   ├── models/models.py       # SQLAlchemy ORM models (classic Column style)
│   │   ├── services/
│   │   │   ├── audio.py           # DSP algorithms (librosa / numpy / scipy)
│   │   │   ├── celery_app.py      # Celery instance
│   │   │   ├── downloader.py      # Download from Supabase Storage via httpx
│   │   │   └── storage.py         # Upload to Supabase Storage via httpx
│   │   ├── base.py                # SQLAlchemy engine + SessionLocal
│   │   └── main.py                # FastAPI app, CORS, WebSocket endpoint
│   ├── tests/
│   │   ├── test_audio.py          # 7 unit tests for DSP functions
│   │   └── test_health.py         # Health endpoint smoke test
│   ├── Dockerfile                 # Multi-stage: builder → runner
│   ├── requirements.txt
│   ├── alembic.ini
│   └── start.sh                   # Runs migrations then uvicorn
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── UploadZone.tsx          # Upload flow + process trigger
│   │   │   ├── ResultsPage.tsx         # Sprint 3 full results dashboard
│   │   │   ├── SpectrogramCanvas.tsx   # Canvas renderer + D3 crosshair overlay
│   │   │   ├── WaveformChart.tsx       # Recharts waveform bars
│   │   │   ├── FrequencyChart.tsx      # Recharts frequency response + bands
│   │   │   ├── LoudnessCard.tsx        # DR bar, RMS curve, LUFS refs, winner badge
│   │   │   ├── StereoCard.tsx          # Gauges + canvas goniometer
│   │   │   └── SectionsTimeline.tsx    # Quiet/loud/peak timeline
│   │   ├── types.ts                    # Shared frontend result interfaces
│   │   ├── App.tsx
│   │   └── App.test.tsx
│   ├── Dockerfile
│   ├── vite.config.ts
│   └── package.json
├── .env                           # Never commit — gitignored
├── .env.example                   # Template for all required env vars
├── docker-compose.yml
└── README.md
```

---

## Services Overview (docker-compose)

| Service    | Image / Build         | Port  | Purpose                              |
|------------|-----------------------|-------|--------------------------------------|
| `postgres`  | postgres:16-alpine    | 5432  | Primary database                     |
| `redis`     | redis:7-alpine        | 6379  | Celery broker/backend + Pub/Sub cache |
| `backend`   | ./backend (runner)    | 8000  | FastAPI + Alembic migrations          |
| `worker`    | ./backend (runner)    | —     | Celery worker (audio processing)      |
| `frontend`  | ./frontend            | 5173  | React + Vite dev server               |

**Startup order:** `postgres` must pass its healthcheck before `backend` or `worker` start.
`redis` only requires `service_started`.

---

## Environment Variables

Defined in `.env` (copy from `.env.example`):

```
DATABASE_URL=postgresql://spektr:spektr@postgres:5432/spektr
REDIS_URL=redis://redis:6379
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_KEY=<service-role-key>
SUPABASE_BUCKET=analyses
```

`DATABASE_URL` uses the Docker Compose service name `postgres` — not `localhost`.
Alembic's `env.py` reads this variable at runtime to override the hardcoded
`sqlalchemy.url` in `alembic.ini`.

---

## API Endpoints

All endpoints are prefixed `/api/v1`.

| Method | Path                              | Description                                 |
|--------|-----------------------------------|---------------------------------------------|
| POST   | `/analyses`                       | Create a new analysis (returns `id`)        |
| POST   | `/analyses/{id}/files`            | Upload one audio file; validates MIME type  |
| POST   | `/analyses/{id}/process`          | Enqueue Celery processing job               |
| GET    | `/analyses/{id}/status`           | Latest job status (pending/processing/done) |
| GET    | `/analyses/{id}/results`          | Fetch analysis results (Redis cache or DB)  |
| GET    | `/health`                         | Health check                                |
| WS     | `/ws/analyses/{id}`               | Real-time processing progress via Pub/Sub   |

### File upload constraints
- Allowed MIME types: `audio/mpeg`, `audio/flac`, `audio/x-flac`, `audio/wav`,
  `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/m4a`
- Max file size: 200 MB
- Max files per analysis: 5
- MIME type is detected from file bytes via `python-magic` (not the filename extension)

---

## Database Schema

### Migrations chain
```
1f35ee457180  →  b2f3e8a1c9d4  →  9e87bf669ba7  →  c3a1f2e8d7b5
(initial)        (mime_type)       (analysis_results)  (rms_curve)
```

Always create a new migration file manually or via `alembic revision --autogenerate`
when adding columns. Never edit existing migration files.

### Models (classic SQLAlchemy Column style)

- **User** — `id, email, hashed_password, created_at`
- **Analysis** — `id, user_id, title, status, created_at`
- **AudioFile** — `id, analysis_id, label, file_path, mime_type, created_at`
- **Job** — `id, analysis_id, status, error_msg, created_at`
- **AnalysisResult** — `id, analysis_id, audio_file_id, waveform, spectrogram,
  loudness, frequency, rms_curve, stereo, sections, created_at`
  (all analysis columns are JSON / nullable)

**mypy note:** The classic `Column` style makes mypy report `Column[str]` for attribute
assignments (e.g. `job.status = "done"`). Suppress with `# type: ignore[assignment]`.

---

## Audio Processing Pipeline (`app/services/audio.py`)

`analyse_file(data: bytes) -> dict` is the single entry point called by the Celery task.
It returns a dict with these keys (all NaN/Inf replaced with `None` via `_sanitise`):

| Key          | What it contains                                              |
|--------------|---------------------------------------------------------------|
| `waveform`   | 2000 RMS-chunked floats, normalised 0–1 (preserves peaks)    |
| `spectrogram`| `{data, shape, hf_rolloff_hz}` — 256×512 dB grid via STFT   |
| `loudness`   | `{dr14, lufs, true_peak_dbtp, crest_factor}` — DR14 algo     |
| `frequency`  | `{freqs_hz, psd_db}` — Welch PSD, S-G smoothed, 512 points  |
| `rms_curve`  | 1000-point short-time RMS curve in dB (20 ms windows)        |
| `stereo`     | `{is_mono, correlation, stereo_width}` ± `{mid_rms, side_rms}`|
| `sections`   | List of `{start_sec, end_sec, label, rms}` — quiet/loud/peak |

All functions that take `sr` accept `float` because `librosa.load` returns `float`.
Any `range()` call using `sr` must cast: `int(sr) * 3`, `int(sr * 0.020)`, etc.

---

## Celery Task (`app/tasks.py`)

`process_analysis(analysis_id, job_id)` — bound task, max 3 retries, 5 s delay.

Progress stages published to Redis channel `analysis:{id}:progress`:
`Loading → Waveform → Spectrogram → Loudness → Frequency → AI → Done`

On completion:
- Results saved as JSON rows in `analysis_results` table
- Full result list cached in Redis under key `results:{id}` for 24 hours

The `GET /analyses/{id}/results` endpoint checks Redis first; falls back to DB.

**Important:** Always check `if job is None` after `db.get(Job, job_id)` — mypy and
runtime both require this guard.

---

## Storage (Supabase)

We do **not** use the `supabase` Python client library — it conflicts with
`httpx >= 0.25` which FastAPI/Starlette require.

Instead, `storage.py` and `downloader.py` call the Supabase Storage REST API
directly via `httpx`:

```
POST  {SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}   # upload
GET   {SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}   # download
Authorization: Bearer {SUPABASE_KEY}
```

---

## Docker / Build Notes

### Dockerfile (backend)
Multi-stage: `builder` installs pip packages; `runner` copies them and adds:
- `libmagic1` — required by `python-magic` for MIME detection
- `libsndfile1` — required by `librosa` for audio decoding

### Celery worker command
Must use `python -m celery ...` not bare `celery ...` — the `celery` binary is not
reliably on PATH inside the Docker image.

### Rebuilding after dependency changes
```bash
docker-compose build --no-cache backend worker
```
Always use `--no-cache` when changing `requirements.txt` to avoid stale layers.

### Wiping state completely
```bash
docker-compose down -v   # removes named volumes (wipes Postgres data)
docker-compose up --build
```

---

## Frontend (`frontend/src/components/UploadZone.tsx`)

Single component that owns the full upload-and-process flow:

1. `react-dropzone` for drag-and-drop; accepted types match backend ALLOWED_MIME_TYPES
2. Per-file label editing before upload
3. Sequential upload with `axios` + `onUploadProgress` for per-file progress bars
4. `POST /process` to enqueue the Celery job
5. WebSocket connection to `/ws/analyses/{id}` with exponential back-off reconnect
   (up to 5 retries, max 30 s delay) to display live stage chips + overall progress bar
6. On `Done`, auto-navigates to `/results/{analysisId}` for Sprint 3 dashboard view

**Type note:** Always import `FileRejection` from `react-dropzone` for the `onDrop`
callback's second parameter — do not inline a custom type, because `errors` is
`readonly FileError[]` in the library. With `verbatimModuleSyntax` on, use
`import type { FileRejection } from 'react-dropzone'` and keep `useDropzone` as a
value import on a separate line.

### Vite / Vitest config
`vite.config.ts` imports `defineConfig` from **`vitest/config`**, not from `vite`.
The `test` block is a Vitest extension and the base `vite` types don't include it.

### Windows / OneDrive workaround
Vitest is configured with `pool: 'threads'` instead of the default `forks` to avoid
file-locking errors that occur on Windows with OneDrive-synced directories.

---

## Sprint 3 Frontend Visualisation

Sprint 3 adds a dedicated results route and a componentized visual dashboard.

### Routing and page flow
- `BrowserRouter` is wired in `frontend/src/main.tsx`
- Routes in `frontend/src/App.tsx`:
  - `/` -> `UploadZone`
  - `/results/:analysisId` -> `ResultsPage`
- `UploadZone` navigates automatically to results after WebSocket stage `Done`

### Results page structure (`frontend/src/components/ResultsPage.tsx`)
- Sticky left sidebar for section navigation: waveform, spectrogram, loudness, frequency, stereo, sections
- Smooth scroll + active section highlight via `IntersectionObserver`
- "What does this mean?" inline helper per section with plain-English interpretation text
- Results fetched from `GET /api/v1/analyses/{id}/results`
- "Winner" (most dynamic) computed client-side as highest `loudness.dr14`

### Charts and widgets
- `WaveformChart.tsx`
  - Recharts `BarChart` for normalized waveform comparisons
- `SpectrogramCanvas.tsx`
  - Pixel-level heatmap rendering on `<canvas>` from `spectrogram.data`
  - D3-powered crosshair lines drawn on transparent SVG overlay
  - Hover tooltip with frequency + time
  - HF rolloff badge from `spectrogram.hf_rolloff_hz`
- `LoudnessCard.tsx`
  - DR14 color-coded badge and horizontal DR bar
  - DR8/DR14 benchmark ticks
  - LUFS / true peak / crest factor metrics
  - RMS curve mini-chart from `rms_curve`
  - `-23` and `-14` LUFS dashed reference lines
  - "Most Dynamic" winner badge for best DR among compared files
- `FrequencyChart.tsx`
  - Log-scaled frequency axis (20 Hz - 20 kHz)
  - 0 dB reference line
  - Frequency band marker lines (Sub/Bass/Low-mid/Mid/High/Air)
  - HF rolloff dashed marker line per file
- `StereoCard.tsx`
  - Stereo width and correlation gauges
  - Canvas Lissajous/goniometer plot from `mid_rms`/`side_rms`
  - Plain-English stereo interpretation text
- `SectionsTimeline.tsx`
  - Color-coded quiet/loud/peak section bars

### Share and export
- Share button copies the current results URL to clipboard
- Export button uses `html2canvas` to render and download full-page PNG
- Current implementation is frontend-only share (URL copy). There is no backend tokenized
  share-link system or expiry enforcement yet.

### Mobile behavior
- At small widths, sidebar is hidden
- Main content padding is reduced
- Spectrogram area is horizontally scrollable

### Sprint 3 dependencies
- Runtime:
  - `react-router-dom`
  - `recharts`
  - `d3`
  - `html2canvas`
- Dev/types:
  - `@types/d3`

---

## CI / GitHub Actions (`.github/workflows/ci.yml`)

### Backend job
1. `ruff check .` — linting
2. `mypy app` — type checking
3. `pytest` — unit tests (needs Postgres + Redis services in CI)

### Frontend job
1. `npm run lint` — ESLint
2. `npx tsc --noEmit` — TypeScript type check
3. `npm test` — Vitest unit tests
4. `npm run build` — production build

### mypy suppressions in use
- `# type: ignore[import-untyped]` on `celery` and `scipy.signal` imports
  (neither ships type stubs)
- `# type: ignore[assignment]` on SQLAlchemy column attribute assignments in `tasks.py`

---

## Common Commands

```bash
# Start the full stack
docker-compose up --build

# Run backend tests
docker-compose run --rm backend pytest tests/ -v

# Run linting + type checking
docker-compose run --rm backend sh -c "ruff check . && mypy app"

# Apply pending migrations
docker-compose run --rm backend alembic upgrade head

# Create a new migration after editing models.py
docker-compose run --rm backend alembic revision --autogenerate -m "describe change"

# Frontend type check
cd frontend && npx tsc --noEmit

# Frontend tests
cd frontend && npm test
```
