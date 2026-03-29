"""
scripts/generate_mock_data.py

Generates fake slim.arrow, bitmasks/*.bin, and api/documents.sqlite
for UI development — no real data needed.

N = 1000 records matching the exact schema expected by the frontend and API.

Usage (from repo root or scripts/):
    cd scripts
    python generate_mock_data.py

Requirements: pandas, pyarrow, numpy  (already in scripts/requirements.txt)
"""
import json
import math
import random
import sqlite3
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.ipc as ipc

# ── Paths ─────────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR   = REPO_ROOT / "frontend" / "public" / "data"
BITMASK_DIR = DATA_DIR / "bitmasks"
SQLITE_PATH = REPO_ROOT / "api" / "documents.sqlite"
INFO_PATH   = DATA_DIR / "info.json"

# ── Config ────────────────────────────────────────────────────────────────────
N    = 1000   # number of mock records
SEED = 42

random.seed(SEED)
np.random.seed(SEED)

# ── Load label registry ───────────────────────────────────────────────────────
with open(INFO_PATH) as f:
    info = json.load(f)

groups = info["groups"]

# ── Generate UMAP coords (two loose clusters) ─────────────────────────────────
angles  = np.random.uniform(0, 2 * np.pi, N)
radii   = np.random.exponential(3.5, N)
cx = np.where(np.arange(N) < N // 2,  5.0, -5.0)
cy = np.where(np.arange(N) < N // 2,  3.0, -3.0)
umap_x  = (radii * np.cos(angles) + cx).astype(np.float32)
umap_y  = (radii * np.sin(angles) + cy).astype(np.float32)

years   = np.random.randint(2000, 2026, N).astype(np.int16)
ids     = np.arange(N, dtype=np.int32)
habitats = ["forest", "ocean", "grassland", "wetland", "coral reef", "savanna"]
titles  = [
    f"Mock article {i}: biodiversity study in {habitats[i % len(habitats)]} ecosystems ({int(years[i])})"
    for i in range(N)
]

# ── Write slim.arrow ──────────────────────────────────────────────────────────
DATA_DIR.mkdir(parents=True, exist_ok=True)
table = pa.table({
    "id":     pa.array(ids,     type=pa.int32()),
    "year":   pa.array(years,   type=pa.int16()),
    "umap_x": pa.array(umap_x,  type=pa.float32()),
    "umap_y": pa.array(umap_y,  type=pa.float32()),
    "title":  pa.array(titles,  type=pa.utf8()),
})
arrow_path = DATA_DIR / "slim.arrow"
with open(arrow_path, "wb") as fh:
    writer = ipc.new_file(fh, table.schema)
    writer.write_table(table)
    writer.close()
print(f"✓  slim.arrow  ({N} records)  →  {arrow_path}")

# ── Assign random labels per record ──────────────────────────────────────────
record_labels: dict[str, list] = {}
for group_key, group in groups.items():
    n_labels = len(group["labels"])
    if group["type"] == "single":
        record_labels[group_key] = [
            random.randint(0, n_labels - 1) if random.random() > 0.08 else None
            for _ in range(N)
        ]
    else:
        record_labels[group_key] = [
            random.sample(
                range(n_labels),
                min(random.choices([0, 1, 2, 3], weights=[0.08, 0.50, 0.30, 0.12])[0], n_labels)
            )
            for _ in range(N)
        ]

# ── Write bitmask files ───────────────────────────────────────────────────────
BITMASK_DIR.mkdir(parents=True, exist_ok=True)
byte_len = math.ceil(N / 8)
total_bitmasks = 0

for group_key, group in groups.items():
    n_labels = len(group["labels"])
    for label_idx in range(n_labels):
        bitmask = bytearray(byte_len)
        for rec_idx in range(N):
            assignment = record_labels[group_key][rec_idx]
            has_label = (
                assignment == label_idx
                if group["type"] == "single"
                else label_idx in assignment
            )
            if has_label:
                bitmask[rec_idx >> 3] |= 1 << (rec_idx & 7)

        # encodeURIComponent('|') == '%7C' — must match frontend fetch URL
        label_key = f"{group_key}|{label_idx}"
        filename  = label_key.replace("|", "%7C") + ".bin"
        (BITMASK_DIR / filename).write_bytes(bytes(bitmask))
        total_bitmasks += 1

print(f"✓  {total_bitmasks} bitmask files  →  {BITMASK_DIR}")

# ── Build label name lookup tables ────────────────────────────────────────────
def label_names(group_key: str) -> dict[int, str]:
    if group_key not in groups:
        return {}
    return {
        i: v["name"]
        for i, (_, v) in enumerate(groups[group_key]["labels"].items())
    }

driver_names    = label_names("drivers")
threat_names    = label_names("threats")
realm_names     = label_names("realm")
study_names     = label_names("study_design")
kingdom_names   = label_names("kingdom")
region_names    = label_names("region")
direction_names = label_names("direction")

# ── Write documents.sqlite ────────────────────────────────────────────────────
SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)
conn = sqlite3.connect(SQLITE_PATH)
conn.execute("DROP TABLE IF EXISTS documents")
conn.execute("""
    CREATE TABLE documents (
        id           INTEGER PRIMARY KEY,
        title        TEXT,
        abstract     TEXT,
        year         INTEGER,
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
conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_id ON documents(id)")

adj = ["tropical", "temperate", "arctic", "boreal", "subtropical", "montane"]
rows = []
fallback_empty = [[] for _ in range(N)]
for i in range(N):
    drv   = record_labels.get("drivers",   fallback_empty)[i]
    thr   = record_labels.get("threats",   fallback_empty)[i]
    rlm   = record_labels.get("realm",     fallback_empty)[i]
    std   = record_labels.get("study_design", [None]*N)[i]
    kin   = record_labels.get("kingdom",   fallback_empty)[i]
    reg   = record_labels.get("region",    fallback_empty)[i]
    dire  = record_labels.get("direction", [None]*N)[i]

    rows.append((
        int(ids[i]),
        titles[i],
        (
            f"This is a mock abstract for article {i}. "
            f"The study investigates biodiversity dynamics in {adj[i % len(adj)]} ecosystems. "
            f"Results indicate significant changes in species richness and abundance over time. "
            f"Key drivers include habitat loss, climate variability, and anthropogenic pressures. "
            f"Data were collected across multiple sites spanning {2000 + (i % 25)} to {2001 + (i % 25)}."
        ),
        int(years[i]),
        f"10.0000/mock.{1000 + i}",
        f"Author {chr(65 + i % 26)}, Author {chr(66 + i % 26)} et al.",
        json.dumps([driver_names[idx]  for idx in drv]),
        json.dumps([threat_names[idx]  for idx in thr]),
        json.dumps([]),                                        # threat_l1 not used in mock
        json.dumps([realm_names[idx]   for idx in rlm]),
        json.dumps([]),                                        # biome not used in mock
        study_names.get(std) if std is not None else None,
        json.dumps([kingdom_names[idx] for idx in kin]),
        json.dumps([region_names[idx]  for idx in reg]),
        direction_names.get(dire) if dire is not None else None,
    ))

conn.executemany(
    "INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    rows,
)
conn.commit()
conn.close()
print(f"✓  documents.sqlite  ({N} documents)  →  {SQLITE_PATH}")
print()
print("Done. Next steps:")
print("  cd frontend && npm install && npm run dev")
print("  cd api && uvicorn main:app --reload --port 8000")
