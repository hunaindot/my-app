"""
scripts/export_bitmasks.py

Generates:
  - frontend/public/data/bitmasks/{group}__{label_id}.bin  (one per label, parents aggregated)
  - frontend/public/data/info.json and api/info.json         (hierarchical schema + counts)

Run after compute_umap.py and before export_sqlite.py.
"""
from __future__ import annotations

import ast
import json
import math
import re
from pathlib import Path
from typing import Dict, List, Iterable, Callable

import numpy as np
import pandas as pd

# ── Config ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_IN = ROOT / "data" / "sample_merged.parquet"
BITMASK_DIR = ROOT / "frontend" / "public" / "data" / "bitmasks"
INFO_FRONTEND = ROOT / "frontend" / "public" / "data" / "info.json"
INFO_API = ROOT / "api" / "info.json"

THREATS_PATH = ROOT / "mappings" / "threats_classification.json"
ECOSYSTEM_PATH = ROOT / "mappings" / "ecosystem_typology_1_3.json"
REGIONS_PATH = ROOT / "mappings" / "ipbes_regions.json"

# Toggle: emit per-country labels/masks? Set False to keep only region+subregion
EMIT_COUNTRY_LABELS = False

# Synonym maps (normalized tokens → canonical ids)
DRIVER_SYNONYMS = {
    "direct_exploitation_and_resource_extraction": "direct_exploitation",
    "direct_exploitation_and_resource_extraction,": "direct_exploitation",
    "invasive_non_native_alien_species": "invasive_alien_species",
    "invasive_non_native_alien_species_diseases": "invasive_alien_species",
    "invasive_non_native_alien_species_diseases_": "invasive_alien_species",
}

REGION_SYNONYMS = {
    "asia_and_the_pacific": "asia_pacific",
    "asia_and_pacific": "asia_pacific",
    "europe_and_central_asia": "europe_central_asia",
    "all_region": "global",
    "global": "global",
    "global_multi_region": "global",
}

REALM_SYNONYMS = {
    "all_realms": "__all_realms__",
    "marine_freshwater_terrestrial": "marine-freshwater-terrestrial",
    "marine_terrestrial": "marine-terrestrial",
    "freshwater_subterranean": "freshwater-subterranean",
}

DIRECTION_SYNONYMS = {
    "positive": "positive",
    "negative": "negative",
    "unclear": "unclear",
    "mixed": "mixed",
}

# Dataset column names (assumed present per README)
COLUMNS = {
    "drivers": "pred_driver",
    "threat_l0": "pred_threat_l0",
    "threat_l1": "pred_threat_l1",
    "threat_l2": "pred_threat_l2",
    "realm": "pred_realm",
    "biome": "pred_biome",
    "efg": "pred_efg",
    "region": "pred_regions",
    "subregion": "pred_subregions",
    "country": "pred_countries",
    "study_design": "pred_study_design",
    "direction": "s2_dir",
}


# ── Helpers ────────────────────────────────────────────────────────────────
def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def derive_colour(base, depth):
    if base is None:
        base = (30, 50, 50)
    h, s, l = base
    s = max(20, min(90, s - 6 * depth))
    l = max(35, min(88, l + 8 * depth))
    return [int(h), float(s), float(l)]


def make_bitmask(bool_series: pd.Series) -> bytes:
    n = len(bool_series)
    padded = np.zeros(math.ceil(n / 8) * 8, dtype=bool)
    padded[:n] = bool_series.values
    packed = np.packbits(padded, bitorder="little")
    return packed.tobytes()


def parse_listish(value) -> List[str]:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        v = value.strip()
        # empty list string
        if v in ("", "[]"):
            return []
        try:
            parsed = ast.literal_eval(v)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [value]
    return [value]


def column_list(series: pd.Series) -> pd.Series:
    return series.apply(parse_listish)


def normalise_token(token) -> str:
    if token is None or (isinstance(token, float) and math.isnan(token)):
        return ""
    return slugify(str(token))


def normalise_multi(values: Iterable) -> List[str]:
    out = []
    for v in values:
        if isinstance(v, str):
            out.extend([p for p in v.split('-') if p])
        else:
            out.append(v)
    return out


class Label:
    def __init__(self, *, id: str, name: str, level: int, parent: str | None, colour, code: str | None = None, dataset_tokens: List[str] | None = None):
        self.id = id
        self.name = name
        self.level = level
        self.parent = parent
        self.children: List[str] = []
        self.colour = colour
        self.code = code or id
        self.dataset_tokens = set(dataset_tokens or [])
        self.count = 0
        self.bitmask_file = None

    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "level": self.level,
            "parent": self.parent,
            "children": self.children,
            "colour": self.colour,
            "count": self.count,
            "bitmask_file": self.bitmask_file,
        }


