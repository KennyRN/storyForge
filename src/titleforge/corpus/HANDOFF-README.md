# titleForge — Stage 5 handoff bundle

Everything a coding agent needed to wire the corpus-grounded **series** shape
set into the live `title-composer` generator. Self-contained; read in this
order. (The integration itself is done — see `../ACCURACY.md` and
`../lexicons/titleComposer.ts`'s `series` family. This folder is the provenance
trail.)

## Start here

1. **`INTEGRATION-PROMPT.md`** — THE brief. Self-contained and sufficient: the
   exact edits, the nine `Pattern` objects embedded verbatim, the routing, nine
   invariants (each traceable to a real engine mechanism or a past bug), the
   commands to run, and acceptance criteria.

## Supporting data (consume if you prefer data over prose)

2. **`series-shapes.json`** — the nine series patterns as clean JSON (identical
   to what's embedded in the prompt and merged into `titleComposer.patterns`).
3. **`series-weights.json`** — the derived genre x structural-family matrix and the
   article/marker policy numbers. Only needed if you later want finer per-genre
   weight tuning (see invariant 7 / the derivation doc).

## Why (reference — read if a decision needs justifying)

4. **`STAGE4-DERIVATION.md`** — how the shape set was derived, the fork
   resolution, the genre mapping, and the three corpus-forced policies
   (no leading-"The" default, don't overweight the of-genitive, genre-condition
   the shapes).
5. **`FROZEN-STATS.md`** — the frozen corpus findings and cross-tabs the weights
   come from (corpus v1.0.0, n=303).
6. **`FREEZE.md`** — provenance: version, SHA-256, freeze gates, limitations.

## Regeneration (only if the corpus ever changes)

7. **`derive.mjs`** + **`corpus.core.frozen.json`** — run `node derive.mjs` to
   regenerate `series-shapes.json` and `series-weights.json` from the frozen
   corpus, then re-copy the shapes into `titleComposer.ts`. The exemplars are
   frozen facts (invariant 8): regenerate here, never hand-edit them.
   `corpus.core.frozen.json` is the 303-record research input; it is the one
   large artifact kept alongside the external research pipeline — drop it in
   here from the Stage 5 handoff bundle if you need to re-run `derive.mjs`.

## The five edits, in one glance (all applied)

1. Add family option `{ "id": "series", "label": "Series umbrella" }` to
   `titleComposer.families`.
2. Append the nine patterns from `series-shapes.json` to
   `titleComposer.patterns`.
3. Pass `family: "series"` to `generateSeries` at the series call-site
   (`view/TitleForgePanel.ts`, `handleGenerate`).
4. No lexicon changes — all slots already exist.
5. Log the nine exemplars as **verified** in `../ACCURACY.md` (provenance:
   series corpus v1.0.0).

Additive and reversible. `validateSpec`, `checkArticleAgreement`, and the
structural + template test sweeps all pass; see
`../__tests__/seriesFamily.test.ts`.

## Not in this bundle

- The full research pipeline (`records.mjs`, `classify.mjs`, `freeze.mjs`, the
  registers) is the provenance trail upstream of the freeze and is not needed
  for integration.
- The two sister-agent prompts (novel + web-novel generators) are a separate
  handoff and are intentionally excluded here.
