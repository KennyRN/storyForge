# titleForge

Eight title & series generators — each an English shape taxonomy modelled on a
different tradition's title conventions (Anglophone literary, webnovel,
Japanese light novel, Korean webnovel, Chinese webnovel, Vietnamese webnovel,
Indonesian webnovel, Thai webnovel). The Anglophone one, `title-composer`, also
carries a comparative "world fiction" genre (with Arabic, Persian, Russian,
Hindi & Urdu and Swahili subgenres) rather than that being a separate
tradition of its own.

**Every generator outputs English, only English.** A title from `japanese-ln`
is an English title that *feels* like a light novel; it never needs to survive
back-translation. The one place original-script text appears is
`Pattern.exemplar` — one real (or, where marked, illustrative) title per shape,
shown under "Why this shape" — and that's metadata, never output. See
`ACCURACY.md` for exactly which exemplars are verified real citations,
which are illustrative constructions, and which were dropped rather than
guessed at, after the lexicons arrived through a lossy copy/paste pass that
corrupted every non-Latin-script character (`ACCURACY.md` has the full story).

## Why this folder, not just more storyForge files

titleForge is a **subplugin**: it lives inside storyForge's repo and bundle
today, but every module is prefixed (`TitleForge*` classes, `titleforge-*`
view type and CSS classes, `_backstage/titleforge/` vault root — its own
sibling region under the shared `_backstage/` parent, not nested under
storyForge's own `_backstage/storyforge/`) and the whole folder is
architecturally self-contained, so that pulling it out into
its **own** standalone Obsidian plugin later is small, mechanical work rather
than a rewrite. See "Extraction checklist" below.

## Where things live

```
src/titleforge/
  engine/              pure, zero-Obsidian-import core — the literal extraction unit
    types.ts             Lexeme, Pattern, GeneratorSpec, TitleResult, HistoryEntry, options
    rng.ts                seeded PRNG (mulberry32); pick / weightedPick / randomSeed
    lexicon.ts            entry normalisation, compact-string parsing, tag filtering
    template.ts           slot-filling renderer: {slot}, {slot#2}, {slot^}, {slot:tag}, {slot|filter}
    titlecase.ts           British-convention title case + indefinite-article fix + word count
    articles.ts            static bare/articled slot-agreement lint
    generate.ts             generateOne / generateMany / validateSpec
    history.ts               JSONL parse/serialise, toEntry, titlesFrom, replay, replayMatches
    registry.ts               register / getGenerator / listGenerators / listByTradition
    userLexicon.ts            scan `user enhanced lexicon.md` + merge its words into a bundled spec
    index.ts                  barrel export
  lexicons/            one .ts module per tradition, each a typed GeneratorSpec
    userLexiconTemplate.ts  bootstrap contents of `user enhanced lexicon.md` (also the user docs)
  tools/
    genre-coverage.ts    npx tsx / `npm run titleforge:coverage` — per-genre eligible-pattern
                         and own/inherited-lexeme counts, THIN/inherits-only flags; reads the
                         bundled specs only, never a vault copy
  storage.ts           the only file touching app.vault — see "Storage" below
  settings.ts          TitleForgeSettings type + defaults
  TitleForgeController.ts   bootstrap: owns settings/storage/registry, self-registers
                            its command/ribbon via the Plugin reference it's handed
  view/
    TitleForgeModal.ts         the only surface — a modal window, no main-area workspace view
    TitleForgePanel.ts         the actual UI/state, rendered into the modal's contentEl
    TitleForgeSettingsModal.ts opened from storyForge's own settings tab
  __tests__/            vitest — engine unit tests + a structural sweep over all eight
                        bundled lexicons (validateSpec, checkArticleAgreement, every
                        pattern has note+exemplar, every genre generates)
  ACCURACY.md          what's verified vs. illustrative vs. dropped in each lexicon, and why
  corpus/              frozen series-name research (v1.0.0, n=303) behind title-composer's
                       `series` shape family — provenance only, never imported/bundled
  README.md            this file
```

Touch points **outside** this folder — deliberately the only three, so the
folder itself never needs `git grep` to find what depends on it:

- `src/main.ts` — construct `TitleForgeController` during plugin `onload()`,
  `await onload()` on layout-ready (vault I/O is not safe during a cold-start
  plugin `onload()`), call `onunload()`. Also reuses one storyForge icon
  (`ICON_TITLEFORGE` from `../icons.js`) for the ribbon icon.
- `src/view/StoryForgeSettingsTab.ts` — one settings-tab group item that opens
  `TitleForgeSettingsModal`.
- `styles.css` — one banner-delimited, entirely `.titleforge-*`-scoped section.

## The engine API

```ts
import { generateOne, generateMany, getGenerator } from "./engine/index.js";
import { titleComposerLexicon } from "./lexicons/titleComposer.js";
import { register } from "./engine/registry.js";

register(titleComposerLexicon);

const result = generateOne(getGenerator("title-composer")!, {
  genre: "epic",
  wordCount: { min: 3, max: 6 },
});
// { generatorId, title, patternId, patternLabel, genre, wordCount, seed, constraintRelaxed? }
```

`generateMany(spec, count, options)` is the batch form (no duplicates within
the batch). Series names come from the same `generateOne`, scoped with
`{ family: "series" }` to draw from the corpus-grounded `series` shape family
instead of the novel patterns — see title-composer's `series`-tagged patterns.
Volume titles come from the novel patterns; an earlier revision generated a
series umbrella plus a fixed set of volumes as one coherent bundle, and this
was removed because volume titles are novel titles, not series titles.

### Template syntax

| Token | Meaning |
| --- | --- |
| `{slot}` | draw from `slot` |
| `{slot#2}` | a specific, stable draw — repeat the token to echo the same word |
| `{slot^}` | the entry's combining form (`Lexeme.stem`) |
| `{slot:tag}` | restrict the draw to entries carrying `tag` |
| `{slot\|lower}` | filters: `lower`, `upper`, `title`, `a`, `the` |
| `{{` `}}` | literal braces |

A slot used more than once in one template must be indexed —
`validateSpec`/`validateTemplate` enforce it. Vocabulary is scoped by genre tag
**after** the shape is chosen, not before, so under "any genre" a shape's own
`genres` list supplies the scope.

### Genres: an optional parent/subgenre tree (up to three levels)

A `GenreOption` (`engine/types.ts`) may carry a `parent`, pointing at another
genre's id — e.g. `title-composer` ships `{ id: "western", label: "Western",
parent: "hist" }`. Depth is capped at **three** (`MAX_GENRE_DEPTH`;
`validateSpec` enforces it, along with no cycles/orphan parents). Only
`western-serial` uses the third level (`progression > dungeon > dungeon-core`);
title-composer is two-level. A genre with no `parent` and nothing pointing at it as one behaves
exactly as a flat genre always has — this is additive, not a redesign.

`genreScope(spec, id)` (`engine/generate.ts`) is the one function that turns a
selected id into "everything it reaches": selecting a **subgenre** reaches
itself plus its ancestors (a `#hist`-only pattern is eligible under *Western*);
selecting a **parent** reaches itself plus every descendant (a
`#western`-only pattern is eligible under *Historical*). A middle-level parent
(`dungeon`) reaches its descendants and then its ancestors, so it still inherits
its own parent's patterns. Pattern eligibility (`eligiblePatterns`) is a
straight membership test against that scope.

