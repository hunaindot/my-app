# Dataset Notes

Quick reference for the data files used in the biodiversity map app.

---

## File overview

```
frontend/public/data/
├── slim.arrow          ← scatterplot data (342,424 articles)
├── info.json           ← label registry (filter panel config)
└── bitmasks/
    ├── drivers__0.bin  ← one file per label (~42KB each)
    ├── drivers__1.bin
    ├── threats__0.bin
    └── ...             (~40 files total)

api/
└── documents.sqlite    ← full records with abstracts (NOT committed, NOT sent to browser)
```

---

## slim.arrow

Apache Arrow binary file. A compressed columnar table — 342,424 rows, 5 columns:

| Column  | Type    | Notes                        |
|---------|---------|------------------------------|
| id      | int32   | article identifier           |
| year    | int16   | publication year             |
| umap_x  | float32 | UMAP projection x coordinate |
| umap_y  | float32 | UMAP projection y coordinate |
| title   | utf8    | truncated to 120 chars       |

Loaded once at app startup. Powers the scatterplot (one dot per row). No abstracts, no label data — kept small on purpose.

---

## info.json

The label registry. Single source of truth for what filter groups and labels exist. The filter panel reads this — label names are never hardcoded in components.

Structure:
```json
{
  "total": 342424,
  "start_year": 2000,
  "end_year": 2025,
  "groups": {
    "<group_key>": {
      "name": "Human readable name",
      "type": "multi" | "single",
      "labels": {
        "<group_key>|<index>": { "name": "Label name", "colour": [H, S, L] }
      }
    }
  }
}
```

### Label groups

| Group key    | Name                   | Type   | Labels |
|--------------|------------------------|--------|--------|
| drivers      | IPBES direct drivers   | multi  | Land/sea use change, Direct exploitation, Climate change, Pollution, Invasive alien species |
| threats      | IUCN threats (L0)      | multi  | Residential dev., Agriculture, Energy/mining, Transportation, Biological resource use, Human intrusions, Natural system modifications, Invasive sp., Pollution, Geological events, Climate change |
| realm        | Ecosystem realm (GET)  | multi  | Terrestrial, Freshwater, Marine, Subterranean, Atmospheric, Transitional/mixed |
| study_design | Study design           | single | Observational, Experimental, Quasi-experimental, Modelling, Review, Unclear |
| kingdom      | Taxonomic group        | multi  | Animalia, Plantae, Fungi, Bacteria, Chromista, Protozoa, Archaea, Not coded |
| region       | Geography (IPBES)      | multi  | Americas, Africa, Asia-Pacific, Europe & Central Asia, Global/multi-region |
| direction    | Direction of change    | single | Negative (loss), Positive (gain), Mixed, Unclear |

`type: "multi"` = OR logic within the group (select multiple).
`type: "single"` = only one label active at a time.

---

## bitmasks/

One binary file per label value. E.g. `drivers|0.bin` = the "Land/sea use change" label.

- Format: packed uint8 array (raw bytes)
- Size: ceil(342424 / 8) = **42,804 bytes** per file
- Bit `i` = 1 means article at row `i` in slim.arrow has this label

Filename pattern: `{group_key}__{label_index}.bin`

### Filtering logic

- **OR within a group**: bitwise OR the bitmasks for selected labels
- **AND between groups**: bitwise AND the group results

```js
// AND two bitmasks
for (let j = 0; j < result.length; j++)
  result[j] &= bitmasks[i][j];

// Extract matching row indices
for (let i = 0; i < bitmask.length; i++)
  for (let b = 0; b < 8; b++)
    if (bitmask[i] & (1 << b)) indices.push(i * 8 + b);
```

All loaded at startup (~40 files × 42KB ≈ a few MB). Filtering runs entirely in the browser — no API call needed.

---

## documents.sqlite (API-side only)

Full article records including abstracts and all L1–L6 label fields. Lives in `api/`. Never committed to git, never sent to the browser in bulk.

Fetched on demand via `POST /api/documents`:
```json
{ "ids": [1, 2, 3, ...], "page": 0, "limit": 10 }
```
Returns 10 records at a time, only when the user views the results panel.

---

## Data flow summary

```
User applies filters
  → bitmask AND/OR runs in browser (instant, no network)
  → scatterplot updates
  → result count shown

User scrolls Results panel
  → POST /api/documents with filtered ids (page by page)
  → SQLite returns 10 full records with abstracts
```

Full records are never loaded at startup — only fetched 10 at a time on demand.

---

## Updating the dataset

Run this when you have a new `systematic_map.parquet` file.

### 1. Regenerate static files (local)

```bash
cd scripts
python compute_umap.py       # → data/systematic_map_umap.parquet
python export_arrow.py       # → frontend/public/data/slim.arrow
python export_bitmasks.py    # → frontend/public/data/bitmasks/*.bin + info.json
python export_sqlite.py      # → api/documents.sqlite
```

### 2. Sync info.json to api/

```bash
cp frontend/public/data/info.json api/info.json
```

### 3. Upload new records to Supabase

If replacing all data, truncate the table first in the Supabase SQL editor:
```sql
TRUNCATE TABLE documents;
```

Then run the migration:
```bash
cd scripts
DATABASE_URL="..." python migrate_to_supabase.py
```

### 4. Commit and push static files

```bash
cd ..
git add frontend/public/data/ api/info.json
git commit -m "update data"
git push
```

GitHub Actions rebuilds and redeploys the frontend automatically.

### Bitmask filename convention

Bitmask files use `__` as the separator (not `|`) to avoid URL-encoding issues on GitHub Pages.
Pattern: `{group_key}__{label_index}.bin` e.g. `drivers__0.bin`

This is handled automatically by `export_bitmasks.py` — do not rename files manually.
