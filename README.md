# Buildora

Construction planning and material estimation, built around a **3D Building Studio**.

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS (3D Studio: React Three Fiber, from Phase 3) |
| Backend | Python, FastAPI |
| Accounts | Supabase Auth |
| Database / files | Supabase PostgreSQL / Storage (from Phase 2) |
| Hosting | Render |

## Status

Phases 0-2 are built: spec, Supabase Auth, and projects with rooms (database design in [docs/DATABASE.md](docs/DATABASE.md), tested locally;
the SQL still has to be run on your Supabase project). See [docs/SPEC.md](docs/SPEC.md) for the decisions, the 3D Studio checklist,
the phases and exactly what has and has not been verified.

## Run locally

```bash
# 1. backend  (Python 3.11+)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env              # then fill in SUPABASE_URL (public value)
uvicorn app.main:app --reload --port 8000

# 2. frontend  (Node 22+), in a second terminal
cd frontend
npm install
cp .env.example .env.local        # then fill in the two public Supabase values
npm run dev                       # http://localhost:5173  (forwards /api to the backend)
```

Tests: `cd backend && python -m pytest` and `cd frontend && npm test` (also `npm run typecheck`, `npm run build`).

Platform setup (Supabase Auth settings, Render): [docs/SETUP.md](docs/SETUP.md).

## Secrets

Only **public** values are used (Supabase project URL and publishable key). The Supabase **service-role key** is never used.
The database password / connection string (Phase 2) lives only in the git-ignored `backend/.env` and in Render's environment settings.
