# Entify Backend

FastAPI service for Entify's entity resolution workflow. The backend profiles uploaded datasets, runs Splink-powered matching, generates semantic blocking suggestions, and exposes chart and diagnostic endpoints used by the frontend.

## Responsibilities

- Decode CSV payloads from the frontend.
- Profile datasets for row counts, column statistics, null rates, and unique counts.
- Convert frontend comparison configuration into Splink settings.
- Run dedupe-style entity resolution with Splink and DuckDB.
- Return match pairs, cluster-oriented outputs, timing, and errors.
- Generate semantic blocking suggestions with sentence-transformer embeddings.
- Stream training logs and expose Splink diagnostic chart endpoints.

## Stack

- FastAPI
- Splink 4
- DuckDB
- pandas
- pydantic
- sentence-transformers
- scikit-learn
- uvicorn

## Install

From the repo root:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements-dev.txt
```

## Run

```bash
. .venv/bin/activate
cd backend
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl -s http://127.0.0.1:8000/api/health
```

## Environment

Optional:

```bash
ENTIFY_METADATA_DB=backend/entify.duckdb
```

`ENTIFY_METADATA_DB` is used by semantic blocking metadata lookups.

## Core Endpoints

- `GET /api/health`
  Returns service, Splink, DuckDB, and Python health information.

- `POST /api/profile`
  Profiles an uploaded CSV file.

- `POST /api/resolve`
  Runs entity resolution from a base64-encoded CSV payload and Splink-style settings.

- `POST /api/resolve/file`
  Runs entity resolution from a direct multipart file upload.

- `POST /api/blocking/suggestions`
  Generates semantic blocking suggestions for selected columns.

- `GET /api/training-logs`
  Streams training/progress messages with server-sent events.

## Tests

From the repo root:

```bash
. .venv/bin/activate
pytest backend/tests -q
```

## Backend Roadmap

- Add request/response fixtures for the full frontend resolve payload.
- Add larger dataset benchmarks and memory guidance.
- Persist run history, settings, and result metadata.
- Add export endpoints for clusters, pairs, and audit reports.
- Add deployment docs for containerized production hosting.
- Harden CORS, auth, and tenant-aware access before public deployment.
