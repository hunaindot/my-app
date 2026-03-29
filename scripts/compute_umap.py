"""
scripts/compute_umap.py

Computes 2D UMAP coordinates from title+abstract embeddings.
Output: data/systematic_map_umap.parquet  (input + umap_x, umap_y columns added)

Runtime: ~2–4 hours on CPU for 342K records. Run once and cache.
GPU with cuML (RAPIDS) can do it in minutes if available.

Requirements (scripts/requirements.txt):
  sentence-transformers
  umap-learn
  pyarrow
  pandas
"""
from pathlib import Path
import glob

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from umap import UMAP

ROOT = Path(__file__).parent.parent
PARQ_CANDIDATES = sorted(glob.glob(str(ROOT / "data" / "*.parq*")))
if not PARQ_CANDIDATES:
    raise FileNotFoundError("No parquet found under data/*.parq*")
DATA_IN = Path(PARQ_CANDIDATES[0])
EMBED_CACHE = ROOT / "data" / "embeddings.npy"    # cached so you can re-run UMAP
DATA_OUT = DATA_IN.with_name(DATA_IN.stem + "_umap.parquet")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"  # fast + good quality
BATCH_SIZE = 512


def main():
    print(f"Reading {DATA_IN}")
    df = pd.read_parquet(DATA_IN)
    n = len(df)
    print(f"  {n:,} records")

    # 1. Embed titles + abstracts (or load cached)
    if EMBED_CACHE.exists():
        print(f"Loading cached embeddings from {EMBED_CACHE}")
        embeddings = np.load(EMBED_CACHE)
    else:
        texts = (df["title"].fillna("") + " " + df["abstract"].fillna("")).tolist()
        print(f"Embedding {n:,} texts with {MODEL_NAME}…")
        model = SentenceTransformer(MODEL_NAME)
        embeddings = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            show_progress_bar=True,
            normalize_embeddings=True,
        )
        np.save(EMBED_CACHE, embeddings)
        print(f"Saved embeddings to {EMBED_CACHE}")

    # 2. UMAP
    print("Running UMAP (this takes a while)…")
    reducer = UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
        verbose=True,
    )
    coords = reducer.fit_transform(embeddings)

    df["umap_x"] = coords[:, 0].astype("float32")
    df["umap_y"] = coords[:, 1].astype("float32")

    df.to_parquet(DATA_OUT, index=False)
    print(f"Wrote {DATA_OUT}")


if __name__ == "__main__":
    main()
