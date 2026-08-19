import type { GeneratorSpec } from "../engine/types.js";

export const indonesianWebLexicon: GeneratorSpec = {
	"id": "indonesian-web",
	"name": "Indonesian web-novel shape",
	"blurb": "English titles built like Wattpad ID and NovelMe: qualified nouns, intimate possessives.",
	"tradition": "Southeast Asian",
	"notes": [
		"The originals attach qualifiers with a relative clause, so \"the love that was forbidden\" is closer in feel than \"forbidden love\"."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "romansa",
			"label": "Romansa (romance)"
		},
		{
			"id": "fantasi",
			"label": "Fantasi"
		},
		{
			"id": "isekai",
			"label": "Isekai & sistem"
		},
		{
			"id": "remaja",
			"label": "Remaja (teen)"
		},
		{
			"id": "horor",
			"label": "Horor"
		}
	],
	"patterns": [
		{
			"id": "yang-clause",
			"label": "The [Qualified] [Noun]",
			"templates": [
				"The {qualifier} {coreNoun}",
				"The {coreNoun} That Never Came Back"
			],
			"weight": 5,
			"note": "Indonesian attaches a qualifier with a relative clause rather than fronting an adjective, so the effect is closer to \"the love that was forbidden\" than \"forbidden love\".",
			"exemplar": "Cinta yang Terlarang — \"Love That Is Forbidden\""
		},
		{
			"id": "enclitic-possessive",
			"label": "My [Noun]",
			"templates": [
				"My {possessed}",
				"My {qualifier} {possessed}",
				"My {person}"
			],
			"weight": 4,
			"genres": [
				"romansa",
				"remaja",
				"isekai"
			],
			"note": "The possessive fuses onto the noun as a single word. Intimate and slightly plaintive; the dominant shape in the teen-romance register.",
			"exemplar": "Cintaku — \"My Love\""
		},
		{
			"id": "noun-di-place",
			"label": "[Noun] at [Place]",
			"templates": [
				"{coreNoun} at {place}",
				"{qualifier|a} {coreNoun} at {place}"
			],
			"weight": 4,
			"note": "The locative title. A feeling plus a place, with the story left to inference.",
			"exemplar": "Cinta di Ujung Dunia — \"Love at the End of the World\""
		},
		{
			"id": "kisah-frame",
			"label": "The Tale of [Person]",
			"templates": [
				"The Tale of {person} and the {coreNoun}",
				"The Chronicle of the {qualifier} {person}"
			],
			"weight": 3,
			"note": "Frames the work as a told tale, inherited from the classical Malay hikayat. Lends weight and a little distance.",
			"exemplar": "Hikayat Hang Tuah — The Tale of Hang Tuah"
		},
		{
			"id": "dari-ke",
			"label": "From [Start] to [End]",
			"templates": [
				"From {startState} to {endState}"
			],
			"weight": 3,
			"genres": [
				"isekai",
				"fantasi"
			],
			"note": "The progression arc stated up front.",
			"exemplar": "Dari Nol ke Puncak — \"From Zero to the Peak\""
		},
		{
			"id": "system-isekai",
			"label": "[System] in [Another World]",
			"templates": [
				"{systemWord} in {place}",
				"I'm Stuck in {place} with {systemWord|a}"
			],
			"weight": 3,
			"genres": [
				"isekai"
			],
			"note": "The loan word stays bare and uninflected; the premise is built around it.",
			"exemplar": "Sistem Level — \"Level System\""
		},
		{
			"id": "imperative-address",
			"label": "Direct address to a person",
			"templates": [
				"Love Me, {person}",
				"Don't Go, {person}"
			],
			"weight": 2,
			"genres": [
				"romansa",
				"remaja"
			],
			"note": "Second-person address reads as a plea rather than a command. Common in the teen register.",
			"exemplar": "Cintai Aku — \"Love Me\""
		}
	],
	"lexicon": {
		"coreNoun": [
			{
				"gloss": "Love",
				"tags": [
					"romansa",
					"remaja"
				],
				"weight": 4
			},
			{
				"gloss": "Promise",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Longing",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Wound",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Secret",
				"tags": [
					"romansa",
					"horor",
					"remaja"
				]
			},
			{
				"gloss": "Dusk",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Choice",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "World",
				"tags": [
					"fantasi",
					"isekai"
				],
				"weight": 2
			},
			{
				"gloss": "Sword",
				"tags": [
					"fantasi"
				]
			},
			{
				"gloss": "Crown",
				"tags": [
					"fantasi"
				]
			},
			{
				"gloss": "Shadow",
				"tags": [
					"fantasi",
					"horor"
				]
			},
			{
				"gloss": "Curse",
				"tags": [
					"horor",
					"fantasi"
				]
			},
			{
				"gloss": "House",
				"tags": [
					"horor"
				]
			},
			{
				"gloss": "Rain",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Star",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Prayer",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Shadow",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Mist",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Fire",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "River",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Celebration",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Voice",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Distance",
				"tags": [
					"romansa",
					"remaja"
				]
			}
		],
		"qualifier": [
			{
				"gloss": "Forbidden",
				"tags": [
					"romansa",
					"horor"
				],
				"weight": 3
			},
			{
				"gloss": "Postponed",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Lost",
				"tags": [
					"romansa",
					"fantasi",
					"horor"
				]
			},
			{
				"gloss": "Never Finished",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Forgotten",
				"tags": [
					"fantasi",
					"horor"
				]
			},
			{
				"gloss": "Promised",
				"tags": [
					"fantasi",
					"romansa"
				]
			},
			{
				"gloss": "Wrong",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "Left Behind",
				"tags": [
					"fantasi",
					"horor"
				]
			},
			{
				"gloss": "Unreturned",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Hidden",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Inherited",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Too Late",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Unexpected",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Guarded",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "Ordinary",
				"tags": [
					"romansa",
					"horor"
				]
			}
		],
		"person": [
			{
				"gloss": "Boss",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Contract Husband",
				"tags": [
					"romansa"
				],
				"weight": 2
			},
			{
				"gloss": "New Kid",
				"tags": [
					"remaja"
				]
			},
			{
				"gloss": "Student Council President",
				"tags": [
					"remaja"
				]
			},
			{
				"gloss": "Best Friend",
				"tags": [
					"remaja",
					"romansa"
				]
			},
			{
				"gloss": "Prince",
				"tags": [
					"fantasi",
					"romansa"
				]
			},
			{
				"gloss": "Witch",
				"tags": [
					"fantasi",
					"horor"
				]
			},
			{
				"gloss": "Hero",
				"tags": [
					"fantasi",
					"isekai"
				]
			},
			{
				"gloss": "Junior",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Young Doctor",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Shopkeeper",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Eldest Child",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Ex",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "New Teacher",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Heir",
				"tags": [
					"romansa"
				]
			}
		],
		"possessed": [
			{
				"gloss": "Love",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Secret",
				"tags": [
					"romansa",
					"horor"
				]
			},
			{
				"gloss": "World",
				"tags": [
					"fantasi"
				]
			},
			{
				"gloss": "Boss",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "System",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Promise",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Small Secret",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Home",
				"tags": [
					"romansa"
				]
			},
			{
				"gloss": "Name",
				"tags": [
					"romansa"
				]
			}
		],
		"place": [
			{
				"gloss": "the End of the World",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "Jakarta",
				"tags": [
					"romansa",
					"remaja"
				]
			},
			{
				"gloss": "the Old Town",
				"tags": [
					"horor",
					"romansa"
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
				"gloss": "the Hundredth Tower",
				"tags": [
					"isekai",
					"fantasi"
				]
			},
			{
				"gloss": "This School",
				"tags": [
					"remaja",
					"horor"
				]
			},
			{
				"gloss": "Bandung",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "This Campus",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "Grandmother's House",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "a Small Island",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "the Last Station",
				"tags": [
					"romansa",
					"fantasi"
				]
			},
			{
				"gloss": "Under the Stairs",
				"tags": [
					"romansa",
					"fantasi"
				]
			}
		],
		"systemWord": [
			{
				"gloss": "System",
				"tags": [
					"isekai"
				],
				"weight": 3
			},
			{
				"gloss": "Level",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Status Screen",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Daily Quest",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Class",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Gacha",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "Leaderboard",
				"tags": [
					"isekai"
				]
			}
		],
		"startState": [
			{
				"gloss": "Zero",
				"tags": [
					"isekai",
					"fantasi"
				]
			},
			{
				"gloss": "the Bottom",
				"tags": [
					"isekai"
				]
			},
			{
				"gloss": "the Lowest Class",
				"tags": [
					"isekai"
				]
			}
		],
		"endState": [
			{
				"gloss": "the Peak",
				"tags": [
					"isekai",
					"fantasi"
				]
			},
			{
				"gloss": "the Throne",
				"tags": [
					"fantasi"
				]
			},
			{
				"gloss": "Max Level",
				"tags": [
					"isekai"
				]
			}
		]
	}
};
