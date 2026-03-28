"""
scripts/export_arrow.py

Writes slim.arrow — the lightweight columnar file loaded by the browser.
Contains only the fields needed for the scatterplot + result ordering.
Does NOT contain abstracts (those stay in SQLite).

Run after compute_umap.py.
"""
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc

ROOT = Path(__file__).parent.parent
DATA_IN  = ROOT / "data" / "systematic_map_umap.parquet"
DATA_OUT = ROOT / "frontend" / "public" / "data" / "slim.arrow"


def main():
    print(f"Reading {DATA_IN}")
    df = pd.read_parquet(DATA_IN, columns=["id", "year", "umap_x", "umap_y", "title"])

    # Truncate titles to 120 chars to keep file small
    df["title"] = df["title"].str[:120]

    # Cast to compact types
    df = df.astype({
        "id":     "int32",
        "year":   "int16",
        "umap_x": "float32",
        "umap_y": "float32",
    })

    table = pa.Table.from_pandas(df, preserve_index=False)

    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    with ipc.open_file(DATA_OUT, pa.ipc.new_file(DATA_OUT, table.schema)) as writer:
        writer.write_table(table)

    size_mb = DATA_OUT.stat().st_size / 1e6
    print(f"Wrote {DATA_OUT}  ({size_mb:.1f} MB, {len(df):,} rows)")


if __name__ == "__main__":
    main()
