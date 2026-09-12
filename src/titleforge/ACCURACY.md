# titleForge lexicon accuracy notes

The nine lexicons were handed off from an earlier authoring pass as pasted JSON.
In transit, every character above the Latin-1 range (`â`, em dashes, curly
quotes, and — critically — every non-Latin script: Japanese, Korean, Chinese,
Arabic, Persian, Devanagari, Thai) was corrupted (mojibake). Tested directly: a
plain UTF-8-as-Latin-1 round-trip reverses the *2-byte* range cleanly (café,
naïve, and most Vietnamese diacritics recover exactly), but every 3-byte-or-wider
UTF-8 sequence — which covers all the CJK/Arabic/Persian/Devanagari/Thai script
and even plain English em dashes and curly apostrophes — had already lost
information before it reached this session. That family could not be repaired
mechanically; the lead byte survived as a lone "â" glyph with no way to recover
what followed it.

What this means for each file, and what was done about it:

- **English prose and glosses** (all nine files): every `â`-family mojibake
  instance in `note`/`exemplar`/`blurb` text was hand-corrected (em dash,
  apostrophe, curly quote) by inspection — these are unambiguous from context
  and low-risk. Latin-diacritic words (`Fiancée`, French/Vietnamese loanwords)
  were verified against the mechanical Latin-1 round-trip where that succeeded.

- **`title-composer`, `western-serial`, `indonesian-web`**: pure English (or,
  for Indonesian, Latin script with no diacritics in the source). No
  unrecoverable corruption; nothing was dropped.

