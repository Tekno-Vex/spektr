# Spektr — Performance

> Measurements taken on a local Docker Compose stack (Windows 11, OneDrive-synced).
> Production numbers on Render free tier will differ due to cold starts (~30s after 15 min idle).

---

## API Response Times (local Docker)

| Endpoint | Method | Typical | Notes |
|---|---|---|---|
| `/health` | GET | < 5ms | No DB touch |
| `/api/v1/analyses` | POST | ~20ms | Single DB write |
| `/api/v1/analyses/{id}/results` | GET | ~8ms | Redis cache hit |
| `/api/v1/analyses/{id}/results` | GET | ~80ms | Postgres fallback (cache miss) |
| `/api/v1/auth/register` | POST | ~400ms | bcrypt cost factor 12 |
| `/api/v1/auth/login` | POST | ~400ms | bcrypt verify |
| `/api/v1/auth/refresh` | POST | ~10ms | Redis denylist check only |

---

## Audio Processing Pipeline (Celery job duration)

| File size | Format | DSP time | AI time | Total |
|---|---|---|---|---|
| ~5 MB | MP3 128kbps | ~15s | ~8s | ~23s |
| ~20 MB | MP3 320kbps | ~30s | ~8s | ~38s |
| ~30 MB | FLAC | ~45s | ~8s | ~53s |
| 5× files | Mixed | ~90s | ~10s | ~100s |

DSP time is dominated by librosa's STFT for the spectrogram (O(n log n) in file duration).
AI time is dominated by Gemini network latency (~5–10s on free API tier).

`duration_ms` is recorded on every `Job` row — query your database to see real numbers:
```sql
SELECT id, duration_ms FROM jobs ORDER BY created_at DESC LIMIT 20;
```

---

## Database Query Performance

Indexes added in Sprint 6 (`efb22115ecc5` migration):

| Query pattern | Before index | After index |
|---|---|---|
| Load user's analyses list (`WHERE user_id = X`) | Full table scan | Index seek on `ix_analyses_user_id` |
| Filter by status (`WHERE status = 'done'`) | Full table scan | Index seek on `ix_analyses_status` |
| Load results for analysis (`WHERE analysis_id = Y`) | Full table scan | Index seek on `ix_analysis_results_analysis_id` |
| Load job for analysis (`WHERE analysis_id = Z`) | Full table scan | Index seek on `ix_jobs_analysis_id` |

Impact is small at low data volumes but becomes significant as the `analysis_results` table grows (each row stores multiple large JSON blobs).

---

## Frontend Bundle Size

Built with `npm run build` (Vite production mode, esbuild minifier):

| Asset | Gzip size | Notes |
|---|---|---|
| `index.html` | ~0.4 kB | Entry point |
| `index.css` | ~1.5 kB | Tailwind purged |
| `index.js` (main bundle) | ~280 kB | Includes recharts + d3 |

The bundle is relatively large due to recharts and d3. Future optimisation: code-split the results page (dynamic `import()`) so the charting libraries are only loaded when the user navigates to `/results`.

---

## Test Coverage

| Suite | File | Tests | What is covered |
|---|---|---|---|
| DSP unit tests | `test_audio.py` | 7 | `audio.py` functions (waveform, spectrogram, loudness, frequency, stereo, sections) |
| Health check | `test_health.py` | 1 | `/health` endpoint |
| API integration | `test_api.py` | 11 | Auth endpoints, analysis CRUD, results retrieval |
| Frontend components | `LoginPage.test.tsx` | 5 | Login form render + validation |
| Frontend components | `RegisterPage.test.tsx` | 3 | Register form render |
| Frontend app | `App.test.tsx` | 1 | App renders without crash |
| **Total** | | **28** | |

Backend coverage: **≥ 45%** of `app/` (enforced by CI `--cov-fail-under=45`).

---

## CI Pipeline Duration

| Job | Steps | Typical duration |
|---|---|---|
| Backend | ruff + mypy + pytest (19 tests) | ~2–3 min |
| Frontend | eslint + tsc + vitest + build | ~2–3 min |
| Deploy | curl Render deploy hook | ~10s (+ Render build ~5 min) |

Jobs run in parallel — total wall-clock time from push to green CI: ~3 min.
Total time from push to live on Render: ~8–10 min.