def load_base_colours(old_info, group_key):
    base = {}
    grp = old_info.get("groups", {}).get(group_key, {})
    for label_key, lbl in grp.get("labels", {}).items():
        # label_key like threats|0 → use order
        base_idx = label_key.split("|")[-1]
        base[str(base_idx)] = lbl.get("colour")
        base[slugify(lbl.get("name", ""))] = lbl.get("colour")
    return base


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


# ── Build label trees ──────────────────────────────────────────────────────
def build_flat_group(old_info, group_key, col_name, values: List[str], synonyms_map: Dict[str, List[str]] | None = None) -> Dict:
    grp = old_info["groups"].get(group_key, {})
    labels_out: Dict[str, Label] = {}
    for idx, value in enumerate(values):
        old_lbl = grp.get("labels", {}).get(f"{group_key}|{idx}", {})
        extra_tokens = synonyms_map.get(value, []) if synonyms_map else []
        labels_out[value] = Label(
            id=value,
            name=old_lbl.get("name", value.replace("_", " ").title()),
            level=0,
            parent=None,
            colour=old_lbl.get("colour", [30, 50, 50]),
            code=value,
            dataset_tokens=[value, normalise_token(value), *extra_tokens],
        )
    return {
        "name": grp.get("name", group_key),
        "type": grp.get("type", "multi"),
        "labels": labels_out,
        "column": col_name,
    }


def build_threats(old_info) -> Dict:
    data = json.loads(THREATS_PATH.read_text())
    base_colours = load_base_colours(old_info, "threats")

    labels: Dict[str, Label] = {}

    def add_level(node, level, parent_id=None):
        code = node["code"]
        name = node.get("name") or node.get("examples") or code
        anchor = base_colours.get(code) or next(iter(base_colours.values()), None)
        colour = derive_colour(anchor, level)
        lbl = Label(
            id=str(code),
            code=str(code),
            name=name,
            level=level,
            parent=parent_id,
            colour=colour,
            dataset_tokens=[str(code), slugify(name)],
        )
        labels[lbl.id] = lbl
        if parent_id:
            labels[parent_id].children.append(lbl.id)

        # level1/level2 keys are nested dictionaries
        if "level1" in node:
            for child_name, child in node["level1"].items():
                child = dict(child)
                child.setdefault("name", child_name)
                add_level(child, level + 1, lbl.id)
        if "level2" in node:
            for child_name, child in node["level2"].items():
                child = dict(child)
                child.setdefault("name", child_name)
                add_level(child, level + 1, lbl.id)

    for name, node in data.get("threats", {}).items():
        root = dict(node)
        root.setdefault("name", name)
        add_level(root, 0, None)

    return {
        "name": "IUCN threats",
        "type": "hierarchical",
        "level_order": ["L0", "L1", "L2"],
        "labels": labels,
        "columns": {0: COLUMNS["threat_l0"], 1: COLUMNS["threat_l1"], 2: COLUMNS["threat_l2"]},
    }


def build_ecosystems(old_info) -> Dict:
    data = json.loads(ECOSYSTEM_PATH.read_text())
    base_colours = load_base_colours(old_info, "realm")
    labels: Dict[str, Label] = {}

    for realm_key, realm_obj in data.items():
        realm_name = realm_obj.get("name", realm_key)
        realm_slug = slugify(realm_name)
        base_colour = base_colours.get(realm_slug) or next(iter(base_colours.values()), None)
        realm_label = Label(
            id=realm_slug,
            code=realm_slug,
            name=realm_name,
            level=0,
            parent=None,
            colour=derive_colour(base_colour, 0),
            dataset_tokens=[realm_slug, normalise_token(realm_name)],
        )
        labels[realm_label.id] = realm_label

        for biome in realm_obj.get("biomes", []):
            biome_code = biome.get("code")
            biome_name = biome.get("name", biome_code)
            biome_label = Label(
                id=biome_code,
                code=biome_code,
                name=biome_name,
                level=1,
                parent=realm_label.id,
                colour=derive_colour(base_colour, 1),
                dataset_tokens=[biome_code, slugify(biome_name)],
            )
            labels[realm_label.id].children.append(biome_label.id)
            labels[biome_label.id] = biome_label

            for efg in biome.get("efg", []):
                efg_code = efg.get("code")
                efg_name = efg.get("name", efg_code)
                efg_label = Label(
                    id=efg_code,
                    code=efg_code,
                    name=efg_name,
                    level=2,
                    parent=biome_label.id,
                    colour=derive_colour(base_colour, 2),
                    dataset_tokens=[efg_code, slugify(efg_name)],
                )
                labels[biome_label.id].children.append(efg_label.id)
                labels[efg_label.id] = efg_label

    return {
        "name": "Ecosystem typology (GET)",
        "type": "hierarchical",
        "level_order": ["realm", "biome", "efg"],
        "labels": labels,
        "columns": {0: COLUMNS["realm"], 1: COLUMNS["biome"], 2: COLUMNS["efg"]},
    }


