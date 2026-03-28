"""
scripts/export_bitmasks.py

Reads systematic_map_umap.parquet (output of compute_umap.py) and generates:
  - frontend/public/data/bitmasks/{group}|{idx}.bin  (one per label value)
  - frontend/public/data/info.json                    (updated with real counts)

Run after compute_umap.py and before export_sqlite.py.
"""
import json
import struct
from pathlib import Path

import numpy as np
import pandas as pd

# ── Config ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_IN = ROOT / "data" / "systematic_map_umap.parquet"
BITMASK_DIR = ROOT / "frontend" / "public" / "data" / "bitmasks"
INFO_PATH = ROOT / "frontend" / "public" / "data" / "info.json"

# Column → group key mapping
# Edit this if your Parquet column names differ
LABEL_COLUMN_MAP = {
    "drivers": {
        "col": "L1_drivers",        # list-type column: [['land_use', 'climate'], ...]
        "values": [
            "land_sea_use_change",
            "direct_exploitation",
            "climate_change",
            "pollution",
            "invasive_alien_species",
        ],
    },
    "threats": {
        "col": "L2_threat_l0",
        "values": [
            "residential_commercial_development",
            "agriculture_aquaculture",
            "energy_production_mining",
            "transportation_corridors",
            "biological_resource_use",
            "human_intrusions",
            "natural_system_modifications",
            "invasive_problematic_species",
            "pollution",
            "geological_events",
            "climate_change_severe_weather",
        ],
    },
    "realm": {
        "col": "L4_realm",
        "values": ["terrestrial", "freshwater", "marine",
                   "subterranean", "atmospheric", "transitional"],
    },
    "study_design": {
        "col": "L5_study_design",
        "values": ["observational", "experimental", "quasi_experimental",
                   "modelling", "review", "unclear"],
    },
    "kingdom": {
        "col": "L6_kingdom",
        "values": ["animalia", "plantae", "fungi", "bacteria",
                   "chromista", "protozoa", "archaea", "not_coded"],
    },
    "region": {
        "col": "L3_regions",
        "values": ["americas", "africa", "asia_pacific",
                   "europe_central_asia", "global"],
    },
    "direction": {
        "col": "L0_direction",
        "values": ["negative", "positive", "mixed", "unclear"],
    },
}


def make_bitmask(bool_series: pd.Series) -> bytes:
    """Pack a boolean series into a uint8 bitmask (LSB first within each byte)."""
    n = len(bool_series)
    padded = np.zeros(((n + 7) // 8) * 8, dtype=bool)
    padded[:n] = bool_series.values
    packed = np.packbits(padded, bitorder='little')
    return packed.tobytes()


def main():
    print(f"Reading {DATA_IN}")
    df = pd.read_parquet(DATA_IN)
    n = len(df)
    print(f"  {n:,} records")

    # Clear old bitmask files so stale labels don't linger
    if BITMASK_DIR.exists():
        for f in BITMASK_DIR.glob("*.bin"):
            f.unlink()
    BITMASK_DIR.mkdir(parents=True, exist_ok=True)

    # Load existing info.json to update counts
    info = json.loads(INFO_PATH.read_text())
    info["total"] = n
    info["start_year"] = int(df["year"].min())
    info["end_year"] = int(df["year"].max())

    for group_key, config in LABEL_COLUMN_MAP.items():
        col = config["col"]
        values = config["values"]

        if col not in df.columns:
            print(f"  WARN: column '{col}' not found, skipping group '{group_key}'")
            continue

        col_data = df[col]
        is_list_col = col_data.dtype == object and isinstance(col_data.iloc[0], list)

        for idx, value in enumerate(values):
            label_key = f"{group_key}|{idx}"
            filename = f"{group_key}__{idx}"  # use __ separator to avoid URL-encoding issues

            if is_list_col:
                # List column: record has label if value in its list
                mask = col_data.apply(lambda x: value in (x or []))
            else:
                # Scalar column
                mask = col_data == value

            bitmask_bytes = make_bitmask(mask)
            out_path = BITMASK_DIR / f"{filename}.bin"
            out_path.write_bytes(bitmask_bytes)

            count = mask.sum()
            print(f"  {label_key:30s}  {count:8,} records  → {out_path.name}")

            # Update count in info.json
            if group_key in info["groups"] and label_key in info["groups"][group_key]["labels"]:
                info["groups"][group_key]["labels"][label_key]["count"] = int(count)

    INFO_PATH.write_text(json.dumps(info, indent=2))
    print(f"\nUpdated {INFO_PATH}")
    print("Done.")


if __name__ == "__main__":
    main()
