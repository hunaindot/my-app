"""
api/main.py

Minimal FastAPI backend. Only two endpoints:
  GET  /api/info         → serves info.json
  POST /api/documents    → fetch full records from SQLite by ids

All filtering is client-side (bitmasks). This API only serves full document
records on demand (abstracts, full label lists, DOI, authors).
"""
import os
import json
import sqlite3
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Config ─────────────────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent / "documents.sqlite"
INFO_PATH = Path(__file__).parent.parent / "frontend" / "public" / "data" / "info.json"

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:4173"
).split(",")

# ── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Biodiversity Map API", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ── Helpers ─────────────────────────────────────────────────────────────────
def get_db():
    if not DB_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail="Database not yet generated. Run scripts/export_sqlite.py first."
        )
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


# ── Endpoints ───────────────────────────────────────────────────────────────
@app.get("/api/info")
def get_info():
    """Return the label registry (info.json)."""
    if not INFO_PATH.exists():
        raise HTTPException(status_code=404, detail="info.json not found")
    return json.loads(INFO_PATH.read_text())


class DocumentsRequest(BaseModel):
    ids: List[int] = Field(..., description="slim.arrow indices to fetch")
    page: int = Field(0, ge=0)
    limit: int = Field(10, ge=1, le=50)


@app.post("/api/documents")
def get_documents(req: DocumentsRequest):
    """
    Return full document records for the given slim.arrow indices.
    The frontend sends exactly the ids it wants (already paginated client-side).
    """
    if not req.ids:
        return []

    conn = get_db()
    try:
        placeholders = ",".join("?" for _ in req.ids)
        rows = conn.execute(
            f"""
            SELECT
                id, title, abstract, year, doi, authors,
                drivers, threat_l0, threat_l1,
                realm, biome, study_design,
                kingdom, region, direction
            FROM documents
            WHERE id IN ({placeholders})
            ORDER BY id
            """,
            req.ids,
        ).fetchall()
    finally:
        conn.close()

    import json as _json
    _array_cols = {'drivers', 'threat_l0', 'threat_l1', 'realm', 'biome', 'kingdom', 'region'}
    result = []
    for row in rows:
        d = dict(row)
        for col in _array_cols:
            if col in d and isinstance(d[col], str):
                try:
                    d[col] = _json.loads(d[col])
                except Exception:
                    d[col] = []
        result.append(d)
    return result


@app.get("/health")
def health():
    return {"status": "ok", "db": DB_PATH.exists()}
