# Entify

**Entify** is a modern data cleaning and entity resolution platform built with Next.js (frontend) and FastAPI (backend). It leverages **DuckDB‑WASM** and **Splink** for scalable, privacy‑preserving record linkage, and uses **Supabase** for storage and authentication.

---

## ✨ Features
- Interactive data preview, cleaning, and quality dashboards.
- Configurable blocking rules and comparison methods (exact, Jaro‑Winkler, Levenshtein, Jaccard, etc.).
- Dynamic detection of unique ID columns and flexible blocking rule defaults.
- Real‑time entity resolution with probability thresholds.
- Export results to CSV.

---

## 🚀 Getting Started
### Prerequisites
- **Node.js** (v20+) and **npm**
- **Python** (3.12) with virtual environment
- **Docker** (optional, for local Supabase) 
- **Supabase** project with API keys


## 📦 Backend API
- **GET /api/resolve** – runs entity resolution on the uploaded CSV.
- **POST /api/profile** – returns column statistics.
- **Other endpoints** – project CRUD, dataset upload, etc.

All endpoints expect JSON payloads defined in `backend/services/*.py`.

---

## 🎨 Frontend Overview
- Pages live under `frontend/app/` (e.g., `projects/[id]/page.tsx`).
- Core components in `frontend/components/` handle blocking rule building, comparison configuration, and data cleaning studio.
- Utility libraries in `frontend/lib/` provide Splink client wrappers and comparison method generators.

---

## 🗄️ Database (Supabase)
- Tables: `projects`, `datasets`, `cleaning_metadata`, etc.
- Migrations are stored in `frontend/supabase/migrations/` and applied via Supabase CLI.

---

## 🤝 Contributing
1. Fork the repository.
2. Create a feature branch.
3. Ensure the app runs locally and all tests pass.
4. Submit a pull request with a clear description.

---

## 📄 License
This project is licensed under the **MIT License**.
