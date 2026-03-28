# Biodiversity Systematic Map — Website Architecture & Build Guidelines

**Project:** Mapping scientific literature on biodiversity with machine learning  
**Authors:** Hunain Mohuiddin, Kerstin Forster, Stefan Feuerriegel  
**Reference implementation:** climateliterature.org (CDR Literature Map, Lück et al.)

---

## 1. What this document is

A concise reference for building the interactive web interface that presents the
systematic map dataset. It mirrors the architecture of climateliterature.org but is
adapted to the biodiversity corpus and its specific label structure. The document
covers data model, tech stack, offline build pipeline, and UI panel design.

---

## 2. Dataset produced by the thesis pipeline

The website is built from the systematic map dataset.

| Dataset                    | Contents                              | Size (est.) |
| -------------------------- | ------------------------------------- | ----------- |
| **Systematic map dataset** | ~342K eligible records × L1–L6 labels | **~1–2 GB** |

Each row in the systematic map dataset is one eligible article with fields:

```
id, title, abstract, year, doi, authors, wos_id,
L1_drivers[],           # IPBES: up to 5 values
L2_threat_l0[],         # IUCN L0: up to 11 categories
L2_threat_l1[],         # IUCN L1: specific threats
L2_threat_l2[],         # IUCN L2: most specific threats
L3_scope,               # spatial scope (global / regional / country / site)
L3_regions[],           # IPBES regions
L3_subregions[],        # IPBES subregions
L3_countries[],         # ISO 3166-1 alpha-3 codes
L4_realm[],             # GET realm
L4_biome[],             # GET biome
L4_efg[],               # GET ecosystem functional group
L5_study_design,        # observational / experimental / modelling / review / ...
L5_methods_data[],      # field survey, remote sensing, ...
L5_methods_analysis[],  # GLM, SDM, ...
L5_has_comparison,      # boolean
L6_kingdom[],           # GBIF kingdom
L6_phylum[],            # GBIF phylum
L6_class[],             # GBIF class
L6_order[],             # ...
umap_x, umap_y          # pre-computed UMAP coords (added by export script)
```

---

## 3. Tech stack

| Layer               | Choice                          | Rationale                                    |
| ------------------- | ------------------------------- | -------------------------------------------- |
| Frontend SPA        | **React** (or Vue)              | Simple hash routing; matches skill set       |
| Static file hosting | **GitHub Pages**                | Free; Arrow + bitmask files are static       |
| API backend         | **FastAPI** (Python)            | Reuses thesis Python stack; 2 endpoints only |
| API hosting         | **Fly.io** free tier            | ~256 MB RAM sufficient for SQLite queries    |
| Bulk data format    | **Apache Arrow** (`slim.arrow`) | Binary columnar; browser reads without API   |
| Filter engine       | **Client-side bitmask**         | Bitwise AND → instant filter counts          |
| Full record DB      | **SQLite** (`documents.sqlite`) | Served by FastAPI; single file, portable     |
| Info pages          | **Markdown files**              | Rendered by frontend; no CMS needed          |

---

## 4. Offline build pipeline

Run once (or whenever the pipeline output is updated). Outputs are static files
committed to the GitHub Pages repo, plus a SQLite file deployed with the API.

```
Python pipeline output (Parquet / CSV)
        │
        ├─► export_arrow.py
        │       reads systematic_map.parquet
        │       selects: id, title, year, umap_x, umap_y
        │       writes: static/data/slim.arrow
        │
        ├─► compute_umap.py
        │       reads abstracts (or cached embeddings)
        │       runs umap-learn on sentence-transformer embeddings
        │       writes: umap_coords.parquet  (merged upstream)
        │
        ├─► export_bitmasks.py
        │       for each label value in each label group:
        │           builds a uint8 packed array (1 bit per record, order = slim.arrow idx)
        │           writes: static/data/bitmasks/{group}|{value_idx}.bin
        │       also writes: static/data/info.json  (label registry, see §6)
        │
        └─► export_sqlite.py
                writes: documents.sqlite
                table: documents (all fields from systematic_map.parquet)
                table: labels (doc_id, label_group, label_key, score)
                index on doc_id, label_group
```

