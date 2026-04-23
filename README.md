# Entify

Entify is an in-progress entity resolution workspace built around a Next.js frontend and a FastAPI + Splink backend. The current focus is a reliable local workflow for dataset upload, project configuration, matching, and result review.

## Current Architecture

- `frontend/`
  Next.js 16 app with Clerk auth, Supabase persistence, DuckDB-WASM for browser-side data work, and the main multi-phase ER workspace.
- `backend/`
  FastAPI service for profiling, Splink-based entity resolution, semantic blocking suggestions, and result/visualization endpoints.
- `frontend/supabase_schema.sql`
  Canonical bootstrap schema for fresh Supabase environments.
- `frontend/supabase/migrations/`
  Incremental schema history. Keep this aligned with the bootstrap schema.

## Tested Local Runtime

- Node.js `20.x`
- Python `3.14`

The repo includes `.nvmrc` and `.python-version` to make the local toolchain explicit.

## Local Setup

### 1. Frontend

```bash
cd frontend
npm ci
```

### 2. Backend

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
```

### 3. Environment Variables

Frontend expects these values in `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

Backend can run without a dedicated env file for basic development, but these are useful:

```bash
ENTIFY_METADATA_DB=backend/entify.duckdb
```

## Running Locally

### Start the backend

```bash
. .venv/bin/activate
cd backend
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### Start the frontend

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database Setup

For a fresh Supabase project:

1. Run `frontend/supabase_schema.sql` in the SQL editor.
2. If your environment already has older tables, apply the migrations in `frontend/supabase/migrations/`.

The frontend currently persists:

- datasets and uploaded file metadata
- project blocking rules
- comparison configurations
- global Splink settings
- active workflow phase
- primary key selection
- cleaning metadata paths/state

## Verification

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

### Backend

```bash
. .venv/bin/activate
pytest backend/tests -q
```

## Feature Status

- Stable enough for active development:
  dataset upload, project persistence, blocking/comparison configuration, backend resolution flow, result exploration
- Experimental:
  semantic blocking suggestions, some chart/visualization endpoints, browser-side cleaning flows that depend on local DuckDB state
- Legacy/not yet normalized:
  older prototype components that still assume pre-`/api/*` backend routes
