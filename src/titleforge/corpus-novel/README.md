# src/titleforge/corpus-novel/ — anglophone NOVEL-title research (provenance only)

The frozen research trail behind the **calibration** of the novel patterns in
`../lexicons/titleComposer.ts`. It is **not bundled** and **not imported** by any
shippable code: `esbuild` only pulls what `src/main.ts` transitively imports, and
nothing imports from here; `tsconfig` compiles `src/**/*.ts` only, so the
`.mjs` / `.json` / `.md` files here are inert. Mirrors the series lane's
`../corpus/`, but stays firmly in its own lane (novels, not series).

## What it is

An anchor-sourced corpus of real anglophone **single-novel** titles, each coded
for the observed / derived / judgement split brief A requires:
- **observed** — the exact title string (never invented);
- **derived** — structural fields COMPUTED from the string by `classify.mjs`
  (word count incl. one-word, article, of-genitive, possessive, colon-subtitle,
  coordination, question, structural family);
- **judgement** — genre, era decade, confidence, source, bloc (overridable).

Frozen at **v1.1.0** (n=402): all six target genres are prize-verified C3 —
literary (Booker), SF/F (Hugo), crime (Edgar), horror (Bram Stoker), romance
(RoNA), YA (Printz). The canonical C2 handset now only supplements (historical
is the sole minor genre still C2, and is out of the targeted scope). `derive.mjs` turns the frozen corpus into a calibration of
the EXISTING novel shapes — suggested weights, genre-eligibility, verified
exemplars — and flags intuition-based/wrong ones.

## Files

| file | what |
|---|---|
| `HANDOFF-README.md` | reading order |
| `INTEGRATION-PROMPT.md` | the tiered edits (Tier 1 now; Tier 2 unlocked) + invariants |
| `STAGE4-DERIVATION.md` | how the calibration was derived; the novel-vs-series divergences |
| `FROZEN-STATS.md` | frozen distributions + cross-tabs (emitted by `freeze.mjs`) |
| `FREEZE.md` | freeze certificate: version, SHA-256, gates, limitations |
| `REGISTERS.md` | dedup / quarantine / rejection registers (emitted by `classify.mjs`) |
| `sources/*.json` | the anchor-sourced records (booker, hugo, canonical) |
| `classify.mjs` | derives structural fields → `corpus.classified.json` + registers |
| `freeze.mjs` | gates + SHA → `corpus.core.frozen.json` + stats + certificate |
| `derive.mjs` | calibrates the live 74 novel patterns → `novel-calibration.json` |

## Deepening the corpus

The pipeline is the deliverable; the corpus is expandable. v1.1.0 covers six
prize-verified genres; further prize lists (Pulitzer/NBA/Women's Prize for
literary depth, Newbery/Carnegie for more YA) deepen rather than unlock — drop
them into `sources/` and re-run
`node classify.mjs && node freeze.mjs && node derive.mjs`.

## Changing the calibration

Don't hand-edit the numbers in `INTEGRATION-PROMPT.md`. Edit `sources/`, re-run
the three scripts, and read the regenerated `novel-calibration.json`. A changed
corpus SHA-256 denotes a new corpus version (see `FREEZE.md`).
