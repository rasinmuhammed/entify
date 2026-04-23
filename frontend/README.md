# Frontend

Next.js application for Entify's entity resolution workspace.

## Responsibilities

- Authentication and session-aware app shell
- Supabase-backed dataset and project persistence
- DuckDB-WASM data loading and preview workflows
- Multi-phase workspace for profiling, cleaning, blocking, comparisons, training, and results
- Visualization clients for backend match diagnostics

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run build
```

## Important Environment Variables

Create `frontend/.env.local` with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

## Notes

- The frontend assumes the FastAPI backend is reachable through `NEXT_PUBLIC_API_URL`.
- `frontend/supabase_schema.sql` is the bootstrap schema for new environments.
- Some workspace features depend on the browser DuckDB session being populated from Supabase-backed files.
