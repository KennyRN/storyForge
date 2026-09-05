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
| `derive.mjs` | regenerates `series-shapes.json` + `series-weights.json` from `corpus.core.frozen.json` |
| `series-shapes.json` | the nine patterns as clean JSON (mirrors what's in `titleComposer.ts`) |
| `series-weights.json` | the derived genre x structural-family matrix + policy numbers |
| `corpus.core.frozen.json` | the 303-record frozen corpus (v1.0.0) — `derive.mjs`'s input |
| `build-corpus.mjs` | reconstructs `corpus.core.frozen.json` from a compact per-record table; not part of the normal pipeline, kept as a lower-risk way to regenerate the frozen file if it's ever lost |

## Verifying the pipeline end to end

`node build-corpus.mjs` (writes `corpus.core.frozen.json`) → `node derive.mjs`
(reads it, writes `series-shapes.json` + `series-weights.json`) reproduces
every number in this folder from scratch. Running both and diffing the outputs
against the checked-in files is the regression check: as of this vendoring,
the aggregate distributions (article split 160/137/5/1, structural families
153/64/45/25/13/1/1/1, primary-genre counts) all match `FROZEN-STATS.md`
exactly, and the regenerated `series-shapes.json` is byte-identical (modulo
pretty-printing) to what's merged into `titleComposer.ts`.

## Changing the series shapes

Don't hand-edit the nine patterns in `titleComposer.ts`. Edit the corpus / rules,
re-run `node derive.mjs`, and copy the regenerated `series-shapes.json` back in.
A changed corpus SHA-256 denotes a new corpus version (see `FREEZE.md`).

## Transcription note

The narrative docs (`INTEGRATION-PROMPT.md`, `STAGE4-DERIVATION.md`,
`FROZEN-STATS.md`, `FREEZE.md`, `HANDOFF-README.md`) and the corpus data were
transcribed from the Stage 5 handoff; the same punctuation mojibake that
`../ACCURACY.md` documents for the lexicon hand-off affected the handoff text,
and has been corrected here to plain em dashes / straight quotes and, in two
record names (`HIS007`, `YA033`), correct diacritics. The numeric content
(weights, counts, cross-tabs) is unchanged, and independently re-verified —
see "Verifying the pipeline end to end" above.