def build_geography(old_info) -> Dict:
    data = json.loads(REGIONS_PATH.read_text())
    base_colours = load_base_colours(old_info, "region")
    labels: Dict[str, Label] = {}

    for region_name, subregions in data.items():
        region_slug = slugify(region_name)
        base_colour = base_colours.get(region_slug) or next(iter(base_colours.values()), None)
        region_label = Label(
            id=region_slug,
            code=region_slug,
            name=region_name,
            level=0,
            parent=None,
            colour=derive_colour(base_colour, 0),
            dataset_tokens=[region_slug, normalise_token(region_name)],
        )
        labels[region_label.id] = region_label

        for subregion_name, countries in subregions.items():
            sub_slug = slugify(subregion_name)
            sub_label = Label(
                id=sub_slug,
                code=sub_slug,
                name=subregion_name,
                level=1,
                parent=region_label.id,
                colour=derive_colour(base_colour, 1),
                dataset_tokens=[sub_slug, normalise_token(subregion_name)],
            )
            labels[region_label.id].children.append(sub_label.id)
            labels[sub_label.id] = sub_label

            if EMIT_COUNTRY_LABELS:
                for country in countries:
                    iso3 = country.get("ISO_3166_alpha_3") or country.get("Country")
                    country_name = country.get("Country", iso3)
                    country_label = Label(
                        id=iso3,
                        code=iso3,
                        name=country_name,
                        level=2,
                        parent=sub_label.id,
                        colour=derive_colour(base_colour, 2),
                        dataset_tokens=[normalise_token(iso3), iso3, slugify(country_name)],
                    )
                    labels[sub_label.id].children.append(country_label.id)
                    labels[country_label.id] = country_label

    # Synthetic global / multi-region label to catch "All Region" etc.
    if "global" not in labels:
        base_colour = next(iter(base_colours.values()), [0, 0, 60])
        global_lbl = Label(
            id="global",
            code="global",
            name="Global / multi-region",
            level=0,
            parent=None,
            colour=derive_colour(base_colour, 0),
            dataset_tokens=["global", "all_region", "global_multi_region"],
        )
        labels[global_lbl.id] = global_lbl

    return {
        "name": "Geography (IPBES)",
        "type": "hierarchical",
        "level_order": ["region", "subregion"] if not EMIT_COUNTRY_LABELS else ["region", "subregion", "country"],
        "labels": labels,
        "columns": {0: COLUMNS["region"], 1: COLUMNS["subregion"], **({2: COLUMNS["country"]} if EMIT_COUNTRY_LABELS else {})},
    }


# ── Bitmask construction ───────────────────────────────────────────────────
def build_leaf_masks(df: pd.DataFrame, group_key: str, group_spec: Dict, labels: Dict[str, Label]) -> Dict[str, pd.Series]:
    masks = {}
    columns = group_spec.get("columns") or {0: group_spec["column"]}

    def tokens_from_values(values):
        tokens = []
        for v in values:
            norm = normalise_token(v)
            if group_key == "realm":
                # split combined realm strings on - /
                parts = re.split(r"[-/]", norm) if norm else []
                tokens.extend([p for p in parts if p])
                tokens.append(norm)
            else:
                tokens.append(norm)
        if group_key == "realm" and "all_realms" in tokens:
            tokens.extend([l.id for l in labels.values() if l.level == 0])
        if group_key == "region":
            tokens = [REGION_SYNONYMS.get(t, t) for t in tokens]
        if group_key == "drivers":
            tokens = [DRIVER_SYNONYMS.get(t, t) for t in tokens]
        return set(tokens)

    cache = {}

    for label in labels.values():
        col_name = columns.get(label.level)
        if not col_name or col_name not in df.columns:
            continue
        col_data = column_list(df[col_name])
        target_tokens = set(label.dataset_tokens or {normalise_token(label.id)})

        def matcher(vals):
            key = tuple(vals)
            if key not in cache:
                cache[key] = tokens_from_values(vals)
            toks = cache[key]
            return len(target_tokens & toks) > 0

        masks[label.id] = col_data.apply(matcher)

    return masks


def propagate_parent_masks(labels: Dict[str, Label], masks: Dict[str, pd.Series]) -> None:
    # Post-order traversal via repeated aggregation until all have masks
    pending = True
    while pending:
        pending = False
        for lbl in labels.values():
            if lbl.id in masks:
                continue
            if not lbl.children:
                continue
            if any(child_id not in masks for child_id in lbl.children):
                pending = True
                continue
            # OR children
            agg = masks[lbl.children[0]].copy()
            for child_id in lbl.children[1:]:
                agg = agg | masks[child_id]
            masks[lbl.id] = agg


