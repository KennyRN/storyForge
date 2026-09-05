# corpus-webnovel — anglophone web-fiction title corpus & derivation

Dev-time tooling (never bundled) that builds a frozen, reproducible corpus of
**English-original** web-fiction titles and derives corpus-grounded patterns for
the shipped `western-serial` generator. Scope is anglophone web serials (Royal
Road / ScribbleHub / WebNovel English / Wattpad / KDP LitRPG); translated
JP/KR/CN/SEA titles are held out for their own lanes.

## Pipeline

```
harvest.tsv               Goodreads-rated titles (shelf, ratings, title)
  │  build-corpus.mjs     merge + median-floor / top-quartile selection
  ▼
corpus.jsonl              scanned titles with ratings + selection flags
  │  classify.mjs         derive structural fields (families, register, length, formula)
  ▼
classified.json
  │  freeze.mjs           materiality gate + formula dedup + sensitivity cut → versioned freeze
  ▼
frozen/webnovel.v1.0.0.json
  │  derive.mjs           promoted GAPs → live-schema Patterns (+ new slots/platforms)
  ▼  (weights from data; templates/notes from pattern-templates.mjs — judgement kept separate)
derived-patterns.json  +  PATCH.txt
  │  verify.mjs (npx tsx) merge into a clone of the shipped spec; run the engine's OWN
  ▼                       validateSpec / checkArticleAgreement / generate / series checks
ALL CHECKS PASSED
```

Run: `node classify.mjs && node freeze.mjs && node derive.mjs && npx tsx verify.mjs`

## Files

- `corpus.jsonl` — the corpus (one title per line; `scope`, `bloc`, `source`).
- `classify.mjs` — code-derived structural classifier (no hand-assigned fields).
- `freeze.mjs` — gates + versioned freeze; the materiality test that holds
  under-supported frames.
- `pattern-templates.mjs` — the **editorial** layer (template wording, notes,
  new slots), kept separate from the derived stats.
- `derive.mjs` — emits `derived-patterns.json` + `PATCH.txt`.
- `verify.mjs` — proves conformance against the live engine.
- `STAGE4.md` — every frozen finding → generator decision.
- `INTEGRATION-PROMPT.md` — additive, reversible merge brief for a coding agent.

## Result (v1.1.0)

311 scanned titles across two metric axes — 103 Goodreads-rated (median 9,463
ratings) and 50 Royal Road Rising Stars (median 569 followers) — plus 148
frame-coverage incl. the Aethon and Shadow Alley publisher catalogues.
Derivation runs on the 225-title selected pool. 6 new patterns (`regression-rebirth`,
`dungeon-anchor` w3 capped, `possessive-relation` w4, `interrogative-hook`,
`status-hook`, `bracket-tag`), 9 new slots, 1 new platform.
Held: `genre-subtitle`, `first-person`. See `STAGE4.md`.
