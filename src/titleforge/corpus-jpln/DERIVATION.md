# Derivation & method — jpln-localised → japaneseLn.ts

## Pipeline
1. **Corpus build.** Real English-localised LN titles harvested from publisher catalogues (Seven Seas/Airship, Yen Press/Yen On, J-Novel Club, Cross Infinite World, Hanashi Media) and Wikipedia/ANN. Classified by lane, tiered (T1 publisher-confirmed / T2 real-licensed / T3 discovery). Never invented.
2. **Freeze.** `records → freeze`: canonicalised, SHA-256 hashed, versioned, with per-lane gates. Floors: isekai 75, villainess 25 (met at 27); slow-life/vrmmo lower (small market).
3. **De-Japanning (v1.4.0).** Romanised-Japanese brand heads stripped, English remainder kept; Japanese-only titles dropped. Corpus n=141, SHA-256 `9e29c7fb3348…`.
4. **Derive shapes.** Editorial shape abstraction validated against the corpus: every shape exemplar must be a real corpus title; weight = distinct titles attesting it. 8 promoted (n≥2), 8 held (n=1). Dominant structural finding: villainess/romcom are structurally diffuse — their strength is lexical, so they inherit general shapes and carry identity in tagged lexicon.
5. **Reconcile to the engine.** Conformed to the live `GeneratorSpec`/`Pattern`/`Lexeme` types; every template `{slot}` backed by a populated lexicon slot; repeated slots index-tagged; series-heads (`englishHead`) split from opaque brands (`bare-title`).
6. **Mine the lexicon.** All 141 titles POS-tagged with winkNLP (the project's own tool); every content word + noun-phrase extracted → 515 keywords, genre-tagged, with frequency and provenance (`mined-lexicon.json`). Nouns/phrases/numbers routed into semantic slots by transparent rule; POS-noisy raw verb/adjective buckets deliberately not folded.
7. **Calibrate.** Split `clause`→`clauseBase`/`clausePast` by grammatical form; dedicated bare-noun `roleWord` slot for `role-role-no`; de-articled `abstract`; switched the one `a {adjective}` template to `My {adjective}` (engine has no runtime a/an corrector).
8. **Final QA.** Removed exact-duplicate and article-twin lexemes; removed unreferenced reserve slots (kept in mined-lexicon.json). All engine validators green.

## Integrity invariants (each traces to a real failure during the build)
- No fabricated titles — every corpus record is a real localisation; classification is editorial and re-checkable.
- No shape without a real corpus exemplar (build refuses otherwise).
- No untagged lexeme (build refuses) — the audit's untagged-slot leak.
- No romanised Japanese in the lexicon (token-scan) — the single-surface rule.
- Every template slot populated, or the shape can't render.

## Provenance of the lexicon
- **Observed** entries trace to a real corpus title (mined or hand-mapped).
- **Editorial** entries are invented English in-register — legitimate generator-surface content, as the original `japaneseLn` did. The corpus and mined-lexicon.json hold the attested base.
