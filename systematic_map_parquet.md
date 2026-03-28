# systematic_map.parquet — Schema Reference

Input file for the build pipeline. Place at `data/systematic_map.parquet` (not committed to git).

---

## Required columns

### Core fields

| Column    | Type   | Example                        | Notes                        |
|-----------|--------|--------------------------------|------------------------------|
| `id`      | int    | `1042`                         | Unique article identifier    |
| `title`   | str    | `"Biodiversity loss in..."`    | Truncated to 120 chars in slim.arrow |
| `abstract`| str    | `"This study investigates..."` | Stays in SQLite only, never sent to browser in bulk |
| `year`    | int    | `2019`                         | Publication year             |
| `doi`     | str    | `"10.1038/s41586-020-0000-0"`  | Can be null                  |
| `authors` | str    | `"Smith J, Doe A et al."`      | Can be null                  |

### Label columns (added by your classification pipeline)

| Column           | Type        | Values (must match exactly)                                                                                   | Notes         |
|------------------|-------------|---------------------------------------------------------------------------------------------------------------|---------------|
| `L0_direction`   | str scalar  | `"negative"`, `"positive"`, `"mixed"`, `"unclear"`                                                           | One value per article |
| `L1_drivers`     | list[str]   | `"land_sea_use_change"`, `"direct_exploitation"`, `"climate_change"`, `"pollution"`, `"invasive_alien_species"` | Can be empty list |
| `L2_threat_l0`   | list[str]   | `"residential_commercial_development"`, `"agriculture_aquaculture"`, `"energy_production_mining"`, `"transportation_corridors"`, `"biological_resource_use"`, `"human_intrusions"`, `"natural_system_modifications"`, `"invasive_problematic_species"`, `"pollution"`, `"geological_events"`, `"climate_change_severe_weather"` | Can be empty list |
| `L2_threat_l1`   | list[str]   | Finer-grained threat subcategories                                                                            | Not used in frontend yet, can be empty list |
| `L3_regions`     | list[str]   | `"americas"`, `"africa"`, `"asia_pacific"`, `"europe_central_asia"`, `"global"`                              | Can be empty list |
| `L4_realm`       | list[str]   | `"terrestrial"`, `"freshwater"`, `"marine"`, `"subterranean"`, `"atmospheric"`, `"transitional"`             | Can be empty list |
| `L5_study_design`| str scalar  | `"observational"`, `"experimental"`, `"quasi_experimental"`, `"modelling"`, `"review"`, `"unclear"`          | One value per article |
| `L6_kingdom`     | list[str]   | `"animalia"`, `"plantae"`, `"fungi"`, `"bacteria"`, `"chromista"`, `"protozoa"`, `"archaea"`, `"not_coded"`  | Can be empty list |

### UMAP columns (added by compute_umap.py — not in the raw parquet)

| Column   | Type    | Notes                                  |
|----------|---------|----------------------------------------|
| `umap_x` | float32 | Added by `scripts/compute_umap.py`     |
| `umap_y` | float32 | Added by `scripts/compute_umap.py`     |

The raw parquet does **not** need these — `compute_umap.py` adds them and writes `systematic_map_umap.parquet`.

---

## CRITICAL: label values are exact-match strings

The pipeline matches label values with `==` or `value in list`. If your parquet uses different casing or formatting, bitmasks will silently be all zeros (no error).

**Examples of mismatches that will break things:**

| Your parquet has     | Pipeline expects          | Result              |
|----------------------|---------------------------|---------------------|
| `"climate change"`   | `"climate_change"`        | bitmask all zeros   |
| `"Climate_Change"`   | `"climate_change"`        | bitmask all zeros   |
| `"land use change"`  | `"land_sea_use_change"`   | bitmask all zeros   |

If your parquet uses different strings, update the `values` lists in `scripts/export_bitmasks.py` to match — do not change the parquet.

---

## Example rows

```
id    title                          abstract      year  doi              authors         L0_direction  L1_drivers                          L4_realm                  L5_study_design
1042  "Coral bleaching in Pacific..."  "..."       2019  "10.1038/..."    "Smith J..."    "negative"    ["climate_change", "pollution"]      ["marine"]                "observational"
1043  "Forest loss in Amazon..."       "..."       2021  "10.1016/..."    "Doe A..."      "negative"    ["land_sea_use_change"]              ["terrestrial"]           "modelling"
1044  "Multi-threat review..."         "..."       2023  null             "Lee B..."      "mixed"       ["climate_change", "pollution"]      ["terrestrial", "marine"] "review"
```

---

## Pipeline order

```bash
# Place your parquet first:
cp your_output.parquet data/systematic_map.parquet

# Then run in order:
cd scripts
python compute_umap.py        # ~2-4 hrs on CPU; adds umap_x, umap_y
python export_arrow.py        # → frontend/public/data/slim.arrow
python export_bitmasks.py     # → frontend/public/data/bitmasks/*.bin + info.json
python export_sqlite.py       # → api/documents.sqlite
```

For UI development without real data, skip all of this and run:
```bash
cd scripts
python generate_mock_data.py  # generates all output files with 1000 fake records
```
