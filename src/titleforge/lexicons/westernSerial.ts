import type { GeneratorSpec } from "../engine/types.js";

export const westernSerialLexicon: GeneratorSpec = {
	"id": "western-serial",
	"name": "Web serial (Anglophone)",
	"blurb": "LitRPG, progression fantasy, dungeon core, cosy apocalypse.",
	"tradition": "Anglophone",
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "litrpg",
			"label": "LitRPG & system"
		},
		{
			"id": "progression",
			"label": "Progression fantasy"
		},
		{
			"id": "dungeon",
			"label": "Dungeon core"
		},
		{
			"id": "isekai",
			"label": "Isekai & portal"
		},
		{
			"id": "cultivation",
			"label": "Western cultivation"
		},
		{
			"id": "cosy",
			"label": "Cosy & slice of life"
		},
		{
			"id": "romance",
			"label": "Romance (Wattpad register)"
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
		}
	],
	"patterns": [
		{
			"id": "system-calamity",
			"label": "[System Word] [Calamity]",
			"templates": [
				"{systemWord} {calamity}",
				"The {calamity} {systemWord}",
				"{systemWord} {calamity}: Book One"
			],
			"weight": 4,
			"genres": [
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
				"The {rank} {role} of {place}"
			],
			"weight": 4,
			"note": "A bare superlative noun phrase, the Anglophone cousin of the Chinese rank-and-role title.",
			"exemplar": "The Legendary Mechanic"
		},
		{
			"id": "only-i",
			"label": "Only I Can [Verb] the [Place]",
			"templates": [
				"The Hidden {placeBare} Only I Can Reach",
				"Only the {role} Can Enter {place}"
			],
			"weight": 3,
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
			"weight": 3,
			"genres": [
				"cultivation",
				"cosy",
				"dungeon"
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
			"weight": 4,
			"genres": [
				"cosy",
				"cultivation",
				"isekai"
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
				"litrpg",
				"cosy"
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
				"progression"
			],
			"note": "The number is the premise. Progression fiction sells accumulated effort, so quantify it.",
			"exemplar": "I've Been Killing Slimes for 300 Years"
		},
		{
			"id": "genre-subtitle",
			"label": "[Title]: A [Genre] [Form]",
			"templates": [
				"The {rank} {role}: A LitRPG Serial",
				"{place}: A Progression Fantasy"
			],
			"weight": 2,
			"platforms": [
				"royalroad",
				"scribblehub"
			],
			"note": "An explicit genre subtitle, because discovery on serial platforms is search- and tag-driven rather than shelf-driven.",
			"exemplar": "The Wandering Inn: A LitRPG Adventure"
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
		}
	],
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
					"litrpg"
				],
				"weight": 3
			},
			{
				"gloss": "Integration",
				"tags": [
					"litrpg"
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
					"litrpg"
				]
			},
			{
				"gloss": "Reset",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Convergence",
				"tags": [
					"litrpg"
				]
			},
			{
				"gloss": "Rollout",
				"tags": [
					"litrpg"
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
					"litrpg"
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
			}
		],
		"role": [
			{
				"gloss": "Necromancer",
				"tags": [
					"litrpg",
					"progression"
				]
			},
			{
				"gloss": "Alchemist",
				"tags": [
					"progression",
					"cosy"
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
					"isekai"
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
					"progression"
				]
			},
			{
				"gloss": "Accidental",
				"tags": [
					"cosy",
					"isekai"
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
					"cultivation"
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
		]
	}
};
