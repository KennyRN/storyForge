import type { GeneratorSpec } from "../engine/types.js";

export const japaneseLnLexicon: GeneratorSpec = {
	"id": "japanese-ln",
	"name": "Japanese light-novel shape",
	"blurb": "English titles built like light novels: full-sentence premises, deadpan negations.",
	"tradition": "East Asian",
	"notes": [
		"Long is the point. If a title here feels too long for English, it is probably the right length for the shape.",
		"The cosy and the epic registers do not mix — pick one per title."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "isekai",
			"label": "Isekai"
		},
		{
			"id": "villainess",
			"label": "Villainess / otome"
		},
		{
			"id": "cheat",
			"label": "Cheat & overpowered"
		},
		{
			"id": "exiled",
			"label": "Exiled / slow life"
		},
		{
			"id": "romcom",
			"label": "School romcom"
		},
		{
			"id": "short",
			"label": "Short & brandable"
		}
	],
	"patterns": [
		{
			"id": "possessive-negation",
			"label": "[My] [Relation] Can't Be This [Adjective]",
			"templates": [
				"{pron} {kin} Can't Be This {predicate}!",
				"{pron} {kin} Is Far Too {predicate}"
			],
			"weight": 3,
			"genres": [
				"romcom"
			],
			"exemplar": "俺の妹がこんなに可愛いわけがない — My Little Sister Can't Be This Cute!",
			"note": "A flat denial of something the reader can see is true. The negation is the joke."
		},
		{
			"id": "isekai-transition",
			"label": "[Transitioned] in [World]",
			"templates": [
				"{transition} in {world}",
				"That Time I, {modernRole}, {transition^} in {world}"
			],
			"weight": 4,
			"genres": [
				"isekai"
			],
			"exemplar": "Re:ゼロから始める異世界生活 — Re:Zero, Starting Life in Another World",
			"note": "States the displacement and the destination and stops. The oldest and plainest of the isekai shapes."
		},
		{
			"id": "situation-result",
			"label": "[Situation], So [Result]",
			"templates": [
				"{situation}, So {result}",
				"I Was Banished from the {group}. {result}"
			],
			"weight": 4,
			"exemplar": "Banished from the Hero's Party, I Decided to Live a Quiet Life in the Countryside (illustrative English rendering — the source's Japanese title could not be reliably recovered; see titleforge/ACCURACY.md)",
			"note": "The full-sentence premise title: grievance, then the decision it produced. Long by design, because it is doing the work a blurb would otherwise do."
		},
		{
			"id": "cheat-power",
			"label": "I Became the [Power] [Profession] with [Cheat]",
			"templates": [
				"I Became the {power} {profession} with {cheatThing}",
				"The {power} {profession} Runs Riot in {world} Without Noticing"
			],
			"weight": 3,
			"genres": [
				"cheat",
				"isekai"
			],
			"exemplar": "異世界はスマートフォンとともに。— In Another World With My Smartphone",
			"note": "The unfair advantage is named in the title, so the reader knows they are here for competence rather than struggle."
		},
		{
			"id": "villainess",
			"label": "I Was Reincarnated as [Villainess Role]",
			"templates": [
				"I've Been Reincarnated as {villainRole} of {world}",
				"I May Be {villainRole}, but {result}"
			],
			"weight": 3,
			"genres": [
				"villainess"
			],
			"exemplar": "乙女ゲームの破滅フラグしかない悪役令嬢に転生してしまった…— My Next Life as a Villainess: All Routes Lead to Doom!",
			"note": "The narrator knows the plot she has landed in and knows it ends badly for her. The trailing ellipsis is resignation."
		},
		{
			"id": "exiled-slowlife",
			"label": "Banished from [Group], I Start [Slow Life]",
			"templates": [
				"Banished from the {group}, I'm Starting {slowLife} in {world}"
			],
			"weight": 3,
			"genres": [
				"exiled"
			],
			"exemplar": "Banished from the Hero's Party, I Started a Quiet Life on the Frontier (illustrative English rendering — see titleforge/ACCURACY.md)",
			"note": "Rejection followed immediately by something better. Signals a low-conflict, competence-and-comfort read."
		},
		{
			"id": "question",
			"label": "Is It Wrong to [Clause]?",
			"templates": [
				"Is It Wrong to {questionClause}?",
				"Surely No One Expects Me to {questionClause}?!"
			],
			"weight": 2,
			"exemplar": "ダンジョンに出会いを求めるのは間違っているだろうか — Is It Wrong to Try to Pick Up Girls in a Dungeon?",
			"note": "A rhetorical question that concedes the premise is absurd and asks the reader to come anyway."
		},
		{
			"id": "profession-mundane",
			"label": "The [Profession]'s [Mundane Activity]",
			"templates": [
				"The {profession}'s Monologue",
				"The {profession} Takes Up {slowLife} in Another World"
			],
			"weight": 2,
			"exemplar": "薬屋のひとりごと — The Apothecary Diaries",
			"note": "An unglamorous trade plus an unglamorous activity. The understatement is the pitch, and it reads as quality signalling."
		},
		{
			"id": "subtitle",
			"label": "[Main Title] ~[Subtitle]~",
			"templates": [
				"{transition} in {world}: {subtitleTail}"
			],
			"weight": 2,
			"exemplar": "無職転生 ～異世界行ったら本気だす～ — Mushoku Tensei: Jobless Reincarnation",
			"note": "A short brandable head, then a subtitle carrying the actual joke or promise. Gives you something to abbreviate to."
		},
		{
			"id": "short-brand",
			"label": "Short & brandable",
			"templates": [
				"{brandNoun}"
			],
			"genres": [
				"short"
			],
			"note": "Two words, one image, nothing explained. Usually an older work or one confident enough not to sell itself.",
			"exemplar": "ゴブリンスレイヤー — Goblin Slayer"
		}
	],
	"lexicon": {
		"pron": [
			{
				"gloss": "My",
				"tags": [
					"romcom",
					"isekai"
				],
				"weight": 3
			},
			{
				"gloss": "That",
				"tags": [
					"romcom"
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
				"gloss": "Big Sister",
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
				"gloss": "Classmate",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Fiancée",
				"tags": [
					"romcom",
					"villainess"
				]
			},
			{
				"gloss": "Junior",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Senior",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Editor",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Landlady",
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
				"gloss": "Study Partner",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Stepsister",
				"tags": [
					"romcom"
				]
			}
		],
		"predicate": [
			{
				"gloss": "Cute",
				"tags": [
					"romcom"
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
				"gloss": "Attentive",
				"tags": [
					"romcom"
				]
			},
			{
				"gloss": "Capable",
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
			}
		],
		"world": [
			{
				"gloss": "Another World",
				"weight": 4
			},
			"a Game World",
			{
				"gloss": "an Otome Game",
				"tags": [
					"villainess"
				]
			},
			"a Dungeon",
			"a Labyrinth City",
			"a World of Swords and Sorcery",
			{
				"gloss": "the Frontier",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "a Dying World",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Tutorial Village",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "the Demon Realm",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Sword-and-Sorcery World",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "a Post-Game Save File",
				"tags": [
					"villainess"
				]
			}
		],
		"transition": [
			{
				"gloss": "Reincarnated",
				"stem": "Got Reincarnated",
				"weight": 4
			},
			{
				"gloss": "Transported",
				"stem": "Got Transported"
			},
			{
				"gloss": "Summoned",
				"stem": "Got Summoned"
			},
			{
				"gloss": "Banished",
				"stem": "Got Banished",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Demoted",
				"stem": "Got Demoted",
				"tags": [
					"exiled"
				]
			}
		],
		"modernRole": [
			"a NEET",
			"a Salaryman",
			"a Corporate Drone",
			"a Shut-In",
			"a High Schooler",
			"a Former Office Worker",
			"a Sweatshop Employee",
			"a Convenience-Store Clerk",
			"a Cram-School Tutor",
			"a Night-Shift Nurse",
			"a Retired Detective",
			"a Junior Accountant",
			"a Delivery Driver",
			"a Failed Novelist",
			"a Temp Worker"
		],
		"profession": [
			"Apothecary",
			"Tamer",
			"Blacksmith",
			"Alchemist",
			"Sage",
			"Mage",
			"Saintess",
			"Innkeeper",
			"Gatekeeper",
			"Herbalist",
			"Beast Tamer",
			"Court Painter",
			"Cartographer",
			"Cook",
			"Undertaker",
			"Bell-Keeper",
			"Tailor",
			"Scribe"
		],
		"power": [
			{
				"gloss": "Strongest",
				"weight": 3
			},
			"Invincible",
			"Weakest",
			"Off-the-Charts",
			"Perfectly Average",
			"Unkillable",
			"Wildly Overqualified",
			"Statistically Unremarkable",
			"Legendary"
		],
		"cheatThing": [
			{
				"gloss": "a Cheat Skill",
				"weight": 3
			},
			"a Dud Skill",
			"an Appraisal Skill",
			"an Unlimited Gacha",
			"Knowledge of My Past Life",
			"My Smartphone",
			"an Appraisal Eye",
			"a Menu Screen",
			"a Save Point",
			"a Recipe Book",
			"a Log of Everyone's Regrets"
		],
		"villainRole": [
			{
				"gloss": "the Villainess",
				"weight": 4
			},
			"a Background Character",
			"the Decoy Fiancée",
			"the Final Boss",
			"the Condemned Noblewoman",
			"the Doomed Fiancée",
			"the Discarded Saintess",
			"the Side Character",
			"the Reader Who Knows the Ending"
		],
		"group": [
			{
				"gloss": "Hero's Party",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Guild",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Royal Court",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Ducal House",
				"tags": [
					"exiled",
					"villainess"
				]
			},
			{
				"gloss": "Adventurers' Guild",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Temple",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Academy",
				"tags": [
					"exiled"
				]
			}
		],
		"slowLife": [
			{
				"gloss": "the Quiet Life",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Frontier Homesteading",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Innkeeping",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Dungeon Management",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Tea-House Keeping",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Beekeeping",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Running a Bathhouse",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Cartography",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Bread-Baking",
				"tags": [
					"exiled"
				]
			},
			{
				"gloss": "Library Restoration",
				"tags": [
					"exiled"
				]
			}
		],
		"situation": [
			{
				"gloss": "They Told Me I Wasn't a True Companion",
				"stem": "Being Told I Wasn't a True Companion"
			},
			{
				"gloss": "My Engagement Was Broken Off",
				"stem": "Having My Engagement Broken Off",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Everyone Laughed at My Boring Skill",
				"stem": "Being Laughed at for My Boring Skill"
			},
			{
				"gloss": "I Kept Dying and Waking Up Again",
				"stem": "Dying and Waking Up Again"
			},
			{
				"gloss": "They Worked Me Until Retirement",
				"stem": "Being Worked Until Retirement"
			},
			{
				"gloss": "They Replaced Me with a Younger Hero",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "The Goddess Filed My Paperwork Wrong",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "My Party Left Me in the Dungeon",
				"tags": [
					"villainess"
				]
			}
		],
		"result": [
			"I'm Aiming to Be the Strongest",
			"I've Decided to Take It Easy on the Frontier",
			"I Teamed Up with a Legendary Witch",
			"I Decided to Found a Country",
			"It's Far Too Late to Ask Me Back",
			"I'm Never Getting Involved Again",
			"I'm Opening a Shop Instead",
			"I've Started Keeping Bees",
			"I Refuse to Save the World Twice",
			"I'm Charging for It This Time"
		],
		"questionClause": [
			"Try to Pick Up Girls in a Dungeon",
			{
				"gloss": "Let the Villainess Be Happy",
				"tags": [
					"villainess"
				]
			},
			{
				"gloss": "Fight the Demon Lord with a Dud Skill",
				"tags": [
					"cheat"
				]
			},
			{
				"gloss": "Expect an Apology After Banishing Me",
				"tags": [
					"exiled"
				]
			}
		],
		"brandNoun": [
			"Hollowmark",
			"Ashlight",
			"Bellcarver",
			"Saltwake",
			"Nightsmith",
			"The Grey Compact",
			"Emberfall",
			"Ninefold",
			"Ravenwake",
			"Coldforge"
		],
		"subtitleTail": [
			"I'll Get Serious Once I'm in Another World",
			"This Time I Definitely Won't Interfere",
			"My Second Life, My Rules"
		]
	}
};
