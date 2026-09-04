# titleForge anglophone series-name corpus — FROZEN statistics

**STATUS: FROZEN — corpus v1.0.0 (2026-09-02).** These are the authoritative
descriptive findings for deriving the series generator (Stage 4). n = 303 CORE.
SHA-256 of corpus.core.json: `4025e68d845784bcfbbffbcf8acb7031539e44e638229e6f9ec4f95bf92962c1`

## 1. Population

- CORE 303 · EXTENDED 0 · QUARANTINE 4 · REJECTED 35
- Baen/WMG bloc in CORE: 29 (9.6%)

## 2. Headline distributions (CORE)

### Article
- THE: 160 (52.8%)
- NO_INITIAL_ARTICLE: 137 (45.2%)
- A: 5 (1.7%)
- AN: 1 (0.3%)

### Word count
- 2: 131 (43.2%)
- 3: 118 (38.9%)
- 4: 27 (8.9%)
- 5: 19 (6.3%)
- 6: 7 (2.3%)
- 7: 1 (0.3%)

### Structural family
- SF02 — Compound: 153 (50.5%)
- SF05 — Proper-Name: 64 (21.1%)
- SF03 — Prepositional: 45 (14.9%)
- SF01 — Simple: 25 (8.3%)
- SF04 — Coordinated: 13 (4.3%)
- SF10 — Punct-Bipartite: 1 (0.3%)
- SF09 — Verbal: 1 (0.3%)
- SF08 — Clause: 1 (0.3%)

### Connectors present (non-exclusive)
- (none): 244 (80.5%)
- OF: 40 (13.2%)
- AND: 15 (5.0%)
- TO: 4 (1.3%)
- IN: 2 (0.7%)
- FROM: 1 (0.3%)

### Formal designation (trailing Saga/Cycle/Chronicle/Trilogy/…)
- None: 254 (83.8%)
- Trilogy: 13 (4.3%)
- Chronicles: 11 (3.6%)
- Saga: 9 (3.0%)
- Cycle: 7 (2.3%)
- Sequence: 4 (1.3%)
- Quartet: 3 (1.0%)
- Chronicle: 1 (0.3%)
- Tapestry: 1 (0.3%)

### Naming focus (semantic axis)
- NF01: 84 (27.7%)
- NF04: 37 (12.2%)
- NF08: 31 (10.2%)
- NF02: 29 (9.6%)
- NF05: 26 (8.6%)
- NF11: 22 (7.3%)
- NF03: 19 (6.3%)
- NF06: 15 (5.0%)
- NF09: 13 (4.3%)
- NF07: 13 (4.3%)
- NF10: 7 (2.3%)
- NF12: 6 (2.0%)
- NF13: 1 (0.3%)

### Object form
- OF01: 276 (91.1%)
- OF03: 16 (5.3%)
- OF02: 6 (2.0%)
- OF06: 4 (1.3%)
- OF05: 1 (0.3%)

### Primary genre
- G01 — Fantasy: 102 (33.7%)
- G02 — SF: 60 (19.8%)
- G03 — Crime: 42 (13.9%)
- G05 — Romance: 20 (6.6%)
- G07 — Historical: 16 (5.3%)
- G04 — Thriller: 14 (4.6%)
- G06 — Horror: 13 (4.3%)
- G11 — Comedy: 13 (4.3%)
- G08 — Literary: 12 (4.0%)
- G10 — Western: 7 (2.3%)
- G09 — Adventure: 4 (1.3%)

### Confidence
- C2: 155 (51.2%)
- C3: 148 (48.8%)

## 3. Cross-tab — structural family x genre (CORE counts)

| family \ genre | Fantasy | SF | Crime | Thriller | Romance | Horror | Historical | Literary | Adventure | Western | Comedy | Sum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Simple | 7 | 4 | 1 | . | 6 | 2 | 2 | . | . | 3 | . | 25 |
| Compound | 55 | 46 | 6 | 1 | 12 | 5 | 10 | 8 | 4 | 3 | 3 | 153 |
| Prepositional | 28 | 6 | 1 | . | 2 | 2 | 2 | 2 | . | . | 2 | 45 |
| Coordinated | 7 | 1 | 1 | 1 | . | 1 | 1 | . | . | . | 1 | 13 |
| Proper-Name | 4 | 2 | 33 | 11 | . | 3 | 1 | 2 | . | 1 | 7 | 64 |
| Clause | 1 | . | . | . | . | . | . | . | . | . | . | 1 |
| Verbal | . | 1 | . | . | . | . | . | . | . | . | . | 1 |
| Punct-Bipartite | . | . | . | 1 | . | . | . | . | . | . | . | 1 |
| **Sum** | 102 | 60 | 42 | 14 | 20 | 13 | 16 | 12 | 4 | 7 | 13 | 303 |

## 4. Cross-tab — structural family x object form (CORE counts)

| family \ object form | Narrative | Franchise | Shared-U | Collection | Anthology | Sum |
|---|---|---|---|---|---|---|
| Simple | 23 | . | 2 | . | . | 25 |
| Compound | 135 | 2 | 12 | . | 4 | 153 |
| Prepositional | 42 | . | 2 | 1 | . | 45 |
| Coordinated | 12 | 1 | . | . | . | 13 |
| Proper-Name | 62 | 2 | . | . | . | 64 |
| Clause | 1 | . | . | . | . | 1 |
| Verbal | 1 | . | . | . | . | 1 |
| Punct-Bipartite | . | 1 | . | . | . | 1 |
| **Sum** | 276 | 6 | 16 | 1 | 4 | 303 |

## 5. Sensitivity cuts (article + structural family)

| cut | n | THE% | no-article% | top family | top family% |
|---|---|---|---|---|---|
| CORE (all) | 303 | 52.8 | 45.2 | Compound | 50.5 |
| CORE — bloc | 274 | 54.0 | 43.8 | Compound | 48.5 |
| CORE C3-only | 148 | 51.4 | 44.6 | Compound | 50.0 |

_EXTENDED tier is empty, so the CORE-vs-(CORE+EXTENDED) cut is identity and omitted._

## 6. Notes for Stage 4 (generator derivation)

- The initial-"The" vs no-article split is near-even and stable across every cut —
  series shapes should NOT default to a leading "The".
- Compound Nominal dominates but is < ~50%; Proper-Name and Prepositional together
  are a large minority — a series generator needs all three well-weighted, not just
  the "The … of …" cliché (of-genitive is only ~15%).
- Most names carry no connector; "of" is the main one when present.
- Formal designations (Saga/Cycle/Chronicle/Trilogy) are a minority tail, not the norm.
