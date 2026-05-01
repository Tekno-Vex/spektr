# Spektr — Audio Version Comparison Platform

> Compare originals, remasters, and remixes side by side using DSP metrics and AI analysis.

**Live demo:** https://spektr-omega.vercel.app
**API docs:** https://spektr-api-81p5.onrender.com/docs

---

## What it does

Upload 2–5 audio files (MP3, FLAC, WAV, OGG, M4A) and Spektr automatically computes:

| Metric | What it tells you |
|---|---|
| Waveform | Loudness dynamics over time (2 000-point RMS envelope) |
| Spectrogram | Full frequency content as a 256×512 dB colour grid |
| DR14 / LUFS / True Peak | Industry-standard loudness and dynamic range |
| Frequency response | Welch PSD smoothed across 512 points |
| Stereo field | Width, phase correlation, Lissajous goniometer |
| Dynamic sections | Quiet / loud / peak segments mapped by time |
| AI Verdict | Gemini 2.5 Flash identifies the best master with cited metrics |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | Fast HMR, full type safety |
| Visualisation | Recharts + D3 + Canvas API | Pixel-perfect spectrogram, interactive charts |
| Backend | FastAPI + SQLAlchemy 2 + Alembic | Async-ready, auto-migrating on startup |
| Audio DSP | librosa + numpy + scipy | Industry-standard algorithms |
| AI Analysis | Google Gemini 2.5 Flash | Structured JSON output, streaming verdict |
| Auth | JWT (access + refresh) + bcrypt | Stateless, rotation-aware, HttpOnly cookies |
| Queue | Celery + Redis | Async processing, pub/sub live progress |
| Storage | Supabase Storage | S3-compatible REST API, free tier |
| Database | PostgreSQL 16 (Supabase) | ACID, indexed queries, free tier |
| CI/CD | GitHub Actions → Render + Vercel | Zero-touch deploy on every push to main |

---

## Local Setup (5 minutes)

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Git](https://git-scm.com/)

```bash
git clone https://github.com/Tekno-Vex/spektr.git
cd spektr
cp .env.example .env
# Edit .env with your Supabase and Gemini API keys
docker-compose up --build
```

Open http://localhost:5173 — no other setup needed.

**Verify the stack is running:**
- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health → `{"status":"ok"}`

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram and design decisions.

## Performance

See [PERFORMANCE.md](./PERFORMANCE.md) for measured timing data and build metrics.

---

## API Reference

Full interactive docs at `/docs` on any running backend.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Log in, receive JWT access + refresh tokens |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Invalidate refresh token |
| GET | `/api/v1/auth/me` | Current user info |
| POST | `/api/v1/analyses` | Create new comparison |
| POST | `/api/v1/analyses/{id}/files` | Upload one audio file (up to 5 per analysis) |
| POST | `/api/v1/analyses/{id}/process` | Start DSP + AI pipeline |
| GET | `/api/v1/analyses/{id}/status` | Job status (pending / processing / done) |
| GET | `/api/v1/analyses/{id}/results` | Fetch computed DSP metrics |
| GET | `/api/v1/analyses/{id}/verdict` | Fetch AI verdict |
| WS | `/ws/analyses/{id}` | Real-time progress stream via Redis pub/sub |

---

## Project Structure

```
spektr/
├── .github/workflows/ci.yml   # CI/CD: lint → test → deploy
├── backend/
│   ├── alembic/versions/      # One migration file per schema change
│   ├── app/
│   │   ├── api/               # analyses.py + auth.py REST routers
│   │   ├── models/models.py   # SQLAlchemy ORM (User, Analysis, Job, AnalysisResult)
│   │   ├── services/          # audio.py (DSP), auth.py, storage.py, downloader.py
│   │   ├── base.py            # DB engine + SessionLocal
│   │   ├── main.py            # FastAPI app, CORS, WebSocket, logging
│   │   └── tasks.py           # Celery task: download → DSP → AI → cache
│   └── tests/
│       ├── test_audio.py      # 7 DSP unit tests
│       ├── test_health.py     # 1 health smoke test
│       └── test_api.py        # 11 API integration tests
├── frontend/
│   └── src/
│       ├── components/        # UploadZone, ResultsPage, DashboardPage, LoginPage,
│       │                      # RegisterPage, AiVerdictCard, WaveformChart,
│       │                      # SpectrogramCanvas, FrequencyChart, LoudnessCard,
│       │                      # StereoCard, SectionsTimeline
│       └── contexts/AuthContext.tsx
├── docker-compose.yml         # Local dev stack
├── docker-compose.prod.yml    # Production multi-stage build (no volume mounts)
├── .env.example               # Template for all required env vars
├── ARCHITECTURE.md
└── PERFORMANCE.md
```

---

## Running Tests

```bash
# Backend — 19 tests with coverage report
docker-compose run --rm backend pytest --cov=app -v

# Frontend — 9 component tests
cd frontend && npm test
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Supabase session pooler URI) |
| `REDIS_URL` | Redis connection string |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase service role key |
| `SUPABASE_BUCKET` | Storage bucket name (e.g. `analyses`) |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `SECRET_KEY` | 32-byte hex secret for JWT signing (`python -c "import secrets; print(secrets.token_hex(32))"`) |
