# titleForge — NOVEL calibration handoff

Everything a coding agent needs to apply the corpus-grounded novel-title
calibration to the live `title-composer` generator. Self-contained; read in
this order. Stays in the novel lane — does not touch the series family or
`../corpus/`.

## Start here

1. **`INTEGRATION-PROMPT.md`** — THE brief. Tier 1 (apply now: the `name-epithet`
   exemplar fix) and Tier 2 (now unlocked — corpus is release-grade: the weight/genre
   recalibration), the eight invariants, the commands, acceptance, rollback.

## Supporting data

2. **`novel-calibration.json`** — per-family calibration (current vs suggested
   weight, corpus genre-eligibility, corpus-verified exemplars) + the flags.
   Emitted by `derive.mjs`.

## Why (reference)

3. **`STAGE4-DERIVATION.md`** — the derivation, the measured novel-vs-series
   divergences (one-word 15.7%, "The" 32.3%, of-genitive 11.9%), the
   family→basis mapping and its caveat, and the add/drop/re-weight/re-genre
   decisions.
4. **`FROZEN-STATS.md`** — the frozen distributions + cross-tabs the numbers
   come from (corpus v1.1.0, n=402).
5. **`FREEZE.md`** — provenance: version, SHA-256, gates, limitations.
6. **`REGISTERS.md`** — dedup / quarantine / rejection.

## Regeneration

7. **`classify.mjs` → `freeze.mjs` → `derive.mjs`** — from `sources/*.json`.
   Add prize lists to `sources/` and re-run all three to deepen the corpus further.

## Status flag (read before acting)

The corpus is **v1.1.0** (n=402; all six target genres prize-verified —
literary/SF-F/crime/horror/romance/YA; only historical, out of scope, stays C2).
Tier 1 is the unconditional accuracy fix; Tier 2 is unlocked, apply with the
mapping caveat.

## Not in this bundle / out of lane

- The series corpus (`../corpus/`) and `family:"series"` shapes — frozen by the
  other lane; suggestions for them go in a note to that agent, not an edit.
- Web-fiction / LitRPG / progression-fantasy titles — sister-agent B's lane,
  firewalled out of this trad-prose study.
