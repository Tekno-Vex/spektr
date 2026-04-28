# Spektr

Audio version comparison platform — compare originals, remasters & remixes side by side.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Backend | FastAPI + SQLAlchemy 2 + Alembic |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Containerization | Docker + Docker Compose |
| CI | GitHub Actions |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- [Node.js 20+](https://nodejs.org/) (only needed for local frontend work outside Docker)
- [Python 3.12+](https://www.python.org/) (only needed for local backend work outside Docker)
- [Git](https://git-scm.com/)

## Local Setup

1. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd spektr
   ```

2. **Copy the environment file**
   ```bash
   cp .env.example .env
   ```
   The defaults work out of the box with Docker Compose — no changes needed.

3. **Start everything**
   ```bash
   docker-compose up --build
   ```
   This will:
   - Build the backend and frontend images
   - Start PostgreSQL and wait until it is healthy
   - Run `alembic upgrade head` to create all database tables
   - Start the FastAPI server and the Vite dev server

4. **Verify the stack is running**
   - Frontend: http://localhost:5173
   - Backend API docs: http://localhost:8000/docs
   - Health check: http://localhost:8000/health → `{"status":"ok"}`

5. **Stop everything**
   ```bash
   docker-compose down
   ```
   To also wipe the database volume:
   ```bash
   docker-compose down -v
   ```

## Database Migrations

Migrations run automatically on every backend startup. To manage them manually:

```bash
# Enter the running backend container
docker-compose exec backend bash

# Apply all pending migrations
alembic upgrade head

# Roll back the last migration
alembic downgrade -1

# Create a new migration after changing models
alembic revision --autogenerate -m "describe your change"
```

## Running Tests Locally

**Backend**
```bash
cd backend
pip install -r requirements.txt
pytest
```

**Frontend**
```bash
cd frontend
npm install
npm run lint
npx tsc --noEmit
npm run build
```

## Project Structure

```
spektr/
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions CI pipeline
├── backend/
│   ├── alembic/            # Database migration scripts
│   ├── app/
│   │   ├── models/         # SQLAlchemy ORM models
│   │   ├── base.py         # Database engine + session setup
│   │   └── main.py         # FastAPI app entry point
│   ├── Dockerfile
│   ├── requirements.txt
│   └── start.sh            # Startup: alembic upgrade head → uvicorn
├── frontend/
│   ├── src/
│   │   └── App.tsx
│   ├── Dockerfile
│   ├── vite.config.ts
│   └── package.json
├── .env.example            # Documents all required environment variables
├── docker-compose.yml
└── README.md
```
