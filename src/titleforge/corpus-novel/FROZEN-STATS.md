# titleForge anglophone NOVEL-title corpus — FROZEN statistics

**STATUS: FROZEN — v1.1.0 release-grade (6 genres prize-verified; 0 canonical-C2) — corpus v1.1.0 (2026-09-05).** n = 402 CORE.
SHA-256 (record set): `8a4c0dc7e5a90dacd79eff64f9fc44b63fc906cf21c975fd9655cdebed0249fe`

## 1. Population
- CORE 402 · handset(C2) bloc 66 (16.4%) · prize-verified C3 336

## 2. Headline distributions (CORE)

### Article
- NONE: 251 (62.4%)
- THE: 130 (32.3%)
- A: 21 (5.2%)

### Word count  ·  ONE-WORD titles: 63 (15.7%)
- 1: 63 (15.7%)
- 2: 111 (27.6%)
- 3: 107 (26.6%)
- 4: 65 (16.2%)
- 5: 33 (8.2%)
- 6: 16 (4%)
- 7: 5 (1.2%)
- 8: 2 (0.5%)

### Structural family
- SF02 — Compound: 210 (52.2%)
- SF03 — Prepositional: 90 (22.4%)
- SF01 — Simple: 56 (13.9%)
- SF05 — Proper-Name: 31 (7.7%)
- SF04 — Coordinated: 11 (2.7%)
- SF10 — Punct-Bipartite: 2 (0.5%)
- SF09 — Verbal: 2 (0.5%)

### Selected structural markers (non-exclusive)
- of-genitive: 48 (11.9%)
- possessive: 23 (5.7%)
- colon/subtitle: 2 (0.5%)
- coordinated (and/&): 11 (2.7%)
- question: 0 (0%)
- proper-name (judgement+heuristic): 31 (7.7%)

### Primary genre
- crime: 88 (21.9%)
- rom: 77 (19.2%)
- sf: 77 (19.2%)
- lit: 71 (17.7%)
- horror: 53 (13.2%)
- ya: 32 (8%)
- hist: 4 (1%)

### Per-genre confidence (prize-verified C3 vs canonical C2)
- sf: n=77 (C3 77 / C2 0)
- horror: n=53 (C3 41 / C2 12)
- crime: n=88 (C3 72 / C2 16)
- lit: n=71 (C3 61 / C2 10)
- hist: n=4 (C3 0 / C2 4)
- rom: n=77 (C3 65 / C2 12)
- ya: n=32 (C3 20 / C2 12)
Prize-verified genres (>=5 C3): sf, horror, crime, lit, rom, ya.

### Era (decade of publication/award)
- 1810s: 3 (0.7%)
- 1840s: 1 (0.2%)
- 1890s: 1 (0.2%)
- 1930s: 4 (1%)
- 1940s: 1 (0.2%)
- 1950s: 15 (3.7%)
- 1960s: 31 (7.7%)
- 1970s: 48 (11.9%)
- 1980s: 50 (12.4%)
- 1990s: 60 (14.9%)
- 2000s: 71 (17.7%)
- 2010s: 79 (19.7%)
- 2020s: 38 (9.5%)

## 3. Cross-tab — structural family × primary genre (CORE counts)

| family \ genre | epic | sf | horror | crime | lit | hist | rom | short | ya | Sum |
|---|---|---|---|---|---|---|---|---|---|---|
| Simple | . | 13 | 10 | 5 | 22 | 1 | 2 | . | 3 | 56 |
| Compound | . | 46 | 25 | 54 | 23 | 2 | 44 | . | 16 | 210 |
| Prepositional | . | 15 | 12 | 20 | 17 | 1 | 18 | . | 7 | 90 |
| Coordinated | . | 2 | . | 2 | 2 | . | 5 | . | . | 11 |
| Proper-Name | . | 1 | 6 | 6 | 5 | . | 8 | . | 5 | 31 |
| Clause/Question | . | . | . | . | . | . | . | . | . | 0 |
| Verbal | . | . | . | . | 1 | . | . | . | 1 | 2 |
| Punct-Bipartite | . | . | . | 1 | 1 | . | . | . | . | 2 |

## 4. Sensitivity cuts (article + top structural family)

| cut | n | THE% | no-article% | top family | top family% |
|---|---|---|---|---|---|
| CORE (all) | 402 | 32.3 | 62.4 | Compound | 52.2 |
| CORE − handset | 336 | 31.3 | 62.5 | Compound | 53.6 |
| CORE C3-only | 336 | 31.3 | 62.5 | Compound | 53.6 |

## 5. Notes for derivation (Stage 4)
- ONE-WORD titles are legitimate and common here (15.7%) — the series lane's one-word EXCLUSION must NOT be imported. This is the single biggest novel-vs-series divergence.
- Article distribution differs from the series near-even split: THE 32.3% here.
- of-genitive is 11.9% — measure, don't default to it.