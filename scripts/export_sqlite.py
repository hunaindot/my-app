"""
scripts/export_sqlite.py

Writes api/documents.sqlite from the full systematic map parquet.
This file is deployed with the FastAPI backend; it is NOT committed to git.

Schema: one row per eligible record, all L1-L6 label fields stored as
JSON strings (arrays). The API deserialises them when serving results.
"""
import json
import sqlite3
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent
DATA_IN = ROOT / "data" / "systematic_map_umap.parquet"
DB_OUT  = ROOT / "api" / "documents.sqlite"

# Columns to include in SQLite. Adjust to match your actual Parquet schema.
COLUMNS = [
    "id", "title", "abstract", "year", "doi", "authors",
    "L1_drivers",       # list → JSON
    "L2_threat_l0",     # list → JSON
    "L2_threat_l1",     # list → JSON
    "L4_realm",         # list → JSON
    "L5_study_design",  # scalar
    "L6_kingdom",       # list → JSON
    "L3_regions",       # list → JSON
    "L0_direction",     # scalar
]

LIST_COLS = ["L1_drivers", "L2_threat_l0", "L2_threat_l1",
             "L4_realm", "L6_kingdom", "L3_regions"]


def main():
    print(f"Reading {DATA_IN}")
    cols = [c for c in COLUMNS if c]  # filter any None
    df = pd.read_parquet(DATA_IN, columns=cols)
    print(f"  {len(df):,} records, {len(df.columns)} columns")

    # Serialise list columns to JSON strings
    for col in LIST_COLS:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: json.dumps(x) if x is not None else "[]")

    # Rename to friendlier API names
    df = df.rename(columns={
        "L1_drivers":    "drivers",
        "L2_threat_l0":  "threat_l0",
        "L2_threat_l1":  "threat_l1",
        "L4_realm":      "realm",
        "L5_study_design": "study_design",
        "L6_kingdom":    "kingdom",
        "L3_regions":    "region",
        "L0_direction":  "direction",
    })

    DB_OUT.parent.mkdir(parents=True, exist_ok=True)
    if DB_OUT.exists():
        DB_OUT.unlink()

    conn = sqlite3.connect(DB_OUT)
    df.to_sql("documents", conn, index=False, if_exists="replace")

    # Indices for fast id lookups
    conn.execute("CREATE INDEX IF NOT EXISTS idx_id ON documents(id)")
    conn.commit()
    conn.close()

    size_mb = DB_OUT.stat().st_size / 1e6
    print(f"Wrote {DB_OUT}  ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
