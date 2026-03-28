# Biodiversity Loss Literature Map

**Authors:** Hunain Mohuiddin, Kerstin Forster, Stefan Feuerriegel  
**Affiliation:** LMU Munich · Munich Center for Machine Learning

## Citation

> Mohuiddin H, Forster K, Feuerriegel S. *Mapping scientific literature on
> biodiversity with machine learning.* Master's thesis, LMU Munich, 2025.

## Abstract

Biological diversity underpins ecosystem functioning and planetary resilience.
Biodiversity research has expanded rapidly, yet keeping track of which habitats
are most studied remains a major challenge. Here we present a large language
model (LLM)–based framework to systematically map biodiversity research at scale.
Our framework classifies scientific publications according to multiple taxonomies,
including habitats, geographic regions, and conservation actions. We further link
each paper to over two million described species, providing granular evidence that
can inform conservation priorities for endangered taxa. Applied to 342,424 scientific
articles, our machine-learning-based mapping reveals disparities in research
attention across habitats and regions, and differences in how species and
conservation measures are studied.

## Data & Methods

We followed the [CEE Guidelines for Systematic Maps](https://www.environmentalevidence.org/information-for-authors/guidance-for-authors-systematic-maps)
and screened 2.3 million Web of Science records for evidence of biodiversity loss
linked to direct anthropogenic drivers. Eligible records were coded across six
label sets using GPT-5-Nano with zero-shot prompting:

- **L1 IPBES drivers** — five broad direct driver categories
- **L2 IUCN threats** — hierarchical (L0–L2) threat classification
- **L3 Geography** — IPBES regions, subregions, ISO country codes
- **L4 Ecosystems** — Global Ecosystem Typology (realm, biome, EFG)
- **L5 Study attributes** — study design, methods, comparator structure
- **L6 Taxonomy** — GBIF backbone taxonomy

The systematic map protocol is registered at
[PROCEED Evidence Registry](https://www.proceedevidence.info).

## Contact

Stefan Feuerriegel · feuerriegel@lmu.de
