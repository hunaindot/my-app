"""
scripts/export_arrow.py

Writes slim.arrow — the lightweight columnar file loaded by the browser.
Contains only the fields needed for the scatterplot + result ordering.
Does NOT contain abstracts (those stay in SQLite).

Run after compute_umap.py.
"""
from math import ceil, sqrt
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc

ROOT = Path(__file__).parent.parent
DATA_IN  = ROOT / "data" / "sample_merged.parquet"
DATA_OUT = ROOT / "frontend" / "public" / "data" / "slim.arrow"


def main():
    print(f"Reading {DATA_IN}")
    src = pd.read_parquet(DATA_IN, columns=["Publication Year", "Article Title"])

    n = len(src)
    grid_w = ceil(sqrt(max(n, 1)))
    ids = pd.Series(range(n), name="id", dtype="int32")
    wos_id = src.get("custom_id") if "custom_id" in src.columns else src.get("UT (Unique WOS ID)")
    if wos_id is not None:
        wos_id = wos_id.fillna("").astype(str).rename("wos_id")
    years = src["Publication Year"].astype("int16", copy=False).rename("year")
    titles = src["Article Title"].fillna("").astype(str).str[:120].rename("title")
    umap_x = pd.Series([i % grid_w for i in range(n)], name="umap_x", dtype="float32")
    umap_y = pd.Series([i // grid_w for i in range(n)], name="umap_y", dtype="float32")

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
