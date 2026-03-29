"""
scripts/export_sqlite.py

Writes api/documents.sqlite from the full systematic map parquet.
This file is deployed with the FastAPI backend; it is NOT committed to git.

Schema: one row per eligible record, all L1-L6 label fields stored as
JSON strings (arrays). The API deserialises them when serving results.
"""
import ast
import json
import sqlite3
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent
DATA_IN = ROOT / "data" / "sample_merged.parquet"
DB_OUT  = ROOT / "api" / "documents.sqlite"

# Columns to include in SQLite (mapped from sample_merged schema)
COLUMNS = {
    "idx": None,               # numeric row index (matches slim.arrow id / bitmask index)
    "id": "custom_id",        # WOS-style id (falls back to UT if missing)
    "title": "Article Title",
    "abstract": "Abstract",
    "year": "Publication Year",
    "doi": None,
    "authors": None,
    "drivers": "pred_driver",
    "threat_l0": "pred_threat_l0",
    "threat_l1": "pred_threat_l1",
    "realm": "pred_realm",
    "biome": "pred_biome",
    "study_design": "pred_study_design",
    "kingdom": None,
    "region": "pred_regions",
    "direction": "s2_dir",
}

LIST_COLS = {k for k, v in COLUMNS.items() if v and v.startswith("pred_")}


def main():
    print(f"Reading {DATA_IN}")
    src = pd.read_parquet(DATA_IN)
    n = len(src)
    print(f"  {n:,} records, {len(src.columns)} columns")

    out = pd.DataFrame()
    out["idx"] = pd.Series(range(n), dtype="int32")
    out["id"] = src.get("custom_id", src.get("UT (Unique WOS ID)", pd.Series(range(n)))).fillna("").astype(str)
    out["title"] = src[COLUMNS["title"]].fillna("").astype(str)
    out["abstract"] = src[COLUMNS["abstract"]].fillna("").astype(str)
    out["year"] = src[COLUMNS["year"]].astype("int16")
    out["doi"] = ""
    out["authors"] = ""

    def parse_list(val):
        if val is None:
            return []
        if isinstance(val, list):
            return val
        if isinstance(val, str):
            v = val.strip()
            if v in ("", "[]"):
                return []
            try:
                parsed = ast.literal_eval(v)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass
            return [val]
        return [val]

    for key in ["drivers", "threat_l0", "threat_l1", "realm", "biome", "region"]:
        col = COLUMNS.get(key)
        if col and col in src.columns:
            out[key] = src[col].apply(parse_list).apply(json.dumps)
        else:
            out[key] = "[]"

    out["study_design"] = src[COLUMNS["study_design"]].fillna("").astype(str)
    out["kingdom"] = "[]"
    out["direction"] = src[COLUMNS["direction"]].fillna("").astype(str)

    DB_OUT.parent.mkdir(parents=True, exist_ok=True)
    if DB_OUT.exists():
        DB_OUT.unlink()

    conn = sqlite3.connect(DB_OUT)
    out.to_sql("documents", conn, index=False, if_exists="replace")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_id ON documents(id)")
    conn.commit()
    conn.close()

    size_mb = DB_OUT.stat().st_size / 1e6
    print(f"Wrote {DB_OUT}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
