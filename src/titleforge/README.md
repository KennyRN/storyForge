# titleForge

Nine title & series generators — each an English shape taxonomy modelled on a
different tradition's title conventions (Anglophone literary, Western web
serial, Japanese light novel, Korean web novel, Chinese web novel, Vietnamese
web novel, Indonesian web novel, Thai web novel, and a comparative "world
literary shapes" bench for Arabic/Persian/Russian/Hindi/Swahili conventions).

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
    generate.ts             generateOne / generateMany / generateSeries / validateSpec
    history.ts               JSONL parse/serialise, toEntry, titlesFrom, replay, replayMatches
    registry.ts               register / getGenerator / listGenerators / listByTradition
    index.ts                  barrel export
  lexicons/            one .ts module per tradition, each a typed GeneratorSpec
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
  __tests__/            vitest — engine unit tests + a structural sweep over all nine
                        bundled lexicons (validateSpec, checkArticleAgreement, every
                        pattern has note+exemplar, every genre generates, every series
                        strategy succeeds)
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
import { generateOne, generateMany, generateSeries, getGenerator } from "./engine/index.js";
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
the batch). `generateSeries(spec, options)` produces a series title and its
volumes as one coherent set — see `SeriesStrategy` in `types.ts`: `echo` (one
shape, repeated), `anchor` (one element fixed, e.g. *Harry Potter and the
[Noun]*), `free` (a label plus loose volumes, e.g. *The Chronicles of Narnia*).

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

### Genres: an optional two-level parent/subgenre model

A `GenreOption` (`engine/types.ts`) may carry a `parent`, pointing at another
genre's id — e.g. `title-composer` ships `{ id: "western", label: "Western",
parent: "hist" }`. Depth is capped at **two**: a genre with a `parent` may not
itself be a parent (`validateSpec` enforces this, along with no cycles/orphan
parents). A genre with no `parent` and nothing pointing at it as one behaves
exactly as a flat genre always has — this is additive, not a redesign.

`genreScope(spec, id)` (`engine/generate.ts`) is the one function that turns a
selected id into "everything it reaches": selecting a **subgenre** reaches
itself plus its ancestors (a `#hist`-only pattern is eligible under *Western*);
selecting a **parent** reaches itself plus every descendant (a
`#western`-only pattern is eligible under *Historical*). Pattern eligibility
(`eligiblePatterns`) is a straight membership test against that scope.
Lexicon vocabulary is more careful, because "union everything" would make a
richly-authored subgenre indistinguishable from a starved one: a subgenre
selection uses **most-specific-tag-present-wins** (`narrowLeaf` — the first
tag in the chain that matches anything in a given slot wins outright, so
adding one `#western` word makes that one slot Western-only while every other
slot keeps falling back to `#hist`), while a parent selection uses a plain
**union** of self plus every descendant (`narrowParent`).

This is what makes a new subgenre cheap: declare `{ id: "regency", parent:
"hist" }` with zero lexemes and zero patterns of its own, and it already
produces valid, Historical-shaped titles by inheritance (`title-composer`
ships `western`/`regency` this way deliberately, as a live example — see
`genre-coverage`'s "inherits only" flag below). `validateSpec`'s reachability
check follows the same rule: a subgenre with no *own* material is never
flagged unreachable as long as its parent has patterns.

Run `npm run titleforge:coverage` (`tools/genre-coverage.ts`) to see, per
generator, every genre's eligible-pattern count, its own-tagged lexeme count,
how much more it can reach by inheritance, and a `THIN`/`inherits only` flag —
the "easy to see what needs expanding" half of this feature. It exits
non-zero if any declared genre is genuinely unreachable, so it can gate CI.

The view (`TitleForgePanel.hierarchicalGenreOptions`) renders this as one
flat, indented `<select>` — parents in declaration order, each immediately
followed by its own subgenres — rather than a dependent pair of pickers, to
keep the picker's shape unchanged.

## Storage

`storage.ts` is the *only* file that imports `obsidian`-vault-adjacent
storyForge modules (`../paths.js` for `TITLEFORGE_BACKSTAGE_ROOT`,
`../writeGuard.js` for guarded writes). Everything titleForge writes lives
under `_backstage/titleforge/`:

- `lexicons/*.json` — seeded from the bundled `.ts` defaults on first load,
  as **real, hand-editable JSON**. A vault copy always wins over the bundled
  default at *load* time, and a parse failure falls back to the bundled
  default with a `Notice` (never a silent swallow). This is how "edit a word,
  no rebuild" (the original design's whole point) survives inside a bundled
  Obsidian plugin: the bundled `.ts` module is just the seed.
  - **Seed propagation** (`ensureLexiconsSeeded`, on every `onload()`): a
    hidden `lexicons/.seed-manifest.json` tracks, per generator, the hash of
    the bundled bytes and the hash of what was actually written to the vault
    at the moment it was last seeded/reset. A rebuilt bundle then propagates
    automatically onto any vault copy that was **never hand-edited since**
    (hashes still match); a copy that *has* been hand-edited is always kept,
    with a one-off `Notice` pointing at "Reset lexicon to bundled default" to
    adopt the new version deliberately. A vault copy that pre-dates this
    manifest is left untouched the first time it's seen (its provenance is
    unknown) and just gets an advisory `Notice`, once — from then on it's
    tracked like any other. This is what makes "genres/vocabulary look out of
    date" something a rebuild fixes on its own, without ever silently
    discarding an edit.
  - **Reset** (`resetLexiconToBundled`, id-based) always re-resolves the true
    bundled spec from `ALL_TITLEFORGE_LEXICONS` by id, never from whatever
    spec a caller happens to be holding — `TitleForgeController.generators`
    is itself vault-preferred, so a spec sourced from there can *be* the
    stale copy the reset button exists to replace. The settings modal also
    has a "Reset all lexicons to bundled" button (confirms first) for
    clearing out every generator's vault copy at once — mainly useful right
    after an upgrade whose vault copies pre-date the manifest above.
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
   the two `writeGuard.ts` calls with plain
   `vault.create`/`vault.modify` (writeGuard's only job was confining writes
   inside storyForge's folder, which a standalone plugin doesn't need).
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

Adding a word or a whole tradition is data work, not code work, once seeded:
edit the JSON under `_backstage/titleforge/lexicons/` directly in the vault
(or edit the bundled `.ts` module and re-copy it out via the settings modal's
"Reset lexicon to bundled default"). The compact string form —
`"gloss #tag *weight ^stem"` — is `gloss`, then `#tag`/`*weight` in any order,
then `^stem` last; the object form (`{ gloss, tags?, weight?, stem? }`) is the
escape hatch for a word that genuinely needs a `#`, `*` or `^` in it.

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
