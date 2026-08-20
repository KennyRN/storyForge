import type { GeneratorSpec } from "../engine/types.js";

export const chineseWebLexicon: GeneratorSpec = {
	"id": "chinese-web",
	"name": "Chinese web-novel shape",
	"blurb": "English titles built like Qidian and JJWXC serials: stacked categories, four-beat compounds.",
	"tradition": "East Asian",
	"notes": [
		"The colon in these titles is doing the work a Chinese genitive particle does — category first, premise second.",
		"Four-beat compounds want two stressed pairs and no connecting words."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "xianxia",
			"label": "Xianxia (仙侠)"
		},
		{
			"id": "xuanhuan",
			"label": "Xuanhuan (玄幻)"
		},
		{
			"id": "wuxia",
			"label": "Wuxia (武侠)"
		},
		{
			"id": "system",
			"label": "System / game (系统)"
		},
		{
			"id": "rebirth",
			"label": "Rebirth (重生)"
		},
		{
			"id": "urban",
			"label": "Urban (都市)"
		},
		{
			"id": "romance",
			"label": "Romance & danmei"
		}
	],
	"platforms": [
		{
			"id": "all",
			"label": "Any platform"
		},
		{
			"id": "qidian",
			"label": "Qidian 起点"
		},
		{
			"id": "jjwxc",
			"label": "JJWXC 晋江"
		},
		{
			"id": "fanqie",
			"label": "Fanqie 番茄"
		},
		{
			"id": "zongheng",
			"label": "Zongheng 纵横"
		}
	],
	"patterns": [
		{
			"id": "zhi-genitive",
			"label": "[Category]: [The Specific Thing]",
			"templates": [
				"{systemWord}: The {rank} {role}",
				"Reborn: The {rank} {role} of {domain}"
			],
			"weight": 5,
			"exemplar": "系统之绝世武神 — \"System: Peerless Martial God\" (illustrative)",
			"note": "The defining Qidian shape. A classical genitive particle stacks a genre tag onto a premise, so the title tells you the category and the hook at once. In English the colon does the same work."
		},
		{
			"id": "verb-object",
			"label": "[Verb] the [Object]",
			"templates": [
				"{verb} the {celestial}",
				"{verb} {beast}"
			],
			"weight": 4,
			"genres": [
				"xianxia",
				"xuanhuan",
				"wuxia"
			],
			"exemplar": "诛仙 — published in English as Jade Dynasty",
			"note": "A bare transitive verb and its object. Blunt, declarative, and reads as a mission statement rather than a description."
		},
		{
			"id": "four-character",
			"label": "Four-beat compound",
			"templates": [
				"The {beast} Between {celestial#1} and {celestial#2}",
				"{verb}ing {celestial#1} and {celestial#2}"
			],
			"weight": 4,
			"genres": [
				"xianxia",
				"xuanhuan",
				"wuxia"
			],
			"exemplar": "斗破苍穹 — Battle Through the Heavens",
			"note": "The prestige form, borrowing the cadence of a four-character idiom: two balanced halves, no articles, no connectives. In English, aim for two stressed pairs."
		},
		{
			"id": "bring-x-to-y",
			"label": "Taking [Modern Thing] into [Fantasy Setting]",
			"templates": [
				"Taking {kit} into {domain}",
				"I Support My Family in {domain} with {kit}"
			],
			"weight": 3,
			"genres": [
				"system",
				"rebirth",
				"urban"
			],
			"exemplar": "带着农场穿越异界 — \"Taking a Farm Across to Another World\" (illustrative)",
			"note": "The premise is the collision. A mundane convenience carried into an epic setting promises comedy and competence at the same time."
		},
		{
			"id": "first-person-premise",
			"label": "I [Verb] in [Setting]",
			"templates": [
				"I'm the {role} of {domain}",
				"There's Something Wrong with My {systemWord}"
			],
			"weight": 3,
			"genres": [
				"system",
				"urban",
				"rebirth"
			],
			"platforms": [
				"fanqie",
				"qidian"
			],
			"exemplar": "我在异界当门房 — \"I Am the Gatekeeper of Another World\" (illustrative)",
			"note": "The first-person premise title. Dominant where discovery is algorithmic rather than shelf-driven, because the hook has to land in the first few words."
		},
		{
			"id": "jjwxc-relation",
			"label": "[My Relation] [Complaint]",
			"templates": [
				"{relation} {complaint}",
				"After I Was Reborn, {relation} {complaint}"
			],
			"weight": 3,
			"genres": [
				"romance"
			],
			"platforms": [
				"jjwxc"
			],
			"note": "Female-oriented platforms foreground the relationship and its temperature rather than the setting. The complaint is the plot.",
			"exemplar": "我师兄今天也在装深沉 — \"My Senior Brother Is Being Broody Again Today\" (illustrative)"
		},
		{
			"id": "rank-role",
			"label": "The [Superlative] [Role]",
			"templates": [
				"The {rank} {role}",
				"The {rank} {role} of {domain}"
			],
			"weight": 3,
			"exemplar": "全职法师 — Versatile Mage",
			"note": "A bare superlative noun phrase. No verb, no setting: the rank carries the whole promise."
		}
	],
	"lexicon": {
		"celestial": [
			{
				"gloss": "Heaven",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Immortal",
				"tags": [
					"xianxia"
				],
				"weight": 3
			},
			{
				"gloss": "Divine",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Dao",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Demon",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Stars",
				"tags": [
					"xuanhuan"
				]
			},
			{
				"gloss": "Firmament",
				"tags": [
					"xuanhuan"
				]
			},
			{
				"gloss": "Cosmos",
				"tags": [
					"xuanhuan"
				]
			},
			{
				"gloss": "Samsara",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Void",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Netherworld",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Primordial Chaos",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Thunder Tribulation",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			},
			{
				"gloss": "Jade Pool",
				"tags": [
					"xianxia",
					"xuanhuan"
				]
			}
		],
		"beast": [
			{
				"gloss": "Dragon",
				"weight": 3
			},
			"Phoenix",
			"Tiger",
			"Roc",
			"Flood Dragon",
			{
				"gloss": "Fox",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Qilin",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Turtle",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Serpent",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Crane",
				"tags": [
					"romance"
				]
			}
		],
		"verb": [
			{
				"gloss": "Slay",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Battle Through",
				"tags": [
					"xuanhuan"
				]
			},
			"Coiling",
			"Tread",
			"Question",
			"Seal",
			"Command",
			"Defy"
		],
		"rank": [
			{
				"gloss": "Strongest",
				"weight": 3
			},
			"Peerless",
			"Invincible",
			"Foremost",
			"Eternal",
			"Good-for-Nothing",
			"Low-Profile",
			"Nine-Star",
			"Heaven-Defying",
			"Unranked",
			"Thrice-Reborn",
			"Half-Step",
			"Unassuming",
			"Blacklisted"
		],
		"role": [
			{
				"gloss": "Sword Cultivator",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Martial God",
				"tags": [
					"xuanhuan",
					"system"
				]
			},
			{
				"gloss": "Sect Master",
				"tags": [
					"xianxia",
					"wuxia"
				]
			},
			{
				"gloss": "Honoured Master",
				"tags": [
					"xianxia",
					"romance"
				]
			},
			{
				"gloss": "Big Shot",
				"tags": [
					"urban",
					"romance"
				]
			},
			{
				"gloss": "Film Emperor",
				"tags": [
					"urban",
					"romance"
				]
			},
			{
				"gloss": "Farm Owner",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "Tomb Raider",
				"tags": [
					"urban"
				]
			},
			{
				"gloss": "Young Lord",
				"tags": [
					"romance",
					"wuxia"
				]
			},
			{
				"gloss": "Alchemy Master",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Beast Tamer",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Formation Master",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Talisman Maker",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Sword Immortal",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Pill Cauldron Keeper",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Frontier General",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Merchant Prince",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Ghost Cultivator",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Village Doctor",
				"tags": [
					"xianxia"
				]
			}
		],
		"domain": [
			{
				"gloss": "the Martial World",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Cultivation World",
				"tags": [
					"xianxia"
				]
			},
			{
				"gloss": "Another World",
				"tags": [
					"xuanhuan",
					"system"
				]
			},
			{
				"gloss": "the Apocalypse",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "the Entertainment Industry",
				"tags": [
					"urban",
					"romance"
				]
			},
			{
				"gloss": "the 1980s",
				"tags": [
					"rebirth",
					"romance"
				]
			},
			{
				"gloss": "the Instance Dungeon",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "the Demon Territories",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Spirit Market",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Sect Trials",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Mortal World",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Ancient Battlefield",
				"tags": [
					"wuxia"
				]
			},
			{
				"gloss": "the Livestream",
				"tags": [
					"wuxia"
				]
			}
		],
		"systemWord": [
			{
				"gloss": "System",
				"tags": [
					"system"
				],
				"weight": 4
			},
			{
				"gloss": "Daily Check-In System",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Livestream System",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Simulator",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Status Panel",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Farming System",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Villain System",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "Retirement System",
				"tags": [
					"system"
				]
			}
		],
		"kit": [
			{
				"gloss": "a Farm",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "a Shop Interface",
				"tags": [
					"system"
				]
			},
			{
				"gloss": "a Pocket Dimension",
				"tags": [
					"system",
					"rebirth"
				]
			},
			{
				"gloss": "Memories of My Past Life",
				"tags": [
					"rebirth"
				]
			},
			{
				"gloss": "One Cat",
				"tags": [
					"urban"
				]
			},
			{
				"gloss": "a Vegetable Patch",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "a Live Chat Channel",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "a Textbook",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "an Ancestral Ring",
				"tags": [
					"system",
					"urban"
				]
			},
			{
				"gloss": "a Very Ordinary Dog",
				"tags": [
					"system",
					"urban"
				]
			}
		],
		"relation": [
			{
				"gloss": "My Master",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Senior Brother",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Fiancé",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Sworn Enemy",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Ex",
				"tags": [
					"romance",
					"urban"
				]
			},
			{
				"gloss": "My Junior Sister",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Sworn Brother",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Contracted Beast",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "My Landlord",
				"tags": [
					"romance"
				]
			}
		],
		"complaint": [
			{
				"gloss": "Is Acting Strange",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Is Completely Unhinged",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Wants Me Back",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Begs Me Daily",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Will Not Take the Hint",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Keeps Sending Gifts",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Has Started Crying",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Is Pretending Not to Know Me",
				"tags": [
					"romance"
				]
			}
		]
	}
};
