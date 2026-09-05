# HANDOFF — titleForge `western-serial` web-novel expansion (corpus v1.1.0)

Single entry point for the coding agent. Read this first. Everything referenced
is in this folder. The change is **additive and reversible**; if anything here
conflicts with the live repo, **trust the repo and stop** — the source of truth
is the code, not this document.

Target repo: `KennyRN/storyForge`, path `src/titleforge/`.

---

## TL;DR — what to apply

Two files change in the plugin. Everything else in this folder is the corpus
pipeline that produced them (kept for provenance/reproducibility) plus review
material.

| Apply this file | Over this repo file | Nature |
|---|---|---|
| `westernSerial.applied.ts` | `src/titleforge/lexicons/westernSerial.ts` | adds 6 patterns, 9 slots, 1 platform (`+214` lines, additive) |
| `titlecase.patched.ts` | `src/titleforge/engine/titlecase.ts` | adds an `ACRONYMS` map + `applyAcronym` hook |

Prefer a diff over a blind overwrite. If you'd rather merge by hand than drop in
the whole file, `PATCH.txt` is the exact same additions as a paste-block.

Also copy the dev tooling folder `corpus-webnovel/` to
`src/titleforge/corpus-webnovel/` (dev-time only — `.mjs`, never imported by the
plugin entry, so esbuild will not bundle it).

---

## Apply + verify (steps)

1. **Back up / branch.** Both target files are replaced additively; keep the
   originals for the diff.
2. **Drop in** `westernSerial.applied.ts` → `lexicons/westernSerial.ts` and
   `titlecase.patched.ts` → `engine/titlecase.ts`.
3. **Diff-check** that the only changes to `westernSerial.ts` are: 6 appended
   pattern objects (`dungeon-anchor`, `regression-rebirth`, `possessive-relation`,
   `interrogative-hook`, `status-hook`, `bracket-tag`), 9 appended lexicon slots
   (`monster`, `rebirth`, `rebirthTail`, `interro`, `owner`, `relObject`,
   `statusVerb`, `beloved`, `bracketTag`), and the `webnovel` platform option.
   `titlecase.ts` gains only the `ACRONYMS` map, `applyAcronym`, and one call to
   it inside `titleCase`.
4. **Run the engine conformance harness** (no repo deps needed):
   `cd src/titleforge/corpus-webnovel && npx tsx verify.mjs`
   Expect all six checks `ok` and `ALL CHECKS PASSED`.
5. **Run the real test suite** (this is the step I could not run — deps weren't
   installed in my environment): `npm test` (or `npx vitest run`). The relevant
   file is `src/titleforge/__tests__/lexicons.structural.test.ts`, which pins
   the nine generator ids and the per-pattern lints. `verify.mjs` replicates its
   assertions, but run the real suite to be sure.
6. **Confirm bundle size** with a real esbuild build (~4.5 KB of new content
   expected; the ceiling and the "tooling must not bundle" rule are in
   `INTEGRATION-PROMPT.md`).

---

## Invariants (do not break)

Full list with rationale in `INTEGRATION-PROMPT.md`. The load-bearing ones:

- **Exactly nine generator ids.** This extends `western-serial` in place — do
  not add a tenth generator. The structural test asserts the id set.
- **`validateSpec` and `checkArticleAgreement` return `[]`.** Every literal
  `the` in a new template precedes a *bare* slot; new platforms are declared.
- **Exemplars are verified corpus titles.** Do not swap in an exemplar that
  isn't in `corpus.jsonl`; never invent one.
- **Acronym casing lives in the engine**, not the lexicon. Extend the
  `ACRONYMS` map; never pre-case a gloss (the caser re-derives casing).
- **Scope firewall.** This lane is anglophone / English-original web fiction.
  Translated titles are held out and must not become exemplars or lexemes.

---

## Still needs a human before ship (not code)

1. **Editorial review of the ~90 new lexemes** — use `SAMPLES.md` (10 generated
   titles per new pattern). Confirm the word lists are varied and on-brand.
2. **Sign-off on the two fixes** already applied: acronym casing (`LitRPG`, not
   `Litrpg`) and the romance register no longer pulling ironic `{rank}`
   adjectives.
3. Decide whether the publisher/romance-app titles should ever move from
   frame-coverage onto a metric axis (optional; see STAGE4 §1).

---

## File manifest

**Apply to the plugin**
- `westernSerial.applied.ts` — pre-merged generator spec (drop-in / diff).
- `titlecase.patched.ts` — engine caser with the acronym dictionary.
- `PATCH.txt` — the same additions as a copy-paste block (alternative to the above).

**Read for context / review**
- `INTEGRATION-PROMPT.md` — invariants and step-by-step, each traced to a mechanism/failure.
- `STAGE4.md` — every frozen corpus finding → generator decision.
- `SAMPLES.md` — 10 sample titles per new pattern, for lexeme QA.
- `README.md` — pipeline overview.

**Corpus pipeline (provenance + reproducibility; dev-time only)**
- `corpus.jsonl` — 311 scanned titles with metric/selection flags.
- `corpus.v1.jsonl` — frame-coverage + reference source titles.
- `harvest.tsv` / `harvest-rr.tsv` / `harvest-pub.tsv` — raw sourced slices
  (Goodreads ratings / Royal Road followers / publisher catalogues).
- `build-corpus.mjs` → `classify.mjs` → `freeze.mjs` → `derive.mjs` — the pipeline.
- `pattern-templates.mjs` — the editorial layer (templates/notes/new slots).
- `verify.mjs` — engine conformance harness. `samples.mjs` — regenerates SAMPLES.
- `build-applied.mjs` — regenerates `westernSerial.applied.ts` from the derived output.
- `classified.json`, `derived-patterns.json`, `frozen/webnovel.v1.1.0.json` — pipeline artifacts.

**Reproduce end-to-end:**
`node build-corpus.mjs && node classify.mjs && node freeze.mjs && node derive.mjs && npx tsx verify.mjs && node build-applied.mjs`

---

## What this adds (one-line summary)

311-title anchor-sourced corpus (Goodreads ratings axis + Royal Road followers
axis + frame-coverage) → 6 new corpus-grounded patterns for `western-serial`
(regression-rebirth, dungeon-anchor, possessive-relation, interrogative-hook,
status-hook, bracket-tag), 9 slots, the `webnovel` platform, and an engine-level
acronym-casing fix. ~4.5 KB of new bundled content.
