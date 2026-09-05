# STAGE 4 — frozen corpus → generator decisions (`western-serial`), v1.1.0

Every family, count and selection is code-derived (`build-corpus` → `classify`
→ `freeze`); only template wording/notes are editorial (`pattern-templates.mjs`).
Reproduce: `node build-corpus && node classify && node freeze && node derive && npx tsx verify`.

## 0. Stage-0 reality
`western-serial` already ships 9 patterns; no series-lane corpus harness exists
in the repo; lexemes compile from `.ts`; the suite pins exactly nine generator
ids. This extends `western-serial` in place. Trust the repo for the schema.

## 1. Corpus — 311 scanned titles, anglophone English-original

Two independent metric axes, each with its own median floor and top-quartile cut
(the requested "top 25% of ratings / readers / subscribers"):

- **Goodreads-rated** (metric = ratings count): 103 titles, **median 9,463,
  p75 17,030**. Shelves progression-fantasy, dungeon-core, litrpg-gamelit.
- **Royal Road Rising Stars** (metric = followers / subscribers): 50 titles from
  rst.doomlabs.net, **median 569, p75 1,215**. Pure RR, anglophone web-original.
- **148 frame-coverage** (unrated): RR tracker bloc (litrpgtoolkit), WebNovel,
  ScribbleHub, Wattpad, the binge-romance apps (GoodNovel, Dreame, NovelCat,
  AlphaNovel), and **publisher catalogues** — Aethon Books and Shadow Alley Press,
  the houses that convert Royal Road serials into novels, plus a Goodreads
  prog/litrpg shelf. Publisher titles are publisher-vetted but carry no harvested
  per-title metric, so they inform frames/register, not the percentile cuts.
- **10 translated references**, held out and subtractable.

Selection runs per axis: a rated title below its own axis median isn't selected.
Derivation uses the **selected** pool (above-median on either axis + frame
coverage) = **178 titles**; the top quartile (39) picks exemplars. Translated
Russian LitRPG and Chinese-MTL romance excluded at harvest.

## 2. Frozen taxonomy — SELECTED pool (gate: n>=3, blocs>=2, formulas>=2)

| family | n | blocs | verdict |
|---|---|---|---|
| setting-anchor | 25 | 7 | **NEW** `dungeon-anchor` (weight-capped) |
| class-role | 24 | 10 | covered (`rank-role`) |
| possessive-relation | 23 | 7 | **NEW** `possessive-relation` |
| regression-rebirth | 13 | 5 | **NEW** `regression-rebirth` |
| system-bracket | 12 | 3 | **NEW** `bracket-tag` — now metric-ranked via the RR slice |
| full-sentence | 9 | 4 | covered (`situation-complaint`) |
| first-person-declarative | 8 | 5 | covered (`situation-complaint`) |
| genre-subtitle | 5 | 2 | covered (`genre-subtitle`) — got its 2nd bloc from RR |
| interrogative-hook | 4 | 3 | **NEW** `interrogative-hook` |
| status-hook | 4 | 2 | **NEW** `status-hook` |
| system-litrpg | 3 | 2 | covered (`system-calamity`) |
| warning / numeric | 1 | 1 | HELD — below gate |

Registers: neutral 126, sincere 38, hard 13, ironic-cosy 1. Length modes:
standard 95, terse 48, **long 31, extreme 4** — the long tail, absent in early
versions, is now well-populated by RR sentence-length titles.

## 3. Six new patterns
- **`regression-rebirth`** w3 — slots `rebirth`, `rebirthTail`. Exemplar *I Became a Patron God* (RR, top-follower).
- **`dungeon-anchor`** w3 **capped** (dungeon topically over-sampled) — slot `monster`, adds `webnovel` platform. *Cultivating Dungeon*.
- **`possessive-relation`** w4 (dominant un-capped gap) — slots `owner`, `relObject`. *Carl's Doomsday Scenario*.
- **`bracket-tag`** w3 — slot `bracketTag`. Exemplar *Godless Sword [Timeloop LitRPG]* (RR, 5,067 followers).
- **`interrogative-hook`** w2 — slot `interro`. *Awakened As A Dungeon Core?*
- **`status-hook`** w2 — slots `statusVerb`, `beloved`. *Kidnapped by My Mate*.

## 4. Held (gate-blocked)
`warning-label`, `numeric-grind` (below gate). `full-sentence` /
`first-person` / `genre-subtitle` / `system-litrpg` are promoted-but-covered by
shipped patterns, so no new pattern is emitted for them.