Total static asset size estimate: ~15 MB Arrow + ~3 MB bitmasks = ~18 MB.  
SQLite full database: ~500 MB (stays server-side, never shipped to browser).

---

## 5. API (FastAPI) — only 2 endpoints needed

```python
GET  /api/info
     → returns info.json (label registry, map metadata)

POST /api/documents
     body: { "ids": [int], "page": int, "limit": int }
     → returns paginated list of full document records from SQLite
       (the frontend supplies the filtered id list from client-side bitmask logic)
```

That's it. No server-side filtering logic — all filtering happens in the browser.

---

## 6. info.json — the label registry

The frontend loads this once on startup. It defines every filter group and label
so the UI can render filter panels dynamically.

```json
{
  "name": "Biodiversity Loss Literature Map",
  "total": 342424,
  "start_year": 2000,
  "end_year": 2025,
  "groups": {
    "drivers": {
      "name": "IPBES direct drivers",
      "type": "multi",
      "labels": {
        "drivers|0": { "name": "Land/sea use change",      "colour": [120, 60, 50] },
        "drivers|1": { "name": "Direct exploitation",      "colour": [30,  70, 55] },
        "drivers|2": { "name": "Climate change",           "colour": [200, 80, 60] },
        "drivers|3": { "name": "Pollution",                "colour": [270, 50, 55] },
        "drivers|4": { "name": "Invasive alien species",   "colour": [50,  75, 50] }
      }
    },
    "threats": {
      "name": "IUCN threats (L0)",
      "type": "multi",
      "labels": { ... }   // 11 IUCN L0 categories
    },
    "realm": {
      "name": "Ecosystem realm (GET)",
      "type": "multi",
      "labels": { ... }   // ~6 GET realms
    },
    "study_design": {
      "name": "Study design",
      "type": "single",
      "labels": { ... }   // observational, experimental, modelling, review, ...
    },
    "kingdom": {
      "name": "Taxonomic group",
      "type": "multi",
      "labels": { ... }   // Animalia, Plantae, Fungi, Bacteria, ...
    },
    "region": {
      "name": "Geography (IPBES region)",
      "type": "multi",
      "labels": { ... }   // Americas, Africa, Asia-Pacific, Europe & C. Asia, Global
    },
    "direction": {
      "name": "Direction of change",
      "type": "single",
      "labels": { ... }   // negative, positive, mixed, unclear
    }
  }
}
```

**Note on hierarchy:** IUCN threats and GET ecosystems are three-level hierarchies.
For V1, expose only L0 (threats) and realm (GET) as filters. L1/L2 and biome/EFG
can be added in V2 as drill-down sub-filters once the core UI is stable.

---

## 7. Bitmask design

Each bitmask file covers all N records in the order they appear in `slim.arrow`.

```
filename:  bitmasks/drivers|0.bin
format:    packed uint8 array
length:    ceil(N / 8) bytes  →  ceil(342424 / 8) = 42804 bytes ≈ 42 KB per file
bit value: 1 = record has this label, 0 = does not
```

Number of bitmask files: roughly 5 (drivers) + 11 (IUCN L0) + 6 (realm) + 6 (study
design) + 8 (kingdom) + 6 (region) + 4 (direction) = **~46 files × 42 KB ≈ 2 MB
total.** Loaded once on startup; all filtering thereafter is purely in-memory.

Client-side AND logic (JavaScript):

```javascript
// Example: user selects drivers|0 AND realm|2
function applyFilters(selectedBitmasks) {
  let result = new Uint8Array(selectedBitmasks[0]); // start with first selection
  for (let i = 1; i < selectedBitmasks.length; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] &= selectedBitmasks[i][j]; // bitwise AND
    }
  }
  return result; // then extract 1-bits as record indices
}
```

---

## 8. slim.arrow schema

Loaded once on startup (~15 MB). Powers the scatterplot and record count display.
Does **not** include abstracts — those live in SQLite, fetched on demand.

```
id:       int32      WoS record identifier
year:     int16      publication year
umap_x:   float32    UMAP x coordinate
umap_y:   float32    UMAP y coordinate
title:    utf8       truncated to ~120 chars for display
```