- **`vietnamese-web`**: genre labels and the two exemplars that are real, known
  works (*Thiên Long Bát Bộ*, *Chuyện của Pao*) were retyped with correct
  diacritics from verified knowledge. The other four exemplars in this file read
  as illustrative constructed phrases in the source material rather than
  citations of one identifiable published work; they're retyped with correct
  Vietnamese spelling (common vocabulary I'm confident of) but marked
  `(illustrative)` rather than presented as a specific citation.

- **`japanese-ln`**: seven of ten exemplars are real, well-known published or
  televised works, and are retyped in correct Japanese from verified knowledge:
  *My Little Sister Can't Be This Cute!*, *Re:Zero*, *In Another World With My
  Smartphone*, *My Next Life as a Villainess*, *Is It Wrong to Try to Pick Up
  Girls in a Dungeon?* (DanMachi), *The Apothecary Diaries*, *Mushoku Tensei*,
  *Goblin Slayer*. The other two (`situation-result`, `exiled-slowlife`) are
  generic "banished from the party" isekai phrasing that the corrupted source
  didn't let me pin to one specific title with confidence — rather than guess
  at Japanese I couldn't verify, those two exemplars are English-only with an
  `(illustrative)` note.

- **`korean-web`**: two exemplars are real, well-known works, retyped correctly:
  *Solo Leveling*, *Omniscient Reader's Viewpoint*. The other four are
  grammatically straightforward constructed phrases (common vocabulary,
  standard grammar) that I'm confident are correctly spelled but that aren't
  citations of one specific identifiable novel — marked `(illustrative)`.

- **`chinese-web`**: two exemplars are real, well-known works, retyped
  correctly: 诛仙 / *Jade Dynasty*, 全职法师 / *Versatile Mage*. One pairing in
  the source was simply wrong and has been corrected: 斗破苍穹 was glossed as
  "Stellar Transformations" (that's actually 星辰变, a different novel); 斗破苍穹
  is *Battle Through the Heavens*, and the English gloss now says that. The
  remaining three exemplars are illustrative constructed phrases, marked as
  such.

- **`non-western-literary`**: all five exemplars are real, canonical, extremely
  well-known works, retyped in correct native script from verified knowledge:
  *Season of Migration to the North* (Tayeb Salih, Arabic), *The Blind Owl*
  (Sadegh Hedayat, Persian), *War and Peace* (Tolstoy, Russian), *Godan*
  (Premchand, Hindi). The Swahili exemplar is a plain, uncorrupted Latin-script
  phrase in the source and is marked illustrative rather than a specific
  citation.

- **`thai-web`**: the one file where I judged the honest answer was to drop the
  native script rather than guess. Thai orthography (vowel and tone marks in
  particular) is exactly the kind of detail a plausible-looking but wrong
  reconstruction would misrepresent silently, and unlike Japanese/Korean/Chinese
  I don't have confident independent knowledge of these specific phrases. Every
  exemplar in this file is English-only, marked `(illustrative)`, with a note in
  the generator's own `notes` field explaining why. **This file is the one most
  worth a native Thai speaker's review** if titleForge ships broadly — the
  shapes and English illustrative glosses are sound, but the bilingual "Why this
  shape" panel that every other generator gets is thinner here.

None of the above affects correctness of the *engine* or of *generated output*
— every generator only ever outputs English (see `README.md` §"English only").
This entirely concerns the original-script citation shown under "Why this
shape", which is metadata, never output.

## `title-composer` — the `series` umbrella family (verified)

The nine `series-*` patterns (family `series`, added in Stage 5) are grounded in
the frozen anglophone series-name corpus, **series corpus v1.0.0** (2026-09-02,
n=303; SHA-256 `4025e68d…62c1`). Their weights, genre-eligibility, and exemplars
were computed from that corpus by `corpus/derive.mjs`, not asserted — see
`corpus/` for the full provenance trail.

Every exemplar on these nine shapes is a **real, published series taken directly
from the frozen corpus** — they enter as *verified*, not *illustrative*:

| shape | exemplars (all real series) |
|---|---|
| `series-simple` | The Belgariad; The Expanse; The Strain |
| `series-compound` | The Stormlight Archive; Revelation Space; Cthulhu Mythos |
| `series-of` | A Song of Ice and Fire; The Book of the New Sun; The Books of Blood |
| `series-pair` | Memory, Sorrow, and Thorn; The Fast and the Furious; Jeeves and Wooster |
| `series-name` | James Bond; Harry Bosch; Hannibal Lecter |
| `series-marker` | The Stormlight Archive; The Murderbot Diaries; The Best American Short Stories |
| `series-colon` | Mission: Impossible |
| `series-verb` | Shatter Me |
| `series-clause` | How to Train Your Dragon |

Do not "improve" or paraphrase these — if a shape's exemplar ever needs
regenerating, re-run `corpus/derive.mjs` and copy its output (invariant 8).

## `western-serial` — Stage 4.1 vocabulary/weight correction

After the corpus-webnovel merge shipped (6 patterns, 9 lexicon slots), real use
surfaced two problems the merge's own tests couldn't catch because they check
structure, not feel: the 9 new slots (`monster`, `owner`, `relObject`, `rebirth`,
`rebirthTail`, `bracketTag`, `interro`, `statusVerb`, `beloved`) shipped
**untagged** — so they never narrowed by genre like every older slot — and most
had only 5-14 hand-picked entries where the underlying corpus family attests far
more. `possessive-relation` also tied for the highest weight in the file (4)
while drawing from the narrowest of those slots, which under a filtered
genre+platform combination (e.g. romance+webnovel) could reach ~40% of draws.

Stage 4.1 (this pass) re-mined `corpus-webnovel/corpus.jsonl` exhaustively for
every one of the 9 slots — every attested, in-scope phrase for a family, not a
sample — and tagged every entry by genre using the same compact `#tag` syntax
used everywhere else in the lexicons. `possessive-relation`'s `weightCap` was
lowered 4 → 3 in `pattern-templates.mjs` (matching `dungeon-anchor`'s existing
cap rationale) and regenerated through `derive.mjs`, not hand-edited. See
`corpus-webnovel/pattern-templates.mjs` for the per-slot mining notes and
`corpus-webnovel/derived-patterns.json` for the regenerated provenance. No
exemplars changed; no templates changed; no new patterns were added.

## `title-composer` — fantasy/SF sibling genres (flat, non-hierarchical)

`epic` (Epic fantasy) and `sf` (Science fiction) were the only fantasy/SF genre
options — no subgenre distinction existed anywhere in titleForge, in code or in
any corpus doc (the frozen corpus's `secondary_genres` field exists but was
never populated in any record). Five sibling genre ids were added as flat,
independent entries alongside them — not a hierarchy, no type-system change:

| id | label | provenance |
|---|---|---|
| `urban-fantasy` | Urban fantasy | attested in `corpus/corpus.core.frozen.json` `source_note` free text (Butcher, Correia, Briggs, Aaronovitch) — real signal, never structured |
| `space-opera` | Space opera | attested likewise (Weber, Rusch, Chaney & Maggert) |
| `military-sf` | Military SF | attested likewise (Weber, Alanson, Larson, Forstchen, Drake) |
| `heroic-fantasy` | Heroic fantasy | editorial addition — no corpus record names it |
| `sword-sorcery` | Sword & Sorcery | editorial addition — no corpus record names it |

Every pattern already tagged `epic` and/or `sf` was reviewed and given the
sibling(s) that fit its shape (e.g. `of-the` also reads as heroic-fantasy,
sword-sorcery, urban-fantasy and space-opera; `series-compound` fits all five;
`declarative` only fits urban-fantasy/space-opera/military-sf). `name-epithet`
also picked up `sword-sorcery` alone, without `epic`, as an explicit exception —
its exemplar ("Conan the Barbarian") is the archetypal S&S naming convention
even though the Tier-2 novel calibration pass had already narrowed this shape's
own genres off `epic`.

A sibling id in a pattern's `genres` isn't enough on its own — an untagged
shared-lexicon slot is genre-neutral and falls through unfiltered even under a
brand-new genre id (see `engine/lexicon.ts`'s `withTags`). So every existing
`adj`/`colour`/`noun`/`abstract`/`place`/... entry already tagged `epic`/`sf`
was swept and given the matching sibling tag(s) (`epic` → always
`heroic-fantasy`, plus `sword-sorcery` for pulp/combat/quest words like `sword`,
`blade`, `siege`, `throne`; `sf` → always `space-opera`, plus `military-sf` for
martial/logistics words like `fleet`, `garrison`, `regiment`), and any
`horror`/`crime`-tagged entry picked up `urban-fantasy` (its defining
contemporary/noir register in this lexicon). A small number of brand-new,
hand-authored words with no corpus backing (e.g. `barbarian`, `neon-lit`,
`starless`, `battle-worn`) were added to `adj`, each tagged with both its
sibling and parent genre. `series-shapes.json` (the vendored provenance copy of
the nine `series` patterns) was updated identically so it stays byte-matched
with `titleComposer.ts`, per `seriesFamily.test.ts`'s vendored-copy check.

## `title-composer` — 41-subgenre taxonomy expansion (frozen subgenre corpus, both lanes)

A frozen, sourced handoff (`README.md`/`MANIFEST.md`/`RECONCILIATION.md` +
`novel-lane/`/`series-lane/` COVERAGE/LEXICON-FRAGMENTS/SHAPES docs, each entry
traced to named T1/T2 sources) expanded the taxonomy from 18 to 41 declared
genres/subgenres across two "lanes" — novel-shape patterns and the existing
`family: "series"` patterns above — plus 237 general-vocabulary words. Applied
as a single pass; every declared subgenre validates as reachable
(`validateSpec`, `npm run titleforge:coverage`).

**Taxonomy.** `crime` split into two top-level siblings, `crime` and
`thriller` (existing `#crime`-tagged lexemes untouched; every pattern
previously eligible under `crime` also got `thriller` added — additive only,
since the two were one merged genre until this split). All 41 subgenres are
declared as two-level `GenreOption`s in both lanes; a subgenre with no own
lexicon/pattern work is still declared and selectable, resolving to its
parent's pool (per the handoff's own "declare all, disposition differs by
design" rule).

**Where the handoff's own docs disagreed or ran short, judgment calls (all
additive, never removing/narrowing anything):**
- `START-HERE.md`'s summary paragraph disagreed with `COVERAGE.md`'s own table
  for 5 subgenre dispositions (cyberpunk/cosmic-horror/slasher/hard-sf/heist) —
  the table (explicitly "the master/honest map") won.
- `SHAPES.md` only gave explicit pattern-weight prose for 7 of the 9
  "shape"-disposition novel subgenres; `whodunit`/`ancient`'s shape work is
  instead drawn from their own `novel-lane/batches/<id>.frozen.json` `verdict`
  field and `START-HERE.md`'s cross-family of-genitive percentages.
- `noir`'s disposition is "shape+lexicon" in `COVERAGE.md`, but its own
  `frozen.json` verdict is explicit that its shape is structurally identical to
  parent `crime` ("shapes ~ parent") — no separate pattern-weight work was
  done for it; the lexicon fragment stands on its own.
- **Pattern `weight` is global, not per-genre** — `weightedPick` draws from
  whichever patterns are eligible for the *current* genre selection, all
  sharing one flat weight. So "make pattern X feel dominant for subgenre Y" was
  achieved by *which* existing patterns list Y in their `genres` (never by
  bumping a shared pattern's `weight`, which would also inflate it for every
  sibling genre already on that pattern) — e.g. romantasy's "50% of-genitive +
  coordination" signature is expressed by adding it to the existing `a-of-and`
  pattern (already an exact template match, "A [Noun] of [Noun] and [Noun]"),
  not by reweighting it.
- **`fantasy` had no pattern content at all** (confirmed by
  `genreHierarchy.test.ts`'s own pre-existing comment) — unlike `sf`/`horror`/
  `crime`/`hist`/`rom`, which are already used as bare genre tags on dozens of
  patterns, so their new subgenries (cyberpunk, gothic, whodunit's siblings,
  etc.) inherit a working baseline for free. Without a fix, the three new
  fantasy subgenres (`dark-fantasy`/`portal-fantasy`/`cosy-fantasy`) would have
  been completely unreachable (`validateSpec` caught this immediately). Fixed
  by adding bare `"fantasy"` to `the-noun`/`the-adj-noun` (both already list
  every fantasy sibling individually, so this is a no-op for them — verified in
  `genreHierarchy.test.ts` — and newly gives `sword-sorcery` access to
  `the-noun`, the one sibling that didn't already have it there, which is
  called out as a deliberate change in that same test file).
- **A slot the corpus named isn't always drawn by any current pattern** — e.g.
  no existing pattern references `{object}` in series mode, no series pattern
  uses `{role}`. Where a fragment's literal slot would sit dormant, the words
  were either re-slotted to the nearest already-live equivalent (dark-fantasy's
  and military-sf's series "object" words → `group`, already drawn by
  `series-simple`; medieval's series "object" words → `kingdom`, already drawn
  there too) or merged into an already-reachable slot the same subgenre already
  owns in the other lane (paranormal-romance's series `role`/`adj` words folded
  into its own existing `role`/`adj` entries; romantasy's series words merged
  into its novel `object`/`abstract` entries, per the handoff's own note that
  romantasy is "identical in both lanes").
- **General-lexicon vs. new subgenre-tag collisions, undetected by the
  handoff's own dedup.** `GENERAL-LEXICON-ADDITIONS-COMPREHENSIVE.md` was
  checked against the existing 799 glosses and the earlier 105 additions, but
  *not* against this same handoff's own new `LEXICON-FRAGMENTS.md`/
  `SERIES-LEXICON-FRAGMENTS.md` tags (parallel work-streams). Cross-checked by
  hand, same slot: ~20 collisions found and skipped (the subgenre-tagged
  version already surfaces under "Any genre" per `withTags`, so also adding an
  untagged copy would only double-weight that one word) — e.g. `role`:
  vampire/lord/lady/duke/baron/viscount/rake/rogue/killer/phantom/angel/
  wanderer/necromancer/burglar/admiral/lover; `abstract`: sleep/kiss/blues;
  `seriesWord`: mysteries/wars/wheel; `object`: wings; `group`: club/society;
  `adj`: wicked. The comprehensive doc's own explicit "approved... genuinely
  general copies" exceptions (blood, ghost, kings, goodbye, jazz, upstairs)
  were honoured as written — both the tagged and untagged copy exist.
- `regency` and `historical-romance` share one honorific/role pool by design
  (per the handoff's own instruction, since a fragile 7-author regency-only
  copy would fail the author-floor) — the shared words are dual-tagged
  (`#historical-romance #regency`) rather than duplicated, reachable from
  either subgenre's own narrowing.
- `military-sf`'s pre-existing lexicon/patterns were left untouched per the
  handoff's own instruction ("do not touch" the six pre-existing
  fantasy/sf siblings) — only its explicit top-up (3 new, diffed-non-duplicate
  words: glory, dragoons, desolation) was added.
- `series-shapes.json` was regenerated from the final `titleComposer.ts` state
  (not from `corpus/derive.mjs`, which only reproduces the original v1.0.0
  series corpus and knows nothing of this later expansion) to keep
  `seriesFamily.test.ts`'s vendored-copy invariant meaningful going forward.
