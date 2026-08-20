import type { GeneratorSpec } from "../engine/types.js";

export const thaiWebLexicon: GeneratorSpec = {
	"id": "thai-web",
	"name": "Thai web-novel shape",
	"blurb": "English titles built like Thai serials: nominalised abstractions, oblique and interior.",
	"tradition": "Southeast Asian",
	"notes": [
		"These titles name states and processes rather than events. Resist the urge to add plot.",
		"The royal register belongs to royal subjects. Keep it in its own genre.",
		"Genre labels here are English-only rather than bilingual: the source material's Thai-script labels were corrupted beyond reliable recovery in transit (see titleforge/ACCURACY.md), and guessing at Thai orthography risked shipping wrong text in a real language, which this project treats as worse than doing without."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "romance",
			"label": "Romance"
		},
		{
			"id": "fantasy",
			"label": "Fantasy"
		},
		{
			"id": "bl",
			"label": "BL (Boys' Love)"
		},
		{
			"id": "royal",
			"label": "Royal & historical"
		},
		{
			"id": "horror",
			"label": "Horror"
		}
	],
	"patterns": [
		{
			"id": "khwam-frame",
			"label": "The [Abstraction] of [Possessor]",
			"templates": [
				"The {abstract} of {person}",
				"The {abstract} at the {setting}"
			],
			"weight": 5,
			"exemplar": "\"The Secret of the Heart\" (illustrative English rendering; Thai-script exemplar dropped, see titleforge/ACCURACY.md)",
			"note": "Thai builds titles by turning a state into a noun and attaching a possessor. The result is oblique and interior rather than plot-forward."
		},
		{
			"id": "kan-action",
			"label": "The [Action] of [Person]",
			"templates": [
				"The {action} of {person}"
			],
			"weight": 3,
			"exemplar": "\"The Journey of a Boy\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "Naming the process rather than the event. Reads as literary and slightly distanced."
		},
		{
			"id": "rueang-frame",
			"label": "The Story of [Person] and [Setting]",
			"templates": [
				"The Story of {person} and the {setting}"
			],
			"weight": 3,
			"exemplar": "\"My Story\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "Frames the work explicitly as a told tale. The conversational register that teen-community platforms grew out of."
		},
		{
			"id": "love-quality",
			"label": "Love [Intensity]",
			"templates": [
				"Love {quality}",
				"Loving {person} {quality}"
			],
			"weight": 4,
			"genres": [
				"romance",
				"bl"
			],
			"exemplar": "\"Love with All the Heart\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "The emotion, then its intensity, and nothing else. No plot, no setting, no irony."
		},
		{
			"id": "in-setting",
			"label": "[Feeling] in [Setting]",
			"templates": [
				"{abstract} in the {setting}",
				"{action} in the {setting}"
			],
			"weight": 4,
			"exemplar": "\"Love in a Strange City\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "Locates the feeling in a place and lets the reader infer the story from the pairing."
		},
		{
			"id": "royal-register",
			"label": "Beneath [Royal Thing] / [Royal Thing] of [Place]",
			"templates": [
				"Beneath {royalNoun}",
				"{royalNoun} of {setting}",
				"{royalNoun} and a {quality} {abstract}"
			],
			"weight": 3,
			"genres": [
				"royal"
			],
			"exemplar": "\"Beneath the Royal Umbrella\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "Royal and courtly vocabulary is a distinct register in Thai, not a decorative theme. In English, reach for elevated abstractions and keep them attached to royal subjects."
		},
		{
			"id": "demonstrative",
			"label": "The [Setting] No One Talks About",
			"templates": [
				"{setting} No One Talks About"
			],
			"weight": 2,
			"genres": [
				"horror",
				"romance"
			],
			"exemplar": "\"That House\" (illustrative English rendering; see titleforge/ACCURACY.md)",
			"note": "A trailing demonstrative does the work an English definite article does, and implies shared knowledge the reader has not been given yet."
		}
	],
	"lexicon": {
		"abstract": [
			{
				"gloss": "Love",
				"tags": [
					"romance",
					"bl"
				],
				"weight": 4
			},
			{
				"gloss": "Secret",
				"tags": [
					"romance",
					"horror",
					"bl"
				]
			},
			{
				"gloss": "Dream",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Memory",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Silence",
				"tags": [
					"horror",
					"romance"
				]
			},
			{
				"gloss": "Attachment",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Vengeance",
				"tags": [
					"royal",
					"horror"
				]
			},
			{
				"gloss": "Hope",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Loneliness",
				"tags": [
					"romance",
					"horror"
				]
			},
			{
				"gloss": "Obligation",
				"tags": [
					"royal",
					"romance"
				]
			}
		],
		"person": [
			{
				"gloss": "the Heart",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "You",
				"tags": [
					"romance",
					"bl"
				],
				"weight": 2
			},
			{
				"gloss": "the Senior",
				"tags": [
					"bl",
					"romance"
				]
			},
			{
				"gloss": "a Stranger",
				"tags": [
					"romance",
					"horror"
				]
			},
			{
				"gloss": "the Mage",
				"tags": [
					"fantasy"
				]
			},
			{
				"gloss": "the Bodyguard",
				"tags": [
					"royal",
					"fantasy"
				]
			},
			{
				"gloss": "the Householder",
				"tags": [
					"horror"
				]
			},
			{
				"gloss": "the Student",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "the Doctor",
				"tags": [
					"romance",
					"horror"
				]
			},
			{
				"gloss": "the Photographer",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "the Fortune-Teller",
				"tags": [
					"horror",
					"romance"
				]
			}
		],
		"royalNoun": [
			{
				"gloss": "the Moon",
				"tags": [
					"royal"
				]
			},
			{
				"gloss": "Royal Grace",
				"tags": [
					"royal"
				]
			},
			{
				"gloss": "the Princess",
				"tags": [
					"royal"
				]
			},
			{
				"gloss": "the Dynasty",
				"tags": [
					"royal"
				]
			},
			{
				"gloss": "the Palace",
				"tags": [
					"royal"
				]
			}
		],
		"setting": [
			{
				"gloss": "Strange City",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Rainy Season",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Empty House",
				"tags": [
					"horror"
				]
			},
			{
				"gloss": "Another World",
				"tags": [
					"fantasy"
				]
			},
			{
				"gloss": "Rear Palace",
				"tags": [
					"royal"
				]
			},
			{
				"gloss": "University",
				"tags": [
					"bl",
					"romance"
				]
			},
			{
				"gloss": "Night Market",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Rooftop",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Boarding House",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Last Train",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Temple Fair",
				"tags": [
					"romance",
					"fantasy"
				]
			}
		],
		"quality": [
			{
				"gloss": "with All My Heart",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "That Never Arrives",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Forbidden",
				"tags": [
					"romance",
					"bl",
					"royal"
				]
			},
			{
				"gloss": "for the Last Time",
				"tags": [
					"romance",
					"horror"
				]
			},
			{
				"gloss": "Forgotten",
				"tags": [
					"fantasy",
					"horror"
				]
			},
			{
				"gloss": "That Was Never Returned",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Kept in a Drawer",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Half-Spoken",
				"tags": [
					"romance",
					"bl"
				]
			}
		],
		"action": [
			{
				"gloss": "Waiting",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Returning",
				"tags": [
					"romance",
					"fantasy"
				]
			},
			{
				"gloss": "Searching",
				"tags": [
					"fantasy",
					"romance"
				]
			},
			{
				"gloss": "Parting",
				"tags": [
					"romance"
				]
			},
			{
				"gloss": "Watching",
				"tags": [
					"royal",
					"fantasy"
				]
			},
			{
				"gloss": "Forgetting",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Confessing",
				"tags": [
					"romance",
					"bl"
				]
			},
			{
				"gloss": "Letting Go",
				"tags": [
					"romance",
					"bl"
				]
			}
		]
	}
};