#### Vocabulary is additive

A genre's own words are **added** to a shared pool rather than replacing it
(`blendSlot` in `engine/generate.ts`). Each slot a draw uses combines three tiers,
each entry in its highest tier only:

| Tier | What's in it |
|---|---|
| own | entries tagged with the genre (for a parent selection: with itself or any descendant) |
| inherited | each ancestor's **lexicon**, nearest first: entries tagged with the parent, **or with 2+ of the parent's subgenres** |
| general | entries whose tags span **2+ top-level genres** (a subgenre tag counts towards its top genre), or that carry no genre tag |

So `scaffold [hist, horror, epic, heroic-fantasy, sword-sorcery, urban-fantasy]`
is in fantasy's lexicon (four fantasy subgenres) and on the general list
(hist + horror + fantasy). Both rules are derived at draw time (`inParentLexicon`,
`isGeneralEntry`), so a new word follows them with no extra tagging.

The tiers split each draw by `vocabularyBlend` (default 55% own, 30% inherited,
15% general; nearer ancestors weigh more). Empty tiers are renormalised away.
A tier with fewer than `fullTier` (8) words gets a proportional cut, so a genre
with one own word doesn't hand that word half of every draw. A slot where a genre
has nothing of its own or inherited stays genre-neutral, and the whole slot is
drawn, as before. Opt-outs: `GenreOption.isolated` skips the general list (webnovel
`romance`), and `GeneratorSpec.exclusiveSlots` keeps the older exclusive narrowing
(`narrowLeaf`/`narrowParent`) for named slots.

