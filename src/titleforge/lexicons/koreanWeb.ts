import type { GeneratorSpec } from "../engine/types.js";

export const koreanWebLexicon: GeneratorSpec = {
	"id": "korean-web",
	"name": "Korean web-novel shape",
	"blurb": "English titles built like Korean serials: regressors, \"only I\", polite defiance.",
	"tradition": "East Asian",
	"notes": [
		"The characteristic tone is courteous construction with defiant content. Keep the politeness formal and the refusal flat."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "regression",
			"label": "Regression & return"
		},
		{
			"id": "hunter",
			"label": "Hunter / system"
		},
		{
			"id": "romfan",
			"label": "Romance fantasy"
		},
		{
			"id": "modern",
			"label": "Modern & office"
		},
		{
			"id": "martial",
			"label": "Murim / martial"
		}
	],
	"patterns": [
		{
			"id": "only-i",
			"label": "Only I [Verb]",
			"templates": [
				"{only} {verbPhrase}",
				"{only} Know About the {modifier} {thing}"
			],
			"weight": 4,
			"genres": [
				"hunter",
				"regression"
			],
			"exemplar": "나 혼자만 레벨업 — Solo Leveling, literally \"Only I Level Up\"",
			"note": "Exclusivity as the hook: everyone is in the same system and one person is exempt from its rules."
		},
		{
			"id": "modifier-role",
			"label": "[Modifier] [Role]",
			"templates": [
				"The {modifier} {role}",
				"The {modifier} {role}'s {thing}"
			],
			"weight": 4,
			"exemplar": "전지적 독자 시점 — Omniscient Reader's Viewpoint",
			"note": "A modifier that names an unfair epistemic advantage, then the role holding it."
		},
		{
			"id": "possessive-ui",
			"label": "The [Role]'s [Thing]",
			"templates": [
				"The {role}'s {thing}",
				"The {lifeWord} of the {modifier} {thing}"
			],
			"weight": 3,
			"exemplar": "마법사의 전설 — \"Legend of the Magician\" (illustrative)",
			"note": "The genitive is the workhorse noun-phrase title. Quiet, and it puts the emphasis on the possessed thing rather than the person."
		},
		{
			"id": "nth-life",
			"label": "My [Nth] [Life]",
			"templates": [
				"In My {ordinal} {lifeWord}, {declaration}",
				"The {role} of the {ordinal} {lifeWord}"
			],
			"weight": 3,
			"genres": [
				"regression",
				"romfan"
			],
			"exemplar": "7번째 회귀 — \"The Seventh Regression\" (illustrative)",
			"note": "Numbering the attempt tells the reader this is a loop story and that the narrator is out of patience."
		},
		{
			"id": "polite-declaration",
			"label": "[Situation], but [Flat Refusal]",
			"templates": [
				"I May Be the {modifier} {role}, but {declaration}",
				"I'm Done with the {thing} — {declaration}"
			],
			"weight": 3,
			"exemplar": "이번 생은 사양하겠습니다 — \"I Would Rather Decline This Life\" (illustrative)",
			"note": "The signature Korean web novel tone: formally polite in construction, flatly defiant in content. Courtesy as a weapon."
		},
		{
			"id": "reverse-role",
			"label": "I Became the [Role]",
			"templates": [
				"I Became the {modifier} {role}"
			],
			"weight": 2,
			"exemplar": "나는 이 집 아이가 되었다 — \"I Became the Child of This House\" (illustrative)",
			"note": "A completed transformation stated in the past tense, so the story is about the consequences rather than the change."
		}
	],
	"lexicon": {
		"only": [
			{
				"gloss": "Only I",
				"tags": [
					"hunter"
				],
				"weight": 3
			},
			{
				"gloss": "This Time",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Again",
				"tags": [
					"regression"
				]
			}
		],
		"verbPhrase": [
			{
				"gloss": "Level Up",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Regressed",
				"tags": [
					"regression"
				]
			},
			"Survive",
			{
				"gloss": "Remember",
				"tags": [
					"regression"
				]
			},
			"Can Read It",
			"Can Enter",
			{
				"gloss": "Return",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Know the Ending",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Read the Script",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Wake Up First",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "See the Status Window",
				"tags": [
					"hunter"
				]
			}
		],
		"role": [
			{
				"gloss": "Regressor",
				"tags": [
					"regression"
				],
				"weight": 3
			},
			{
				"gloss": "Returner",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Hunter",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Player",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Villainess",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Archduke",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Imperial Princess",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Sword God",
				"tags": [
					"martial"
				]
			},
			{
				"gloss": "Sect Master",
				"tags": [
					"martial"
				]
			},
			{
				"gloss": "Chaebol Youngest Son",
				"tags": [
					"modern"
				]
			},
			{
				"gloss": "Junior Employee",
				"tags": [
					"modern"
				]
			},
			{
				"gloss": "Gatekeeper",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Raid Leader",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Necromancer",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Constellation",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Saintess",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Swordmaster",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Duke's Bastard",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Court Physician",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Tower Climber",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Assassin",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Prosecutor",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Idol Trainee",
				"tags": [
					"regression"
				]
			}
		],
		"modifier": [
			{
				"gloss": "Strongest",
				"weight": 3
			},
			"Utterly Ordinary",
			"Omniscient",
			"Genius",
			"Ruined",
			{
				"gloss": "Abandoned",
				"tags": [
					"romfan"
				]
			},
			"Hidden",
			{
				"gloss": "Discarded",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Overlooked",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Untalented",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Terminally Calm",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Twice-Betrayed",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Nameless",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Reluctant",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Unbeaten",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Half-Blood",
				"tags": [
					"romfan"
				]
			}
		],
		"thing": [
			"Viewpoint",
			{
				"gloss": "Past Life",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Dungeon",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Tower",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Guild",
				"tags": [
					"hunter"
				]
			},
			{
				"gloss": "Contract",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Divorce",
				"tags": [
					"romfan"
				]
			},
			{
				"gloss": "Martial Art",
				"tags": [
					"martial"
				]
			},
			{
				"gloss": "Company",
				"tags": [
					"modern"
				]
			},
			"Talent",
			{
				"gloss": "System",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Regression",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Prophecy",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Ledger",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Bloodline",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Scenario",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Awakening",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Debt",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Trial",
				"tags": [
					"regression"
				]
			}
		],
		"ordinal": [
			{
				"gloss": "Second",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Third",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Seventh",
				"tags": [
					"regression"
				]
			},
			"Last",
			{
				"gloss": "Fourth",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Ninety-Ninth",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Final",
				"tags": [
					"regression"
				]
			}
		],
		"lifeWord": [
			"Life",
			"Lifetime",
			{
				"gloss": "Run-Through",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Attempt",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Playthrough",
				"tags": [
					"regression"
				]
			},
			{
				"gloss": "Round",
				"tags": [
					"regression"
				]
			}
		],
		"declaration": [
			"I Quit",
			"I'm Running Away",
			"This Time I'll Live Differently",
			"I Refuse to Fall in Love",
			"I'm Taking My Revenge",
			"I'm Retiring",
			"I'm Selling the Company",
			"I Will Not Be Saving Anyone",
			"I'm Keeping the Money",
			"I'm Not Doing This Again",
			"I'd Rather Farm"
		]
	}
};
