# src/titleforge/corpus/ — series-name research (provenance only)

This folder is the **frozen research trail** behind the `series` shape family in
`../lexicons/titleComposer.ts`. It is **not bundled** and **not imported** by any
shippable code (INTEGRATION-PROMPT.md, invariant 9): `esbuild` only pulls in what
`src/main.ts` transitively imports, and nothing imports from here. `tsconfig.json`
compiles `src/**/*.ts` only, so the `.mjs` / `.json` / `.md` files here are inert.

## What it is

A hand-built corpus of 303 real anglophone book/series umbrella names (fantasy,
SF, crime, romance, horror, historical, literary, YA, western, comedy), each
coded for article, structural family, connectors, naming focus, genre, and
umbrella-name status, then **frozen** at v1.0.0 (2026-09-02). `derive.mjs` turns
that corpus into the nine `series-*` `Pattern` objects — their weights, genre
eligibility, and exemplars are all *computed*, not asserted — which were then
transcribed into `titleComposer.ts`.

## Files

| file | what |
|---|---|
| `HANDOFF-README.md` | the reading order for the whole bundle |
| `INTEGRATION-PROMPT.md` | the exact Stage 5 edits (all applied) + invariants |
| `STAGE4-DERIVATION.md` | how the shape set was derived; the three corpus-forced policies |
| `FROZEN-STATS.md` | the frozen distributions and cross-tabs |
| `FREEZE.md` | freeze certificate: version, SHA-256, gates, limitations |
| `derive.mjs` | regenerates `series-shapes.json` + `series-weights.json` from the corpus |
| `series-shapes.json` | the nine patterns as clean JSON (mirrors what's in `titleComposer.ts`) |
| `series-weights.json` | the derived genre x structural-family matrix + policy numbers |
| `corpus.core.frozen.json` | **not vendored here** — the 303-record `derive.mjs` input; copy it in from the Stage 5 handoff bundle only if you need to re-run `derive.mjs` |

## Changing the series shapes

Don't hand-edit the nine patterns in `titleComposer.ts`. Edit the corpus / rules,
re-run `node derive.mjs`, and copy the regenerated `series-shapes.json` back in.
A changed corpus SHA-256 denotes a new corpus version (see `FREEZE.md`).

## Transcription note

These docs were transcribed from the Stage 5 handoff; the same punctuation
mojibake that `../ACCURACY.md` documents for the lexicon hand-off affected the
handoff text, and has been corrected here to plain em dashes / straight quotes.
The numeric content (weights, counts, cross-tabs) is unchanged.
