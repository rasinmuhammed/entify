# Entify

Entity resolution workspace for messy real-world data. Upload a CSV, find the
records that refer to the same person or company, review why they matched, and
export the deduplicated result.

Built on [Splink 4](https://github.com/moj-analytical-services/splink) (the UK
Ministry of Justice's probabilistic record linkage library) and DuckDB.

**Measured accuracy: precision 0.999, recall 0.943 (F1 0.970)** against a
labelled benchmark of 3,671 records with known duplicates. See
[Benchmark](#benchmark) to reproduce it.

---

## Quickstart

Two commands. No accounts, no API keys, no database to provision.

```bash
cd backend && pip install -r requirements.txt && uvicorn api:app --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:3000. The app starts in **demo mode**: no sign-in, and
projects persist to browser localStorage.

To try it against data with known duplicates, grab the generated sample:

```bash
curl -o demo_customers.csv "http://localhost:8000/api/demo/dataset?entities=4000"
```

That file holds about 4,700 rows covering 4,000 real people. The same person
entered twice with a nickname, a typo'd email, a differently formatted phone
number, or `Street` written as `St`. Upload it and the matcher should recover
roughly 700 duplicate records.

The configuration that produces the benchmark numbers is served at
`GET /api/demo/config`, so you do not have to guess good blocking rules on a
first run.

### Optional: sign-in and shared storage

Demo mode is the default because it has no prerequisites. Add credentials to
`frontend/.env.local` to enable Clerk auth and Supabase persistence:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Detection is by presence of credentials, so there is no flag to get wrong. Run
`frontend/supabase_schema.sql` against your Supabase project first.

---

## What it does

**Configure itself.** `POST /api/autoconfig` reads a CSV, works out what each
column holds (name, email, phone, address, locality, date, identifier),
proposes blocking rules, measures how many pairs each one actually generates,
and keeps the set that fits a comparison budget. Every decision carries a
stated reason and can be overridden.

On the benchmark, automatic configuration scores **precision 0.999, recall
0.943 (F1 0.970)**, better than the hand-tuned config below, while scoring
less than half the candidate pairs. That is the difference between a tool for
people who understand record linkage and one that anybody can use.

**Profile.** Row counts, distinct values and completeness per column. Missing
data counts nulls *and* blank strings, because a column that is 40% empty
strings is 40% empty.

**Block.** Candidate pair generation. Comparing 4,000 records naively is 8
million pairs; blocking cuts that to the thousands that could plausibly match.
Pair counts are computed by `GROUP BY` cardinality in O(n), not by a self-join.

**Merge.** `GET /api/merge/export` returns the deduplicated file: one
surviving record per real entity. Survivorship is applied per field, not per
record, because the most complete address and the best phone number usually
live on different rows. Source IDs are retained so any merge can be traced or
undone.

**Compare.** Per-field comparison levels: exact, Jaro-Winkler, Jaccard,
Levenshtein, plus semantic blocking via sentence-transformers.

**Train.** U values by random sampling, then m values and the prior by
expectation maximisation, on your data. Training status is reported back, not
assumed.

**Review.** Score distribution, threshold analysis, and Splink's waterfall
charts explaining which fields contributed how much evidence to a pair.

**Audit.** A PDF report of what was found.

---

## The audit report

`POST /api/audit` renders a PDF: duplicate counts, field completeness, real
example groups from the data, and the methodology behind the numbers.

Every figure in it is measured. The report deliberately does **not** estimate
financial savings. It prints a cost worksheet where you supply your own unit
rates, and totals only what you provided. An invented savings figure does not
survive the first question from a finance team, and the example groups are the
stronger argument anyway: if a reader can see four records that are obviously
the same customer, the count defends itself.

```bash
curl -X POST http://localhost:8000/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"table_name":"customers","threshold":0.95,"dataset_name":"Customer export"}' \
  -o audit.pdf
```

---

## Benchmark

Accuracy claims should be reproducible. The generator in
`backend/sample_data.py` emits a `true_entity_id` column, so precision and
recall are measured rather than eyeballed.

```bash
cd backend && pytest tests/test_matching_quality.py -v
```

The suite asserts floors on precision and recall, that the reported duplicate
count tracks ground truth within 20%, that precision rises monotonically with
threshold, and that the model actually trained. A scoring or clustering
regression fails the build instead of quietly degrading results.

| Config          | Threshold | Precision | Recall |    F1 | Pairs scored |
| --------------- | --------- | --------- | ------ | ----- | ------------ |
| Hand-tuned      |      0.90 |     0.981 |  0.930 | 0.955 |       13,376 |
| Hand-tuned      |      0.99 |     0.996 |  0.920 | 0.957 |       13,376 |
| **Auto-config** |      0.95 | **0.999** |  0.943 | 0.970 |    **5,595** |
| **Auto-config** |      0.99 | **1.000** |  0.943 | 0.970 |    **5,595** |

Measured on 3,671 records / 3,000 distinct entities at an 18% duplicate rate.
About 1–2.5 seconds end to end.

Duplicate records in the generator are given a *different* signup date from
their original. Copying it verbatim would hand the matcher a near-perfect
identifier and inflate every number in this table.

### Scaling

Measured on an Apple silicon laptop with `scripts/benchmark_scale.py`, using
the same tuned configuration:

| Rows    |  Time | Peak memory |
| ------- | ----- | ----------- |
| 1,859   |  1.3s |      309 MB |
| 6,129   |  2.0s |      453 MB |
| 24,729  |  4.2s |     1.3 GB |
| 74,132  | 32.3s |     2.5 GB |
| 185,487 |  fails |     2.5 GB |

These are laptop numbers, and the failure is memory-bound rather than
architectural: DuckDB scales vertically, so a larger machine moves the
ceiling up. Run this benchmark on your own hardware before assuming the
figures above apply to it.

Two limits are not fixed by a bigger machine. Memory grows faster than row
count (3x the rows cost 4x the memory between 25,000 and 74,000), and
predictions accumulate in a Python list rather than streaming, so peak usage
tracks result size. Raising the ceiling properly means a persistent DuckDB
file instead of an in-memory database, and streaming predictions out as they
are produced.

Blocking matters more than any other single choice: a loose rule set on the
same data scored 230,785 pairs at precision 0.61, while the tuned rules scored
13,376 pairs at precision 0.98: seventeen times less work, and better answers.

---

## Architecture

```
backend/
  engine.py          Splink + DuckDB: ingest, profile, train, predict, cluster
  services/          Request/response schemas, frontend-config translation
  auditor.py         PDF audit report
  sample_data.py     Deterministic messy-data generator with ground truth
  api.py             FastAPI routes
frontend/
  app/               Next.js 16 routes: vault, project workspace, analytics
  components/        Workspace UI: blocking, comparison, clustering, charts
  lib/               API client, local persistence shim, config detection
```

**Stack:** FastAPI, Splink 4, DuckDB, pandas, sentence-transformers · Next.js
16, React 19, TypeScript, Tailwind, DuckDB-WASM.

Four rules the backend follows, each of which was a real bug at some point:

1. **`predict()` is never pre-filtered.** Splink can drop pairs below a
   probability at predict time. That destroys the score distribution threshold
   tuning depends on, and with an untrained prior it silently reported zero
   duplicates on data visibly full of them.
2. **The model is trained before predicting**, and the training report is part
   of the response. An untrained model produces confident nonsense.
3. **SQL identifiers are always quoted** through `quote_ident`. Table and
   column names arrive from HTTP requests.
4. **Caller-supplied settings are never mutated.**

---

## Current limitations

Stated plainly, because knowing the edges is part of using this.

- **Single-run engine state.** One resolution result is held in memory at a
  time; a second concurrent run replaces the first. Multi-tenant deployment
  needs a keyed engine registry.
- **Memory-bound.** Uploads are read fully into memory (100 MB cap, via
  `ENTIFY_MAX_UPLOAD_MB`). Past roughly 100,000 rows this wants a DuckDB
  file backend and a job queue rather than a request/response cycle.
- **No authentication on the API.** The backend trusts its caller and assumes
  it is bound to localhost. Blocking rules are user-supplied SQL by design,
  do not expose this to untrusted callers as-is.
- **Demo-mode persistence is per-browser.** Clearing site data clears projects.
- **No automatic phone/address normalisation.** Matching handles format
  variation statistically, but a cleaning pass would improve recall.

---

## Development

```bash
cd backend && pytest tests/ -q      # 43 tests, ~10s
cd frontend && npm run build        # typecheck + production build
```

Requires Python 3.11+ and Node 20+. The repo includes `.nvmrc` and
`.python-version`.

## Licence

See [LICENSE.md](LICENSE.md).
