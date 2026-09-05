# titleForge — NOVEL calibration integration prompt (for the coding agent)

You are applying a **corpus-grounded calibration** of the existing novel
patterns in `src/titleforge/lexicons/titleComposer.ts`. This is an AUDIT, not a
new feature: you change `weight` / `genres` / `exemplar` fields on shapes that
already exist. **You add no shapes, no families, and no vocabulary.** Do exactly
the edits in the tier you are told to apply and nothing more.

## Context (read once)

- `title-composer` is the anglophone bench; its 74 novel patterns coexist with
  the 9 `family:"series"` patterns from the *other* lane. **Do not touch the
  series family, its patterns, or `src/titleforge/corpus/`.**
- All numbers come from the frozen novel corpus `src/titleforge/corpus-novel/`
  (v1.1.0, n=402). That folder is research-only and **not bundled**
  (nothing imports it; `tsconfig` compiles `src/**/*.ts` only). You copy values
  *out*; you never import it.
- The corpus is now **v1.1.0** (402 records; all six target genres —
  literary/SF-F/crime/horror/romance/YA — prize-verified), so Tier 2 is unlocked. Tier 1
  remains the unconditional accuracy fix; apply Tier 2 with the mapping caveat
  in mind (composer families are not 1:1 with corpus structural families).

## Tier 1 — apply now (unambiguous accuracy fix)

In the `name-epithet` pattern, the exemplar contains **"Ivan the Terrible"**,
which is not a novel (historical epithet / film). Replace that one item with a
sourced novel exemplar of the same shape (e.g. a real "[Name] the [Epithet]"
novel). Keep the other exemplar(s). Do not touch the templates, weight, or genres.

## Tier 2 — unlocked (corpus is v1.1.0, n=402)

Re-weights, from `novel-calibration.json` (`suggested_weight`), applied only to
the flagged shapes. These are relative weights *within the novel patterns*; do
not renormalise against the series family.

| pattern | family | current | set to | frozen basis |
|---|---|---|---|---|
| `of-the` | of | 5 | 1 | of-genitive 11.9% (n=48) — corroborated by series lane |
| `role-poss` | poss | 4 | 1 | possessive 5.7% (n=23) |
| `who-clause` | clause | 4 | 1 | long declarative n=23 (winner-skewed floor) |
| compound/`modifier` shapes | modifier | 3 | 5 | compound 52.2% (n=210) — currently under-weighted vs `core` |

Genre tightening (Tier 2): narrow `name` (proper-name) toward its corpus
attestation (horror/crime/lit/rom/ya) rather than a broad default. Confirm against
`corpus_genre_eligibility` in `novel-calibration.json`. Treat the heuristic
families (`name`=SF05, any `verb`=SF09) as lower-confidence (FREEZE.md
Limitation 4) and prefer a judgement check before narrowing them.

Do **not** touch the 14 families with `corpus_basis:null`
(`rhetoric,temporal,reference,place,participle,number,journey,guide,event,tale,
negative,list,lastfirst,verb`) — the corpus gives them no basis; leave their
weights and genres exactly as they are.

## Invariants (each traceable to a real mechanism or a past failure)

1. **Zero new vocabulary / zero new slots.** The plugin ships under a bundle
   ceiling; a prior pass wasted ~7 KB on reintroduced whitespace/vocab. This
   calibration only edits `weight`/`genres`/`exemplar` scalars on existing
   patterns — the raw byte delta is a few characters. (bundle ceiling)
2. **`validateSpec` must stay green.** It rejects unknown families/genres and
   unreachable genres; if you narrow a shape's `genres`, ensure every remaining
   genre is still declared in `titleComposer.genres`. (validateSpec, generate.ts)
3. **`checkArticleAgreement` must stay green.** Do not add hard-coded "The"/"A"
   while editing; article changes are out of scope for a weight/genre pass.
   (articles.ts)
4. **Every pattern keeps a non-empty `note` and `exemplar`.** The structural
   test asserts this; when you replace the `name-epithet` exemplar, do not leave
   it empty. (lexicons.structural.test.ts)
5. **Exemplars must be real, sourced novels.** The whole point of Tier 1 is that
   a non-novel slipped in; the replacement must be a verifiable novel title, not
   another intuition. (this corpus, brief A)
6. **Weights are relative within the novel patterns.** Do not "round up" or
   renormalise against the series 15/6/5 band; the novel band is 1..5.
7. **Do not touch the series family or `corpus/`.** They are frozen by the other
   lane; a change there is a note for that agent, not an edit here. (coordination)
8. **The novel corpus folder is not a runtime dependency.** Transcribe values;
   never `import` from `src/titleforge/corpus-novel/` into shippable code.
   (mirrors series invariant 9)

## Commands to run (after either tier)

```
npm run build                              # tsc -noEmit + esbuild; confirm clean
npm test -- lexicons.structural.test.ts    # validateSpec + note/exemplar sweep
npm test -- generate.test.ts               # generateSeries unaffected
npm test -- articles.test.ts               # checkArticleAgreement == []
```

## Acceptance criteria

- Tier 1: `name-epithet` exemplar contains no non-novel; structural sweep green.
- Tier 2: `validateSpec` and `checkArticleAgreement` return `[]`;
  `generateSeries` behaviour unchanged; bundle delta is scalar-only (no new
  lexicon entries).

## Rollback

Every edit is a scalar field change on an existing pattern (plus one exemplar
string). To revert, restore the prior scalar values; nothing else depends on them.
