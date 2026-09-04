# titleForge Stage 5 — integration prompt (for the coding agent)

You are wiring a **corpus-grounded series shape set** into the live
`title-composer` generator. All research is done and frozen; this is
transcription + routing + tests. Do exactly the edits below and nothing more.
Do not redesign shapes, rebalance weights, or add vocabulary.

## Context (read once)

- titleForge lives at `src/titleforge/`. Generators are compiled TypeScript
  `GeneratorSpec` objects under `src/titleforge/lexicons/`. The anglophone bench
  is `src/titleforge/lexicons/titleComposer.ts`.
- "Series generation" is an **engine mode**, not a module:
  `generateSeries(spec, options)` in `src/titleforge/engine/generate.ts` runs
  `echo` / `anchor` / `free` strategies over a spec's patterns. It selects
  patterns through `eligiblePatterns(spec, options)`, which honours
  `options.family`.
- The nine patterns below were derived from the frozen research corpus
  (`src/titleforge/corpus/`, v1.0.0, n=303). That folder is research only and is
  **not** bundled; you are copying values *out* of it into `titleComposer.ts`,
  never importing it at runtime.

## Edit 1 — add the family option

In `titleComposer.ts`, add ONE entry to the `families` array:

```json
{ "id": "series", "label": "Series umbrella" }
```

## Edit 2 — append the nine series patterns

Append these nine objects to `titleComposer.ts`'s `patterns` array **verbatim**
(they already match the quoted-key house style and the `Pattern` schema):

```json
[
	{ "id": "series-simple", "family": "series", "label": "The [Noun]",
	  "templates": ["The {noun}", "The {abstract}", "The {group}", "The {kingdom}"],
	  "genres": ["epic","sf","horror","hist","rom","ya"], "weight": 3,
	  "exemplar": "The Belgariad; The Expanse; The Strain",
	  "note": "The barest umbrella — one weighty noun. Reads as \"the one that matters\"; leans literary/SF. Nearly always takes \"The\"." },

	{ "id": "series-compound", "family": "series", "label": "[Adjective] [Noun] / The [Adjective] [Noun]",
	  "templates": ["The {adj} {noun}", "{adj} {noun}", "The {colour} {noun}", "{noun} {noun#2}", "The {noun} {noun#2}"],
	  "genres": ["epic","sf","horror","crime","lit","hist","rom","short","ya"], "weight": 15,
	  "exemplar": "The Stormlight Archive; Revelation Space; Cthulhu Mythos",
	  "note": "The workhorse series shape (~half the corpus). Articled and bare forms are near-even in real series, so both are offered; pick the adjective for sound." },

	{ "id": "series-of", "family": "series", "label": "The [Noun] of [Noun]",
	  "templates": ["The {noun} of {noun#2}", "{noun|a} of {noun#2}", "{noun} of {place}", "{title} of {place}", "The {taleWord} of {name}", "{group} of {place}"],
	  "genres": ["epic","sf","horror","crime","lit","hist","rom","ya"], "weight": 5,
	  "exemplar": "A Song of Ice and Fire; The Book of the New Sun; The Books of Blood",
	  "note": "The of-genitive is iconic but a MINORITY in real series (~15%) — do not overweight it. The bare and \"A …\" forms matter (A Song of Ice and Fire)." },

	{ "id": "series-pair", "family": "series", "label": "[Noun] and [Noun]",
	  "templates": ["{noun} and {noun#2}", "The {noun} and the {noun#2}", "{name} and {name#2}", "{adj} and {adj#2}"],
	  "genres": ["epic","crime","lit","ya"], "weight": 1,
	  "exemplar": "Memory, Sorrow, and Thorn; The Fast and the Furious; Jeeves and Wooster",
	  "note": "Coordination — a pairing or a duo. Uncommon but distinctive; also the natural home for the ampersand pairing (Bryant & May)." },

	{ "id": "series-name", "family": "series", "label": "[Character Name]",
	  "templates": ["{name} {name#2}", "{honorific} {name}", "{name}"],
	  "genres": ["epic","sf","horror","crime","lit","hist","ya"], "weight": 6,
	  "exemplar": "James Bond; Harry Bosch; Hannibal Lecter",
	  "note": "A recurring protagonist as the umbrella. In real series this is overwhelmingly crime/thriller (and comic) — hence its genre-eligibility, not a global default." },

	{ "id": "series-marker", "family": "series", "label": "The [Noun] [Saga/Cycle/Chronicles/Files]",
	  "templates": ["The {adj} {seriesWord}", "The {noun} {seriesWord}", "{name} {seriesWord}", "The {name} {countWord}", "The {storyWord} of {place}"],
	  "genres": ["epic","sf","horror","crime","lit","hist","rom","ya"], "weight": 6,
	  "exemplar": "The Stormlight Archive; The Murderbot Diaries; The Best American Short Stories",
	  "note": "The one genuinely series-specific shape: a trailing multi-work marker (Saga, Cycle, Chronicles, Files, Trilogy). A minority tail in the corpus — signals scope without being the norm." },

	{ "id": "series-colon", "family": "series", "label": "[Name]: [Noun]",
	  "templates": ["{name}: {noun}", "{noun}: {abstract}"],
	  "genres": ["crime"], "weight": 1,
	  "exemplar": "Mission: Impossible",
	  "note": "Bipartite, colon-split — franchise/property register (Mission: Impossible). Rare in prose series; low weight." },

	{ "id": "series-verb", "family": "series", "label": "[Verb] [Object]",
	  "templates": ["{strikeVerb} Me", "{verb} the {noun}"],
	  "genres": ["sf","ya"], "weight": 1,
	  "exemplar": "Shatter Me",
	  "note": "Imperative/verbal — urgent, voice-forward (Shatter Me). Very rare as a series umbrella; low weight, YA-leaning." },

	{ "id": "series-clause", "family": "series", "label": "How to [Verb] [Noun]",
	  "templates": ["How to {verb} Your {noun}"],
	  "genres": ["epic","ya"], "weight": 1,
	  "exemplar": "How to Train Your Dragon",
	  "note": "A clause/how-to umbrella (How to Train Your Dragon). Very rare; children's/comic register; low weight." }
]
```

