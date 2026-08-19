import type { GeneratorSpec } from "../engine/types.js";

export const vietnameseWebLexicon: GeneratorSpec = {
	"id": "vietnamese-web",
	"name": "Vietnamese web-novel shape",
	"blurb": "English titles in two registers: elevated-martial and modern-romantic.",
	"tradition": "Southeast Asian",
	"notes": [
		"The two registers correspond to two vocabularies in the original and should not be mixed unless the effect is deliberately comic."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any"
		},
		{
			"id": "tienhiep",
			"label": "Tiên hiệp (xianxia)"
		},
		{
			"id": "kiemhiep",
			"label": "Kiếm hiệp (wuxia)"
		},
		{
			"id": "ngontinh",
			"label": "Ngôn tình (romance)"
		},
		{
			"id": "dothi",
			"label": "Đô thị (urban)"
		},
		{
			"id": "hethong",
			"label": "Hệ thống (system)"
		}
	],
	"patterns": [
		{
			"id": "hv-compound",
			"label": "[Elevated Modifier] [Elevated Noun]",
			"templates": [
				"The {hvModifier} {hvNoun}",
				"The {hvModifier} {hvNoun} {hvDomain}"
			],
			"weight": 4,
			"genres": [
				"tienhiep",
				"kiemhiep"
			],
			"note": "Sino-Vietnamese vocabulary carries the epic and martial register. In English, the equivalent is Latinate or archaic diction with no connecting words.",
			"exemplar": "Thiên Long Bát Bộ — the Vietnamese title of Jin Yong's Demi-Gods and Semi-Devils"
		},
		{
			"id": "hv-genitive",
			"label": "The [Noun] of the [Domain]",
			"templates": [
				"The {hvNoun} of the {hvDomain}",
				"The Path of the {hvNoun}, by {person}"
			],
			"weight": 3,
			"genres": [
				"tienhiep",
				"kiemhiep",
				"ngontinh"
			],
			"exemplar": "Đường Về Thiên Giới — \"The Road Back to the Heavenly Realm\" (illustrative; not a citation of one specific published work)",
			"note": "The genitive equivalent of the Chinese particle shape, but with a native Vietnamese connector."
		},
		{
			"id": "from-to",
			"label": "From [Start] to [End]",
			"templates": [
				"From {startState} to {endState}",
				"From {startState}, I {action} Everything"
			],
			"weight": 3,
			"genres": [
				"tienhiep",
				"hethong",
				"dothi"
			],
			"note": "States the whole progression arc up front. Suits a serial the reader is committing hundreds of chapters to.",
			"exemplar": "Từ Thô Sơ Đến Tuyệt Đỉnh — \"From Crude Beginnings to the Summit\" (illustrative)"
		},
		{
			"id": "love-modifier",
			"label": "[Qualified] Love",
			"templates": [
				"{feeling} Love",
				"Loving You, {feeling}",
				"{person} and {feeling|a} Love"
			],
			"weight": 4,
			"genres": [
				"ngontinh"
			],
			"note": "Romance titles put the emotion first and qualify it, rather than naming the lovers.",
			"exemplar": "Tình Yêu Bất Tận — \"Endless Love\" (illustrative)"
		},
		{
			"id": "person-place",
			"label": "[Person] in [Place]",
			"templates": [
				"{person} in {place}",
				"The Story of {person} in {place}"
			],
			"weight": 3,
			"genres": [
				"ngontinh",
				"dothi"
			],
			"note": "Contemporary titles locate the story. Modern register, native vocabulary, no elevation.",
			"exemplar": "Chuyện Của Pao — The Story of Pao"
		},
		{
			"id": "system-premise",
			"label": "[System] and [Premise]",
			"templates": [
				"There Is Something Wrong with My {systemWord}",
				"I {action} {place} Thanks to a {systemWord}"
			],
			"weight": 3,
			"genres": [
				"hethong"
			],
			"note": "System fiction imported from Chinese and Korean keeps the loan word as a bare, uninflected head noun.",
			"exemplar": "Hệ Thống Cấp Độ — \"Level System\" (illustrative)"
		}
	],
	"lexicon": {
		"hvModifier": [
			{
				"gloss": "Heavenly",
				"tags": [
					"tienhiep",
					"kiemhiep"
				],
				"weight": 3
			},
			{
				"gloss": "Great",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Strongest",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "Invincible",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Defiant",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Ancient",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Arcane",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Absolute",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Sable",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Sanctified",
				"tags": [
					"tienhiep"
				]
			}
		],
		"hvNoun": [
			{
				"gloss": "Dragon",
				"tags": [
					"tienhiep",
					"kiemhiep"
				],
				"weight": 3
			},
			{
				"gloss": "Sword",
				"tags": [
					"kiemhiep",
					"tienhiep"
				],
				"weight": 3
			},
			{
				"gloss": "Immortal",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Demon",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Emperor",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "God",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Dao",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Soul",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "King",
				"tags": [
					"kiemhiep",
					"tienhiep"
				]
			},
			{
				"gloss": "Spirit",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Blood",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Wind",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Cloud",
				"tags": [
					"tienhiep"
				]
			}
		],
		"hvDomain": [
			{
				"gloss": "Realm",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Path",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Era",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Palace",
				"tags": [
					"kiemhiep"
				]
			},
			{
				"gloss": "Sect",
				"tags": [
					"kiemhiep",
					"tienhiep"
				]
			}
		],
		"person": [
			{
				"gloss": "The Young Man",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "The Woman",
				"tags": [
					"ngontinh"
				],
				"weight": 2
			},
			{
				"gloss": "The Girl",
				"tags": [
					"ngontinh",
					"dothi"
				]
			},
			{
				"gloss": "The CEO",
				"tags": [
					"ngontinh",
					"dothi"
				],
				"weight": 2
			},
			{
				"gloss": "My Wife",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "My Ex-Husband",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "My Flatmate",
				"tags": [
					"dothi"
				]
			},
			{
				"gloss": "The Stranger",
				"tags": [
					"ngontinh",
					"dothi"
				]
			},
			{
				"gloss": "The Young Mistress",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "The Schoolteacher",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "The Neighbour",
				"tags": [
					"dothi",
					"ngontinh"
				]
			}
		],
		"feeling": [
			{
				"gloss": "Endless",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Sweet",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Too Late",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Unspoken",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Done Wrong",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Unfinished",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Ardent",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Troubled",
				"tags": [
					"ngontinh"
				]
			}
		],
		"place": [
			{
				"gloss": "the City",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "Saigon",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "That Summer",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "Another World",
				"tags": [
					"hethong"
				]
			},
			{
				"gloss": "the Ninth Floor",
				"tags": [
					"hethong"
				]
			},
			{
				"gloss": "Hanoi",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "the Old Quarter",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "That Winter",
				"tags": [
					"ngontinh"
				]
			},
			{
				"gloss": "an Empty Shore",
				"tags": [
					"ngontinh",
					"dothi"
				]
			}
		],
		"startState": [
			{
				"gloss": "a Good-for-Nothing",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "Zero",
				"tags": [
					"hethong"
				]
			},
			{
				"gloss": "a Nobody Clerk",
				"tags": [
					"dothi"
				]
			},
			{
				"gloss": "the Cast-Out",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "a Failure",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "a Nobody",
				"tags": [
					"dothi",
					"hethong"
				]
			}
		],
		"endState": [
			{
				"gloss": "the Summit",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "the Peak",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "Godhood",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "First Place",
				"tags": [
					"dothi",
					"hethong"
				]
			},
			{
				"gloss": "the Highest Peak",
				"tags": [
					"tienhiep",
					"hethong"
				]
			}
		],
		"systemWord": [
			{
				"gloss": "System",
				"tags": [
					"hethong"
				],
				"weight": 3
			},
			{
				"gloss": "Status Panel",
				"tags": [
					"hethong"
				]
			},
			{
				"gloss": "Experience Points",
				"tags": [
					"hethong"
				]
			}
		],
		"action": [
			{
				"gloss": "Defeat",
				"tags": [
					"tienhiep",
					"kiemhiep"
				]
			},
			{
				"gloss": "Overcome",
				"tags": [
					"tienhiep",
					"hethong"
				]
			},
			{
				"gloss": "Subdue",
				"tags": [
					"tienhiep"
				]
			},
			{
				"gloss": "Shoulder",
				"tags": [
					"dothi"
				]
			},
			{
				"gloss": "Protect",
				"tags": [
					"tienhiep",
					"dothi"
				]
			},
			{
				"gloss": "Wait For",
				"tags": [
					"dothi",
					"ngontinh"
				]
			},
			{
				"gloss": "Abandon",
				"tags": [
					"tienhiep",
					"dothi"
				]
			}
		]
	}
};
