"""
api/main.py

Minimal FastAPI backend. Only two endpoints:
  GET  /api/info         → serves info.json
  POST /api/documents    → fetch full records from Postgres (Supabase) by ids

All filtering is client-side (bitmasks). This API only serves full document
records on demand (abstracts, full label lists, DOI, authors).
"""
import os
import json
from pathlib import Path
from typing import List

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Config ─────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")  # set in Render env vars
INFO_PATH = Path(os.getenv("INFO_PATH", str(Path(__file__).parent / "info.json")))

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
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL not set.")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
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
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id, title, abstract, year, doi, authors,
                    drivers, threat_l0, threat_l1,
                    realm, biome, study_design,
                    kingdom, region, direction
                FROM documents
                WHERE id = ANY(%s)
                ORDER BY id
                """,
                (req.ids,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    _array_cols = {'drivers', 'threat_l0', 'threat_l1', 'realm', 'biome', 'kingdom', 'region'}
    result = []
    for row in rows:
        d = dict(row)
        for col in _array_cols:
            if col in d and isinstance(d[col], str):
                try:
                    d[col] = json.loads(d[col])
                except Exception:
                    d[col] = []
        result.append(d)
    return result


@app.get("/health")
def health():
    try:
        conn = get_db()
        conn.close()
        return {"status": "ok", "db": "connected"}
    except Exception:
        return {"status": "ok", "db": "unavailable"}
