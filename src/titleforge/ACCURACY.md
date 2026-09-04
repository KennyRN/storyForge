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
