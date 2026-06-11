# Entify

Open-source entity resolution workspace for messy real-world data.

Entify helps teams find duplicate, linked, or overlapping records across messy datasets. It turns entity resolution into a product workflow: upload data, profile it, clean it, define blocking rules, configure field comparisons, run Splink-powered matching, and review the resulting clusters.

This repo is public because the problem is real and the direction is worth exploring in the open. It is not being presented as a finished production system. Entify is currently a developer preview: useful for local evaluation, product exploration, and contributors who want to help shape an approachable open-source interface for record linkage and data deduplication.

## Why Entify Exists

Entity resolution is usually trapped between notebooks, SQL scripts, brittle one-off pipelines, and expensive black-box tools. Splink is powerful, but teams still need a practical workspace around it: somewhere to inspect data, tune logic, compare runs, and explain why records matched.

Entify is that workspace. The goal is to make entity matching more usable, more transparent, and easier to adopt without hiding the mechanics from technical teams.

What Entify is built to do:

- Profile columns and inspect data quality before matching.
- Choose primary keys and preserve uploaded dataset metadata.
- Build blocking rules that reduce comparison cost.
- Configure exact, fuzzy, phonetic, date, numeric, token, and semantic comparisons.
- Run a FastAPI backend backed by Splink and DuckDB.
- Review match pairs, clusters, model diagnostics, and threshold behavior.
- Persist project state in Supabase so matching decisions are repeatable.

## Who It Is For

Entify is useful for:

- Data engineers building deduplication or record linkage pipelines.
- Analytics teams reconciling customer, vendor, patient, product, or organization records.
- Data quality teams investigating duplicate records before MDM rollout.
- Researchers and civic data teams matching public datasets.
- AI and data product builders who need explainable entity matching rather than opaque similarity search alone.

## Current Product Status

Entify is an active, working application moving from prototype toward an adoptable open-source product.

The honest status: this is early. Keep expectations practical. The repo is just a developer preview, not a production-ready MDM platform.

Working today:

- CSV dataset upload and project creation.
- Supabase-backed dataset and project persistence.
- Multi-phase workspace for profile, cleaning, blocking, comparisons, training, laboratory, and results.
- Backend `/api/resolve` flow for Splink-powered matching.
- Semantic blocking suggestion service.
- Frontend lint and production build pass.

Not ready yet:

- Production deployment recipes.
- Authentication and multi-tenant permission hardening.
- Larger dataset execution strategy beyond local/browser-friendly flows.
- Full warning cleanup across older frontend components.
- End-to-end test coverage for the complete upload-to-results path.


## Architecture

```text
Entify
├── frontend/   Next.js 16, React 19, Clerk, Supabase, DuckDB-WASM
├── backend/    FastAPI, Splink, DuckDB, pandas, semantic blocking services
└── frontend/supabase_schema.sql
```

### Frontend

The frontend is a Next.js application that owns the authenticated app shell, dataset vault, project workspace, browser-side DuckDB previews, matching configuration UI, and visualization panels.

### Backend

The backend is a FastAPI service that exposes profiling, entity resolution, semantic blocking suggestions, training logs, and Splink chart endpoints.

### Persistence

Supabase stores datasets, project configuration, workflow phase, blocking rules, comparison settings, global model settings, primary key choices, and cleaning metadata.

## Tech Stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS
- Clerk authentication
- Supabase database and storage
- DuckDB-WASM in the browser
- FastAPI
- Splink 4
- DuckDB
- pandas
- sentence-transformers for semantic blocking suggestions

## Local Setup

### Requirements

- Node.js `20.x`
- Python `3.14`
- Supabase project
- Clerk application

The repo includes `.nvmrc` and `.python-version`.

### Install Frontend

```bash
cd frontend
npm ci
```

### Install Backend

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
```

### Configure Environment

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

Optional backend environment:

```bash
ENTIFY_METADATA_DB=backend/entify.duckdb
```

### Prepare Supabase

For a new Supabase project, run:

```text
frontend/supabase_schema.sql
```

Existing databases should also apply the migrations in:

```text
frontend/supabase/migrations/
```

## Run Locally

Start the backend:

```bash
. .venv/bin/activate
cd backend
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend:

```bash
cd frontend
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verify

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
. .venv/bin/activate
pytest backend/tests -q
```



## Keywords

entity resolution, record linkage, data deduplication, fuzzy matching, customer 360, master data management, data quality, data matching, Splink UI, DuckDB, FastAPI, Next.js, Supabase, semantic blocking, identity resolution, duplicate detection, entity matching, data cleaning, open source MDM

## License

See [LICENSE.md](./LICENSE.md).
