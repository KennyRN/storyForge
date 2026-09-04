# titleForge — Stage 4: deriving the series generator

Turns the frozen corpus (v1.0.0, n=303 CORE) into a corpus-grounded **series
shape set** for `title-composer`. Everything numeric here — weights, genre
eligibility, exemplars — is computed by `derive.mjs` from
`corpus.core.frozen.json`, not asserted. Re-run with `node derive.mjs`.

Outputs: `series-shapes.json` (the `Pattern[]` to merge) and
`series-weights.json` (the derived genre x family matrix + policy numbers).

## The fork, resolved

The open question was (a) re-weight/tag the existing composer shapes for series
use, versus (b) a distinct series shape set because series names diverge from
novel names. Reading the **live** lexicon settled it:

- The composer already carries the series-marker vocabulary as real slots —
  `seriesWord` (Chronicles, Saga, Cycle, Sequence, Archive, Files, Annals,
  Quartet, Papers, Dossier), `countWord` (Trilogy, Duology…), `storyWord`,
  `taleWord` — each genre-tagged inline, plus a `subtitle` = "Subtitle &
  series" family.
- The frozen corpus confirms series **labels** are built from the *same*
  grammatical families as novel titles (compound nominal, of-genitive,
  proper-name, coordinated, simple). There is no separate series grammar.

So the honest answer is **neither pure (a) nor pure (b)**: a **calibration**
delivered as one coherent, selectable series shape set (`family: "series"`),
reusing the composer's existing slots, with weights and eligibility fixed by the
corpus. This is bundle-cheap (see below) and leaves novel generation untouched.
This updates the earlier lean toward (b) — that lean came from the cross-tab
before the live lexicon was read.

## Bundle cost: ~nine patterns, zero new lexicon

Every slot the nine shapes use (`noun`, `adj`, `colour`, `abstract`, `group`,
`kingdom`, `name`, `honorific`, `title`, `place`, `seriesWord`, `countWord`,
`storyWord`, `taleWord`, `verb`, `strikeVerb`) already exists in
`titleComposer.lexicon`. **No new word lists are added.** The only additions are
the nine `Pattern` objects and one family option.

## Genre mapping (corpus G-codes -> composer genres)

Composer genres are `epic, sf, horror, crime, lit, hist, rom, short, ya`. The
corpus's eleven genres fold in: Fantasy->epic, SF->sf, Crime & Thriller->crime,
Romance->rom, Horror->horror, Historical & Western->hist, Literary & Comedy->lit,
Adventure->epic; anthology object-form->short; YA/MG/CHILD audience adds `ya`.
Western and Comedy have no native composer genre and fold to the nearest
(hist, lit) — a documented approximation, small in volume.

## The series shape set (derived)

Weight = scaled corpus frequency of the grounding family (`round(n/10)`, min 1);
eligibility = composer genres with >=2 attesting records; exemplars are real
corpus titles (C3 and non-bloc preferred, spanning genres).

| shape | family basis | weight | eligible genres | exemplars (corpus) |
|---|---|---:|---|---|
| series-compound | Compound Nominal | 15 | all | The Stormlight Archive; Revelation Space; Cthulhu Mythos |
| series-name | Proper-Name | 6 | epic, sf, horror, crime, lit, hist, ya | James Bond; Harry Bosch; Hannibal Lecter |
| series-marker | trailing Saga/Cycle/Files/… | 6 | all but short | The Stormlight Archive; The Murderbot Diaries; The Best American Short Stories |
| series-of | Prepositional (of-genitive) | 5 | all but short | A Song of Ice and Fire; The Book of the New Sun; The Books of Babel |
| series-simple | Simple Nominal | 3 | epic, sf, horror, hist, rom, ya | The Belgariad; The Expanse; The Strain |
| series-pair | Coordinated | 1 | epic, crime, lit, ya | Memory, Sorrow, and Thorn; The Fast and the Furious; Jeeves and Wooster |
| series-colon | Punctuation-Bipartite | 1 | crime | Mission: Impossible |
| series-verb | Verbal | 1 | sf, ya | Shatter Me |
| series-clause | Clause / how-to | 1 | epic, ya | How to Train Your Dragon |

## Three policies the corpus forces

1. **No leading-"The" default.** The corpus split is 52.8% "The" / 45.2% no
   article — near-even and stable across every sensitivity cut. So the two
   nominal shapes (`series-simple`, `series-compound`) carry *both* articled and
   bare templates rather than defaulting to "The".
2. **Do not overweight the of-genitive.** The "The … of …" shape *feels* like
   the default series name but is only ~15% of the corpus. `series-of` is
   weighted 5, below compound (15) and level with name/marker — a deliberate
   correction of the cliché. Its templates include the bare and "A …" forms
   (via the `{noun|a}` article filter) because real of-genitive series use them
   (*A Song of Ice and Fire*).
3. **Genre-condition the shapes.** Structural family is strongly genre-linked
   (frozen cross-tab: Proper-Name is 33/42 of crime but ~0 of romance; Compound
   and of-genitive concentrate in fantasy/SF). This is encoded as per-shape
   genre-eligibility. Finer per-genre *weight* tuning isn't expressible on the
   scalar `Pattern.weight`, so the full genre x family matrix is emitted in
   `series-weights.json` for a possible future per-genre-weight engine feature
   or manual Stage-5 splitting.

## Stage 5 integration brief

1. Add one family option to `titleComposer.families`:
   `{ "id": "series", "label": "Series umbrella" }`.
2. Merge the nine objects from `series-shapes.json` into
   `titleComposer.patterns` (they already match the `Pattern` schema and the
   quoted-key house style).
3. No lexicon changes required.
4. Route `generateSeries(spec, options)` to prefer these via `family: "series"`
   (the `free` strategy uses the umbrella label; `anchor` can fix the `{name}`
   in `series-name`; `echo` can repeat any nominal shape as a volume pattern).
5. Run the existing lints: `validateSpec`, `checkArticleAgreement` (the article
   filter `{noun|a}` is used wherever an indefinite article appears; no template
   hard-codes "A"/"An"), and confirm every pattern has `note` + `exemplar`
   (all nine do) and every repeated slot is indexed (`{noun#2}`, `{name#2}`,
   `{adj#2}` — checked clean by `derive.mjs`).
6. Update `ACCURACY.md`: all nine exemplars are verified real series drawn from
   the frozen corpus (provenance = corpus v1.0.0), so they enter as *verified*,
   not *illustrative*.

## Self-check (run in `derive.mjs`)

Lint clean: no unindexed repeated slots, no hard-coded indefinite articles
(the `|a` filter is used instead), every shape has a note and a real exemplar.
All template slots are confirmed members of the live `titleComposer.lexicon`.
