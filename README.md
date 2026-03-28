# Biodiversity Loss Literature Map

Interactive web interface for the systematic map of ~342K scientific articles
on biodiversity loss. Built for the thesis "Mapping scientific literature on
biodiversity with machine learning" (Mohuiddin, Forster, Feuerriegel — LMU Munich).

Reference implementation: [climateliterature.org](https://climateliterature.org/#/project/cdrmap)

---

## Quick start

### 1. Generate static assets (run once, after pipeline)

```bash
cd scripts
pip install -r requirements.txt
python compute_umap.py        # ~2–4h CPU, or minutes on GPU
python export_arrow.py        # → frontend/public/data/slim.arrow
python export_bitmasks.py     # → frontend/public/data/bitmasks/ + info.json
python export_sqlite.py       # → api/documents.sqlite
```

Expects `data/systematic_map.parquet` in the repo root (not committed).

> **Pre-committed data:** `frontend/public/data/info.json` and `info.md` are
> already in the repo. `slim.arrow` and `bitmasks/` are **not** — the frontend
> will fail to load data without them. Run the pipeline scripts above to generate
> them, or supply stub files for local UI development.

### 1b. Generate mock data (skip the full pipeline)

If you don't have `systematic_map.parquet`, generate fake data for UI development:

```bash
cd scripts
python generate_mock_data.py
```

This creates 1 000 synthetic records and writes:
- `frontend/public/data/slim.arrow`
- `frontend/public/data/bitmasks/*.bin`
- `api/documents.sqlite`

Requires only `pyarrow` and `numpy` (already in `scripts/requirements.txt`).

---

### 2. Run the frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### 3. Run the API

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Repo structure

```
├── CLAUDE.md               ← Claude Code instructions (read this first)
├── frontend/               ← React SPA
│   ├── src/
│   │   ├── components/     FilterPanel, Scatterplot, ResultsList, InfoTab
│   │   ├── utils/          bitmask.js, arrow.js, api.js
│   │   └── App.jsx
│   └── public/data/        slim.arrow, info.json, bitmasks/ (generated)
├── api/                    ← FastAPI (2 endpoints)
│   └── main.py
└── scripts/                ← Offline build pipeline
    ├── compute_umap.py
    ├── export_arrow.py
    ├── export_bitmasks.py
    └── export_sqlite.py
```

---

## Architecture overview

See `CLAUDE.md` for the full architecture reference.

All filtering is **client-side**: the browser downloads one small binary bitmask
file per label on startup (~42 KB each, ~2 MB total), then does bitwise AND/OR
operations in memory. The API is only called to fetch full document records
(with abstracts) on demand.
