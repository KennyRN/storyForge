# START HERE — anglophone NOVEL-title calibration handoff (v1.1.0)

Everything the coding agent needs to apply the corpus-grounded calibration of the
novel patterns in `title-composer`. Self-contained. If you read one file, read
**`INTEGRATION-PROMPT.md`** — this page is just the map, the drop-in steps, and
the checklist.

## What this is

An **audit/recalibration** of the ~74 existing novel patterns in
`src/titleforge/lexicons/titleComposer.ts`, derived from a frozen, anchor-sourced
corpus of 402 real anglophone novel titles (six genres prize-verified). It
changes only `weight` / `genres` / `exemplar` scalars on shapes that already
exist. **No new shapes, no new families, no new vocabulary.**

## Drop-in (do this first)

1. You are working inside the cloned `KennyRN/storyForge` repo.
2. Place this whole folder at `src/titleforge/corpus-novel/` (it is research-only
   and inert — nothing imports it; `tsconfig` compiles `src/**/*.ts`, so the
   `.mjs`/`.json`/`.md` files never enter the bundle).
3. Optionally verify the frozen artefacts reproduce:
   `cd src/titleforge/corpus-novel && node classify.mjs && node freeze.mjs && node derive.mjs`
   → expect `v1.1.0 n=402`, SHA-256 `8a4c0dc7…`, all gates PASS.
4. Then open `INTEGRATION-PROMPT.md` and apply the tiers below.

## The change, in one screen

**Tier 1 — apply now (unconditional accuracy fix).**
In the `name-epithet` pattern, replace the exemplar item **"Ivan the Terrible"**
(not a novel) with a real sourced "[Name] the [Epithet]" novel title. Nothing else.

**Tier 2 — now unlocked (corpus is release-grade v1.1.0).** Re-weights on flagged
shapes (relative to the novel 1..5 band; from `novel-calibration.json`):

| pattern | family | current | set to | why (frozen) |
|---|---|---|---|---|
| `of-the` | of | 5 | 1 | of-genitive 11.9% (n=48) |
| `role-poss` | poss | 4 | 1 | possessive 5.7% (n=23) |
| `who-clause` | clause | 4 | 1 | long declarative n=23 |
| compound/`modifier` | modifier | 3 | 5 | compound 52.2% (n=210), under-weighted vs `core` |

Plus: narrow `name` genres toward corpus attestation (horror/crime/lit/rom/ya).
**Caveat:** composer families are not 1:1 with corpus structural families, so the
weight *directions* are solid; treat exact integers as corpus-scaled suggestions
and sanity-check `the-adj-noun` (it files under `core` but classifies as compound).

**Do NOT touch** the 14 families with no corpus basis
(`rhetoric, temporal, reference, place, participle, number, journey, guide,
event, tale, negative, list, lastfirst, verb`) — leave their weights/genres as-is.

## Acceptance checklist

- [ ] Folder placed at `src/titleforge/corpus-novel/`; pipeline reproduces v1.1.0.
- [ ] Tier 1 exemplar fix applied; `name-epithet` exemplar contains no non-novel.
- [ ] (Tier 2) the four re-weights + `name` genre narrowing applied.
- [ ] `npm run build` clean (tsc -noEmit + esbuild); bundle delta scalar-only.
- [ ] `npm test -- lexicons.structural.test.ts` green (validateSpec + note/exemplar).
- [ ] `npm test -- articles.test.ts` green (`checkArticleAgreement` == []).
- [ ] `npm test -- generate.test.ts` green (`generateSeries` unchanged).
- [ ] No new lexeme/slot added; no edit to `family:"series"` or `../corpus/`.

## Do NOT (coordination / invariants)

- Do not edit the series family, its 9 `series-*` patterns, or `../corpus/`
  (frozen by the other lane). A suggested change there → a note to that agent.
- Do not pull web-fiction / LitRPG / progression-fantasy titles in (sister-agent
  B's lane; firewalled out of this trad-prose study).
- Do not `import` anything from `corpus-novel/` into shippable code.
- Do not add vocabulary or slots (bundle ceiling). All edits are scalar.

## File manifest

| file | role |
|---|---|
| **START-HERE.md** | this map |
| **INTEGRATION-PROMPT.md** | the authoritative brief: tiers, invariants, commands, rollback |
| **novel-calibration.json** | machine-readable per-family calibration + flags (from `derive.mjs`) |
| HANDOFF-README.md | reading order |
| STAGE4-DERIVATION.md | how the calibration was derived; novel-vs-series divergences |
| FROZEN-STATS.md | frozen distributions + cross-tabs (from `freeze.mjs`) |
| FREEZE.md | freeze certificate: version, SHA-256, gates, limitations |
| REGISTERS.md | dedup / quarantine / rejection (from `classify.mjs`) |
| README.md | folder overview + how to expand the corpus |
| classify.mjs | derives structural fields from title strings → `corpus.classified.json` |
| freeze.mjs | gates + SHA-256 → `corpus.core.frozen.json` + stats + certificate |
| derive.mjs | calibrates the live 74 patterns → `novel-calibration.json` |
| corpus.core.frozen.json | the frozen corpus (402 records, v1.1.0) |
| corpus.classified.json | intermediate (classifier output) |
| sources/booker.json | literary winners (C3) |
| sources/hugo.json | SF/F winners (C3) |
| sources/edgar.json | crime winners (C3) |
| sources/bram-stoker.json | horror winners (C3) |
| sources/rona.json | romance winners (C3) |
| sources/printz.json | YA winners (C3) |
| sources/canonical.json | subtractable canonical C2 handset (bloc=handset) |

## To change the calibration later

Don't hand-edit numbers. Edit `sources/*.json`, re-run the three scripts, read the
regenerated `novel-calibration.json`. A changed SHA-256 = a new corpus version.