## Edit 3 — route series generation to the family

Wherever the UI/controller invokes series generation, pass `family: "series"`
in the `generateSeries` options so the umbrella is drawn from these shapes and
not the 74 novel patterns. If the series UI exposes a genre, pass it through;
`echo`/`anchor`/`free` all work unchanged. Do **not** edit the engine.

## Edit 4 — no lexicon changes

Make none. Every slot used above (`noun adj colour abstract group kingdom name
honorific title place seriesWord countWord storyWord taleWord verb strikeVerb`)
already exists in `titleComposer.lexicon`. Adding words is out of scope.

## Edit 5 — provenance

In `src/titleforge/ACCURACY.md`, log the nine exemplars as **verified** (not
illustrative), provenance "series corpus v1.0.0". They are real series taken
from the frozen corpus; do not alter or "improve" them.

## Invariants (each traceable to a real mechanism or a past failure)

1. **The `series` family option must exist.** `validateSpec` rejects any pattern
   whose `family` is not in `spec.families` — skipping Edit 1 produces
   `unknown family "series"` and fails the build. (validateSpec, generate.ts)
2. **Series generation must pass `family: "series"`.** `eligiblePatterns` only
   narrows to the series set when the family is supplied; without it the nine
   shapes are pooled with the 74 novel patterns and the series voice is diluted.
   (eligiblePatterns, generate.ts)
3. **Zero new lexicon slots/words.** The plugin ships under a bundle ceiling and
   a prior pass wasted ~7 KB to reintroduced whitespace/vocabulary; keep the
   delta to nine patterns + one family option.
4. **Repeated slots stay indexed.** `{noun#2}`, `{name#2}`, `{adj#2}` must keep
   their indices — an un-indexed repeat re-draws the *same* word into both slots
   (a bug fixed earlier). Do not "simplify" them.
5. **Indefinite article only via the `|a` filter.** `series-of` uses
   `{noun|a} of {noun#2}`; never hard-code "A"/"An" before a slot, or
   `checkArticleAgreement` will (correctly) flag it. (articles.ts)
6. **Every pattern keeps its `note` and `exemplar`.** Both feed "Why this shape"
   and are required; all nine already have them.
7. **Weights are relative *within* `family:"series"`.** 15/6/6/5/3/1… encode
   corpus frequency among the series shapes; do not renormalise them against the
   novel patterns or "round them up".
8. **Exemplars are frozen facts.** They come from corpus v1.0.0; if a shape's
   exemplar ever needs regenerating, re-run `node src/titleforge/corpus/derive.mjs`
   and copy the output — never hand-edit.
9. **The corpus folder is not a runtime dependency.** Transcribe values into
   `titleComposer.ts`; do not `import` anything from `src/titleforge/corpus/`
   into shippable code.

## Commands to run (must all pass)

```
# typecheck / build the plugin as usual for this repo, then:
npm test -- generate.test.ts          # generateSeries paths
npm test -- articles.test.ts          # checkArticleAgreement
npm test -- lexicons.structural.test.ts   # structural sweep over every spec
npm test -- template.test.ts          # slot/template resolution
```

If the repo runs the whole suite in one command, run that instead; the four
files above are the ones this change can affect.

## Acceptance criteria

- Build/typecheck clean; `validateSpec(titleComposerLexicon)` returns `[]`.
- `checkArticleAgreement(titleComposerLexicon)` returns `[]`.
- The structural sweep passes with the nine new patterns present.
- `generateSeries(titleComposerLexicon, { family: "series", genre: "crime" })`
  yields character-led umbrellas (series-name/compound), and
  `{ family: "series", genre: "epic" }` yields compound/of-genitive/marker
  umbrellas — i.e. genre-eligibility visibly bites.
- Bundle size delta = nine patterns + one family option; no lexicon growth.

## Rollback

The change is additive (one family option, nine patterns, one call-site
argument, one ACCURACY.md note). To revert, remove those; nothing else depends
on them.
