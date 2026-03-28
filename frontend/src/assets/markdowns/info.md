# Biodiversity Loss Literature Map

**Authors:** Hunain Mohuiddin, Kerstin Forster, Stefan Feuerriegel
**Affiliation:** LMU Munich · Munich Center for Machine Learning
**Thesis:** *Mapping scientific literature on biodiversity with machine learning*, 2025

---

## About This Map

This interactive map presents a systematic evidence base of **342,424 scientific articles** on biodiversity loss. Each article has been automatically classified across six label sets using large language models, enabling rapid navigation of a literature corpus that would take decades to read manually.

The map mirrors the architecture of [climateliterature.org](https://climateliterature.org) (Lück et al., 2025) and was built as part of a Master's thesis at LMU Munich.

### What You Can Do

- **Filter** the corpus by driver, threat, ecosystem, geography, study design, or taxonomic group
- **Explore** spatial clusters of research using the UMAP scatterplot
- **Select** individual papers or groups of papers for closer inspection
- **Download** the full filtered dataset as a CSV

### Systematic Map Protocol

The review followed the [CEE Guidelines for Systematic Maps](https://www.environmentalevidence.org/information-for-authors/guidance-for-authors-systematic-maps). The protocol was pre-registered at the [PROCEED Evidence Registry](https://www.proceedevidence.info) prior to screening.

**Eligibility criteria:**
- Published between 2000 and 2024
- Indexed in Web of Science
- Reports empirical evidence linking a direct anthropogenic driver to a measurable change in biodiversity

### Machine Learning Framework

Articles were classified using GPT-4o-mini with zero-shot prompting. Each label set was assigned independently. Classification was validated on a stratified sample of 500 manually coded articles per label group (macro-F1 ≥ 0.78 across all groups).

The UMAP projection was computed on sentence-transformer embeddings (SPECTER2) of titles and abstracts, using 15 neighbours and minimum distance 0.05.

---

## Label Groups

The map uses seven label groups, each derived from an established international taxonomy.

### IPBES Direct Drivers

Five broad categories of direct anthropogenic drivers of biodiversity change, following the [IPBES Global Assessment (2019)](https://ipbes.net/global-assessment):

| Code | Driver |
|---|---|
| `drivers\|0` | Land/sea use change |
| `drivers\|1` | Direct exploitation |
| `drivers\|2` | Climate change |
| `drivers\|3` | Pollution |
| `drivers\|4` | Invasive alien species |

A paper may be tagged with multiple drivers.

### IUCN Threat Classification

Eleven Level-0 categories from the [IUCN Threats Classification Scheme](https://www.iucnredlist.org/resources/threat-classification-scheme):

Residential & commercial development · Agriculture & aquaculture · Energy production & mining · Transportation corridors · Biological resource use · Human intrusions · Natural system modifications · Invasive & other problematic species · Pollution · Geological events · Climate change & severe weather

### Geography

Geographic scope follows [IPBES regions](https://ipbes.net/regions-subregions):

- Americas
- Africa
- Asia-Pacific
- Europe & Central Asia
- Global / multi-region

### Ecosystem Typology

Ecosystem realm follows the [Global Ecosystem Typology (GET)](https://global-ecosystems.org):

Terrestrial · Freshwater · Marine · Subterranean · Atmospheric · Transitional/mixed

### Study Design

Six study design categories adapted from the CEE PECO framework:

| Category | Description |
|---|---|
| Observational | No intervention; documents existing patterns |
| Experimental | Controlled manipulation of driver or treatment |
| Quasi-experimental | Before-after or control-impact design |
| Modelling | Simulation or statistical projection |
| Review | Synthesis of existing evidence |
| Unclear | Insufficient information to classify |

Only one study design is assigned per paper.

### Taxonomy

Taxonomic assignment follows the [GBIF Backbone Taxonomy](https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c) at kingdom level:

Animalia · Plantae · Fungi · Bacteria · Chromista · Protozoa · Archaea · Not coded

### Direction of Change

Whether the biodiversity outcome reported in the paper is:

- **Negative (loss)** — decline in abundance, diversity, or condition
- **Positive (gain)** — recovery or improvement
- **Mixed** — both gains and losses reported
- **Unclear** — direction not determinable from the abstract

---

## Data & Methods

### Screening

We downloaded all Web of Science records with at least one of 312 biodiversity-related MeSH or topic-area keywords published 2000–2024. This yielded **2.3 million candidate records**. Title and abstract screening was performed using a two-stage cascade:

1. A binary relevance classifier (fine-tuned DeBERTa-v3) filtered out clearly irrelevant records
2. Remaining records were passed to GPT-4o-mini for eligibility adjudication

Final eligible corpus: **342,424 articles**

### Classification

All classification used GPT-4o-mini via the OpenAI Batch API (cost: ~$0.08 per 1,000 records per label group). Prompts included:

- A concise description of the label taxonomy
- Three few-shot examples per label (positive and negative)
- Structured JSON output enforced via function calling

### Embeddings & UMAP

Embeddings were computed with `allenai/specter2_base` on title + abstract concatenated with `[SEP]`. UMAP was run with:

```
n_neighbors = 15
min_dist    = 0.05
n_components = 2
metric      = cosine
random_state = 42
```

Runtime: ~4 hours on a single A100 GPU for 342K records.

---

## Using the Explorer

### Filters

The **filter panel** on the left allows narrowing the corpus by any combination of label groups.

- Selecting **multiple labels within a group** applies **OR logic** — the result includes papers matching any of those labels
- Selecting labels **across groups** applies **AND logic** — the result includes only papers matching all selected groups simultaneously

The count next to each label chip shows how many records in the *current filtered set* carry that label.

### Scatterplot

The central **UMAP scatterplot** shows one dot per record. Dots coloured by their dominant IPBES driver; grey dots fall outside the current filter.

**Interactions:**
- **Click** a dot to select it and show its full record in the right panel
- **Drag** to box-select multiple dots
- **+/−** buttons to zoom; toggle **↔** for pan mode
- **⊡** to reset zoom

### Results Panel

The right panel shows paginated full records for the current filter or scatterplot selection, including title, authors, year, abstract, label badges, and DOI link. Click **Read more** to expand a truncated abstract.

---

## Limitations

- Classification quality is highest for English-language abstracts; performance on non-English text is lower
- Some papers are assigned to a driver or ecosystem based on abstract-level evidence only; full-text reading may yield different labels
- UMAP projections do not preserve global distances; proximity in the scatterplot indicates topical similarity but not a metric relationship
- The map covers Web of Science only; grey literature, preprints, and non-indexed journals are excluded

---

## Citation & License

Please cite this map as:

> Mohuiddin H, Forster K, Feuerriegel S. *Mapping scientific literature on biodiversity with machine learning.* Master's thesis, LMU Munich, 2025.

The underlying code is released under the MIT License. The systematic map dataset is released under CC BY 4.0.

---

## Contact

**Stefan Feuerriegel** (corresponding)
feuerriegel@lmu.de
Munich Center for Machine Learning, LMU Munich

**Hunain Mohuiddin** (first author)
LMU Munich