Consequence for tagging: **multi-genre tags make a word general**. A word that must
stay in one register (galaxy, gun) is tagged within one top-level genre only.
`npm run titleforge:pools` (`tools/vocab-pools.ts`) writes `tools/VOCAB-POOLS.md`,
with before/after pool sizes, every promotion each rule makes, the untagged
entries to audit, and sample titles per genre.

This is what makes a new subgenre cheap: declare `{ id: "regency", parent:
"hist" }` with zero lexemes and zero patterns of its own, and it already
produces valid, Historical-shaped titles by inheritance (`title-composer`
ships `western`/`regency` this way deliberately, as a live example — see
`genre-coverage`'s "inherits only" flag below). `validateSpec`'s reachability
check follows the same rule: a subgenre with no *own* material is never
flagged unreachable as long as its parent has patterns.

Run `npm run titleforge:coverage` (`tools/genre-coverage.ts`) to see, per
generator, every genre's eligible-pattern count, its own-tagged lexeme count,
how much more it can reach by inheritance, the smallest pool a draw sees
(`min pool`, with its slot), and `THIN`/`inherits only`/`THIN POOL` flags —
the "easy to see what needs expanding" half of this feature. It exits
non-zero if any declared genre is genuinely unreachable, so it can gate CI.

The view (`TitleForgePanel.hierarchicalGenreOptions`) renders this as one
flat, indented `<select>` — parents in declaration order, each immediately
followed by its own subgenres (indented once more per level) — rather than a
dependent pair of pickers, to keep the picker's shape unchanged.

Two optional spec fields refine a draw further. Both are used only by
`western-serial` today:

- `genreExclusions: [{ when, exclude }]` — while `when` or anything under it is
  selected, patterns and lexemes tagged with an `exclude` tag are never drawn,
  unless they also carry a non-excluded tag the selection reaches. Applied
  before the forgiving slot fallback. webnovel uses it to keep cultivation out
  of isekai.
- `reservedTitles` — real titles a draw must never reproduce (matched
  case-insensitively). A colliding render resamples within the same pattern; after
  `RESERVED_RETRIES` (20) resamples the draw falls back to the next pattern.
  webnovel's list is generated by `corpus-webnovel/v1.2.0/build-reserved.mjs`.

## Storage

`storage.ts` is the *only* file that imports `obsidian`-vault-adjacent
storyForge modules (`../paths.js` for `TITLEFORGE_BACKSTAGE_ROOT`,
`../writeGuard.js` for guarded writes). Everything titleForge writes lives
under `_backstage/titleforge/`:

- The built-in word lists are **compiled in and read-only** — never seeded
  to the vault, never loaded from it. `loadAllGenerators()` returns the
  compiled `ALL_TITLEFORGE_LEXICONS`, with the user's own additions merged
  into `title-composer` only. There is no vault copy of the built-ins to go
  stale, and no code path lets the vault change a shipped word.
- `user enhanced lexicon.md` — the one file the user *can* edit. On first
  load it is created from the bundled instruction template
  (`lexicons/userLexiconTemplate.ts`); its worked examples all sit inside
  fenced code blocks so the scanner skips them. The scanner
  (`engine/userLexicon.ts`) reads a word only when it is a `- ` list item
  directly under a `## <slot>` heading matching a known `title-composer`
  lexicon slot, parses it with the shared `parseCompactEntry`, and
  **appends** it to a deep copy of the bundled spec (additive only — bundled
  entries are never removed, reordered, or mutated). Malformed lines are
  skipped and reported in one consolidated `Notice`, never thrown; a file
  that can't be read at all falls back to the pure bundle. `validateSpec`
  runs on the merged spec. Editing the file re-scans live (debounced
  `vault.on` subscription in `TitleForgeController.watchUserLexicon`), so
  "add a word, see it" needs no reload.
  - Vaults upgraded from a titleForge that seeded `lexicons/*.json` get a
    one-time advisory `Notice` (`adviseLegacyLexiconsOnce`,
    `settings.legacyLexiconsNoticeShown`) that the folder is now unused and
    can be deleted — never deleted automatically, since a copy there could
    have been hand-edited under the old model.
- `settings.json` — last-used generator/genre/family/platform/series settings.
- `history/<generatorId>.jsonl` — one file per tradition (not one global file),
  since exclusion sets are naturally scoped per tradition. About forty bytes
  per entry plus the title; the seed is provenance (`replay`/`replayMatches`
  regenerate or verify a past title, exact only while the lexicon is
  unchanged).

## Extraction checklist

If this ever becomes its own installed plugin:

1. Copy `src/titleforge/` into the new plugin's `src/`.
2. `storage.ts`: change `root()` to point at the new plugin's own vault-root
   constant instead of storyForge's `TITLEFORGE_BACKSTAGE_ROOT`, and replace
   the `writeGuard.ts` calls with plain `vault.create`/`vault.modify`
   (writeGuard's only job was confining writes inside storyForge's folder,
   which a standalone plugin doesn't need).
3. `TitleForgeController.ts`: swap the `ICON_TITLEFORGE` import for an owned SVG
   registered via Obsidian's `addIcon()`.
4. Write a thin `main.ts`: `export default class extends Plugin { onload() { this.controller = new TitleForgeController(this); return this.controller.onload(); } onunload() { this.controller.onunload(); } }`.
5. Split the `.titleforge-*` CSS block out of storyForge's `styles.css` into
   the new plugin's own — it's already fully self-scoped, so this is a cut and
   paste with no rule to detangle.
6. Everything in `engine/` and `lexicons/` needs no changes at all — that
   boundary (Obsidian-free engine, Obsidian-facing glue one layer up) is the
   whole point of the split.

## Extending it

A **user** adds words by editing `_backstage/titleforge/user enhanced
lexicon.md` — `- word #tag` bullets under `## <slot>` headings, merged into
`title-composer` (see Storage above). Changing or expanding the **built-in**
lists is code work: edit the bundled `.ts` module under `lexicons/` and
rebuild. The compact string form — `"gloss #tag *weight ^stem"` — is `gloss`,
then `#tag`/`*weight` in any order, then `^stem` last; the object form
(`{ gloss, tags?, weight?, stem? }`) is the escape hatch for a word that
genuinely needs a `#`, `*` or `^` in it.

A slot is either *bare* (no entry's gloss starts with "the ") or *articled*
(every entry's does) — `checkArticleAgreement` enforces that a template only
writes literal `the {slot}` for a bare slot, and it's run over every bundled
lexicon in `__tests__/lexicons.structural.test.ts` on every `npm test`.

## What's deliberately not here

No character-count budget (English word count is always meaningful; a
character budget would only ever be a cover-art constraint). No
original-script *output* — see the top of this file. No Indigenous North
American, Aboriginal Australian or Māori generation — those naming practices
turn on *whose name it is* (communally held names, genealogical reference,
in some nations knowledge restricted by design), which a random combiner
cannot represent without producing output that looks authentic and isn't.
The written literary conventions this *does* model (the Arabic construct
state, the Persian linking vowel, Russian paired abstractions, …) are
describable grammar rather than cultural property, which is a different case.
No LLM post-processing of generated output — it would smooth the phrasing and
destroy the property that makes this defensible: every title is traceable to
one stated structural convention.
