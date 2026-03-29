"""
scripts/migrate_to_supabase.py

One-time migration: copies all records from documents.sqlite → Supabase Postgres.

Usage:
    pip install psycopg2-binary python-dotenv
    python migrate_to_supabase.py
"""
import os
import sqlite3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

SQLITE_PATH = os.getenv("SQLITE_PATH", "../api/documents.sqlite")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise SystemExit("Set DATABASE_URL env var first.")

# ── Connect ──────────────────────────────────────────────────────────────────
sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row

pg_conn = psycopg2.connect(DATABASE_URL)
pg_conn.autocommit = False

# ── Create table & clear old data ────────────────────────────────────────────
with pg_conn.cursor() as cur:
    cur.execute("DROP TABLE IF EXISTS documents")
    cur.execute("""
        CREATE TABLE documents (
            idx          INTEGER PRIMARY KEY,
            id           TEXT,
            title        TEXT,
            abstract     TEXT,
            year         SMALLINT,
            doi          TEXT,
            authors      TEXT,
            drivers      TEXT,
            threat_l0    TEXT,
            threat_l1    TEXT,
            realm        TEXT,
            biome        TEXT,
            study_design TEXT,
            kingdom      TEXT,
            region       TEXT,
            direction    TEXT
        )
    """)
    pg_conn.commit()
    print("Table ready (dropped & recreated).")

# ── Migrate ───────────────────────────────────────────────────────────────────
rows = sqlite_conn.execute("SELECT * FROM documents").fetchall()
total = len(rows)
print(f"Migrating {total} records...")

BATCH = 1000
with pg_conn.cursor() as cur:
    for i in range(0, total, BATCH):
        batch = [dict(r) for r in rows[i:i+BATCH]]
        psycopg2.extras.execute_batch(
            cur,
            """
            INSERT INTO documents (
                idx, id, title, abstract, year, doi, authors,
                drivers, threat_l0, threat_l1,
                realm, biome, study_design,
                kingdom, region, direction
            ) VALUES (
                %(idx)s, %(id)s, %(title)s, %(abstract)s, %(year)s, %(doi)s, %(authors)s,
                %(drivers)s, %(threat_l0)s, %(threat_l1)s,
                %(realm)s, %(biome)s, %(study_design)s,
                %(kingdom)s, %(region)s, %(direction)s
            )
            ON CONFLICT (idx) DO NOTHING
            """,
            batch,
        )
        pg_conn.commit()
        print(f"  {min(i+BATCH, total)}/{total}")

print("Done.")
sqlite_conn.close()
pg_conn.close()
