import type { GeneratorSpec } from "../engine/types.js";
import { registers } from "./nameRegisters.js";
import { westernSerialReservedTitles } from "./westernSerialReserved.js";

/**
 * webnovel (western-serial) — Western-original web-fiction series names.
 *
 * Patterns, genre tree and lexicon follow webnovel corpus v1.2.0
 * (`corpus-webnovel/v1.2.0/`, SHA-256 25fef8e2…80bc7aadbd6): 1,535 eligible series out of 1,655.
 * `romance` keeps its v1.1.0 patterns (thin: not re-derived). Slot provenance lives in
 * `corpus-webnovel/v1.2.0/lexicon.v1.2.0.provenance.json`, not here; judgement-call tags are
 * logged in `ACCURACY.md`.
 *
 * Not in the genre picker — reported thin — no evidence in webnovel v1.2.0: rational-magic,
 * isekai/transmigration, isekai/transportation, isekai/portal, isekai/summoning,
 * isekai/reverse-isekai. Add them once a harvest supplies evidence.
 */
export const westernSerialLexicon: GeneratorSpec = {
	"id": "western-serial",
	"name": "webnovel",
	"blurb": "LitRPG, progression fantasy, dungeon core, isekai, villainess, regression.",
	"tradition": "Anglophone",
	// Deliberately absent: rational-magic and isekai/transmigration, /transportation, /portal,
	// /summoning, /reverse-isekai — reported thin — no evidence in webnovel v1.2.0.
	"genres": [
		{
			"id": "all",
			"label": "any"
		},
		{
			"id": "progression",
			"label": "progression fantasy"
		},
		{
			"id": "litrpg",
			"label": "litrpg",
			"parent": "progression"
		},
		{
			"id": "gamelit",
			"label": "gamelit",
			"parent": "progression"
		},
		{
			"id": "cultivation",
			"label": "western cultivation",
			"parent": "progression"
		},
		{
			"id": "dungeon",
			"label": "dungeon",
			"parent": "progression"
		},
		{
			"id": "dungeon-core",
			"label": "dungeon core",
			"parent": "dungeon"
		},
		{
			"id": "dungeon-crawler",
			"label": "dungeon crawler",
			"parent": "dungeon"
		},
		{
			"id": "system-apocalypse",
			"label": "System Apocalypse",
			"parent": "progression"
		},
		{
			"id": "vrmmo",
			"label": "vrmmo",
			"parent": "progression"
		},
		{
			"id": "magic-academy",
			"label": "magic academy",
			"parent": "progression"
		},
		{
			"id": "crafting-profession",
			"label": "crafting & profession",
			"parent": "progression"
		},
		{
			"id": "progression-core",
			"label": "core progression",
			"parent": "progression"
		},
		{
			"id": "tower-climbing",
			"label": "tower climbing",
			"parent": "progression"
		},
		{
			"id": "isekai",
			"label": "isekai"
		},
		{
			"id": "isekai/reincarnation",
			"label": "reincarnation",
			"parent": "isekai"
		},
		{
			"id": "isekai/media-world",
			"label": "into a game or story",
			"parent": "isekai"
		},
		{
			"id": "cosy",
			"label": "cosy & slice of life"
		},
		{
			"id": "villainess",
			"label": "villainess"
		},
		{
			"id": "regression",
			"label": "Regression & Rebirth"
		},
		{
			"id": "romance",
			"label": "romance (wattpad register)",
			"isolated": true
		}
	],
	"platforms": [
		{
			"id": "all",
			"label": "Any platform"
		},
		{
			"id": "royalroad",
			"label": "Royal Road"
		},
		{
			"id": "scribblehub",
			"label": "ScribbleHub"
		},
		{
			"id": "spacebattles",
			"label": "SpaceBattles"
		},
		{
			"id": "wattpad",
			"label": "Wattpad"
		},
		{
			"id": "webnovel",
			"label": "WebNovel"
		}
	],
	"patterns": [
		{
			"id": "system-calamity",
			"label": "[System Word] [Calamity]",
			"templates": [
				"{systemWord} {calamity}",
				"The {calamity} {systemWord}",
				"{role} of the {calamity}",
				"The {rank} {role} {systemWord}"
			],
			"weight": 4,
			"genres": [
				"system-apocalypse",
				"litrpg"
			],
			"platforms": [
				"royalroad",
				"scribblehub"
			],
			"note": "A game term welded to a catastrophe. Tells the reader the rules of the world changed and the numbers are now visible.",
			"exemplar": "The System Apocalypse"
		},
		{
			"id": "rank-role",
			"label": "The [Rank] [Role]",
			"templates": [
				"The {rank} {role}",
				"The {rank} {role} of {place}",
				"{rank} {role}",
				"{calamity} {role}"
			],
			"weight": 5,
			"note": "A bare superlative noun phrase, the Anglophone cousin of the Chinese rank-and-role title.",
			"exemplar": "The Legendary Mechanic",
			"genres": [
				"litrpg",
				"gamelit",
				"cultivation",
				"dungeon",
				"system-apocalypse",
				"vrmmo",
				"magic-academy",
				"crafting-profession",
				"progression-core",
				"tower-climbing"
			]
		},
		{
			"id": "only-i",
			"label": "Only I Can [Verb] the [Place]",
			"templates": [
				"The Hidden {placeBare} Only I Can Reach",
				"Only the {role} Can Enter {place}"
			],
			"weight": 1,
			"genres": [
				"litrpg",
				"progression",
				"dungeon"
			],
			"note": "Exclusive access as the hook. The appeal is not power but privacy.",
			"exemplar": "The Hidden Dungeon Only I Can Enter"
		},
		{
			"id": "warning-title",
			"label": "Beware of [Noun]",
			"templates": [
				"{warning} {role}",
				"{warning} {mundane}"
			],
			"weight": 1,
			"genres": [
				"cosy",
				"cultivation"
			],
			"note": "A deadpan warning label attached to something absurd. Promises comedy and signals the author is not taking the genre solemnly.",
			"exemplar": "Beware of Chicken"
		},
		{
			"id": "mundane-in-fantasy",
			"label": "[Mundane Activity] in [Fantasy Place]",
			"templates": [
				"{mundane} in {place}",
				"A Practical Guide to {mundane}",
				"The {rank} {role}'s Guide to {mundane}"
			],
			"weight": 3,
			"genres": [
				"cosy",
				"cultivation",
				"crafting-profession"
			],
			"note": "The cosy register. The joke is the collision of administrative vocabulary with an epic setting.",
			"exemplar": "A Practical Guide to Evil"
		},
		{
			"id": "situation-complaint",
			"label": "I [Situation] [Complaint]",
			"templates": [
				"I Am the {rank} {role} {complaint}",
				"I Reincarnated as a {role} {complaint}",
				"My {systemWord} Chose {place} {complaint}"
			],
			"weight": 3,
			"genres": [
				"villainess",
				"isekai/media-world",
				"cosy",
				"regression"
			],
			"note": "The first-person aggrieved title: the Anglophone answer to the Japanese full-sentence premise, usually a beat drier.",
			"exemplar": "I've Been Killing Slimes for 300 Years and Maxed Out My Level"
		},
		{
			"id": "numeric-grind",
			"label": "[Number] [Units] of [Activity]",
			"templates": [
				"{number} Years of {mundane}",
				"{number} Levels of {stat}",
				"The {role} Who Ground {stat} to {number}"
			],
			"weight": 2,
			"genres": [
				"litrpg",
				"regression"
			],
			"note": "The number is the premise. Progression fiction sells accumulated effort, so quantify it.",
			"exemplar": "I've Been Killing Slimes for 300 Years"
		},
		{
			"id": "wattpad-register",
			"label": "The [Role] Who [Verb] Me",
			"templates": [
				"The {role} Who Ruined Me",
				"My {rank} {role}",
				"He Was Never Mine to Keep"
			],
			"weight": 2,
			"genres": [
				"romance"
			],
			"platforms": [
				"wattpad"
			],
			"note": "Emotional stakes forward, direct address, no irony. The register is sincere and should not be mixed with the cosy one.",
			"exemplar": "The Bad Boy Stole My Heart"
		},
		{
			"id": "dungeon-anchor",
			"label": "[Monster] Dungeon / [Monster] Core",
			"templates": [
				"The {rank} Dungeon",
				"{monster} Dungeon",
				"{monster} Core"
			],
			"genres": [
				"dungeon-core",
				"dungeon-crawler"
			],
			"platforms": [
				"royalroad",
				"scribblehub",
				"webnovel"
			],
			"weight": 4,
			"note": "The dungeon naming convention: a one-word modifier welded to Dungeon or Core. Instantly legible as POV-is-the-dungeon (core) or delve-the-dungeon (crawler) fiction.",
			"exemplar": "Cultivating Dungeon"
		},
		{
			"id": "possessive-relation",
			"label": "The [Owner]'s [Noun]",
			"templates": [
				"The {owner}'s {relObject}",
				"My {owner}'s {relObject}"
			],
			"genres": [
				"romance",
				"litrpg",
				"dungeon",
				"cosy"
			],
			"weight": 3,
			"note": "The protagonist named by who owns them or what they hold. Two registers share one shape: the fantasy/dungeon streak (the alliterative \"The Crafter's ...\") and the huge binge-romance-app streak (\"The Alpha's Mate\", \"The CEO's Contract Wife\"). Crossed the gate once the corpus was scaled; the romance-app bloc is what gives it its dominant register.",
			"exemplar": "Jake's Magical Market"
		},
		{
			"id": "regression-rebirth",
			"label": "[Rebirth Marker] [Role]",
			"templates": [
				"{rebirth} {role}",
				"Return of the {rank} {role}",
				"The {role} Who {rebirthTail}"
			],
			"genres": [
				"regression",
				"isekai/reincarnation",
				"villainess"
			],
			"weight": 3,
			"note": "The rebirth marker is the whole premise: the reader is promised a protagonist who already knows how the story ends. The single most load-bearing frame in anglophone web fiction after the bare class-role.",
			"exemplar": "I Became a Patron God"
		},
		{
			"id": "interrogative-hook",
			"label": "[Conversational Opener] the [Role]?",
			"templates": [
				"{interro} the {role}?",
				"{interro} the {rank} {role}?"
			],
			"genres": [
				"cosy",
				"litrpg",
				"isekai",
				"cultivation"
			],
			"weight": 2,
			"note": "A question or aside addressed straight to the reader. Signals comedy and a low-solemnity register; the hook is tone, not stakes. Sits badly next to the sincere Wattpad register — keep them apart.",
			"exemplar": "Awakened As A Dungeon Core?"
		},
		{
			"id": "status-hook",
			"label": "[Status Verb] the [Beloved]",
			"templates": [
				"{statusVerb} the {beloved}",
				"{statusVerb} My {beloved}"
			],
			"genres": [
				"romance"
			],
			"platforms": [
				"wattpad",
				"webnovel"
			],
			"weight": 2,
			"note": "The relationship-status hook that dominates the binge-romance apps (Dreame, GoodNovel, NovelCat): the title states what was done to the heroine by the love interest — rejected, married, kidnapped, sold. Fated-mate and contract-marriage machinery compressed into a headline. Firmly the sincere register; keep it away from the ironic frames.",
			"exemplar": "Kidnapped by My Mate"
		},
		{
			"id": "colon-subtitle",
			"label": "[Core Title]: [Epithet]",
			"templates": [
				"{calamity}: {rank} {systemWord}",
				"{placeBare}: {epithet}",
				"{rank} {role}: {epithet}"
			],
			"weight": 3,
			"genres": [
				"system-apocalypse",
				"regression",
				"cultivation",
				"litrpg"
			],
			"note": "A short core title, then a colon and a subtitle that names the hook (the class, the twist, the system). What's left once the genre descriptors are stripped off a Royal Road title: the subtitle is story, not tag.",
			"exemplar": "Apocalypse: Generic System"
		},
		{
			"id": "ascent-of",
			"label": "[Rise / Path / Age] of [Object]",
			"templates": [
				"{ascentLead} of {ascentObject}",
				"Rise of the {rank} {role}",
				"Age of {calamity}"
			],
			"weight": 2,
			"genres": [
				"progression"
			],
			"note": "The trajectory as the title: a rise, a path, an age. Progression fiction sells the climb, so the title names the climb and one word for what's at the top.",
			"exemplar": "Rise of Mankind"
		},
		{
			"id": "ascent-compound",
			"label": "[Rise / Legend] of the [Modifier] [Noun]",
			"templates": [
				"{ascentLead} of the {compoundMod} {compoundNoun}"
			],
			"weight": 2,
			"genres": [
				"progression"
			],
			"note": "The same climb as ascent-of, but the protagonist is a two-word coinage: an odd modifier welded to an ordinary noun. The modifier is the hook, and the two halves are drawn separately so no real title's pair ships whole.",
			"exemplar": "Rise of the Living Forge"
		},
		{
			"id": "vr-online",
			"label": "[Name] Online",
			"templates": [
				"{onlineWord} Online",
				"The {onlineWord} Online"
			],
			"weight": 4,
			"genres": [
				"vrmmo",
				"isekai/media-world"
			],
			"note": "The VRMMO convention: the game's own name, then Online. Tells the reader the story happens inside a game before they read a word of the blurb.",
			"exemplar": "Ascend Online"
		},
		{
			"id": "name-anchor",
			"label": "[Hero Name] vs the [Calamity]",
			"templates": [
				"{heroName} vs the {calamity}",
				"{heroName} in the {calamity}",
				"{heroName} the {rank} {role}",
				"{role} {heroName}"
			],
			"weight": 2,
			"genres": [
				"litrpg",
				"system-apocalypse",
				"villainess"
			],
			"note": "A first name up front: the protagonist is the brand. Usually paired with the catastrophe or a deflating epithet, which keeps it light.",
			"exemplar": "Adam vs the Apocalypse"
		},
		{
			"id": "time-loop",
			"label": "[Word] Loop / [Role] of Time",
			"templates": [
				"{loopWord} Loop",
				"{loopWord} Loops",
				"{role} of Time"
			],
			"weight": 3,
			"genres": [
				"regression"
			],
			"note": "The loop named outright. Regression's second chance made literal and repeatable; the title promises iteration rather than a single do-over.",
			"exemplar": "Lost Loop"
		},
		{
			"id": "re-prefix",
			"label": "RE: [Role]",
			"templates": [
				"RE: {role}",
				"RE: {placeBare}"
			],
			"weight": 2,
			"genres": [
				"regression",
				"magic-academy"
			],
			"note": "The RE: prefix, borrowed from Re:Zero and the email reply line: this is a redo. Two characters carry the whole regression premise.",
			"exemplar": "RE: Knight"
		},
		{
			"id": "tower-anchor",
			"label": "The [Rank] Tower",
			"templates": [
				"The {rank} Tower",
				"The {placeBare} Spire",
				"The {role} and the Tower"
			],
			"weight": 3,
			"genres": [
				"tower-climbing"
			],
			"note": "The tower is the setting, the structure and the progression curve at once: one floor at a time. Naming it is naming the genre.",
			"exemplar": "The Fractured Tower"
		},
		{
			"id": "dao-of",
			"label": "Dao of [Mundane Thing]",
			"templates": [
				"Dao of {mundane:cultivation}"
			],
			"weight": 2,
			"genres": [
				"cultivation"
			],
			"note": "Western cultivation's comic register: the lofty Dao applied to something ordinary. The joke and the premise are the same thing, a path to enlightenment through cooking or money.",
			"exemplar": "Dao of the Deal"
		}
	],
	// Hero names are invented (engine/names.ts); v1.2.0's 18 names lifted from real series are gone.
	"nameGenerators": registers("hero"),
	"lexicon": {
		"systemWord": [
			{
				"gloss": "System",
				"tags": [
					"litrpg"
				],
				"weight": 4
			},
			{
				"gloss": "Interface",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Tutorial",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Patch Notes",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Skill Tree",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Class Selection",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Respawn Timer",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Achievement Log",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Changelog",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Difficulty Slider",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Loot Table",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Cooldown",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Save File",
				"tags": [
					"litrpg"
				]
			}
		],
		"calamity": [
			{
				"gloss": "Apocalypse",
				"tags": [
					"litrpg",
					"system-apocalypse"
				],
				"weight": 3
			},
			{
				"gloss": "Integration",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Descent",
				"tags": [
					"litrpg",
					"dungeon"
				]
			},
			{
				"gloss": "Tribulation",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Culling",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Reset",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Convergence",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Rollout",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Patch Day",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Migration",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Recall",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Beta",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Doom",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Cataclysm",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Ruin",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Armageddon",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Disaster",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			},
			{
				"gloss": "Calamity",
				"tags": [
					"litrpg",
					"system-apocalypse"
				]
			}
		],
		"role": [
			{
				"gloss": "Necromancer",
				"tags": [
					"litrpg",
					"progression",
					"regression",
					"villainess"
				]
			},
			{
				"gloss": "Alchemist",
				"tags": [
					"progression",
					"cosy",
					"crafting-profession",
					"villainess"
				]
			},
			{
				"gloss": "Innkeeper",
				"tags": [
					"cosy"
				],
				"weight": 2
			},
			{
				"gloss": "Cartographer",
				"tags": [
					"cosy",
					"progression"
				]
			},
			{
				"gloss": "Dungeon Core",
				"tags": [
					"dungeon"
				],
				"weight": 3
			},
			{
				"gloss": "Slime",
				"tags": [
					"dungeon",
					"cosy"
				]
			},
			{
				"gloss": "Goblin",
				"tags": [
					"dungeon"
				]
			},
			{
				"gloss": "Accountant",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "Librarian",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Sect Elder",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Rooster",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Summoner",
				"tags": [
					"progression",
					"isekai",
					"regression",
					"villainess"
				]
			},
			{
				"gloss": "Bureaucrat",
				"tags": [
					"cosy",
					"isekai"
				]
			},
			{
				"gloss": "Bad Boy",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Billionaire",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Quartermaster",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Beast Handler",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Guild Auditor",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Portal Technician",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Respawn Clerk",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Tavern Owner",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Dungeon Inspector",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Retired Villain",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Apprentice Lich",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Farmhand",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Mage",
				"tags": [
					"progression",
					"litrpg",
					"regression",
					"villainess"
				]
			},
			{
				"gloss": "Farmer",
				"tags": [
					"progression",
					"cosy",
					"crafting-profession"
				]
			},
			{
				"gloss": "Healer",
				"tags": [
					"progression",
					"litrpg",
					"regression",
					"villainess"
				]
			},
			{
				"gloss": "Cultivator",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Seeker",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Breaker",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Eater",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Slayer",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Juggernaut",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Lord",
				"tags": [
					"progression",
					"regression"
				]
			},
			{
				"gloss": "Monster",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Chef",
				"tags": [
					"progression",
					"cosy",
					"crafting-profession"
				]
			},
			{
				"gloss": "Tamer",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Botanist",
				"tags": [
					"progression",
					"cosy",
					"crafting-profession"
				]
			},
			{
				"gloss": "Engineer",
				"tags": [
					"progression",
					"crafting-profession"
				]
			},
			{
				"gloss": "Wandsmith",
				"tags": [
					"progression",
					"crafting-profession"
				]
			},
			{
				"gloss": "Runesmith",
				"tags": [
					"progression",
					"crafting-profession"
				]
			},
			{
				"gloss": "Druid",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Occultist",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Exorcist",
				"tags": [
					"progression",
					"regression"
				]
			},
			{
				"gloss": "Knight",
				"tags": [
					"progression",
					"litrpg",
					"regression",
					"villainess"
				]
			},
			{
				"gloss": "Hunter",
				"tags": [
					"progression",
					"litrpg",
					"regression"
				]
			},
			{
				"gloss": "Assassin",
				"tags": [
					"progression",
					"litrpg",
					"regression"
				]
			}
		],
		"rank": [
			{
				"gloss": "F-Rank",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Level One",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Unranked",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Mythic",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Deprecated",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Reluctant",
				"tags": [
					"cosy",
					"progression",
					"villainess"
				]
			},
			{
				"gloss": "Accidental",
				"tags": [
					"cosy",
					"isekai",
					"villainess"
				]
			},
			{
				"gloss": "Semi-Retired",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Insufferable",
				"tags": [
					"cosy",
					"cultivation",
					"villainess"
				]
			},
			{
				"gloss": "Provisionally Immortal",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Chronically Underpowered",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Middling",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Off-Brand",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Certified",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Arcane",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Forgotten",
				"tags": [
					"progression",
					"villainess"
				]
			},
			{
				"gloss": "Unbound",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Modern",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Second",
				"tags": [
					"progression",
					"villainess"
				]
			},
			{
				"gloss": "Spell",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Soul",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Blackflame",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Boundless",
				"tags": [
					"progression",
					"cultivation"
				]
			},
			{
				"gloss": "Brimstone",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Cantrip",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Calculating",
				"tags": [
					"progression",
					"cultivation"
				]
			},
			{
				"gloss": "Annihilation",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Augmented",
				"tags": [
					"progression",
					"litrpg"
				]
			},
			{
				"gloss": "Artificial",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Applied",
				"tags": [
					"progression",
					"cultivation"
				]
			}
		],
		"place": [
			{
				"gloss": "the Ninth Floor",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "a Backwater Dungeon",
				"tags": [
					"dungeon"
				]
			},
			{
				"gloss": "the Wandering Inn",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "the Frontier Ward",
				"tags": [
					"cosy",
					"progression"
				]
			},
			{
				"gloss": "the Azure Sect",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Tier Three",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "the Understory",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Another World",
				"tags": [
					"isekai"
				],
				"weight": 3
			},
			{
				"gloss": "the Suburbs",
				"tags": [
					"isekai",
					"cosy"
				]
			},
			{
				"gloss": "the Respawn Point",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Floor Zero",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "the Tutorial Meadow",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "the Guild Annexe",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "a Perfectly Ordinary Village",
				"tags": [
					"dungeon",
					"litrpg"
				]
			}
		],
		"mundane": [
			{
				"gloss": "Chicken Farming",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Bookkeeping",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Soup",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Planning Permission",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Pension Planning",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Customer Service",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "Compost",
				"tags": [
					"cosy",
					"cultivation"
				]
			},
			{
				"gloss": "Inventory Management",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Health and Safety",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Crop Rotation",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Small Talk",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Debt Collection",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "A Decent Cup of Tea",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Cooking",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Healing",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Money",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "the Deal",
				"tags": [
					"cultivation"
				]
			}
		],
		"warning": [
			{
				"gloss": "Beware of",
				"tags": [
					"cultivation",
					"cosy"
				]
			},
			{
				"gloss": "Mind the",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Do Not Feed the",
				"tags": [
					"dungeon",
					"cosy"
				]
			},
			{
				"gloss": "Please Ignore the",
				"tags": [
					"cosy"
				]
			}
		],
		"complaint": [
			{
				"gloss": "and I Have Notes",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "and Nobody Read the Terms",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "and It Will Not Stop Levelling",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "and I Am Extremely Tired",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Against My Better Judgement",
				"tags": [
					"cosy",
					"progression"
				]
			},
			{
				"gloss": "and the Guild Is Furious",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "and No One Warned Me",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "and I Want a Refund",
				"tags": [
					"cosy",
					"litrpg"
				]
			},
			{
				"gloss": "and It Is Somehow My Fault",
				"tags": [
					"cosy",
					"litrpg"
				]
			}
		],
		"stat": [
			"Strength",
			"Charisma",
			"Luck",
			"Willpower",
			"Sanity",
			"Reputation",
			"Patience",
			"Dexterity",
			"Notoriety",
			"Morale"
		],
		"number": [
			"Nine",
			"Ten Thousand",
			"Three Hundred",
			"Two",
			"Forty-Seven"
		],
		"placeBare": [
			{
				"gloss": "Ninth Floor",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Backwater Dungeon",
				"tags": [
					"dungeon"
				]
			},
			{
				"gloss": "Wandering Inn",
				"tags": [
					"cosy"
				]
			},
			{
				"gloss": "Frontier Ward",
				"tags": [
					"cosy",
					"progression"
				]
			},
			{
				"gloss": "Azure Sect",
				"tags": [
					"cultivation"
				]
			},
			{
				"gloss": "Tier Three",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Understory",
				"tags": [
					"progression"
				]
			},
			{
				"gloss": "Another World",
				"tags": [
					"isekai"
				],
				"weight": 3
			},
			{
				"gloss": "Suburbs",
				"tags": [
					"isekai",
					"cosy"
				]
			},
			{
				"gloss": "Respawn Point",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Floor Zero",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Tutorial Meadow",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Guild Annexe",
				"tags": [
					"dungeon",
					"litrpg"
				]
			},
			{
				"gloss": "Perfectly Ordinary Village",
				"tags": [
					"dungeon",
					"litrpg"
				]
			}
		],
		"monster": [
			"Bone #dungeon #litrpg",
			"Slime #dungeon #litrpg",
			"Ember #dungeon #litrpg",
			"Obsidian #dungeon #litrpg",
			"Verdant #dungeon #litrpg",
			"Hollow #dungeon #litrpg",
			"Cinder #dungeon #litrpg",
			"Gloom #dungeon #litrpg",
			"Station #dungeon #litrpg",
			"Cat #dungeon #litrpg",
			"Tree #dungeon #litrpg",
			"Bunker #dungeon #litrpg",
			"Rogue #dungeon #litrpg",
			"Boneless #dungeon #litrpg",
			"Misplaced #dungeon #litrpg",
			"Real-Time #dungeon #litrpg",
			"Bound #dungeon #litrpg",
			"Lonely #dungeon #litrpg",
			"Cultivating #dungeon #litrpg",
			"Dinosaur #dungeon",
			"Dragon #dungeon",
			"Bee #dungeon",
			"Island #dungeon",
			"Museum #dungeon",
			"Oasis #dungeon",
			"Elemental #dungeon",
			"Abyssal #dungeon",
			"Ancient #dungeon",
			"Divine #dungeon",
			"Infinity #dungeon",
			"Viridescent #dungeon",
			"Dragonheart #dungeon",
			"Greedy #dungeon",
			"Reluctant #dungeon",
			"Forgotten #dungeon",
			"Worthy #dungeon",
			"Annihilation #dungeon",
			"Blue #dungeon",
			"Comet #dungeon"
		],
		"owner": [
			"Alpha #romance",
			"Alpha King #romance",
			"Luna #romance",
			"CEO #romance",
			"Billionaire #romance",
			"Duke #romance",
			"Sovereign #romance",
			"Heir #romance",
			"Werewolf #romance",
			"Exiled Noble #romance",
			"Girl #romance",
			"Soldier #romance",
			"Crafter #litrpg #dungeon #cosy",
			"Necromancer #litrpg #dungeon",
			"Archmage #litrpg #dungeon",
			"Warden #litrpg #dungeon",
			"Tyrant #litrpg #dungeon",
			"Anarchist #litrpg #dungeon",
			"Butcher #litrpg #dungeon",
			"Artificer #litrpg #dungeon #cosy",
			"Beekeeper #litrpg #dungeon #cosy",
			"Gorgon #litrpg #dungeon",
			"Sorcerer #litrpg #dungeon",
			"Adventurer #litrpg #dungeon #cosy",
			"Ranger #litrpg #dungeon #cosy",
			"Grimm #litrpg #dungeon",
			"Snake #litrpg #dungeon",
			"Goddess #litrpg #dungeon #cosy",
			"Dungeon #litrpg #dungeon"
		],
		"relObject": [
			"Mate #romance",
			"Bride #romance",
			"Contract Wife #romance",
			"Rejected Mate #romance",
			"Contract Bride #romance",
			"Prodigal Wife #romance",
			"Wrong Bride #romance",
			"Beloved Wife #romance",
			"Substitute Ex-Wife #romance",
			"Human Mate #romance",
			"Slave Mate #romance",
			"Sick Wife #romance",
			"Heartsong #romance",
			"Bad Boys #romance",
			"Cookbook #litrpg #dungeon",
			"Ledger #litrpg #dungeon",
			"Gambit #litrpg #dungeon",
			"Apprentice #litrpg #dungeon",
			"Throne #litrpg #dungeon",
			"Blessing #litrpg #dungeon",
			"Masquerade #litrpg #dungeon",
			"Defense #litrpg #dungeon",
			"Town #litrpg #dungeon",
			"Guide to the Apocalypse #litrpg #dungeon",
			"Last Trick #litrpg #dungeon",
			"Rise #litrpg #dungeon",
			"War #litrpg #dungeon",
			"Secret #romance #litrpg #dungeon #cosy",
			"Revenge #romance #litrpg #dungeon #cosy",
			"Regret #romance #litrpg #dungeon #cosy",
			"Reckoning #romance #litrpg #dungeon #cosy",
			"Grudge #romance #litrpg #dungeon #cosy",
			"Daughter #romance #litrpg #dungeon #cosy",
			"Life #romance #litrpg #dungeon #cosy",
			"Oath #romance #litrpg #dungeon #cosy",
			"Summons #romance #litrpg #dungeon #cosy",
			"Doomsday Scenario #romance #litrpg #dungeon #cosy",
			"Heart #romance #litrpg #dungeon #cosy",
			"Lie #romance #litrpg #dungeon #cosy"
		],
		"rebirth": [
			"Reincarnated as the #litrpg #progression #isekai #cultivation",
			"Reborn as the #litrpg #progression #isekai #cultivation",
			"I Became the #litrpg #progression #isekai #cultivation",
			"Becoming the #litrpg #progression #isekai #cultivation",
			"The Second Life of the #litrpg #progression #isekai #cultivation",
			"Transmigrated into the #litrpg #progression #isekai #cultivation",
			"I Reincarnated as the #litrpg #progression #isekai #cultivation",
			"Oh Great, I Was Reincarnated as the #litrpg #progression #isekai #cultivation"
		],
		"rebirthTail": [
			"Lived Twice #litrpg #progression #isekai #cultivation",
			"Refused to Die #litrpg #progression #isekai #cultivation",
			"Came Back Wrong #litrpg #progression #isekai #cultivation",
			"Would Not Stay Dead #litrpg #progression #isekai #cultivation",
			"Kept the Patch Notes #litrpg #progression #isekai #cultivation",
			"Got a Second Save File #litrpg #progression #isekai #cultivation"
		],
		"interro": [
			"So What If I'm #cosy #litrpg #isekai #cultivation",
			"What Do You Mean I'm #cosy #litrpg #isekai #cultivation",
			"Turns Out I'm #cosy #litrpg #isekai #cultivation",
			"So I'm #cosy #litrpg #isekai #cultivation",
			"Why Is Everyone Obsessed With #cosy #litrpg #isekai #cultivation",
			"Awakened as #cosy #litrpg #isekai #cultivation"
		],
		"statusVerb": [
			"Rejected by #romance",
			"Married to #romance",
			"Mated to #romance",
			"Kidnapped by #romance",
			"Sold to #romance",
			"Claimed by #romance",
			"Bound to #romance",
			"Promised to #romance",
			"Betrothed to #romance",
			"Abandoned by #romance",
			"Reclaimed by #romance",
			"Accidentally Married to #romance"
		],
		"beloved": [
			"Alpha #romance",
			"Mate #romance",
			"Luna #romance",
			"Lycan King #romance",
			"CEO #romance",
			"Billionaire #romance",
			"Rogue #romance",
			"Warlord #romance",
			"Beta #romance",
			"Don #romance",
			"Werewolf #romance",
			"Duke #romance",
			"Sovereign #romance",
			"Heir #romance",
			"Alpha King #romance",
			"Exiled Noble #romance",
			"Soldier #romance",
			"Tyrant #romance"
		],
		"onlineWord": [
			"Ascend #vrmmo #isekai/media-world",
			"Awaken #vrmmo #isekai/media-world",
			"Eternal #vrmmo #isekai/media-world",
			"Eternus #vrmmo #isekai/media-world",
			"Oblivion #vrmmo #isekai/media-world",
			"Rebirth #vrmmo #isekai/media-world",
			"Continue #vrmmo #isekai/media-world",
			"Headshot #vrmmo #isekai/media-world",
			"Sky Realms #vrmmo #isekai/media-world",
			"True World #vrmmo #isekai/media-world",
			"World Gate #vrmmo #isekai/media-world",
			"New Era #vrmmo #isekai/media-world",
			"Modern Age #vrmmo #isekai/media-world",
			"Ages #vrmmo #isekai/media-world",
			"Universe #vrmmo #isekai/media-world",
			"Battlegrounds #vrmmo #isekai/media-world",
			"Beast Slayer #vrmmo #isekai/media-world",
			"Fate & Freedom #vrmmo #isekai/media-world",
			"Uniworld #vrmmo #isekai/media-world",
			"Somnia #vrmmo #isekai/media-world",
			"Insania #vrmmo #isekai/media-world"
		],
		"heroName": [
			"@hero #litrpg #system-apocalypse #villainess #regression"
		],
		"loopWord": [
			"Lost #regression",
			"Lazy #regression",
			"Time #regression"
		],
		"epithet": [
			"Fireborn #system-apocalypse #regression #cultivation #litrpg",
			"Genesis #system-apocalypse #regression #cultivation #litrpg",
			"Reborn #system-apocalypse #regression #cultivation #litrpg",
			"Willbender #system-apocalypse #regression #cultivation #litrpg",
			"Hexcaller #system-apocalypse #regression #cultivation #litrpg",
			"Time Thief #system-apocalypse #regression #cultivation #litrpg",
			"New World #system-apocalypse #regression #cultivation #litrpg",
			"The Broken System #system-apocalypse #regression #cultivation #litrpg",
			"Generic System #system-apocalypse #regression #cultivation #litrpg",
			"The Weakest Druid #system-apocalypse #regression #cultivation #litrpg",
			"Ten Lives Left #system-apocalypse #regression #cultivation #litrpg",
			"Forged in Nightmare #system-apocalypse #regression #cultivation #litrpg",
			"The Final Ceiling #system-apocalypse #regression #cultivation #litrpg",
			"Unlimited Weapon Maker #system-apocalypse #regression #cultivation #litrpg",
			"Monsters & Legends #system-apocalypse #regression #cultivation #litrpg",
			"Trash Class #system-apocalypse #regression #cultivation #litrpg",
			"Dragon Cosmos #system-apocalypse #regression #cultivation #litrpg",
			"Archmage in Seclusion #system-apocalypse #regression #cultivation #litrpg"
		],
		"ascentLead": [
			"Rise #progression",
			"Legend #progression",
			"Return #progression",
			"Dawn #progression",
			"Path #progression",
			"Saga #progression",
			"Chronicles #progression"
		],
		"compoundMod": [
			"Density #progression",
			"Awakened #progression",
			"Spear #progression",
			"Last #progression",
			"Martial #progression",
			"Runebound #progression",
			"Wand #progression",
			"Unbound #progression",
			"Abyssal #progression",
			"Living #progression",
			"Manor #progression",
			"Mystic #progression",
			"Rune #progression",
			"Undead #progression",
			"Soul #progression",
			"Emberstone #progression",
			"Dark #progression",
			"Winter #progression"
		],
		"compoundNoun": [
			"God #progression",
			"Goblin #progression",
			"Saint #progression",
			"Champion #progression",
			"Messiah #progression",
			"Professor #progression",
			"Mage #progression",
			"Flame #progression",
			"Noble #progression",
			"Enchantment #progression",
			"Lord #progression",
			"Forge #progression",
			"Carpenter #progression",
			"Legion #progression",
			"Dungeon #progression",
			"Farm #progression",
			"Heart #progression",
			"Wolf #progression"
		],
		"ascentObject": [
			"Mankind #progression",
			"Dragons #progression",
			"Steel #progression",
			"Transcendence #progression",
			"Prosperity #progression",
			"Mastery #progression",
			"Chaos #progression",
			"Doom #progression",
			"Gods #progression",
			"Ascension #progression",
			"the Devourer #progression",
			"the Archon #progression",
			"the Runeforger #progression",
			"the Primalist #progression",
			"the Skillmaster #progression",
			"Hollows #progression"
		]
	},
	"reservedTitles": westernSerialReservedTitles,
	"genreExclusions": [
		{
			"when": "isekai",
			"exclude": [
				"cultivation"
			]
		}
	]
};
