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

All the pages in the design are built: Dashboard, My Projects, New Project, **3D Building Studio** (3D view, 2D plan editor, doors and windows,
furniture, layout generator, floor plan import), Material Estimation, Catalogue, Prices, Cost Analysis, Waste Optimization, Reports and Settings.
They are tested without a browser; **how the 3D scene looks has not been checked by a person yet**. The database needs both SQL files in
`supabase/migrations/` run once. See [docs/SPEC.md](docs/SPEC.md) for the decisions, the Studio checklist and exactly what has and has not been verified.

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

Two test files write shared fixtures into the other folder on purpose (`frontend/.../contract.test.ts` -> `backend/tests/fixtures`, and `backend/tests/test_export_frontend_fixtures.py` -> `frontend/src/test/fixtures`): they keep the browser and the API agreeing on the data format. Commit the regenerated files when the format changes on purpose.

Platform setup (Supabase Auth settings, Render): [docs/SETUP.md](docs/SETUP.md).

## Secrets

Only **public** values are used (Supabase project URL and publishable key). The Supabase **service-role key** is never used.
The database password / connection string (Phase 2) lives only in the git-ignored `backend/.env` and in Render's environment settings.