The UMAP projection is computed offline from sentence-transformer embeddings of
titles + abstracts. A 2D UMAP at perplexity 30, n_neighbors 15 on 342K records
takes ~2–4 hours on CPU; run once and cache the coordinates.

---

## 9. UI panels

Three-panel layout identical to climateliterature.org:

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Explorer]  [Info]                                    [Download]   │
├──────────────────┬──────────────────────┬───────────────────────────┤
│  FILTERS         │  SCATTERPLOT         │  RESULTS                  │
│                  │  (UMAP, 342K dots,   │  (paginated cards,        │
│  Year histogram  │   colour by label,   │   title, year, authors,   │
│                  │   grey on filter)    │   abstract excerpt,       │
│  IPBES drivers   │                      │   label badges,           │
│  IUCN threats    │                      │   DOI link)               │
│  Ecosystem realm │                      │                           │
│  Study design    │                      │  « 1 2 3 4 5 ... »        │
│  Taxonomic group │                      │                           │
│  Geography       │                      │                           │
│  Direction       │                      │                           │
└──────────────────┴──────────────────────┴───────────────────────────┘
```

**Info tab** renders from markdown:

- `info.md` — title, authors, citation (link to thesis / paper), abstract,
  brief methods summary, link to PROCEED registration
- `protocol.md` — link to supplementary protocol (optional separate tab)

---

## 10. Filter panel design notes

| Filter              | Type      | Display                               | Notes                              |
| ------------------- | --------- | ------------------------------------- | ---------------------------------- |
| Publication year    | Histogram | Bar chart, drag to select range       | Range 2000–2025                    |
| IPBES drivers       | Tag cloud | Coloured pill per driver, count badge | Multi-select; OR within group      |
| IUCN threats L0     | Tag cloud | 11 categories                         | Expandable to L1 in V2             |
| Ecosystem realm     | Tag cloud | 6 GET realms                          | Expandable to biome in V2          |
| Study design        | Tag cloud | 6 categories                          | Single-select or multi             |
| Taxonomic group     | Tag cloud | Kingdom level; ~8 groups              | Expandable to phylum in V2         |
| Geography           | Tag cloud | IPBES regions (5)                     | Geographic map view optional in V2 |
| Direction of change | Tag cloud | negative / positive / mixed / unclear |                                    |

Colour coding for scatterplot dots: default = colour by IPBES driver (same palette
as in driver filter chips). Secondary colour modes: by ecosystem realm, by kingdom.
Use HSL colours stored in info.json (same format as CDR map).

---

## 11. Download

Expose a download button in the header that serves the full systematic map dataset
as a zipped CSV or Parquet from a static URL. This satisfies CEE open-data
requirements and matches climateliterature.org's download pattern.

---

## 12. Build sequence (summary)

```
1. Freeze systematic_map.parquet from pipeline output
2. Run compute_umap.py  →  adds umap_x, umap_y columns
3. Run export_arrow.py  →  static/data/slim.arrow
4. Run export_bitmasks.py  →  static/data/bitmasks/*.bin + info.json
5. Run export_sqlite.py  →  api/documents.sqlite
6. Write info.md + methods.md  (markdown prose for Info tab)
7. Deploy static/ to GitHub Pages
8. Deploy api/ (FastAPI + documents.sqlite) to Fly.io
9. Set VITE_API_URL env var in frontend build to point at Fly.io URL
```

Steps 1–6 are reproducible offline scripts; re-run whenever the pipeline output
is updated. Steps 7–9 are one-time deployment configuration.

---

## 13. V1 scope (thesis deadline) vs V2

| Feature                                  | V1  | V2  |
| ---------------------------------------- | --- | --- |
| Filter panel (L0 / realm / kingdom)      | ✓   | —   |
| UMAP scatterplot                         | ✓   | —   |
| Paginated results                        | ✓   | —   |
| Info tab from markdown                   | ✓   | —   |
| Download button                          | ✓   | —   |
| Hierarchical drill-down (L1/L2, biome)   | —   | ✓   |
| Geographic map view (country choropleth) | —   | ✓   |
| Label correlation matrix                 | —   | ✓   |
| Full-text search                         | —   | ✓   |

V1 is fully functional and presentable for the thesis; V2 adds analytical depth.

---

_Last updated: March 2026_