def write_bitmasks(group_key: str, labels: Dict[str, Label], masks: Dict[str, pd.Series], byte_len: int):
    for label_id, series in masks.items():
        bitmask_bytes = make_bitmask(series)
        filename = f"{group_key}__{label_id}.bin"
        out_path = BITMASK_DIR / filename
        out_path.write_bytes(bitmask_bytes)

        lbl = labels[label_id]
        lbl.count = int(series.sum())
        lbl.bitmask_file = filename


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    print(f"Reading {DATA_IN}")
    df = pd.read_parquet(DATA_IN)
    n = len(df)
    print(f"  {n:,} records")

    ensure_dir(BITMASK_DIR)
    for f in BITMASK_DIR.glob("*.bin"):
        f.unlink()

    old_info = json.loads(INFO_FRONTEND.read_text()) if INFO_FRONTEND.exists() else {"groups": {}}

    year_col = "Publication Year" if "Publication Year" in df.columns else "year"
    info = {
        "name": old_info.get("name", "Biodiversity Loss Literature Map"),
        "total": n,
        "start_year": int(df[year_col].min()),
        "end_year": int(df[year_col].max()),
        "groups": {},
    }

    # ── Flat groups ───────────────────────────────────────────────────
    # Build per-label synonym token lists
    driver_syn_tokens: Dict[str, List[str]] = {k: [] for k in [
        "land_sea_use_change",
        "direct_exploitation",
        "climate_change",
        "pollution",
        "invasive_alien_species",
    ]}
    for syn, target in DRIVER_SYNONYMS.items():
        driver_syn_tokens.setdefault(target, []).append(syn)

    direction_syn_tokens: Dict[str, List[str]] = {
        "negative": ["neg"],
        "positive": ["pos"],
        "mixed": [],
        "unclear": ["unknown"],
    }

    flat_specs = {
        "drivers": {
            "col": COLUMNS["drivers"],
            "values": [
                "land_sea_use_change",
                "direct_exploitation",
                "climate_change",
                "pollution",
                "invasive_alien_species",
            ],
            "synonyms": driver_syn_tokens,
        },
        "study_design": {
            "col": COLUMNS["study_design"],
            "values": [
                "observational",
                "experimental",
                "quasi_experimental",
                "modelling",
                "review",
                "unclear",
            ],
            "synonyms": {},
        },
        "direction": {
            "col": COLUMNS["direction"],
            "values": ["negative", "positive", "mixed", "unclear"],
            "synonyms": direction_syn_tokens,
        },
    }

    byte_len = math.ceil(n / 8)

    for gkey, spec in flat_specs.items():
        grp = build_flat_group(old_info, gkey, spec["col"], spec["values"], spec.get("synonyms"))
        labels = grp.pop("labels")
        # masks for flat groups
        masks = {}
        col = spec["col"]
        if col not in df.columns:
            print(f"WARN: column {col} missing, skipping {gkey}")
            continue
        col_data = column_list(df[col])
        for lbl in labels.values():
            tokens = lbl.dataset_tokens or {lbl.id}
            masks[lbl.id] = col_data.apply(lambda vals: any(normalise_token(v) in tokens for v in vals))
        propagate_parent_masks(labels, masks)
        write_bitmasks(gkey, labels, masks, byte_len)
        info["groups"][gkey] = {
            "name": grp.get("name", gkey),
            "type": grp.get("type", "multi"),
            "labels": {lid: lbl.to_dict() for lid, lbl in labels.items()},
        }

    # ── Hierarchical groups ───────────────────────────────────────────
    hierarchy_builders = {
        "threats": build_threats,
        "realm": build_ecosystems,
        "region": build_geography,
    }

    for gkey, builder in hierarchy_builders.items():
        grp = builder(old_info)
        labels: Dict[str, Label] = grp.pop("labels")
        masks = build_leaf_masks(df, gkey, grp, labels)
        propagate_parent_masks(labels, masks)
        write_bitmasks(gkey, labels, masks, byte_len)
        info["groups"][gkey] = {
            "name": grp.get("name", gkey),
            "type": "hierarchical",
            "level_order": grp.get("level_order"),
            "labels": {lid: lbl.to_dict() for lid, lbl in labels.items()},
        }

    # ── Write info.json to both locations ─────────────────────────────
    INFO_FRONTEND.write_text(json.dumps(info, indent=2))
    ensure_dir(INFO_API.parent)
    INFO_API.write_text(json.dumps(info, indent=2))

    print(f"Wrote info.json to {INFO_FRONTEND} and {INFO_API}")
    print(f"Bitmasks in {BITMASK_DIR}")


if __name__ == "__main__":
    main()
