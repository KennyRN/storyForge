# titleForge — Stage 4: calibrating the anglophone NOVEL shapes

Turns the frozen novel corpus (v1.1.0, n=402 CORE; all six target
genres — literary/SF-F/crime/horror/romance/YA — prize-verified) into a corpus-grounded **audit** of
the ~74 novel patterns already in
`../lexicons/titleComposer.ts`. Everything numeric here is computed by
`derive.mjs` from `corpus.core.frozen.json`; re-run with `node derive.mjs`.

Unlike the series lane (which derived a NEW `family:"series"` shape set), the
novel lane changes **no shapes and no vocabulary**. Its output is a set of
weight / genre-eligibility / exemplar corrections to shapes that already exist,
each traceable to a frozen number.

## What is genuinely different about NOVEL titles (measured)

| axis | novels (this corpus) | series lane (v1.0.0) | consequence |
|---|---|---|---|
| **one-word titles** | **15.7%** (63/402) — *Beloved, It, Jaws, Dune, Neuromancer, Zombie, Gilead…* | excluded by a multi-word floor | **do NOT import the series one-word exclusion**; `core`/one-word shapes are first-class |
| leading **"The"** | **32.3%** (stable 32.3/31.3/31.3 across cuts) | 52.8% | novels lean on "The" *less* than series umbrellas; don't default to it |
| **of-genitive** | **11.9%** | ~15% | the "The X of Y" cliché is even rarer for novels — the current weight-5 `of-the` shape is badly over-weighted |
| top structural family | Compound 52.2% | Compound 50.5% | compound nominal is the workhorse for both |
| possessive | 5.7% (23/402) | — | the weight-4 `role-poss` shape is over-weighted |

Length skews markedly shorter than series (word-count mode is 1–3 words; the
one-word mass is the headline). The long declarative "sentence" tail the brief
asked about is real but small in a prize-winner corpus (`word_count>=6` = 23
records) — see Limitation 3 (winner skew) before weighting it up.

## Family → corpus structural basis (and its caveat)

`derive.mjs` maps each composer family to one corpus structural signal:

`core/abstract→SF01(simple/one-word)`, `modifier→SF02(compound)`,
`of→of-genitive`, `prep→SF03(prepositional)`, `pair→SF04(coordinated)`,
`name→SF05(proper-name)`, `poss→possessive`, `question→question`,
`clause/sentence→word_count>=6`, `subtitle→colon`.

**Caveat (honest):** composer families are not 1:1 with corpus structural
families. E.g. the composer files "The [adj] [noun]" under `core`, but the
string classifier scores it SF02 (compound). So the *direction* of a weight
flag is trustworthy; the exact suggested integer is a first-pass signal, not a
verdict. This is why the integration prompt applies weights only once the corpus is release-grade (now v1.1.0).

## Fourteen families have no structural basis in this corpus

`rhetoric, temporal, reference, place, participle, number, journey, guide,
event, tale, negative, list, lastfirst, verb` are **semantic/rhetorical** axes,
not structural ones — the corpus (coded on structure) can't weight them. They
are left exactly as-is and flagged for dedicated sourcing, NOT silently changed.

## The flags (each traced to a frozen number)

1. **`of-the` weight 5 → suggested 1.** of-genitive is 11.9% of the corpus and
   stable across cuts. Corroborates the *independent* series finding ("do not
   overweight the of-genitive"). **High confidence — recommend acting.**
2. **`role-poss` weight 4 → 1.** possessive is 5.7% (23 records).
3. **`who-clause` weight 4 → 1.** long declaratives are 23 records (and
   winner-skewed — treat as a floor).
4. **`the-adj-noun` weight 5 vs core-basis 2.** Mapping artefact (it's really
   compound, SF02, n=100 → the compound band is *under*-weighted). Read as:
   compound/`modifier` shapes deserve the top weight, not `core`.
5. **`name-epithet` exemplar "Ivan the Terrible" is not a novel.** A historical
   epithet / film. Replace with a sourced novel title. **Unambiguous error —
   fix now.**

## Corpus-forced policies for novels

1. **One-word titles are first-class** (15.7%). No multi-word floor.
2. **Don't default to "The"** (32.3%, not a majority) and **don't overweight the
   of-genitive** (11.9%).
3. **Genre-condition by attestation, not intuition** — `derive.mjs` emits
   per-family corpus genre-eligibility (>=2 attesting records); e.g. `name`
   (proper-name) attests crime/horror/lit here, matching the series finding that
   proper-name titles concentrate in crime.

## Recommended decisions (add / drop / re-weight / re-genre)

- **Add:** nothing. Zero new vocabulary; the corpus doesn't motivate a new shape.
- **Drop:** nothing. Every low-count family is a real (if rare) form.
- **Re-weight:** de-weight `of`/`poss`/long-`clause`; raise compound/`modifier`
  relative to `core`. The corpus is now release-grade (v1.1.0), so these are ready to apply
  (INTEGRATION-PROMPT Tier 2); keep the compound/`core` mapping caveat in mind.
- **Re-exemplar:** fix `name-epithet` now (Tier 1).
- **Re-genre:** tighten `name` toward its corpus attestation (horror/crime/lit/rom/ya), now v1.1.0.

## Self-check (in `derive.mjs`)

Parses 74 novel + 9 series patterns from the live lexicon; flags weight
divergences (>=3), genre unattestation, and hand-audited non-novel exemplars.
