import type { GeneratorSpec } from "../engine/types.js";

export const nonWesternLiteraryLexicon: GeneratorSpec = {
	"id": "non-western-literary",
	"name": "World literary shapes",
	"blurb": "English titles built on Arabic, Persian, Russian, Hindi and Swahili conventions.",
	"tradition": "Comparative",
	"notes": [
		"These are literary rather than commercial shapes: shorter, more abstract, and less willing to explain themselves.",
		"Indigenous North American, Aboriginal Australian and Maori naming is deliberately excluded. See NOTES.md."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any region"
		},
		{
			"id": "arabic",
			"label": "Arabic"
		},
		{
			"id": "persian",
			"label": "Persian"
		},
		{
			"id": "russian",
			"label": "Russian"
		},
		{
			"id": "hindi",
			"label": "Hindi & Urdu"
		},
		{
			"id": "swahili",
			"label": "Swahili"
		}
	],
	"patterns": [
		{
			"id": "idafa",
			"label": "[Head] of [Dependent] — Arabic construct",
			"templates": [
				"{head} of {dependent}",
				"{head} of {dependent} to the North",
				"The {subject#1} and the {subject#2}"
			],
			"weight": 4,
			"genres": [
				"arabic"
			],
			"exemplar": "موسم الهجرة إلى الشمال — Season of Migration to the North",
			"note": "In the Arabic construct the first noun takes no article and the second carries it, so definiteness sits on the dependent. In English that reads as \"Season of Migration\", never \"The Season of the Migration\"."
		},
		{
			"id": "ezafe",
			"label": "The [Adjective] [Noun] — Persian",
			"templates": [
				"The {adjective} {head}",
				"The {head} of {dependent}",
				"The {adjective} {subject}"
			],
			"weight": 4,
			"genres": [
				"persian"
			],
			"exemplar": "بوف کور — The Blind Owl",
			"note": "The Persian linking vowel between head and modifier is audible but usually unwritten, which is why these titles feel compact and slightly riddling."
		},
		{
			"id": "paired-abstraction",
			"label": "[Abstraction] and [Abstraction] — Russian",
			"templates": [
				"{abstractA} and {abstractB}",
				"{adjective} {subject}",
				"A {head} of {dependent}"
			],
			"weight": 4,
			"genres": [
				"russian"
			],
			"exemplar": "Война и мир — War and Peace",
			"note": "Two large abstractions joined by \"and\". A nineteenth-century Russian signature that still reads as a claim to moral seriousness."
		},
		{
			"id": "hindi-compound",
			"label": "Compound or bare abstract noun — Hindi & Urdu",
			"templates": [
				"The {head} of {dependent}",
				"The {adjective} {subject}",
				"{dependent}"
			],
			"weight": 3,
			"genres": [
				"hindi"
			],
			"exemplar": "गोदान — Godan, \"the gift of a cow\"",
			"note": "Either a single dense compound or a bare abstract noun. Both resist the article-plus-modifier shape English expects, so the English equivalent is a one-word title."
		},
		{
			"id": "swahili-genitive",
			"label": "[Noun] of [Noun] — Swahili",
			"templates": [
				"{head} of {dependent}",
				"{subject} of {dependent}"
			],
			"weight": 3,
			"genres": [
				"swahili"
			],
			"note": "A plain genitive, but Swahili chooses the connecting particle by noun class, so the original has a grammatical agreement English simply lacks.",
			"exemplar": "Safari ya Maisha — \"Journey of Life\" (illustrative)"
		}
	],
	"lexicon": {
		"head": [
			{
				"gloss": "Season",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Book",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Map",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Nights",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "House",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Garden",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Night",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Book",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Mirror",
				"tags": [
					"persian",
					"hindi"
				]
			},
			{
				"gloss": "Road",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "House",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Chronicle",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Island",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "House",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Road",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Journey",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "House",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Hotel",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Balcony",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Train",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Notebook",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Courtyard",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Threshold",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Verandah",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Riverbank",
				"tags": [
					"swahili"
				]
			}
		],
		"dependent": [
			{
				"gloss": "Migration",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Sand",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Absence",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "the River",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Silence",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Silence",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Wind",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Stone",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Waiting",
				"tags": [
					"persian",
					"hindi"
				]
			},
			{
				"gloss": "Silence",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Winter",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Memory",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Silence",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Earth",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Life",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Blood",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Exile",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "the City",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "the Dust",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Rain",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "the Ashes",
				"tags": [
					"persian"
				]
			}
		],
		"abstractA": [
			{
				"gloss": "War",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Crime",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Life",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Love",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Love",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Love",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Memory",
				"tags": [
					"russian"
				]
			}
		],
		"abstractB": [
			{
				"gloss": "Peace",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Punishment",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Fate",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Separation",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Parting",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Forgetting",
				"tags": [
					"russian"
				]
			}
		],
		"adjective": [
			{
				"gloss": "Blind",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Distant",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Blind",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Bright",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Dead",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Quiet",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Black",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Long",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Crimson",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "New",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Patient",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Unwritten",
				"tags": [
					"arabic"
				]
			}
		],
		"subject": [
			{
				"gloss": "Owl",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Book of Kings",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Souls",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Don",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Dogs",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Thief",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "City",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Strangers",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Mirror",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Man",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Wanderer",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Brothers",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Master",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Village",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Woman",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Strangers",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Elder",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "People",
				"tags": [
					"hindi"
				]
			},
			{
				"gloss": "Children",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Heirs",
				"tags": [
					"arabic"
				]
			},
			{
				"gloss": "Sisters",
				"tags": [
					"russian"
				]
			},
			{
				"gloss": "Women",
				"tags": [
					"swahili"
				]
			},
			{
				"gloss": "Pilgrims",
				"tags": [
					"persian"
				]
			},
			{
				"gloss": "Clerks",
				"tags": [
					"hindi"
				]
			}
		]
	}
};
