/**
 * The bootstrap contents of `_backstage/titleforge/user enhanced lexicon.md`.
 *
 * Written verbatim on first load when the file does not exist (see
 * `storage.ts`). Every worked example lives inside a fenced code block on
 * purpose: the scanner (`engine/userLexicon.ts`) skips fenced content, so the
 * template can show `- word #tag` lines without them being read as real
 * additions (invariant I4).
 *
 * This is also the shipped user-facing documentation for the feature — keep it
 * readable, not just correct.
 */
export const USER_LEXICON_TEMPLATE = `# Adding your own words to titleForge

titleForge ships with a built-in word list that you can't edit or break — it's baked into the plugin. But you can **add your own words** here, and titleForge will blend them in automatically whenever it generates a title. Nothing you write here can damage the built-in list; your words simply sit alongside it.

## The one thing to understand first

Every word has **two properties**:

1. **A slot** — *where in a title the word is allowed to appear.* A colour, a place name, a verb, and so on. Put a word in the wrong slot and you'll get odd, ungrammatical titles.
2. **One or more genre tags** — *which genres the word shows up for.* This is the \`#tag\` part.

You choose the slot by writing the word under that slot's heading. You choose the genres with \`#tags\`.

> **Important:** always give a word at least one genre tag. A word with no tag only ever appears under "Any genre" — it will never show up when a specific genre is selected.

## How to add a word

Write one word per line, as a bullet, under the slot it belongs to:

\`\`\`
## noun
- cyberdeck #cyberpunk
- data-haven #cyberpunk #sf

## place
- Neon Quay #cyberpunk
\`\`\`

That's it. \`- \` then the word, then a space, then your \`#tags\`.

## Genre tags vs subgenre tags

- Tag with a **whole genre** (e.g. \`#sf\`) and the word appears for that genre *and every subgenre under it*.
- Tag with a **subgenre** (e.g. \`#cyberpunk\`) and the word appears when that subgenre is chosen — and it's also blended in when its parent genre is chosen.
- Use **several tags** if a word fits more than one: \`- chrome #cyberpunk #dystopian\`

**The tags you can use** (these are fixed — a misspelt tag just means the word won't show up where you expect):

| Genre | Whole-genre tag | Subgenre tags |
|---|---|---|
| Fantasy | \`#fantasy\` | \`#epic\` \`#heroic-fantasy\` \`#sword-sorcery\` \`#urban-fantasy\` \`#dark-fantasy\` \`#portal-fantasy\` \`#cosy-fantasy\` |
| Science fiction | \`#sf\` | \`#space-opera\` \`#military-sf\` \`#cyberpunk\` \`#dystopian\` \`#hard-sf\` \`#first-contact\` \`#alt-history\` |
| Horror | \`#horror\` | \`#gothic\` \`#cosmic-horror\` \`#folk-horror\` \`#supernatural\` \`#slasher\` |
| Crime & thriller | \`#crime\` | \`#whodunit\` \`#cosy-mystery\` \`#noir\` \`#psych-thriller\` \`#spy\` \`#heist\` \`#legal-thriller\` |
| Literary | \`#lit\` | *(none)* |
| Historical | \`#hist\` | \`#western\` \`#regency\` \`#wartime\` \`#ancient\` \`#medieval\` \`#naval\` |
| Romance | \`#rom\` | \`#contemporary-romance\` \`#rom-com\` \`#historical-romance\` \`#romantasy\` \`#paranormal-romance\` |
| Young adult | \`#ya\` | *(none)* |

## Two quick tips

- **Give a subgenre a few words, not one.** If you add a single \`#cyberpunk\` noun and nothing else, then choosing Cyberpunk will use *your one noun every time* while everything else falls back to general sci-fi. To make a subgenre feel distinct, add a handful of words across several slots (a few nouns, a couple of places, an adjective or two).
- **Weight (optional).** Add \`*2\`, \`*3\` etc. to make a word come up more often: \`- moonlight #rom *2\`. Leave it off and every word is equally likely.

## Slot reference

Put your word under the slot whose examples it most resembles.

**Describing words**
- \`adj\` — seldom-seen, half-remembered, unlucky
- \`colour\` — scarlet, crimson, ashen
- \`warmAdj\` — forgiving, hospitable, devoted *(warm/kind adjectives)*

**Things**
- \`noun\` — quarantine, almshouse, scaffold *(general nouns)*
- \`object\` — sextant, inkwell, snuffbox *(concrete, handheld things)*
- \`symbol\` — tallow, lodestone, chalk *(evocative, symbolic objects)*
- \`food\` — bread, honey, brine
- \`body\` — knuckle, eyelid, marrow

**Ideas & feelings**
- \`abstract\` — insomnia, gratitude, notoriety
- \`coldNoun\` — attrition, quarantine, liquidation *(cold/harsh abstractions)*

**Nature**
- \`animal\` — corncrake, lamprey, jackdaw
- \`plant\` — hawthorn, yarrow, bindweed
- \`weather\` — hoarfrost, sirocco, gale
- \`water\` — millpond, race, spillway

**People & roles**
- \`name\` — Wren, Osric, Talia *(first names)*
- \`kin\` — daughter, son, mother
- \`person\` — foreigner, apprentice, debtor
- \`role\` — coroner, harbourmaster, almoner *(lowercase job/role)*
- \`title\` — Coroner, Bailiff, Envoy *(capitalised title)*
- \`honorific\` — Mister, Missus, Doctor
- \`group\` — Wardens, Kept, Faithful
- \`epithet\` — Unwitnessed, Tithebreaker, Becalmed *(a byname/nickname)*

**Places**
- \`place\` — Widdershin, Greyhaven, Pennyfields
- \`placeBare\` — Folstoc, Carwin, Blackmere *(place name used on its own)*
- \`kingdom\` — Threnody, Aldermarch, Vayle *(realms, lands)*
- \`planet\` — Kestrel, Tharsis, Coriol *(worlds, for sci-fi)*

**Actions**
- \`verb\` — witness, unmake, pardon *(present tense)*
- \`gerund\` — inventorying, overwintering, disinheriting *(-ing form)*
- \`pastVerb\` — recanted, overwintered, absconded *(past tense)*
- \`pastPart\` — disinherited, unwitnessed, becalmed *(past participle)*
- \`strikeVerb\` — rises, falls, awakens *(third-person, dramatic)*
- \`riseFall\` — fall, ruin, rise *(rise/fall nouns)*

**"Tale" and series words**
- \`taleWord\` — reckoning, account, psalm
- \`seriesWord\` — Chronicles, Saga, Cycle
- \`refWord\` — Book, Dictionary, Encyclopaedia
- \`countWord\` — Trilogy, Duology, Quartet
- \`storyWord\` — Stories, Tales, Cases

**Time**
- \`time\` — winter, dusk, the harvest
- \`shortTime\` — day, night, winter
- \`season\` — Midsummer, Michaelmas, Monsoon
- \`era\` — Age, Year, Reign

**Numbers & quantity**
- \`number\` — Seven, Twelve, Three
- \`ordinal\` — First, Second, Third
- \`quantAll\` — All, Everything
- \`quantNo\` — Nothing, Nobody, No One

**Grammar bits**
- \`possessive\` — My, Her, His
- \`manner\` — Regardless, By Halves, in Winter

---

*Advanced:* if a word needs a different grammatical base form (for correct "a/an" handling or matching), add it after a \`^\` at the end of the line, e.g. \`- I Was Banished ^Being Banished\`. Most words never need this.

---

## Your words

Add your own headings below — one \`## slot\` per slot you want to extend — and list your words as bullets under them. Delete this note once you've started.
`;
