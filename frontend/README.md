# Entify Frontend

Next.js application for Entify, an entity resolution workspace for profiling datasets, configuring record linkage logic, running matching jobs, and reviewing duplicate-record clusters.

## What This App Does

The frontend is the main product surface. It gives users a structured workflow for moving from raw data to explainable entity matches:

- Data vault for uploaded datasets and matching projects.
- Project workspace with profile, cleaning, blocking, comparison, training, laboratory, and results phases.
- Browser-side DuckDB loading for previews and interactive data work.
- Blocking rule and comparison configuration interfaces.
- Semantic blocking suggestions for high-cardinality text columns.
- Cluster and model diagnostic views after backend resolution.
- Supabase persistence for project state, dataset metadata, selected primary keys, and matching configuration.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Clerk
- Supabase
- DuckDB-WASM
- TanStack Query and Table
- Recharts
- Cytoscape
- Radix UI primitives

## Environment

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run build
npm run start
```

The production build uses webpack through:

```bash
next build --webpack
```

## Main Product Areas

- `app/vault/page.tsx`
  Dataset upload, project creation, project list, and dataset list.

- `app/projects/[id]/page.tsx`
  Main multi-phase entity resolution workspace.

- `components/blocking/`
  Blocking-rule builders, explainers, analyzers, templates, and semantic blocking UI.

- `components/comparison/`
  Field comparison configuration for exact, fuzzy, token, phonetic, numeric, date, and semantic methods.

- `components/workspace/`
  Data preview, cleaning, primary-key selection, data quality, and comparison views.

- `lib/projects/`
  Project persistence, autosave, DuckDB loading, CSV serialization, and resolution orchestration helpers.

- `lib/api/`
  Centralized API client for the FastAPI backend.

## Data Flow

1. User uploads a dataset through the vault.
2. Supabase stores dataset metadata and file location.
3. The project workspace loads the file into DuckDB-WASM for preview and configuration.
4. User selects a primary key, blocking rules, comparisons, and global settings.
5. The frontend serializes the active DuckDB table to CSV.
6. The backend runs Splink entity resolution.
7. The frontend renders matches, clusters, diagnostics, and export-oriented views.

## Frontend SEO and Product Positioning

Entify should be described as an entity resolution UI, record linkage workspace, data deduplication application, and explainable Splink workflow builder. The strongest audience language is practical and workflow-oriented: upload messy data, configure matching logic, run entity resolution, review clusters, and make duplicate-record decisions.

## Contributor Notes

- Prefer shared API helpers in `lib/api/` instead of hardcoded backend URLs.
- Keep project state persistence in `lib/projects/` where possible.
- Keep the route component focused on composition and workflow state.
- Use `frontend/supabase_schema.sql` as the fresh-environment schema reference.
- Treat browser DuckDB state as session-local; persist durable state through Supabase.

## Known Warnings

`npm run lint` currently passes with warnings. Most warnings are legacy cleanup items: explicit `any` types, unused imports, hook dependency warnings, and React Compiler compatibility warnings around libraries such as TanStack Table.
