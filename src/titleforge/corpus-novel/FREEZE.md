# titleForge anglophone NOVEL-title corpus — FREEZE CERTIFICATE

- **Version:** 1.1.0
- **Frozen:** 2026-09-05
- **CORE records:** 402
- **SHA-256 (record set):** `8a4c0dc7e5a90dacd79eff64f9fc44b63fc906cf21c975fd9655cdebed0249fe`
- **Result:** FROZEN — v1.1.0 release-grade (6 genres prize-verified; 0 canonical-C2)

## Freeze gates

| gate | check | result | detail |
|---|---|---|---|
| FG1 | Population floor (>=300) | PASS | CORE 402 vs floor 300 |
| FG2 | Validation integrity | PASS | 0 malformed records (classify.mjs emitted 0 rejects for form) |
| FG3 | Dedup resolved | PASS | 0 unacknowledged duplicate clusters |
| FG4 | Registers complete | PASS | rejection + quarantine + dedup registers written |
| FG5 | Derivation integrity | PASS | every record carries observed+derived+judgement; structural_family computed |
| FG6 | Materiality / stability | PASS | THE all/no-bloc/C3 = 32.3/31.3/31.3; top family SF02 |
| FG7 | Genre coverage (>=10 per genre, prize-verified) | PASS | genres with n>=10: sf,horror,crime,lit,rom,ya |

Materiality rule: a headline finding must not shift by more than 10 percentage points, nor change the top structural family's rank, under the handset-removed or C3-only cut.

## Limitations (carried into any use of these findings)

1. **Population** — 402 >= 300 floor. Prize-verified (C3) genres: sf, horror, crime, lit, rom, ya. Genres still represented mainly by the canonical C2 handset (not yet prize-verified): none. Close those with RITA/Vivian (romance) and Newbery/Carnegie (YA) through the SAME classify.mjs.
2. **Handset bloc bias** — 66 C2 records (16.4%) are hand-selected canonical titles, tagged bloc=handset and subtractable; the sensitivity cut shows they do not move the headline (see FROZEN-STATS §4).
3. **Prize-winner skew** — the C3 tier is award WINNERS, which skews literary/"prestige" and away from mass-market commercial titles; commercial proportions here are a floor, not the market.
4. **Heuristic proper-name / verbal detection** — structural_family SF05/SF09 use string heuristics with a judgement override; treat those two families as lower-confidence than SF01–SF04/SF10.
5. **Anglophone prose only** — translated works and web-fiction/LitRPG are out of scope by rule (sister-agent B's lane).

## Governance

To revise: edit sources/*.json, re-run `node classify.mjs && node freeze.mjs`; a changed SHA-256 denotes a new version. The version is computed from the gates (v1.1.0 once all six target genres are prize-verified).