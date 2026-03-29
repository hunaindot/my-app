"""
scripts/export_arrow.py

Computes embeddings + UMAP (2D) directly from the source parquet and writes
slim.arrow for the frontend. Requires sentence-transformers + umap-learn.
"""
import glob
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from sentence_transformers import SentenceTransformer
from umap import UMAP

ROOT = Path(__file__).parent.parent
PARQ_CANDIDATES = sorted(glob.glob(str(ROOT / "data" / "*.parq*")))
if not PARQ_CANDIDATES:
    raise FileNotFoundError("No parquet found in data/*.parq*")
DATA_IN  = Path(PARQ_CANDIDATES[0])
DATA_OUT = ROOT / "frontend" / "public" / "data" / "slim.arrow"


def main():
    print(f"Reading {DATA_IN}")
    src = pd.read_parquet(DATA_IN)

    n = len(src)
    ids = pd.Series(range(n), name="id", dtype="int32")
    years = src.get("Publication Year", pd.Series([0]*n)).astype("int16", copy=False).rename("year")
    titles = src.get("Article Title", pd.Series([""]*n)).fillna("").astype(str).str[:200].rename("title")
    abstracts = src.get("Abstract", pd.Series([""]*n)).fillna("").astype(str)

    wos_id = None
    if "custom_id" in src.columns:
        wos_id = src["custom_id"].fillna("").astype(str).rename("wos_id")
    elif "UT (Unique WOS ID)" in src.columns:
        wos_id = src["UT (Unique WOS ID)"].fillna("").astype(str).rename("wos_id")

    # Embed titles + abstracts
    texts = (titles + " " + abstracts).tolist()
    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    embeddings = model.encode(texts, batch_size=256, show_progress_bar=True, normalize_embeddings=True)

    # UMAP to 2D
    reducer = UMAP(n_components=2, n_neighbors=15, min_dist=0.1, metric="cosine", random_state=42)
    coords = reducer.fit_transform(embeddings).astype("float32")
    umap_x = pd.Series(coords[:, 0], name="umap_x")
    umap_y = pd.Series(coords[:, 1], name="umap_y")

    parts = [ids, years, umap_x, umap_y, titles]
    if wos_id is not None:
        parts.append(wos_id)
    df = pd.concat(parts, axis=1)

    table = pa.Table.from_pandas(df, preserve_index=False)

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    with ipc.new_file(DATA_OUT, table.schema) as writer:
        writer.write_table(table)

    size_mb = DATA_OUT.stat().st_size / 1e6
    print(f"Wrote {DATA_OUT}  ({size_mb:.1f} MB, {len(df):,} rows)")


if __name__ == "__main__":
    main()
