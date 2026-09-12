import type { GeneratorSpec } from "../engine/types.js";

// japaneseLn.ts — regrounded, English-only, corpus-derived.
// Provenance: jpln-localised v1.4.0 (see DERIVATION.md, mined-lexicon.json). Drop-in replacement:
// this file already exports `japaneseLnLexicon` and is registered in lexicons/index.ts.

export const japaneseLnLexicon: GeneratorSpec = {
	"id": "japanese-ln",
	"name": "Japanese light novel shape",
	"blurb": "English titles built like light novels: full-sentence premises, deadpan negations, and English-headed colon titles.",
	"tradition": "East Asian",
	"notes": [
		"Regrounded from corpus jpln-localised v1.4.0 (sha256 9e29c7fb3348…, n=141). English-only surface: romanised-Japanese brand heads were stripped from the corpus.",
		"Once the Japanese heads came off, the old brand-subtitle shape dissolved: its English remainders were merged into bare-title, nominalised-of, full-sentence-premise, and a new how-to-raise shape. Only English-headed colon titles keep a colon shape (english-colon).",
		"Weights are corpus-shaped, not hand-set. Every lexicon entry carries >=1 genre tag.",
		"Lexicon enriched: slots filled with corpus-mined and in-register editorial entries (v3), all genre-tagged, to reduce repetition in the thinner genres.",
		"Lexicon completed by mining all 141 corpus titles for every keyword (515 unique); nouns/phrases/numbers routed into semantic slots by rule, each carrying its source-title genre. Full keyword inventory in mined-lexicon.json.",
		"Calibration pass: split clause into clauseBase/clausePast by grammatical form; role-role-no uses a clean bare-noun roleWord slot; abstract de-articled; how-to template switched to 'My' to avoid a/an disagreement. Passes the engine's article-agreement lint.",
		"Final QA: exact duplicate and article-twin lexemes removed (bare form dropped where an articled form exists); unreferenced reserve slots removed (full keyword inventory retained in mined-lexicon.json)."
	],
	"genres": [
		{
			"id": "all",
			"label": "any"
		},
		{
			"id": "isekai",
			"label": "isekai"
		},
		{
			"id": "cheat",
			"label": "cheat / overpowered"
		},
		{
			"id": "slowlife",
			"label": "slow life"
		},
		{
			"id": "villainess",
			"label": "villainess / otome"
		},
		{
			"id": "romcom",
			"label": "romantic comedy"
		},
		{
			"id": "vrmmo",
			"label": "VRMMO / game"
		}
	],
	"patterns": [
		{
			"id": "english-colon",
			"label": "[English Head] : [Subtitle]",
			"templates": [
				"{englishHead}: {subtitle}"
			],
			"genres": [
				"isekai",
				"cheat",
				"villainess"
			],
			"weight": 6,
			"exemplar": "Dungeon Dive: Aim for the Deepest Level",
			"note": "English series-name head + explanatory subtitle. Romanised-Japanese heads were stripped; only English-headed colon titles remain — so this is much smaller than the old brand-subtitle shape."
		},
		{
			"id": "in-another-world-with",
			"label": "[Activity] in Another World (with [Cheat])",
			"templates": [
				"{activity} in Another World",
				"{activity} in Another World with {cheat}",
				"In Another World With {cheat}"
			],
			"genres": [
				"isekai",
				"cheat",
				"slowlife"
			],
			"weight": 9,
			"exemplar": "Farming Life in Another World",
			"note": "An ordinary activity welded to the destination; the 'with X' tail names the advantage."
		},
		{
			"id": "nominalised-of",
			"label": "[The] [Abstract] of [a/the Role or Name]",
			"templates": [
				"{abstract} of {role}",
				"The {abstract} of {role}",
				"The {abstract} of {name}",
				"The {abstract} of {name} the {epithet}"
			],
			"genres": [
				"isekai",
				"slowlife"
			],
			"weight": 5,
			"exemplar": "Ascendance of a Bookworm",
			"note": "Grand nominal shape. Merged in de-branded remainders 'The Slow Life of a Cheat Pharmacist' and 'The Annals of Veight' — same structure."
		},
		{
			"id": "full-sentence-premise",
			"label": "[Full-sentence premise / complaint]",
			"templates": [
				"Didn't I Say to {clauseBase}?!",
				"I've Been {activity} for {duration} and {result}",
				"I Shall {verb} Using {cheat}!",
				"I Don't Want to {avoid}, so I'll {resolve}"
			],
			"genres": [
				"isekai",
				"cheat",
				"vrmmo"
			],
			"weight": 6,
			"exemplar": "I've Been Killing Slimes for 300 Years and Maxed Out My Level",
			"note": "The long premise that does a blurb's work. Merged in the de-branded 'I Don't Want to…, so I'll…' remainder — same full-sentence shape."
		},
		{
			"id": "transition-as",
			"label": "[That Time I Got] Reincarnated as [Thing]",
			"templates": [
				"{transition} as {thing}",
				"That Time I Got {transition} as {thing}"
			],
			"genres": [
				"isekai"
			],
			"weight": 5,
			"exemplar": "That Time I Got Reincarnated as a Slime",
			"note": "States the rebirth and the new form, and stops."
		},
		{
			"id": "even-in-another-world",
			"label": "[Subject] [Predicate] Even in Another World",
			"templates": [
				"{subject} {predicate} Even in Another World"
			],
			"genres": [
				"isekai"
			],
			"weight": 2,
			"exemplar": "High School Prodigies Have It Easy Even in Another World",
			"note": "Mundane competence set against the fantastical; the 'even' does the deadpan."
		},
		{
			"id": "bare-title",
			"label": "[Short English nominal]",
			"templates": [
				"{brand}"
			],
			"genres": [
				"vrmmo",
				"isekai"
			],
			"weight": 5,
			"exemplar": "Overlord",
			"note": "One- or two-word English nominal. Merged in the de-branded nominals 'Jobless Reincarnation' and 'Spirit Chronicles' — same shape as Overlord / Log Horizon (was 'opaque-brand')."
		},
		{
			"id": "the-modifier-villainess",
			"label": "The/This [Modifier] Villainess [Verb/Situation]",
			"templates": [
				"The {modifier} Villainess {situation}",
				"{modifier} Villainess: {complaint}"
			],
			"genres": [
				"villainess"
			],
			"weight": 5,
			"exemplar": "Modern Villainess: It's Not Easy Building a Corporate Empire Before the Crash",
			"note": "The role-word 'Villainess' fronted by a modifier and trailed by her scheme."
		},
		{
			"id": "possessive-negation",
			"label": "My [Kin] Can't Be This [Adjective]!",
			"templates": [
				"My {kin} Can't Be This {adjective}!"
			],
			"genres": [
				"romcom"
			],
			"weight": 1,
			"exemplar": "My Little Sister Can't Be This Cute!",
			"note": "Deadpan denial of the visibly-true."
		},
		{
			"id": "banished-decision",
			"label": "Banished from [Group], I [Decision]",
			"templates": [
				"Banished from {group}, I {decision}"
			],
			"genres": [
				"slowlife",
				"isekai"
			],
			"weight": 1,
			"exemplar": "Banished from the Hero's Party, I Decided to Live a Quiet Life in the Countryside",
			"note": "Rejection then something better."
		},
		{
			"id": "role-role-no",
			"label": "[Role]? [Role]? No, I'm [Role]!",
			"templates": [
				"{roleWord#1}? {roleWord#2}? No, I'm the {roleWord#3}!"
			],
			"genres": [
				"villainess"
			],
			"weight": 1,
			"exemplar": "Heroine? Saint? No, I'm an All-Works Maid (and Proud of It)!",
			"note": "Sets up expected roles, rejects them, redefines."
		},
		{
			"id": "does-not-dream",
			"label": "[Subject] Does Not Dream of [Object]",
			"templates": [
				"{subject} Does Not Dream of {object}"
			],
			"genres": [
				"romcom"
			],
			"weight": 1,
			"exemplar": "Rascal Does Not Dream of Bunny Girl Senpai",
			"note": "Negated-desire frame."
		},
		{
			"id": "i-am-role-so",
			"label": "I'm [Role], So I'm [Action]",
			"templates": [
				"I'm {villainRole}, So I'm {action}"
			],
			"genres": [
				"villainess"
			],
			"weight": 1,
			"exemplar": "I'm the Villainess, So I'm Taming the Final Boss",
			"note": "Owns the role and states the consequence."
		},
		{
			"id": "if-they-clause",
			"label": "If [Role] and [Role] [Clause]",
			"templates": [
				"If {role#1} and {role#2} {clausePast}"
			],
			"genres": [
				"villainess"
			],
			"weight": 1,
			"exemplar": "If the Villainess and Villain Met and Fell in Love",
			"note": "Conditional 'what if' framing."
		},
		{
			"id": "turned-out-reveal",
			"label": "The [Person] I [Verb] Turned Out to Be My [Kin]",
			"templates": [
				"The {person} I {verb} Turned Out to Be My {kin}"
			],
			"genres": [
				"romcom"
			],
			"weight": 1,
			"exemplar": "The Girl I Saved on the Train Turned Out to Be My Childhood Friend",
			"note": "Long premise with a reveal twist."
		},
		{
			"id": "how-to-raise",
			"label": "How to [Care-verb] a [Adjective] [Kin]",
			"templates": [
				"How to {careVerb} My {adjective} {kin}"
			],
			"genres": [
				"romcom"
			],
			"weight": 1,
			"exemplar": "How to Raise My Boring Girlfriend",
			"note": "De-branded from Saekano's freed subtitle; the how-to premise."
		}
	],
	"lexicon": {
		"transition": [
			{
				"gloss": "Reincarnated",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Summoned",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Banished",
				"tags": [
					"slowlife",
					"isekai",
					"exiled"
				]
			},
			{
				"gloss": "Exiled",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Trapped",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Reborn",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Transported",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Spirited Away",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Cast Out",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Demoted",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Whisked Away",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Dropped",
				"tags": [
					"isekai"
				]
			}
		],
		"villainRole": [
			{
				"gloss": "the Villainess",
				"tags": [
					"villainess",
					"isekai"
				]
			},
			{
				"gloss": "the Condemned Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Modern Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Ultimate Villain",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "This Reincarnated Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "an Inept Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Hidden Boss",
				"tags": [
					"villainess",
					"isekai"
				]
			},
			{
				"gloss": "a Last Boss",
				"tags": [
					"villainess",
					"isekai"
				]
			},
			{
				"gloss": "the Doomed Fiancée",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Discarded Saintess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Decoy Bride",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Side Character",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Reader Who Knows the Ending",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Disgraced Noblewoman",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Duke's Runaway Daughter",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Reincarnated Noble",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Fallen Duchess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Wicked Stepsister",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Reformed Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Reluctant Empress",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Exiled Princess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Final Boss",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Villainess Cecilia Sylvie",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Villainess Level 99",
				"tags": [
					"isekai",
					"villainess"
				]
			}
		],
		"role": [
			{
				"gloss": "Shield Hero",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Wise Man",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "a Bookworm",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "a Part-Timer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "an All-Works Maid",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Demon Knight",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Cheat Pharmacist",
				"tags": [
					"slowlife",
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "the Final Boss",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Evil Lord",
				"tags": [
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "a Typical Nobody",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Vending Machine",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Blacksmith",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "an Undead Adventurer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Summoner",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "the Apothecary",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "the Beast Tamer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Innkeeper",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "the Court Alchemist",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "the Guild Receptionist",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "the Sage",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "the Blacksmith",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Frontier Healer",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Heroine",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Saint",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Villain",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Decoy",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "an Alchemist",
				"tags": [
					"slowlife",
					"cheat"
				]
			},
			{
				"gloss": "an Apothecary",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "a Sage",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "a Beast Tamer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "an Innkeeper",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "a Court Magician",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Knight",
				"tags": [
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "a Priestess",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Duke's Daughter",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Crown Prince",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Guild Receptionist",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "a Frontier Lord",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "a Saintess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Necromancer",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Merchant",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "an Adventurer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Demon Lord",
				"tags": [
					"isekai",
					"slowlife",
					"villainess",
					"vrmmo"
				]
			},
			{
				"gloss": "Bibliophile Princess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Black Summoner",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Dragon Hatchling",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Extraordinary Squire",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Finest Assassin",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Greatest Demon Lord",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Hero Summons",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Max Level Wizard",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Piggy Duke",
				"tags": [
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "Quiet Blacksmith Life",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Reincarnator Executioner",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Skeleton Knight",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Strongest Sage",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Unwanted Undead Adventurer",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Villainous Princess",
				"tags": [
					"cheat",
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "Hero",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Duke",
				"tags": [
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "Princess",
				"tags": [
					"cheat",
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "Assassin",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Dragon",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Executioner",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Maid",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Pharmacist",
				"tags": [
					"cheat",
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Pupil",
				"tags": [
					"cheat",
					"isekai",
					"vrmmo"
				]
			},
			{
				"gloss": "Skeleton",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Slime",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Slimes",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Spider",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Squire",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Undead",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Wizard",
				"tags": [
					"cheat",
					"isekai"
				]
			}
		],
		"cheat": [
			{
				"gloss": "My Smartphone",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Land Mines",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Potions",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "a Potion",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "My Absurd Skill",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "Low-Level Spells",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "an Unlimited Gacha",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Level 2 Super Cheat Powers",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "a Cheat Skill",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Dud Skill",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "an Appraisal Eye",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Menu Screen",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "a Save Point",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "Knowledge of My Past Life",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "a Recipe Book",
				"tags": [
					"slowlife",
					"cheat"
				]
			},
			{
				"gloss": "an Item Box",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Status Screen",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "an Instant-Death Skill",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "Admin Rights",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "a Skill Tree",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "a Cheat Code",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "an Auto-Translate",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "a Max-Level Account",
				"tags": [
					"cheat",
					"vrmmo"
				]
			},
			{
				"gloss": "an Infinite Wallet",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "80,000 Gold",
				"tags": [
					"slowlife",
					"cheat"
				]
			},
			{
				"gloss": "a Legendary Sword",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "the Appraisal Skill",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "Absurd Skill",
				"tags": [
					"cheat",
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Cheat",
				"tags": [
					"cheat",
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Gacha",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Gold",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Skill",
				"tags": [
					"cheat",
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Smartphone",
				"tags": [
					"cheat",
					"isekai"
				]
			}
		],
		"adjective": [
			{
				"gloss": "Cute",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Boring",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Absurd",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "Wrong",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Modern",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Carefree",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Strong",
				"tags": [
					"romcom",
					"cheat"
				]
			},
			{
				"gloss": "Kind",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Terrifying",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Well-Organised",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Persistent",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Unbearable",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Attentive",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Capable",
				"tags": [
					"romcom",
					"cheat"
				]
			},
			{
				"gloss": "Perfect",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Popular",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Aloof",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Clingy",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Oblivious",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Overprotective",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Shameless",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Reliable",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Hopeless",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Adorable",
				"tags": [
					"romcom"
				]
			}
		],
		"abstract": [
			{
				"gloss": "Ascendance",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Rising",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Saga",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Playthrough",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Time Loop",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Blessing",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Rhapsody",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Chronicles",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Annals",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Chronicle",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Reckoning",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Ledger",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Reforging",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Homecoming",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Ballad",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Testament",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Record",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Slow Life",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Journey",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Grimoire",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Legend",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Memoir",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Diary",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Codex",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "7th Time Loop",
				"tags": [
					"villainess"
				]
			}
		],
		"brand": [
			{
				"gloss": "Overlord",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Log Horizon",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Infinite Dendrogram",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Hollowmark",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Ashlight",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Saltwake",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Nightsmith",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Emberfall",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Coldforge",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Ravenwake",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Ninefold",
				"tags": [
					"short",
					"vrmmo"
				]
			},
			{
				"gloss": "Jobless Reincarnation",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Spirit Chronicles",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Endgame",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Respawn",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Sidequest",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Permadeath",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Reincarnator",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Otherworlder",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Ascension",
				"tags": [
					"isekai"
				]
			}
		],
		"kin": [
			{
				"gloss": "Little Sister",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Childhood Friend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Senpai",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Girlfriend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Big Sister",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Stepsister",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Classmate",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Fiancée",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Junior",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Rival",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Upperclassman",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Roommate",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Seatmate",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Ex-Girlfriend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Pen Pal",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Cousin",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Study Partner",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Neighbour",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Fellow Loner",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Angel Next Door Spoils",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Big Brother",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Boring Girlfriend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Bunny Girl Senpai",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Brother",
				"tags": [
					"villainess"
				]
			}
		],
		"englishHead": [
			{
				"gloss": "Dungeon Dive",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Trapped in a Dating Sim",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Villainess Level 99",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "My Next Life as a Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Magic Maker",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Failure Frame",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "Backstabbed in a Backwater Dungeon",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Reincarnated as the Piggy Duke",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Otherworldly Munchkin",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Reborn to Master the Blade",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Chillin' in Another World",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Drugstore in Another World",
				"tags": [
					"slowlife"
				]
			}
		],
		"subtitle": [
			{
				"gloss": "God's Blessing on This Wonderful World!",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "From Commonplace to World's Strongest",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Aim for the Deepest Level",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "All Routes Lead to Doom!",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "I May Be the Hidden Boss but I'm Not the Demon Lord",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "This Time I'm Gonna Tell Her How I Feel!",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Let's Speedrun the Dungeon with Only 1 HP!",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "I Gained a Second Character Class and Became the Strongest Sage in the World!",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "I Got Transported to Another World Where I Can Live My Wildest Dreams!",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "From Hero-King to Extraordinary Squire",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "The World of Otome Games is Tough for Mobs",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "The Slow Life of a Cheat Pharmacist",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "A Slow and Gentle Life on the Frontier",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "My Overpowered Cheat and How I Hid It",
				"tags": [
					"cheat"
				]
			}
		],
		"activity": [
			{
				"gloss": "Slow Life",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "Farming Life",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Campfire Cooking",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Killing Slimes",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Cooking with Wild Game",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Blacksmithing",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Potion-Brewing",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Beekeeping",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Bread-Baking",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Innkeeping",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Herb-Gardening",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Monster-Taming",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Fishing",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Woodworking",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Tea-Brewing",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Cheesemaking",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Cartography",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Bookbinding",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Adventuring",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Dungeon-Diving",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Quiet Life",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Cooking",
				"tags": [
					"cheat",
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Farming",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Retirement",
				"tags": [
					"isekai",
					"slowlife"
				]
			}
		],
		"thing": [
			{
				"gloss": "a Slime",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Sword",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Dragon Hatchling",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Vending Machine",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Spider",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Skeleton",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Dragon",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Demon Lord",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Slime Farmer",
				"tags": [
					"isekai"
				]
			}
		],
		"modifier": [
			{
				"gloss": "Condemned",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Modern",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Reincarnated",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Inept",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Cross-Dressing",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Exiled",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Disgraced",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Doomed",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Reformed",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Reluctant",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Overworked",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Banished",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Forgotten",
				"tags": [
					"villainess"
				]
			}
		],
		"name": [
			{
				"gloss": "Tanya",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Ard",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Cayna",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Veight",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Cid",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Weiss",
				"tags": [
					"isekai"
				]
			}
		],
		"epithet": [
			{
				"gloss": "Evil",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Wise",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Damned",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Brave",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Unkillable",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Nameless",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Unyielding",
				"tags": [
					"isekai"
				]
			}
		],
		"group": [
			{
				"gloss": "the Hero's Party",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Guild",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Royal Court",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Ducal House",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Adventurers' Guild",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "the Demon King's Army",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Royal Knights",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Party",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Temple",
				"tags": [
					"slowlife",
					"isekai"
				]
			}
		],
		"result": [
			{
				"gloss": "Maxed Out My Level",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Became the Strongest",
				"tags": [
					"cheat",
					"isekai"
				]
			},
			{
				"gloss": "Retired to the Frontier",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Retired to the Countryside",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Became a Legend",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Opened a Shop",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Saved the Kingdom by Accident",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Hit Max Level",
				"tags": [
					"cheat",
					"vrmmo"
				]
			}
		],
		"verb": [
			{
				"gloss": "Survive",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Get By",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Saved on the Train",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Sat Next To",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Sat Beside on the Bus",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Shared an Umbrella With",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Lent My Notes To",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Conquer the Dungeon",
				"tags": [
					"isekai",
					"cheat"
				]
			},
			{
				"gloss": "Retire Early",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Grind",
				"tags": [
					"vrmmo"
				]
			}
		],
		"careVerb": [
			{
				"gloss": "Raise",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Spoil",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Win Over",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Confess to",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Impress",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Tutor",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Befriend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Fluster",
				"tags": [
					"romcom"
				]
			}
		],
		"avoid": [
			{
				"gloss": "Get Hurt",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Grind",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Die in the Tutorial",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Get Kicked from the Guild",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Lose My Save",
				"tags": [
					"vrmmo"
				]
			}
		],
		"resolve": [
			{
				"gloss": "Max Out My Defense",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Solo the Final Boss",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Break the Game",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Max Out My Luck",
				"tags": [
					"vrmmo"
				]
			},
			{
				"gloss": "Log Out Forever",
				"tags": [
					"vrmmo"
				]
			}
		],
		"duration": [
			{
				"gloss": "300 Years",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Thousand Years",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Ten Lifetimes",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "500 Years",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "a Whole Lifetime",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Third Time",
				"tags": [
					"isekai"
				]
			}
		],
		"subject": [
			{
				"gloss": "High School Prodigies",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "This Ordinary Salaryman",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Rascal",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "This Retired Hero",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Even the Village Blacksmith",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "The Class Loner",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "This Shut-In",
				"tags": [
					"romcom"
				]
			}
		],
		"predicate": [
			{
				"gloss": "Have It Easy",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Get By Just Fine",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Live Comfortably",
				"tags": [
					"isekai",
					"slowlife"
				]
			},
			{
				"gloss": "Get Along Fine",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Retire Early",
				"tags": [
					"slowlife"
				]
			}
		],
		"situation": [
			{
				"gloss": "Goes Back in Time and Aims to Become the Ultimate Villain",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Enjoys a Carefree Life Married to Her Worst Enemy",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Plots to Avoid the Bad End",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Plots Her Escape from the Ducal Estate",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Decides to Enjoy Her Second Chance",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Refuses to Play Her Assigned Role",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Would Rather Run a Bakery",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Aims to Survive the Story",
				"tags": [
					"villainess"
				]
			}
		],
		"complaint": [
			{
				"gloss": "It's Not Easy Building a Corporate Empire Before the Crash",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Turns Out Ruling Is Exhausting",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Turns Out the Hero Is Insufferable",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Nobody Told Me Ruling Came with Paperwork",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Apparently I'm Doomed Either Way",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Being the Bad End Is Exhausting",
				"tags": [
					"villainess"
				]
			}
		],
		"decision": [
			{
				"gloss": "Decided to Live a Quiet Life in the Countryside",
				"tags": [
					"slowlife",
					"isekai"
				]
			},
			{
				"gloss": "Took Up Farming Instead",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Opened an Inn on the Frontier",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Opened a Tavern on the Frontier",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Took Up Beekeeping",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Retired to Run a Bookshop",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Started a Potion Shop",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Settled Down to Farm",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Became the Village Healer",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Decided to Open an Inn",
				"tags": [
					"slowlife"
				]
			}
		],
		"object": [
			{
				"gloss": "Bunny Girl Senpai",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Her Childhood Friend",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "the Spring Formal",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Anyone but Me",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "the Cultural Festival",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "a Confession",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "the Girl Next Door",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Her Senpai",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "a Quiet Life",
				"tags": [
					"romcom"
				]
			}
		],
		"action": [
			{
				"gloss": "Taming the Final Boss",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Raising the Demon Lord",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Running the Kingdom Behind the Scenes",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Seducing the Final Boss",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Rewriting the Script",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Avoiding My Execution",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Marrying My Worst Enemy",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Reforming the Demon Lord",
				"tags": [
					"villainess"
				]
			}
		],
		"person": [
			{
				"gloss": "Girl",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Boy",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Delinquent",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Upperclassman",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Transfer Student",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Class President",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Barista",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Stranger",
				"tags": [
					"romcom"
				]
			}
		],
		"clauseBase": [
			{
				"gloss": "Make My Abilities Average in the Next Life",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Retire to the Countryside",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Live Quietly for Once",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Take It Slow This Time",
				"tags": [
					"slowlife"
				]
			},
			{
				"gloss": "Avoid the Bad End",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Never Return to the Party",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Not Overdo the Cheats This Time",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "Take It Easy This Run",
				"tags": [
					"vrmmo"
				]
			}
		],
		"clausePast": [
			{
				"gloss": "Met and Fell in Love",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Lived Happily Ever After",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Ended Up Ruling Together",
				"tags": [
					"villainess"
				]
			}
		],
		"roleWord": [
			{
				"gloss": "Heroine",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Saint",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Villainess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Maid",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Duchess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Crown Prince",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Final Boss",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Demon Lord",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Empress",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Saintess",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Noblewoman",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Knight",
				"tags": [
					"villainess"
				]
			}
		]
	}
};
