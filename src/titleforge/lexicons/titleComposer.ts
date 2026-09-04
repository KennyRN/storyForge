import type { GeneratorSpec } from "../engine/types.js";

export const titleComposerLexicon: GeneratorSpec = {
	"id": "title-composer",
	"name": "Title composer",
	"blurb": "The full English shape taxonomy. Eighty-three shapes across twenty-seven families, for novels and series alike.",
	"tradition": "Anglophone",
	"notes": [
		"This is the general-purpose bench, and it names series as readily as novels — a series title is grammatically the same kind of object as a novel title.",
		"Pick the shape for the feeling first and fill the slots second. The same material reads completely differently through a different family.",
		"To shift genre without changing shape, keep the family and change the genre — the vocabulary swaps underneath.",
		"Names and places are invented. Check any that feel familiar before you use them."
	],
	"genres": [
		{
			"id": "all",
			"label": "Any genre"
		},
		{
			"id": "epic",
			"label": "Epic fantasy"
		},
		{
			"id": "sf",
			"label": "Science fiction"
		},
		{
			"id": "horror",
			"label": "Horror"
		},
		{
			"id": "crime",
			"label": "Crime & thriller"
		},
		{
			"id": "lit",
			"label": "Literary"
		},
		{
			"id": "hist",
			"label": "Historical"
		},
		{
			"id": "rom",
			"label": "Romance"
		},
		{
			"id": "short",
			"label": "Short fiction"
		},
		{
			"id": "ya",
			"label": "Young adult"
		}
	],
	"families": [
		{
			"id": "all",
			"label": "Any shape"
		},
		{
			"id": "core",
			"label": "Determiner + noun"
		},
		{
			"id": "of",
			"label": "Of-genitive"
		},
		{
			"id": "poss",
			"label": "Possessive"
		},
		{
			"id": "pair",
			"label": "Pairs & conjunction"
		},
		{
			"id": "prep",
			"label": "Prepositional"
		},
		{
			"id": "verb",
			"label": "Verb-led & imperative"
		},
		{
			"id": "clause",
			"label": "Relative clause"
		},
		{
			"id": "question",
			"label": "Question & address"
		},
		{
			"id": "name",
			"label": "Character & name"
		},
		{
			"id": "place",
			"label": "Place"
		},
		{
			"id": "number",
			"label": "Number & quantity"
		},
		{
			"id": "event",
			"label": "Action & event"
		},
		{
			"id": "modifier",
			"label": "Colour, time & weather"
		},
		{
			"id": "list",
			"label": "List & asyndeton"
		},
		{
			"id": "subtitle",
			"label": "Subtitle & series"
		},
		{
			"id": "guide",
			"label": "How-to & guide"
		},
		{
			"id": "abstract",
			"label": "Abstract & state"
		},
		{
			"id": "sentence",
			"label": "Sentence & clause"
		},
		{
			"id": "participle",
			"label": "Participle"
		},
		{
			"id": "journey",
			"label": "Journey & movement"
		},
		{
			"id": "tale",
			"label": "Tale & chronicle"
		},
		{
			"id": "lastfirst",
			"label": "Last, first & only"
		},
		{
			"id": "temporal",
			"label": "Temporal & age-of"
		},
		{
			"id": "negative",
			"label": "Negative & absence"
		},
		{
			"id": "reference",
			"label": "Reference format"
		},
		{
			"id": "rhetoric",
			"label": "Rhetorical devices"
		},
		{
			"id": "series",
			"label": "Series umbrella"
		}
	],
	"patterns": [
		{
			"id": "the-noun",
			"family": "core",
			"label": "The [Noun]",
			"templates": [
				"The {noun}",
				"The {abstract}",
				"The {object}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"sf",
				"horror",
				"lit",
				"short",
				"ya"
			],
			"exemplar": "The Road; The Trial; The Shining",
			"note": "Plain and weighty. Implies \"the one that matters\" and dares you to ask which."
		},
		{
			"id": "the-adj-noun",
			"family": "core",
			"label": "The [Adjective] [Noun]",
			"templates": [
				"The {adj} {noun}",
				"The {adj} {object}",
				"The {adj} {abstract}"
			],
			"weight": 5,
			"genres": [
				"epic",
				"sf",
				"horror",
				"crime",
				"lit",
				"hist",
				"rom",
				"short",
				"ya"
			],
			"exemplar": "The Great Gatsby; The Bell Jar; The Secret Garden",
			"note": "The commonest literary shape. The adjective sets tone, the noun sets subject; choose the adjective for sound as much as sense."
		},
		{
			"id": "a-adj-noun",
			"family": "core",
			"label": "A [Adjective] [Noun]",
			"templates": [
				"{adj|a} {noun}",
				"{adj|a} {abstract}",
				"{noun|a} of {abstract}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"rom",
				"short",
				"sf"
			],
			"exemplar": "A Clockwork Orange; An American Tragedy",
			"note": "The indefinite article makes it one instance of a larger world — good for a first book, or a story offered as a kind of story."
		},
		{
			"id": "stacked-modifiers",
			"family": "core",
			"label": "The [Adjective] [Adjective] [Noun]",
			"templates": [
				"The {adj#1} {adj#2} {noun}",
				"The {colour} {adj} {noun}"
			],
			"weight": 1,
			"genres": [
				"epic",
				"horror",
				"lit",
				"hist"
			],
			"exemplar": "The Curious Case of Benjamin Button",
			"note": "Denser and more ornate. Tips comic or Gothic depending on which adjective leads."
		},
		{
			"id": "the-plural",
			"family": "core",
			"label": "The [Plural Noun]",
			"templates": [
				"The {group}",
				"The {adj} {kin}s",
				"The {noun}s"
			],
			"weight": 2,
			"genres": [
				"epic",
				"sf",
				"lit",
				"hist",
				"horror",
				"ya"
			],
			"exemplar": "The Hunger Games; The Brothers Karamazov; The Corrections",
			"note": "Collective scope. A system or a family rather than a single thing."
		},
		{
			"id": "of-the",
			"family": "of",
			"label": "The [Noun] of the [Noun]",
			"templates": [
				"The {noun#1} of the {noun#2}",
				"The {title} of the {group}",
				"The {noun} of the {adj} {noun#2}"
			],
			"weight": 5,
			"genres": [
				"epic",
				"hist",
				"lit",
				"horror",
				"sf",
				"ya"
			],
			"exemplar": "The Lord of the Rings; The Name of the Rose",
			"note": "The default epic shape. Grand and hierarchical: the \"of\" implies dominion, and dominion implies stakes."
		},
		{
			"id": "a-of-and",
			"family": "of",
			"label": "A [Noun] of [Noun] and [Noun]",
			"templates": [
				"A {taleWord} of {symbol#1} and {symbol#2}",
				"A {noun} of {abstract#1} and {abstract#2}",
				"A {taleWord} of {abstract} and {symbol}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"lit",
				"rom",
				"ya"
			],
			"exemplar": "A Song of Ice and Fire; A Tale of Two Cities",
			"note": "The softer, more lyrical cousin — a fragment of something larger. The two paired nouns should not be synonyms."
		},
		{
			"id": "bare-of",
			"family": "of",
			"label": "[Noun] of [Noun] (no article)",
			"templates": [
				"{noun} of {abstract}",
				"Of {noun}s and {noun#2}s",
				"{symbol} of {abstract}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"epic",
				"short",
				"hist"
			],
			"exemplar": "Of Mice and Men; Heart of Darkness; Lord of the Flies",
			"note": "Terser, biblical, aphoristic. Dropping the article ages the title by a century."
		},
		{
			"id": "role-of-place",
			"family": "of",
			"label": "[Role] of [Place]",
			"templates": [
				"The {title} of {place}",
				"The {role|title} of {place}",
				"The {title} of {kingdom}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"hist",
				"lit"
			],
			"exemplar": "The Wizard of Oz; The Merchant of Venice; Lawrence of Arabia",
			"note": "Ties a figure to a domain. Classic for legends, and it does a lot of worldbuilding in four words."
		},
		{
			"id": "number-of-abstract",
			"family": "of",
			"label": "[Number] [Time-unit] of [Abstract]",
			"templates": [
				"{number} {shortTime|title}s of {abstract}",
				"{number} {era}s of {abstract}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"epic",
				"hist",
				"sf"
			],
			"exemplar": "One Hundred Years of Solitude",
			"note": "A span of time measured out in one emotion. The larger the number, the more mythic."
		},
		{
			"id": "name-poss",
			"family": "poss",
			"label": "[Name]'s [Noun]",
			"templates": [
				"{name}'s {noun}",
				"{name}'s {adj} {noun}",
				"{name}'s {object}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"rom",
				"hist",
				"crime",
				"short",
				"ya"
			],
			"exemplar": "Sophie's Choice; Charlotte's Web; Ender's Game",
			"note": "Anchors everything to one owner. Intimate and character-forward, and it makes the reader want to meet them."
		},
		{
			"id": "role-poss",
			"family": "poss",
			"label": "The [Role]'s [Noun]",
			"templates": [
				"The {role}'s {kin}",
				"The {role}'s {object}",
				"The {title}'s {noun}"
			],
			"weight": 4,
			"genres": [
				"lit",
				"hist",
				"epic",
				"rom",
				"horror"
			],
			"exemplar": "The Handmaid's Tale; The Time Traveler's Wife; The Zookeeper's Wife",
			"note": "Occupation plus relation or object. Quietly evocative, and the workhorse of the literary shelf."
		},
		{
			"id": "pronoun-poss",
			"family": "poss",
			"label": "[My/Her/Our] [Noun]",
			"templates": [
				"{possessive} {adj} {kin}",
				"{possessive} {noun} of {abstract}",
				"{possessive} {adj} {abstract}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"rom",
				"hist",
				"sf",
				"short",
				"ya"
			],
			"exemplar": "My Brilliant Friend; His Dark Materials; Our Man in Havana",
			"note": "Instantly relational. The pronoun sets a point of view before the story starts."
		},
		{
			"id": "noun-and-noun",
			"family": "pair",
			"label": "[Noun] and [Noun]",
			"templates": [
				"{abstract#1} and {abstract#2}",
				"{noun#1} and {noun#2}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"hist",
				"rom",
				"epic"
			],
			"exemplar": "Pride and Prejudice; Crime and Punishment; War and Peace",
			"note": "Thesis and antithesis. The two terms should pull against each other, not agree."
		},
		{
			"id": "the-and-the",
			"family": "pair",
			"label": "The [Noun] and the [Noun]",
			"templates": [
				"The {noun#1} and the {noun#2}",
				"The {person} and the {animal}",
				"The {adj} and the {adj#2}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"epic",
				"hist",
				"horror",
				"ya"
			],
			"exemplar": "The Old Man and the Sea; The Sound and the Fury; The Quick and the Dead",
			"note": "The same tension with articles: more concrete, more mythic, and it scans better aloud."
		},
		{
			"id": "triad",
			"family": "pair",
			"label": "The [Adj], the [Adj] and the [Adj]",
			"templates": [
				"The {adj#1}, the {adj#2} and the {adj#3}",
				"{noun#1}, {noun#2} and {noun#3}"
			],
			"weight": 1,
			"genres": [
				"epic",
				"crime",
				"hist"
			],
			"exemplar": "The Good, the Bad and the Ugly",
			"note": "Triadic and rhythmic. Nearly always reads as ironic or filmic, so use it knowingly."
		},
		{
			"id": "ampersand",
			"family": "pair",
			"label": "[Name] & [Name]",
			"templates": [
				"{name#1} & {name#2}",
				"{honorific} {name#1} & {honorific#2} {name#2}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"rom",
				"crime",
				"hist"
			],
			"exemplar": "Thelma & Louise; Jonathan Strange & Mr Norrell",
			"note": "The ampersand reads as billing — a partnership, and usually a double act."
		},
		{
			"id": "dilemma",
			"family": "pair",
			"label": "[Noun] or [Noun]",
			"templates": [
				"{abstract#1} or {abstract#2}",
				"{pastPart|title} or {pastPart#2|title}"
			],
			"weight": 1,
			"genres": [
				"crime",
				"horror",
				"sf",
				"epic"
			],
			"exemplar": "Dead or Alive; Kill or Be Killed",
			"note": "A binary posed as a threat. The ultimatum shape."
		},
		{
			"id": "the-noun-in-the",
			"family": "prep",
			"label": "The [Noun] in the [Noun]",
			"templates": [
				"The {person} in the {noun}",
				"The {kin} in the {adj} {noun}",
				"The {object} in {place}"
			],
			"weight": 4,
			"genres": [
				"lit",
				"horror",
				"crime",
				"hist",
				"short",
				"ya"
			],
			"exemplar": "The Girl on the Train; The Man in the High Castle; The Cat in the Hat",
			"note": "Places a figure precisely. Quiet, cinematic, and faintly unsettling because the pairing is never quite ordinary."
		},
		{
			"id": "lead-preposition",
			"family": "prep",
			"label": "In / Under / Beyond / Across + [Noun]",
			"templates": [
				"In {abstract}",
				"Under the {noun}",
				"Beyond the {noun}",
				"Across {place}",
				"Through the {adj} {noun}",
				"Into the {noun}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"sf",
				"epic",
				"horror",
				"hist"
			],
			"exemplar": "On the Road; In Cold Blood; Under the Volcano; Into the Wild",
			"note": "Leads with a spatial frame, so it feels like being dropped mid-scene rather than introduced."
		},
		{
			"id": "extended-preposition",
			"family": "prep",
			"label": "Before / After / Between / Without / Against",
			"templates": [
				"Before the {noun}",
				"After the {noun}",
				"Between {place#1} and {place#2}",
				"{noun} Without {abstract}",
				"Against the {adj} {noun}",
				"Over the {noun}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"sf",
				"horror",
				"crime",
				"epic"
			],
			"exemplar": "Between the World and Me; The Man Without Qualities; Against the Day",
			"note": "Each preposition tells a different story: before is a countdown, after is a long tail, between is liminality, without is loss, against is defiance."
		},
		{
			"id": "with-companion",
			"family": "prep",
			"label": "The [Person] with the [Object]",
			"templates": [
				"The {person} with the {object}",
				"The {kin} with the {adj} {object}",
				"The {person} with No {noun}"
			],
			"weight": 2,
			"genres": [
				"crime",
				"lit",
				"horror",
				"short"
			],
			"exemplar": "The Girl with the Dragon Tattoo; The Girl with All the Gifts",
			"note": "One defining possession stands in for a whole character. Works because the reader immediately asks why that object."
		},
		{
			"id": "imperative",
			"family": "verb",
			"label": "[Verb] the [Noun]",
			"templates": [
				"{verb|title} the {noun}",
				"{verb|title} the {title}",
				"{verb|title} {place}"
			],
			"weight": 3,
			"genres": [
				"crime",
				"horror",
				"epic",
				"sf",
				"ya"
			],
			"exemplar": "Kill Bill; Get Out; Bring Up the Bodies",
			"note": "Punchy and urgent. An order shouted at someone off-page."
		},
		{
			"id": "gerund-object",
			"family": "verb",
			"label": "[Gerund] [Object]",
			"templates": [
				"{gerund|title} {name}",
				"{gerund|title} the {noun}",
				"{gerund|title} {abstract}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"rom",
				"short",
				"crime"
			],
			"exemplar": "Finding Nemo; Saving Private Ryan; Educating Rita",
			"note": "Ongoing action. Reads as a process or a quest rather than an event."
		},
		{
			"id": "negative-imperative",
			"family": "verb",
			"label": "Don't / Never [Verb]",
			"templates": [
				"Don't {verb|title} the {noun}",
				"Never {verb|title} a {person}",
				"Don't {verb|title} for {name}"
			],
			"weight": 2,
			"genres": [
				"horror",
				"crime",
				"lit",
				"ya"
			],
			"exemplar": "Don't Look Now; Never Let Me Go",
			"note": "A prohibition creates instant dread, because a rule stated in a title is a rule the story will break."
		},
		{
			"id": "verb-manner",
			"family": "verb",
			"label": "[Verb] [Manner]",
			"templates": [
				"{verb|title} {manner}",
				"{verb|title} It {manner}"
			],
			"weight": 1,
			"genres": [
				"crime",
				"sf",
				"horror"
			],
			"exemplar": "Die Hard; Get Shorty; Sleep Tight",
			"note": "Compressed and forceful. The adverb does all the work."
		},
		{
			"id": "aphorism",
			"family": "verb",
			"label": "The [Noun] Always / Never [Verb]",
			"templates": [
				"The {noun} Always {strikeVerb}",
				"The {group} Never {verb}",
				"The {noun} Also {strikeVerb}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"crime",
				"horror",
				"epic"
			],
			"exemplar": "The Sun Also Rises; The Postman Always Rings Twice; The Dead Don't Die",
			"note": "Reads like a proverb or a warning, which lends the book an authority it has not yet earned."
		},
		{
			"id": "who-clause",
			"family": "clause",
			"label": "The [Person] Who [Verb]",
			"templates": [
				"The {person} Who {pastVerb}",
				"The {role} Who {pastVerb}",
				"The {adj} {person} Who {pastVerb}"
			],
			"weight": 4,
			"genres": [
				"lit",
				"epic",
				"crime",
				"horror",
				"short",
				"ya"
			],
			"exemplar": "The Man Who Fell to Earth; The Ones Who Walk Away from Omelas",
			"note": "Defines someone by a single act and withholds their name. The hook is that you want the rest of the sentence."
		},
		{
			"id": "that-clause",
			"family": "clause",
			"label": "The [Noun] That [Verb]",
			"templates": [
				"The {noun} That {pastVerb}",
				"The {object} That {pastVerb}",
				"{placeBare} That {pastVerb}"
			],
			"weight": 2,
			"genres": [
				"horror",
				"lit",
				"sf",
				"short"
			],
			"exemplar": "The Thing That Wouldn't Die",
			"note": "The same move applied to an object or a place, which is how a thing becomes an antagonist."
		},
		{
			"id": "overreaching",
			"family": "clause",
			"label": "The [Adj] [Noun] of the [Noun] in the [Noun]",
			"templates": [
				"The {adj} {abstract} of the {animal} in {time}",
				"The {adj} {noun} of the {role} of {place}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"short",
				"hist"
			],
			"exemplar": "The Curious Incident of the Dog in the Night-Time",
			"note": "Whimsical and memorable precisely because it overreaches. One per book, at most."
		},
		{
			"id": "question",
			"family": "question",
			"label": "Who / What / Where + [clause]?",
			"templates": [
				"What Happened to {name}?",
				"Who {pastVerb} for {name}?",
				"Where Did {name} Go?",
				"Why Did the {role} {verb}?"
			],
			"weight": 2,
			"genres": [
				"crime",
				"horror",
				"lit",
				"short",
				"ya"
			],
			"exemplar": "Who's Afraid of Virginia Woolf?; Do Androids Dream of Electric Sheep?",
			"note": "A question is a hook you cannot decline. Keep it answerable, or it reads as a tease."
		},
		{
			"id": "statement-question",
			"family": "question",
			"label": "Where / When + [clause]",
			"templates": [
				"Where the {animal}s {strikeVerb}",
				"When {name} {pastVerb}",
				"Where the {adj} {noun}s Are"
			],
			"weight": 2,
			"genres": [
				"lit",
				"short",
				"rom",
				"epic",
				"ya"
			],
			"exemplar": "Where the Wild Things Are; When Harry Met Sally; Where the Crawdads Sing",
			"note": "The question word without the question mark. Softer, more lyrical, and it promises a place rather than an answer."
		},
		{
			"id": "direct-address",
			"family": "question",
			"label": "Direct address",
			"templates": [
				"Dear {name}",
				"{name}, Come Home",
				"Forgive Me, {name}",
				"Are You There, {name}?"
			],
			"weight": 1,
			"genres": [
				"lit",
				"rom",
				"short",
				"crime"
			],
			"exemplar": "Dear John; Are You There God? It's Me, Margaret",
			"note": "The letter form. Intimate, and it casts the reader as the addressee whether they like it or not."
		},
		{
			"id": "honorific-name",
			"family": "name",
			"label": "[Honorific] [Name]",
			"templates": [
				"{honorific} {name}",
				"{honorific} {name} and the {noun}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"crime",
				"hist",
				"horror",
				"short"
			],
			"exemplar": "Mrs. Dalloway; Doctor Faustus; Dr. No",
			"note": "The honorific supplies class, era, or irony in a single word."
		},
		{
			"id": "name-epithet",
			"family": "name",
			"label": "[Name] the [Epithet]",
			"templates": [
				"{name} the {epithet}",
				"{name} {epithet}"
			],
			"weight": 2,
			"genres": [
				"epic",
				"hist",
				"horror",
				"ya"
			],
			"exemplar": "Conan the Barbarian; Ivan the Terrible",
			"note": "Folkloric and legendary. Good for founders and villains, and it implies the story is already famous."
		},
		{
			"id": "appositive",
			"family": "name",
			"label": "[Name], [Descriptor]",
			"templates": [
				"{name}, {role|title}",
				"{name}, {pastPart|title}",
				"I, {name}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"hist",
				"sf",
				"short"
			],
			"exemplar": "Girl, Interrupted; I, Claudius; Bartleby, the Scrivener",
			"note": "The comma does the work of a whole clause. Declarative and self-defining."
		},
		{
			"id": "life-of-name",
			"family": "name",
			"label": "The [Adventures/Life] of [Name]",
			"templates": [
				"The {taleWord|title} of {name}",
				"The Life and Death of {name}",
				"The {taleWord|title} of {honorific} {name}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"hist",
				"epic",
				"short"
			],
			"exemplar": "The Adventures of Huckleberry Finn; The Life of Pi",
			"note": "Biography-shaped. Promises a whole life, and the \"Life and Death of\" variant promises the ending too."
		},
		{
			"id": "bare-place",
			"family": "place",
			"label": "[Place]",
			"templates": [
				"{place}",
				"{adj|title} {placeBare}",
				"{kingdom}"
			],
			"weight": 2,
			"genres": [
				"epic",
				"hist",
				"lit",
				"horror",
				"sf",
				"ya"
			],
			"exemplar": "Wuthering Heights; Bleak House; Cold Mountain; Cannery Row",
			"note": "Setting as the whole promise. Works when the place is strange enough to carry the book on its own."
		},
		{
			"id": "bounded-space",
			"family": "place",
			"label": "The [House/Garden] of [Noun]",
			"templates": [
				"The House of {abstract}",
				"The {adj} Garden",
				"The Room of {noun}s",
				"The House of the {group}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"horror",
				"hist",
				"rom"
			],
			"exemplar": "The House of Mirth; The House of the Spirits; The Secret Garden",
			"note": "A domestic or bounded space turned symbolic. The smaller the room, the larger the theme."
		},
		{
			"id": "number-noun",
			"family": "number",
			"label": "[Number] [Noun]",
			"templates": [
				"{number} {adj|title} {person}s",
				"{number} {noun}s",
				"{number} {shortTime|title}s in {placeBare}"
			],
			"weight": 2,
			"genres": [
				"crime",
				"sf",
				"lit",
				"hist",
				"ya"
			],
			"exemplar": "Twelve Angry Men; Twelve Years a Slave; Slaughterhouse-Five",
			"note": "A concrete count reads documentary or high-concept. Odd numbers sound more deliberate than even ones."
		},
		{
			"id": "quantifier",
			"family": "number",
			"label": "[All/No/Nothing] + [clause]",
			"templates": [
				"{quantAll} the {title}'s {kin}s",
				"No Country for {adj} {person}s",
				"Nothing but {noun}",
				"{quantAll} the {noun} We Cannot {verb}",
				"{quantNo} to {verb}",
				"{quantNo} {pastVerb} for {name}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"epic",
				"crime",
				"hist",
				"ya"
			],
			"exemplar": "All the King's Men; No Country for Old Men; All the Light We Cannot See",
			"note": "Absolutes. Sweeping and thematic, and they promise the book has an argument."
		},
		{
			"id": "rise-of",
			"family": "event",
			"label": "Rise / Return / Revenge of the [Noun]",
			"templates": [
				"{riseFall|title} of the {group}",
				"The {riseFall|title} of {kingdom}",
				"Return of the {title}",
				"Revenge of the {group}",
				"Night of the {adj} {person}s"
			],
			"weight": 3,
			"genres": [
				"epic",
				"sf",
				"horror",
				"hist",
				"ya"
			],
			"exemplar": "Return of the Jedi; Night of the Living Dead; The Day of the Jackal",
			"note": "Momentum-driven and sequel-friendly. Genre-loud by design — this shape does not whisper."
		},
		{
			"id": "strikes-back",
			"family": "event",
			"label": "The [Noun] [Rises/Falls]",
			"templates": [
				"The {group} {strikeVerb}",
				"{kingdom} {strikeVerb}",
				"The {adj} {noun} {strikeVerb}"
			],
			"weight": 2,
			"genres": [
				"epic",
				"sf",
				"hist",
				"horror",
				"ya"
			],
			"exemplar": "The Empire Strikes Back; The Dark Knight Rises",
			"note": "Subject and verb, nothing else. The bare present tense makes it sound like it is happening now."
		},
		{
			"id": "colour-noun",
			"family": "modifier",
			"label": "[Colour] [Noun]",
			"templates": [
				"The {colour|title} {noun}",
				"The {person|title} in {colour|title}",
				"The {colour|title} {animal}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"horror",
				"hist",
				"rom",
				"short",
				"ya"
			],
			"exemplar": "The Scarlet Letter; The Woman in White; The Bluest Eye",
			"note": "Colour carries mood and symbol at once, and it is the cheapest way to make an ordinary noun strange."
		},
		{
			"id": "weather-noun",
			"family": "modifier",
			"label": "[Time/Weather] + [Noun]",
			"templates": [
				"The {weather|title} of {place}",
				"{season} {noun}",
				"The {noun} of {time}",
				"{weather|title} over {place}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"epic",
				"hist",
				"horror",
				"short"
			],
			"exemplar": "Tender Is the Night; The Remains of the Day; The Snows of Kilimanjaro",
			"note": "A temporal or meteorological frame lends elegy or menace without naming either."
		},
		{
			"id": "asyndeton",
			"family": "list",
			"label": "[Noun] [Noun] [Noun] [Noun]",
			"templates": [
				"{role|title} {role#2|title} {role#3|title} {role#4|title}",
				"{abstract#1|title}, {abstract#2|title}, {abstract#3|title}",
				"{verb#1|title}, {verb#2|title}, {verb#3|title}"
			],
			"weight": 1,
			"genres": [
				"crime",
				"lit",
				"short",
				"sf"
			],
			"exemplar": "Tinker Tailor Soldier Spy; Eat, Pray, Love; Sex, Lies, and Videotape",
			"note": "Rhythmic enumeration, catalogue-like and faintly incantatory. Four beats is the sweet spot."
		},
		{
			"id": "colon-subtitle",
			"family": "subtitle",
			"label": "[Title]: [Subtitle]",
			"templates": [
				"{place}: A {season} {riseFall|title}",
				"{kingdom}: The {adj} {noun}",
				"The {noun}: {taleWord|title} of {kingdom}"
			],
			"weight": 2,
			"genres": [
				"epic",
				"sf",
				"crime",
				"hist",
				"ya"
			],
			"exemplar": "Star Wars: A New Hope; Dr. Strangelove: or How I Learned to Stop Worrying",
			"note": "A hook you can abbreviate to, plus a second beat that explains or undercuts it."
		},
		{
			"id": "archaic-or",
			"family": "subtitle",
			"label": "[Title]; or, [Alternative]",
			"templates": [
				"{name}; or, The {adj} {noun}",
				"The {noun}; or, {abstract}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"hist",
				"horror"
			],
			"exemplar": "Moby-Dick; or, The Whale; Frankenstein; or, The Modern Prometheus",
			"note": "Old-fashioned and wry. The second title is usually the honest one."
		},
		{
			"id": "series-word",
			"family": "subtitle",
			"label": "The [Name] [Chronicles/Saga]",
			"templates": [
				"{placeBare} {seriesWord}",
				"The {kingdom} {seriesWord}",
				"The {adj} {noun} {countWord}",
				"The {title} {storyWord}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"sf",
				"crime",
				"hist",
				"lit",
				"ya"
			],
			"exemplar": "The Chronicles of Narnia; The Dresden Files; The Southern Reach Trilogy",
			"note": "Signals a series and a world. Chronicles suggests history, Files suggests episodes, Saga suggests generations, Trilogy promises an end."
		},
		{
			"id": "how-to",
			"family": "guide",
			"label": "How to [Verb] [Object]",
			"templates": [
				"How to {verb|title} a {noun}",
				"How to {verb|title} in {place}",
				"How Not to {verb|title} a {title}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"sf",
				"short",
				"rom"
			],
			"exemplar": "How to Train Your Dragon",
			"note": "An instructional frame, and almost always ironic when the book is fiction."
		},
		{
			"id": "art-of",
			"family": "guide",
			"label": "The Art of [Noun]",
			"templates": [
				"The Art of {gerund|title}",
				"The Art of {abstract}",
				"A {role}'s Guide to {abstract}",
				"The {role}'s Guide to {place}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"sf",
				"epic",
				"short"
			],
			"exemplar": "The Art of War; The Hitchhiker's Guide to the Galaxy",
			"note": "Mock-authoritative. The gap between the confident frame and the absurd subject is the joke."
		},
		{
			"id": "bare-abstract",
			"family": "abstract",
			"label": "[Abstract Noun]",
			"templates": [
				"{abstract|title}",
				"The {adj} {abstract} of {noun}",
				"The {abstract|title} of the {role}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"hist",
				"rom",
				"short"
			],
			"exemplar": "Atonement; Persuasion; Beloved; The Unbearable Lightness of Being",
			"note": "A concept as the whole title. Spare and thematic, and it dares the reader to find it pretentious."
		},
		{
			"id": "declarative",
			"family": "sentence",
			"label": "Full declarative sentence",
			"templates": [
				"There Will Be {abstract}",
				"The {group} Do Not {verb}",
				"Everything Is {pastPart|title}",
				"Nobody {pastVerb} for {name}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"sf",
				"horror",
				"crime",
				"ya"
			],
			"exemplar": "There Will Be Blood; Everything Is Illuminated; Their Eyes Were Watching God",
			"note": "A flat statement of fact or prophecy. Ominous precisely because it does not elaborate."
		},
		{
			"id": "conditional",
			"family": "sentence",
			"label": "If [clause]",
			"templates": [
				"If {name} Could {verb}",
				"If the {noun} {strikeVerb}",
				"If I {verb} {abstract}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"rom",
				"sf",
				"short",
				"ya"
			],
			"exemplar": "If Beale Street Could Talk; If on a Winter's Night a Traveller",
			"note": "Opens a hypothetical. Wistful or plaintive, and it implies the answer is no."
		},
		{
			"id": "temporal-clause",
			"family": "sentence",
			"label": "When / While / As [clause]",
			"templates": [
				"When We Were {pastPart|title}",
				"While {name} {pastVerb}",
				"As the {noun} {strikeVerb}",
				"When the {group} {strikeVerb}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"hist",
				"rom",
				"short"
			],
			"exemplar": "When We Were Orphans; While You Were Sleeping; As I Lay Dying",
			"note": "Frames the story against a moment in progress. Durative and retrospective."
		},
		{
			"id": "conjunction-opener",
			"family": "sentence",
			"label": "So / And / But + [clause]",
			"templates": [
				"And Then There Were {number}",
				"So Long, and Thanks for the {noun}",
				"But the {noun} {strikeVerb}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"crime",
				"short",
				"sf"
			],
			"exemplar": "And Then There Were None; So Long, and Thanks for All the Fish",
			"note": "Starting on a connective mimics speech mid-flow. Casual and disarming, and slightly rude."
		},
		{
			"id": "how-clause",
			"family": "sentence",
			"label": "How [subject] [verb] [object]",
			"templates": [
				"How {name} {pastVerb}",
				"How the {group} {pastVerb}",
				"How Green Was {place}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"hist",
				"short",
				"rom"
			],
			"exemplar": "How Stella Got Her Groove Back; How the Grinch Stole Christmas",
			"note": "Promises the story of how something came to pass, which is a promise of an anecdote rather than a plot."
		},
		{
			"id": "past-participle",
			"family": "participle",
			"label": "[Past Participle] [Noun]",
			"templates": [
				"{pastPart|title} {kin|title}",
				"The {pastPart} {noun}",
				"{pastPart|title} {name}"
			],
			"weight": 3,
			"genres": [
				"crime",
				"horror",
				"lit",
				"epic",
				"ya"
			],
			"exemplar": "Gone Girl; Buried Child; Unbroken; Beloved",
			"note": "Something has already happened and the book opens in the aftermath. Strong for crime, horror and elegy."
		},
		{
			"id": "participle-by",
			"family": "participle",
			"label": "[Past Participle] by [Noun]",
			"templates": [
				"{pastPart|title} by the {group}",
				"{pastPart|title} by {abstract}",
				"{pastPart|title} by {place}"
			],
			"weight": 1,
			"genres": [
				"horror",
				"crime",
				"lit",
				"sf"
			],
			"exemplar": "Possessed by Shadows",
			"note": "Names what did the acting. The least attested of the participle shapes, and the closest to melodrama — handle carefully."
		},
		{
			"id": "road-to",
			"family": "journey",
			"label": "The Road to [Place]",
			"templates": [
				"The {adj} Road to {place}",
				"The Way of the {group}",
				"The Long {noun} to {place}",
				"Voyage of the {adj} {animal}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"sf",
				"lit",
				"hist",
				"ya"
			],
			"exemplar": "The Road to Wigan Pier; The Way of Kings; The Voyage of the Dawn Treader",
			"note": "Motion as the spine of the story. Quests, exiles and returns all live here."
		},
		{
			"id": "return-to",
			"family": "journey",
			"label": "Return to [Place]",
			"templates": [
				"Return to {place}",
				"Escape from {place}",
				"Back to {kingdom}",
				"Flight from {place}"
			],
			"weight": 2,
			"genres": [
				"sf",
				"crime",
				"lit",
				"epic"
			],
			"exemplar": "Return to Oz; Escape from New York",
			"note": "Implies a prior story and an emotional debt. Do not use it for a first book unless the debt is the point."
		},
		{
			"id": "tale-of",
			"family": "tale",
			"label": "The [Song/Ballad/Chronicle] of [Name]",
			"templates": [
				"The {taleWord|title} of {name}",
				"The {taleWord|title} of the {title}",
				"The {taleWord|title} of {kingdom}"
			],
			"weight": 4,
			"genres": [
				"epic",
				"hist",
				"lit",
				"short",
				"ya"
			],
			"exemplar": "The Song of Achilles; The Ballad of Songbirds and Snakes; The Book of Dust",
			"note": "Frames the work as record or legend, which makes it feel older than it is."
		},
		{
			"id": "last-first",
			"family": "lastfirst",
			"label": "The Last [Noun] of [Place]",
			"templates": [
				"The {ordinal} {noun} of {place}",
				"The {ordinal} {title} of {kingdom}",
				"The {ordinal} {person} Who {pastVerb}",
				"The {ordinal} {adj} {noun}"
			],
			"weight": 4,
			"genres": [
				"epic",
				"sf",
				"lit",
				"hist",
				"horror",
				"ya"
			],
			"exemplar": "The Last of the Mohicans; The Last Unicorn; The Only Story",
			"note": "Superlatives of finality. Extraordinarily productive in speculative fiction, where \"last\" carries a whole world."
		},
		{
			"id": "age-of",
			"family": "temporal",
			"label": "The [Age/Year] of [Noun]",
			"templates": [
				"The {era} of {abstract}",
				"The {era} of the {group}",
				"The {era} of {kingdom}"
			],
			"weight": 3,
			"genres": [
				"epic",
				"sf",
				"hist",
				"lit",
				"ya"
			],
			"exemplar": "The Age of Innocence; The Year of Magical Thinking",
			"note": "\"The Age of\" mythologises an era in three words, which is why worldbuilders reach for it so often."
		},
		{
			"id": "one-night",
			"family": "temporal",
			"label": "One [Day/Night/Summer]",
			"templates": [
				"One {shortTime|title} in {place}",
				"The {shortTime|title} of the {animal}",
				"The Year of the {animal}",
				"One {season} in {kingdom}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"hist",
				"rom",
				"short"
			],
			"exemplar": "One Day; The Night Circus; A Midsummer Night's Dream",
			"note": "Pins the story to a span. The shorter the span, the more pressure the title implies."
		},
		{
			"id": "absence",
			"family": "negative",
			"label": "No / Never / Nothing + [Noun]",
			"templates": [
				"No {abstract} for the {role}",
				"{quantNo} but {abstract}",
				"The {noun} Without a {noun#2}",
				"No Longer {adj|title}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"crime",
				"horror",
				"epic",
				"ya"
			],
			"exemplar": "No Country for Old Men; Nothing to Envy; No Longer Human",
			"note": "Defines the story by what is missing. Bleak, ironic, or defiant depending on the noun."
		},
		{
			"id": "reference-work",
			"family": "reference",
			"label": "The [Book/Field Guide] of [Noun]",
			"templates": [
				"The {refWord} of {abstract}",
				"The {refWord} of {kingdom}",
				"A {refWord} to the {group}"
			],
			"weight": 2,
			"genres": [
				"lit",
				"sf",
				"epic",
				"hist"
			],
			"exemplar": "The Dictionary of the Khazars; The Anatomy of Melancholy",
			"note": "Borrows the shape of a reference work. Playful, systematic, or mock-authoritative."
		},
		{
			"id": "listicle",
			"family": "reference",
			"label": "[Number] Reasons / Things / Ways",
			"templates": [
				"{number} Reasons the {role} {pastVerb}",
				"{number} Things We {pastVerb} in {place}",
				"{number} Ways to {verb|title} a {noun}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"crime",
				"short",
				"rom"
			],
			"exemplar": "Thirteen Reasons Why; Things We Lost in the Fire",
			"note": "The listicle shape, which sounds contemporary and slightly glib — useful when that is the voice."
		},
		{
			"id": "oxymoron",
			"family": "rhetoric",
			"label": "Oxymoron — [Warm Adj] [Cold Noun]",
			"templates": [
				"The {warmAdj|title} {coldNoun}",
				"{warmAdj|title} {coldNoun}",
				"A {warmAdj} {coldNoun}"
			],
			"weight": 2,
			"genres": [
				"horror",
				"crime",
				"lit",
				"sf",
				"ya"
			],
			"exemplar": "True Lies; Eyes Wide Shut; The Beautiful and Damned",
			"note": "Two clashing terms yoked together. The reader cannot resolve it without reading the book, which is the whole trick."
		},
		{
			"id": "metaphor",
			"family": "rhetoric",
			"label": "Metaphor — the [Symbol] of [Abstract]",
			"templates": [
				"The {symbol|title} of {abstract}",
				"The {object} of {abstract}",
				"The {symbol|title} {noun}"
			],
			"weight": 3,
			"genres": [
				"lit",
				"epic",
				"horror",
				"short",
				"ya"
			],
			"exemplar": "The Bell Jar; The Grapes of Wrath; Wolf Hall; Cloud Atlas",
			"note": "A concrete image standing in for the theme. The reader decodes it as they read, which is a pleasure in itself."
		},
		{
			"id": "simile",
			"family": "rhetoric",
			"label": "Simile — [X] Like [Y]",
			"templates": [
				"{noun|title}s Like {adj|title} {animal}s",
				"Like {water|title} for {abstract}",
				"A {noun} Like {symbol|a}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"short",
				"rom",
				"horror"
			],
			"exemplar": "Hills Like White Elephants; Like Water for Chocolate",
			"note": "An explicit comparison. Evocative and often tender or strange, and it slows the title down in a good way."
		},
		{
			"id": "repetition",
			"family": "rhetoric",
			"label": "Repetition",
			"templates": [
				"{place#1}, {place#1}",
				"The {noun#1} and the {noun#1}",
				"{verb#1|title}, {verb#1|title} Again",
				"{abstract#1|title} upon {abstract#1|title}"
			],
			"weight": 1,
			"genres": [
				"lit",
				"sf",
				"short",
				"horror"
			],
			"exemplar": "New York, New York; Run Lola Run; Everything Everywhere All at Once",
			"note": "A word doubled. Hypnotic, urgent, or comic, and almost never neutral."
		},
		{
			"id": "exclamatory",
			"family": "rhetoric",
			"label": "Exclamatory — [phrase]!",
			"templates": [
				"{place}!",
				"{verb|title} the {noun}!",
				"{name}, {verb|title}!"
			],
			"weight": 1,
			"genres": [
				"short",
				"rom",
				"crime"
			],
			"exemplar": "Airplane!; Oklahoma!; Mamma Mia!",
			"note": "The mark itself supplies the energy. Reads as comedy or musical unless the phrase is genuinely alarming."
		},
		{
			"id": "detective-series",
			"family": "subtitle",
			"label": "[Detective] Mysteries",
			"templates": [
				"{title} Mysteries",
				"{honorific} {name} Mysteries",
				"{placeBare} Mysteries",
				"The {title} Investigations"
			],
			"genres": [
				"crime",
				"hist"
			],
			"weight": 2,
			"exemplar": "the Hercule Poirot mysteries",
			"note": "Named for the detective rather than the crime. Note that \"The X Mysteries\" is usually a reader or retailer label rather than the publisher's own title, so it belongs on the shelf more than the cover."
		},
		{
			"id": "series-simple",
			"family": "series",
			"label": "The [Noun]",
			"templates": [
				"The {noun}",
				"The {abstract}",
				"The {group}",
				"The {kingdom}"
			],
			"genres": [
				"epic",
				"sf",
				"horror",
				"hist",
				"rom",
				"ya"
			],
			"weight": 3,
			"exemplar": "The Belgariad; The Expanse; The Strain",
			"note": "The barest umbrella — one weighty noun. Reads as \"the one that matters\"; leans literary/SF. Nearly always takes \"The\"."
		},
		{
			"id": "series-compound",
			"family": "series",
			"label": "[Adjective] [Noun] / The [Adjective] [Noun]",
			"templates": [
				"The {adj} {noun}",
				"{adj} {noun}",
				"The {colour} {noun}",
				"{noun} {noun#2}",
				"The {noun} {noun#2}"
			],
			"genres": [
				"epic",
				"sf",
				"horror",
				"crime",
				"lit",
				"hist",
				"rom",
				"short",
				"ya"
			],
			"weight": 15,
			"exemplar": "The Stormlight Archive; Revelation Space; Cthulhu Mythos",
			"note": "The workhorse series shape (~half the corpus). Articled and bare forms are near-even in real series, so both are offered; pick the adjective for sound."
		},
		{
			"id": "series-of",
			"family": "series",
			"label": "The [Noun] of [Noun]",
			"templates": [
				"The {noun} of {noun#2}",
				"{noun|a} of {noun#2}",
				"{noun} of {place}",
				"{title} of {place}",
				"The {taleWord} of {name}",
				"{group} of {place}"
			],
			"genres": [
				"epic",
				"sf",
				"horror",
				"crime",
				"lit",
				"hist",
				"rom",
				"ya"
			],
			"weight": 5,
			"exemplar": "A Song of Ice and Fire; The Book of the New Sun; The Books of Blood",
			"note": "The of-genitive is iconic but a MINORITY in real series (~15%) — do not overweight it. The bare and \"A …\" forms matter (A Song of Ice and Fire)."
		},
		{
			"id": "series-pair",
			"family": "series",
			"label": "[Noun] and [Noun]",
			"templates": [
				"{noun} and {noun#2}",
				"The {noun} and the {noun#2}",
				"{name} and {name#2}",
				"{adj} and {adj#2}"
			],
			"genres": [
				"epic",
				"crime",
				"lit",
				"ya"
			],
			"weight": 1,
			"exemplar": "Memory, Sorrow, and Thorn; The Fast and the Furious; Jeeves and Wooster",
			"note": "Coordination — a pairing or a duo. Uncommon but distinctive; also the natural home for the ampersand pairing (Bryant & May)."
		},
		{
			"id": "series-name",
			"family": "series",
			"label": "[Character Name]",
			"templates": [
				"{name} {name#2}",
				"{honorific} {name}",
				"{name}"
			],
			"genres": [
				"epic",
				"sf",
				"horror",
				"crime",
				"lit",
				"hist",
				"ya"
			],
			"weight": 6,
			"exemplar": "James Bond; Harry Bosch; Hannibal Lecter",
			"note": "A recurring protagonist as the umbrella. In real series this is overwhelmingly crime/thriller (and comic) — hence its genre-eligibility, not a global default."
		},
		{
			"id": "series-marker",
			"family": "series",
			"label": "The [Noun] [Saga/Cycle/Chronicles/Files]",
			"templates": [
				"The {adj} {seriesWord}",
				"The {noun} {seriesWord}",
				"{name} {seriesWord}",
				"The {name} {countWord}",
				"The {storyWord} of {place}"
			],
			"genres": [
				"epic",
				"sf",
				"horror",
				"crime",
				"lit",
				"hist",
				"rom",
				"ya"
			],
			"weight": 6,
			"exemplar": "The Stormlight Archive; The Murderbot Diaries; The Best American Short Stories",
			"note": "The one genuinely series-specific shape: a trailing multi-work marker (Saga, Cycle, Chronicles, Files, Trilogy). A minority tail in the corpus — signals scope without being the norm."
		},
		{
			"id": "series-colon",
			"family": "series",
			"label": "[Name]: [Noun]",
			"templates": [
				"{name}: {noun}",
				"{noun}: {abstract}"
			],
			"genres": [
				"crime"
			],
			"weight": 1,
			"exemplar": "Mission: Impossible",
			"note": "Bipartite, colon-split — franchise/property register (Mission: Impossible). Rare in prose series; low weight."
		},
		{
			"id": "series-verb",
			"family": "series",
			"label": "[Verb] [Object]",
			"templates": [
				"{strikeVerb} Me",
				"{verb} the {noun}"
			],
			"genres": [
				"sf",
				"ya"
			],
			"weight": 1,
			"exemplar": "Shatter Me",
			"note": "Imperative/verbal — urgent, voice-forward (Shatter Me). Very rare as a series umbrella; low weight, YA-leaning."
		},
		{
			"id": "series-clause",
			"family": "series",
			"label": "How to [Verb] [Noun]",
			"templates": [
				"How to {verb} Your {noun}"
			],
			"genres": [
				"epic",
				"ya"
			],
			"weight": 1,
			"exemplar": "How to Train Your Dragon",
			"note": "A clause/how-to umbrella (How to Train Your Dragon). Very rare; children's/comic register; low weight."
		}
	],
	"lexicon": {
		"adj": [
			"seldom-seen #lit #hist #short",
			"half-remembered #lit #horror #short",
			"unlucky #crime #lit #short #ya",
			"obliging #lit #crime #rom",
			"implacable #epic #crime #sf",
			"sunlit #rom #lit #short",
			"threadbare #lit #hist #short",
			"mutinous #hist #sf #epic",
			"uncharted #sf #epic #ya",
			"sealed #crime #horror #sf #ya",
			"inherited #lit #hist #horror",
			"unfinished #lit #rom #short",
			"midnight #horror #crime #rom #ya",
			"dutiful #hist #rom #lit",
			"ravenous #horror #epic",
			"saltworn #epic #hist #sf",
			"lucky #crime #lit #short",
			"apostate #epic #hist #horror",
			"mislaid #lit #crime #short",
			"irreparable #lit #sf #crime",
			"last #epic #sf #lit #hist *3 #ya",
			"quiet #lit #horror #rom #short",
			"buried #epic #horror #crime #hist",
			"hollow #epic #horror #lit",
			"ashen #epic #horror",
			"distant #sf #lit #rom",
			"forgotten #epic #horror #hist #lit",
			"sacred #epic #hist #horror",
			"iron #epic #hist #sf",
			"pale #horror #lit #short",
			"long #lit #hist #epic",
			"broken #epic #crime #lit #rom #ya",
			"faithful #hist #rom #lit",
			"unquiet #horror #lit",
			"grey #lit #crime #short",
			"deep #sf #epic #horror",
			"patient #crime #horror #lit",
			"crooked #crime #lit #short",
			"borrowed #crime #lit #rom",
			"sunken #epic #horror #sf",
			"gilded #hist #rom #epic #ya",
			"bitter #lit #rom #hist #ya",
			"narrow #crime #lit #short",
			"vacant #sf #horror #crime",
			"sleepless #horror #crime #lit #ya",
			"tender #rom #lit #short",
			"ruinous #epic #hist",
			"wintering #epic #lit #hist",
			"nameless #epic #horror #sf #ya",
			"unspoken #rom #lit #short",
			"reluctant #rom #lit #crime #ya",
			"improper #rom #hist",
			"scandalous #rom #hist",
			"wayward #rom #lit #hist",
			"untitled #lit #short",
			"provincial #lit #hist",
			"salvaged #sf #crime",
			"recursive #sf",
			"derelict #sf #horror",
			"terminal #sf #crime #horror",
			"synthetic #sf",
			"unmapped #sf #epic",
			"orbital #sf",
			"lucid #sf #lit #horror",
			"brittle #lit #horror #short #ya",
			"ordinary #lit #short #crime",
			"sufficient #lit #short",
			"imperial #hist #epic #sf",
			"sovereign #hist #epic",
			"loyal #hist #epic #rom",
			"northern #hist #epic #crime",
			"feral #horror #epic #ya",
			"rotting #horror",
			"grinning #horror #crime",
			"weeping #horror #lit #rom",
			"hungry #horror #epic #lit #ya"
		],
		"colour": [
			"scarlet #hist #rom #lit",
			"crimson #horror #epic #rom #ya",
			"ashen #horror #epic #ya",
			"pale #horror #lit",
			"black #crime #horror #epic #ya",
			"white #lit #horror #short",
			"golden #hist #rom #epic",
			"grey #crime #lit #sf",
			"green #lit #short #epic",
			"blue #lit #rom #sf",
			"amber #sf #epic #lit",
			"russet #hist #lit",
			"indigo #sf #lit #rom",
			"bone-white #horror #epic #ya",
			"ochre #hist #lit",
			"silver #epic #sf #rom #ya"
		],
		"noun": [
			"quarantine #sf #horror #crime",
			"almshouse #hist #lit #horror",
			"scaffold #hist #horror #epic",
			"weir #lit #epic #short",
			"threnody #epic #lit #horror",
			"manifest #sf #crime #hist",
			"turnpike #hist #crime #lit",
			"apiary #lit #hist #short",
			"pilgrimage #epic #hist #lit",
			"recital #lit #rom #short",
			"dowry #hist #rom #epic",
			"quarry #crime #horror #hist",
			"ferry #lit #hist #short",
			"sanction #sf #crime #hist",
			"sluice #lit #horror #hist",
			"lighthouse #lit #horror #short",
			"armistice #hist #sf #epic",
			"tithe #epic #hist #horror",
			"allotment #lit #short #hist",
			"scrimshaw #hist #lit #sf",
			"watchtower #epic #sf #hist",
			"undercroft #horror #epic #hist",
			"granary #epic #hist",
			"warden #epic #hist #crime",
			"gate #epic #sf #hist",
			"hearth #epic #lit #rom #hist",
			"harvest #epic #hist #lit",
			"river #lit #epic #hist #short",
			"road #lit #epic #crime",
			"oath #epic #hist #rom #ya",
			"bell #epic #horror #lit",
			"wall #epic #hist #sf",
			"seed #epic #lit #sf",
			"ember #epic #horror #lit #ya",
			"ash #epic #horror #lit #ya",
			"keep #epic #hist",
			"field #hist #lit #short",
			"crown #epic #hist #rom #ya",
			"throne #epic #hist #ya",
			"covenant #epic #hist #horror",
			"reckoning #epic #crime #horror #ya",
			"lantern #epic #horror #lit",
			"compact #epic #sf #hist",
			"verdict #crime #hist #lit #ya",
			"bargain #epic #rom #crime #ya",
			"marches #epic #hist",
			"sword #epic #hist",
			"banner #epic #hist",
			"siege #epic #hist #ya",
			"ledger #crime #hist #lit",
			"tenant #crime #lit #horror",
			"inquest #crime #hist",
			"alibi #crime",
			"confession #crime #lit #rom #ya",
			"witness #crime #lit #ya",
			"debt #crime #rom #lit #hist #ya",
			"errand #crime #lit #short",
			"warrant #crime #hist",
			"signal #sf #crime",
			"cascade #sf",
			"threshold #sf #horror #epic",
			"archive #sf #lit #hist",
			"lattice #sf",
			"anomaly #sf #horror",
			"aperture #sf #horror",
			"relay #sf",
			"habitat #sf",
			"engine #sf #hist #epic",
			"station #sf #crime",
			"nursery #horror #lit",
			"cellar #horror #crime",
			"congregation #horror #hist",
			"appetite #horror #lit #rom",
			"vigil #horror #lit #hist",
			"hymn #horror #hist #lit",
			"fever #horror #lit #rom",
			"teeth #horror #short",
			"season #lit #rom #short",
			"letter #rom #hist #lit",
			"waltz #rom #hist",
			"promise #rom #lit",
			"courtship #rom #hist",
			"interval #lit #sf #short",
			"remainder #lit #short",
			"arrangement #lit #rom #short",
			"distance #lit #rom #sf",
			"habit #lit #short",
			"return #lit #epic #sf",
			"regiment #hist",
			"charter #hist #sf",
			"dynasty #hist #epic",
			"treaty #hist #sf",
			"mill #hist #lit",
			"estate #hist #lit #rom",
			"rebellion #hist #epic #sf #ya",
			"passage #hist #lit #sf",
			"threshing floor #epic #hist",
			"watchfire #epic #hist #horror",
			"furrow #hist #lit #epic",
			"toll #epic #crime #hist",
			"thresher #hist #epic #lit",
			"breakwater #lit #sf #horror",
			"coppice #lit #hist #epic",
			"stipend #hist #lit #crime",
			"reliquary #epic #hist #horror",
			"trial #ya #epic",
			"arena #ya #sf",
			"cohort #ya #sf",
			"uprising #ya #hist",
			"lottery #ya #horror",
			"curfew #ya #crime",
			"initiation #ya #epic",
			"cage #ya #horror",
			"scholarship #ya #lit"
		],
		"abstract": [
			"insomnia #horror #lit #sf",
			"gratitude #rom #lit #hist",
			"notoriety #crime #hist #rom",
			"symmetry #sf #lit #horror",
			"cowardice #hist #lit #epic #ya",
			"appetency #lit #horror",
			"credulity #crime #lit #hist",
			"stubbornness #lit #rom #hist #ya",
			"vertigo #sf #horror #lit",
			"homesickness #lit #sf #rom",
			"arithmetic #sf #crime #lit",
			"weather #lit #epic #short",
			"inheritance #lit #hist #rom",
			"diligence #hist #lit #crime",
			"temperance #hist #lit #rom",
			"mutiny #hist #sf #epic",
			"mercy #epic #lit #hist",
			"sorrow #lit #rom #epic",
			"ruin #epic #horror #hist",
			"honour #epic #hist #rom",
			"exile #epic #lit #hist #sf #ya",
			"silence #horror #lit #crime #short",
			"hunger #horror #lit #epic #ya",
			"faith #lit #hist #horror",
			"grief #lit #rom #short #ya",
			"oblivion #sf #horror #epic",
			"valour #epic #hist",
			"loyalty #epic #hist #rom #crime #ya",
			"reckoning #epic #crime",
			"patience #lit #rom #short",
			"appetite #horror #lit",
			"restraint #lit #rom #crime",
			"consequence #crime #lit #sf",
			"suspicion #crime #lit",
			"duty #hist #epic #rom",
			"longing #rom #lit #short #ya",
			"regret #rom #lit #crime #ya",
			"forgiveness #rom #lit #hist #ya",
			"inevitability #sf #crime #lit",
			"entropy #sf",
			"recursion #sf",
			"solitude #lit #sf #short",
			"tenderness #rom #lit #short",
			"disgrace #lit #hist",
			"atonement #lit #hist #rom",
			"persuasion #rom #hist #lit",
			"obligation #lit #hist #crime",
			"providence #hist #epic #horror",
			"dread #horror #crime #ya",
			"consolation #lit #rom #short",
			"defiance #ya #epic",
			"belonging #ya #lit",
			"notoriety #ya #crime"
		],
		"object": [
			"sextant #hist #sf #epic",
			"inkwell #hist #lit #short",
			"snuffbox #hist #crime #rom",
			"prosthetic hand #sf #horror #crime",
			"ledger stone #hist #horror #epic",
			"wax cylinder #hist #crime #sf",
			"sewing needle #lit #rom #horror",
			"bridle #epic #hist #lit",
			"census roll #hist #sf #crime",
			"tin whistle #lit #short #hist",
			"lantern #epic #horror #hist",
			"blade #epic #crime #hist #ya",
			"key #crime #lit #epic #ya",
			"crown #epic #hist",
			"ledger #crime #hist",
			"seal #epic #hist #crime",
			"loom #hist #lit #epic",
			"plough #hist #epic",
			"reliquary #epic #hist #horror",
			"compass #sf #epic #hist",
			"telescope #sf #hist #lit",
			"locket #rom #hist #horror #ya",
			"photograph #crime #lit #short #ya",
			"tape recorder #crime #sf",
			"mirror #horror #lit #rom",
			"music box #horror #rom #hist #ya",
			"kite #lit #short",
			"typewriter #lit #crime #hist",
			"wedding ring #rom #crime #lit",
			"signal flare #sf #crime #ya",
			"glass eye #horror #crime #short"
		],
		"symbol": [
			"tallow #hist #horror #lit",
			"lodestone #epic #sf #hist",
			"chalk #lit #horror #short",
			"amber #sf #epic #lit",
			"vellum #hist #epic #lit",
			"tar #crime #horror #hist",
			"lichen #lit #sf #short",
			"copper #sf #hist #crime",
			"ash #epic #lit #horror #ya",
			"ember #epic #lit #ya",
			"salt #epic #lit #hist",
			"thread #lit #rom #epic",
			"glass #lit #horror #sf #ya",
			"iron #epic #hist #sf",
			"thorn #epic #rom #horror #ya",
			"hearth #epic #lit #rom",
			"tide #epic #lit #sf",
			"stone #epic #hist #lit",
			"smoke #horror #crime #lit #ya",
			"rust #sf #crime #hist",
			"frost #epic #lit #horror #ya",
			"honey #rom #lit #short",
			"wire #sf #crime #horror #ya",
			"feather #lit #rom #short"
		],
		"animal": [
			"corncrake #lit #hist #short",
			"lamprey #horror #sf #lit",
			"jackdaw #crime #lit #hist",
			"lurcher #crime #hist #epic",
			"sturgeon #lit #hist #sf",
			"weevil #horror #hist #short",
			"peregrine #epic #sf #lit",
			"donkey #hist #lit #short",
			"raven #epic #horror #hist #ya",
			"wolf #epic #horror #hist #ya",
			"hart #epic #hist",
			"mare #hist #epic #lit",
			"hound #crime #horror #epic",
			"kestrel #epic #lit #sf",
			"boar #epic #hist",
			"magpie #crime #lit #short",
			"heron #lit #short #epic",
			"moth #horror #lit #short #ya",
			"fox #crime #lit #epic #ya",
			"whale #lit #epic #sf",
			"starling #lit #short #rom",
			"adder #horror #epic #crime"
		],
		"plant": [
			"hawthorn #epic #horror #hist",
			"yarrow #lit #hist #short",
			"bindweed #horror #lit #crime",
			"sedge #lit #epic #short",
			"juniper #epic #hist #rom",
			"teasel #lit #short #horror",
			"briar #epic #rom #horror #ya",
			"willow #lit #rom #short",
			"nettle #lit #horror #short #ya",
			"orchard #lit #hist #rom",
			"rye #hist #lit",
			"foxglove #horror #crime #rom",
			"laurel #hist #epic",
			"bramble #epic #horror #lit #ya"
		],
		"weather": [
			"hoarfrost #epic #horror #lit",
			"sirocco #hist #sf #lit",
			"gale #hist #epic #crime",
			"haar #crime #horror #lit",
			"frost #epic #lit #horror #ya",
			"thaw #epic #lit #hist",
			"squall #sf #lit #hist",
			"drought #epic #hist #sf",
			"monsoon #hist #lit",
			"blizzard #sf #epic #crime #ya",
			"fog #crime #horror #lit #ya",
			"heat #crime #lit #short"
		],
		"water": [
			"millpond #lit #horror #hist",
			"race #lit #crime #hist",
			"spillway #sf #crime #lit",
			"tidewrack #epic #horror #lit",
			"estuary #lit #crime #short",
			"shallows #lit #horror #epic #ya",
			"undertow #horror #crime #lit #ya",
			"harbour #hist #crime #lit",
			"flood #epic #hist #horror",
			"reservoir #crime #sf #lit"
		],
		"body": [
			"knuckle #crime #lit #short",
			"eyelid #horror #lit #sf",
			"marrow #horror #epic #sf",
			"tendon #horror #sf #crime",
			"heart #rom #lit #horror #ya",
			"bone #horror #epic #lit #ya",
			"hand #lit #rom #crime",
			"throat #horror #crime",
			"spine #horror #sf",
			"lung #horror #sf #lit",
			"skin #horror #lit",
			"pulse #sf #crime #rom #ya"
		],
		"food": [
			"bread #hist #lit #rom",
			"honey #rom #lit",
			"brine #hist #horror #epic",
			"pottage #hist #epic",
			"marmalade #lit #short #rom",
			"salt cod #hist #lit"
		],
		"name": [
			"Wren #lit #crime #short #ya",
			"Osric #epic #hist",
			"Talia #sf #rom #epic #ya",
			"Brannoc #epic #hist",
			"Ludmila #hist #lit #sf",
			"Fintan #epic #lit #hist",
			"Aurelia #hist #rom #epic",
			"Kestrel Vane #sf #crime",
			"Josiah #hist #horror #lit",
			"Marguerite #hist #rom #lit",
			"Emeric #epic #hist #sf",
			"Suniva #epic #lit #rom",
			"Cabot #crime #sf #hist",
			"Lorna #lit #crime #rom #ya",
			"Absalom #hist #horror #epic",
			"Aldwyn #epic #hist",
			"Carys #epic #hist #rom #ya",
			"Maerin #epic",
			"Bevan #epic #hist #crime",
			"Enid #hist #lit #rom",
			"Tomas #hist #crime #lit",
			"Sela #epic #sf #ya",
			"Rhun #epic",
			"Idris #epic #hist #lit",
			"Nesta #hist #rom #lit",
			"Gwarin #epic",
			"Alderic #epic #hist",
			"Hesper #sf #lit #rom #ya",
			"Corin #epic #sf #ya",
			"Merrow #crime #horror #epic",
			"Ilse #lit #hist #crime",
			"Ottoline #lit #hist #rom",
			"Jerome #lit #crime #short",
			"Vesna #sf #lit #crime",
			"Ansel #lit #short #sf",
			"Rosalind #rom #hist #lit",
			"Halloway #crime #horror #lit",
			"Marchetti #crime #rom",
			"Okonkwo #lit #hist #short",
			"Nadia #sf #crime #rom #ya",
			"Bram #horror #crime #short #ya",
			"Perpetua #hist #lit #horror"
		],
		"place": [
			"Widdershin #epic #horror",
			"Greyhaven #epic #sf #crime",
			"Pennyfields #hist #crime #lit",
			"the Fetterlands #epic #hist",
			"Coldharbour #crime #sf #hist",
			"Lammas Green #hist #lit #rom",
			"the Shrouds #horror #epic #sf #ya",
			"Quill Row #crime #lit #hist",
			"Bittern Marsh #lit #horror #epic",
			"the Umbral Shelf #sf",
			"Fairwater #rom #lit #short",
			"Gallowgate #crime #horror #hist",
			"Folstoc #epic #hist",
			"Carwin #epic #hist",
			"the Marches #epic #hist",
			"Blackmere #epic #horror",
			"Stonefen #epic #hist",
			"the Weald #epic #hist #lit",
			"Ravenhollow #epic #horror",
			"Saltmarsh #epic #hist #crime",
			"the Deeping #epic #horror #ya",
			"Wendover #hist #lit #crime",
			"Ashford #hist #lit",
			"the Long Coast #epic #sf",
			"Thornbury #crime #lit #hist",
			"Ashcombe #crime #lit #rom",
			"Halloway Reach #crime #horror",
			"the Fens #crime #horror #lit",
			"Milford #lit #short #rom",
			"Aldergrove #lit #hist #short",
			"the Estuary #lit #short #crime",
			"Cinderhall #epic #horror #sf #ya",
			"Tycho Deep #sf",
			"the Bright Verge #sf #epic",
			"Cassian Reach #sf",
			"the Kuiper Line #sf",
			"Netherfell #horror #epic #ya",
			"Marrow Lane #horror #crime",
			"the Old Parish #horror #hist",
			"Rosemead #rom #hist #lit",
			"Havenhurst #rom #hist",
			"Kentmere #rom #hist #lit"
		],
		"placeBare": [
			"Folstoc #epic #hist",
			"Carwin #epic #hist",
			"Blackmere #epic #horror #ya",
			"Stonefen #epic #hist",
			"Ravenhollow #epic #horror #ya",
			"Saltmarsh #epic #hist #crime",
			"Wendover #hist #lit #crime",
			"Ashford #hist #lit",
			"Thornbury #crime #lit #hist",
			"Ashcombe #crime #lit #rom",
			"Milford #lit #short #rom",
			"Aldergrove #lit #hist #short",
			"Cinderhall #epic #horror #sf #ya",
			"Netherfell #horror #epic #ya",
			"Rosemead #rom #hist #lit",
			"Havenhurst #rom #hist",
			"Kentmere #rom #hist #lit",
			"Widdershin #epic #horror #ya",
			"Greyhaven #epic #sf #crime #ya",
			"Coldharbour #crime #sf #hist",
			"Fairwater #rom #lit #short",
			"Gallowgate #crime #horror #hist #ya",
			"Bittern Marsh #lit #horror #epic",
			"Tycho Deep #sf",
			"Hesperus #sf",
			"Perihelion #sf"
		],
		"kingdom": [
			"Threnody #epic #horror #sf #ya",
			"Aldermarch #epic #hist",
			"Vayle #epic #ya",
			"Ashlands #epic #sf #horror",
			"Corvath #epic #hist #ya",
			"Elderreach #epic",
			"Salt Kingdoms #epic #hist",
			"Marrowen #epic #horror #ya",
			"Nine Reaches #epic #sf",
			"Thessaly Minor #hist #sf #epic",
			"Pale Dominion #epic #horror #sf",
			"Free Cantons #hist #epic"
		],
		"planet": [
			"Kestrel #sf",
			"Tharsis #sf",
			"Coriol #sf",
			"Vheld #sf",
			"Ashfall Station #sf",
			"Hesperus #sf",
			"Ganymede Yards #sf",
			"Cold Harbour #sf #crime",
			"Perihelion #sf"
		],
		"title": [
			"Coroner #crime #hist #horror",
			"Bailiff #hist #crime #epic",
			"Envoy #sf #epic #hist",
			"Prioress #hist #horror #epic",
			"Wharfinger #hist #crime #lit",
			"Cartwright #hist #epic #lit",
			"Warden #epic #hist #ya",
			"Keeper #epic #hist #lit #ya",
			"Marshal #epic #hist #crime #ya",
			"Steward #epic #hist",
			"Reeve #epic #hist",
			"Bellringer #epic #horror #lit",
			"Harrower #epic #horror #ya",
			"Magistrate #hist #crime #epic",
			"Vicereine #epic #sf #hist",
			"Quartermaster #hist #sf #crime",
			"Archivist #sf #lit #epic",
			"Almoner #hist #lit",
			"Chancellor #hist #epic #sf",
			"Rook #crime #epic #ya"
		],
		"role": [
			"coroner #crime #horror #hist",
			"harbourmaster #hist #crime #sf",
			"almoner #hist #lit #epic",
			"wheelwright #hist #epic #lit",
			"rat-catcher #horror #hist #crime",
			"cellarer #hist #epic #horror",
			"draughtsman #sf #lit #hist",
			"signal officer #sf #hist #crime",
			"herbalist #epic #hist #lit #ya",
			"pallbearer #horror #lit #hist",
			"auctioneer #crime #lit #short",
			"lay preacher #hist #horror #lit",
			"xenobotanist #sf",
			"fence #crime #hist",
			"apothecary #hist #lit #epic",
			"cartographer #sf #epic #lit #ya",
			"locksmith #crime #lit #hist #ya",
			"undertaker #horror #crime #hist",
			"midwife #hist #lit #horror",
			"glassblower #lit #hist #short",
			"translator #lit #sf #crime",
			"lamplighter #hist #horror #lit",
			"bookbinder #lit #hist #short",
			"gravedigger #horror #hist #crime #ya",
			"tax collector #hist #crime #epic",
			"seamstress #hist #rom #lit",
			"falconer #epic #hist #ya",
			"clockmaker #sf #hist #lit",
			"salvor #sf #crime",
			"smuggler #crime #hist #sf #ya",
			"governess #rom #hist #horror",
			"housekeeper #crime #horror #lit",
			"schoolmaster #hist #lit #horror"
		],
		"person": [
			"foreigner #hist #lit #crime",
			"apprentice #hist #epic #lit #ya",
			"debtor #crime #hist #lit",
			"convalescent #lit #horror #short",
			"surveyor #sf #hist #crime",
			"man #lit #crime #short",
			"woman #lit #crime #rom #short",
			"boy #lit #short #horror #ya",
			"girl #lit #crime #short #ya",
			"king #epic #hist",
			"queen #epic #hist #rom",
			"god #epic #horror #sf",
			"stranger #crime #horror #lit #short #ya",
			"widow #crime #hist #lit #rom",
			"heir #epic #hist #rom #ya",
			"soldier #hist #epic #sf #ya",
			"sister #lit #rom #horror #short #ya",
			"neighbour #crime #horror #lit #short",
			"passenger #sf #crime #lit",
			"tenant #crime #horror #lit",
			"child #horror #lit #short #ya",
			"tribute #ya",
			"initiate #ya #epic",
			"runner #ya #sf",
			"recruit #ya #hist",
			"volunteer #ya",
			"orphan #ya #lit"
		],
		"kin": [
			"daughter #lit #hist #rom #horror #ya",
			"son #lit #hist #epic #ya",
			"mother #lit #horror #rom #ya",
			"father #lit #hist #crime",
			"brother #epic #crime #lit #ya",
			"sister #lit #rom #horror #ya",
			"wife #rom #crime #lit",
			"husband #rom #crime #lit",
			"cousin #hist #lit #short #ya",
			"grandmother #lit #horror #short",
			"twin #horror #sf #lit #ya"
		],
		"group": [
			"Wardens #epic #hist",
			"Kept #epic #horror #ya",
			"Faithful #epic #hist #horror #ya",
			"Drowned #epic #horror #ya",
			"Nameless #epic #sf #horror #ya",
			"Unbidden #horror #epic #ya",
			"Quiet Men #crime #hist",
			"Salt Guild #epic #hist #crime",
			"Long Company #epic #hist #sf",
			"Bereaved #lit #horror #hist #ya",
			"Tithed #epic #hist #horror",
			"Unnumbered #epic #sf #horror",
			"Wintering Host #epic #hist"
		],
		"epithet": [
			"Unwitnessed #epic #horror #hist",
			"Tithebreaker #epic #hist",
			"Becalmed #epic #sf #lit",
			"Wintercome #epic #hist #horror",
			"Merciful #epic #hist #rom"
		],
		"honorific": [
			"Mister #lit #crime #hist #short",
			"Missus #lit #hist #short",
			"Doctor #crime #horror #sf #lit #ya",
			"Captain #hist #sf #epic #ya",
			"Sister #horror #hist #lit #ya",
			"Professor #sf #crime #lit",
			"Madame #hist #rom #crime",
			"Inspector #crime #hist",
			"Brother #horror #hist #epic"
		],
		"verb": [
			"witness #crime #lit #hist",
			"unmake #epic #sf #horror",
			"pardon #hist #crime #rom",
			"enumerate #sf #lit #crime",
			"salvage #sf #crime #lit",
			"disown #lit #hist #rom",
			"winter #epic #lit #hist",
			"hold #epic #crime #hist",
			"keep #epic #lit #crime",
			"guard #epic #crime #hist",
			"burn #epic #horror #crime #ya",
			"break #crime #lit #epic #ya",
			"remember #lit #rom #short #ya",
			"leave #lit #rom #crime #short #ya",
			"bury #crime #horror #hist",
			"wake #horror #sf #lit",
			"trust #crime #rom #lit #ya",
			"follow #crime #horror #sf #ya",
			"defend #epic #hist #crime #ya",
			"name #epic #lit #sf",
			"count #crime #sf #lit",
			"answer #crime #lit #sf",
			"ransom #epic #crime #hist",
			"outlive #lit #hist #horror #ya",
			"inherit #hist #lit #rom",
			"forgive #rom #lit #hist"
		],
		"gerund": [
			"inventorying #sf #lit #crime",
			"overwintering #epic #lit #hist",
			"disinheriting #hist #lit #rom",
			"salvaging #sf #crime #lit",
			"finding #lit #crime #short",
			"holding #lit #rom #epic",
			"keeping #lit #epic #hist",
			"burning #horror #epic #crime #ya",
			"leaving #lit #rom #short #ya",
			"guarding #epic #crime",
			"breaking #crime #lit #sf #ya",
			"tending #lit #hist #rom",
			"burying #horror #crime #hist",
			"counting #crime #sf #lit",
			"translating #lit #sf #short",
			"mending #lit #rom #hist #short",
			"outrunning #crime #sf #epic #ya"
		],
		"pastVerb": [
			"recanted #hist #crime #epic",
			"overwintered #epic #lit #hist",
			"absconded #crime #hist #lit",
			"kept faith #epic #hist #rom",
			"went quiet #crime #horror #lit #ya",
			"paid the tithe #epic #hist #horror",
			"learned to lie #crime #lit #rom",
			"fell #epic #hist #lit #ya",
			"vanished #crime #horror #sf #ya",
			"waited #lit #rom #short",
			"burned #horror #epic #crime #ya",
			"returned #lit #epic #sf",
			"lied #crime #lit #rom #ya",
			"wept #lit #rom #hist",
			"knelt #epic #hist #rom",
			"stayed #lit #rom #short",
			"forgot #lit #sf #short",
			"remembered #lit #sf #rom",
			"drowned #horror #epic #crime",
			"endured #hist #lit #epic #ya",
			"sang #epic #lit #short",
			"confessed #crime #lit #hist #ya",
			"refused #lit #hist #crime #rom #ya",
			"counted #crime #sf #lit",
			"walked away #lit #crime #short #ya"
		],
		"pastPart": [
			"disinherited #hist #lit #rom",
			"unwitnessed #crime #horror #lit",
			"becalmed #hist #lit #sf",
			"shriven #hist #horror #epic",
			"outnumbered #epic #sf #hist",
			"gone #crime #lit #horror",
			"lost #lit #epic #sf #ya",
			"buried #horror #crime #hist",
			"broken #crime #lit #epic #ya",
			"forgotten #epic #lit #hist #ya",
			"drowned #horror #epic",
			"taken #crime #horror #sf #ya",
			"forsaken #epic #horror #hist",
			"kept #lit #rom #epic",
			"burned #horror #crime #epic #ya",
			"unmourned #horror #hist #epic",
			"unclaimed #crime #lit #sf #ya"
		],
		"strikeVerb": [
			"rises #epic #sf #hist #ya",
			"falls #epic #hist #horror #ya",
			"awakens #horror #sf #epic #ya",
			"answers #epic #sf #horror",
			"endures #hist #epic #lit",
			"returns #epic #sf #crime #ya",
			"holds #epic #hist #lit"
		],
		"riseFall": [
			"fall #epic #hist #sf #ya",
			"ruin #epic #hist #horror",
			"rise #epic #hist #sf #ya",
			"siege #epic #hist",
			"breaking #epic #hist #sf",
			"reckoning #epic #horror #crime #ya",
			"sundering #epic #sf #horror #ya"
		],
		"taleWord": [
			"reckoning #epic #crime #hist",
			"account #hist #crime #lit",
			"psalm #epic #hist #horror",
			"almanac #hist #sf #epic",
			"song #epic #lit #hist #ya",
			"ballad #epic #hist #lit #ya",
			"tale #epic #hist #short",
			"legend #epic #hist #ya",
			"chronicle #epic #hist #sf",
			"testament #epic #hist #horror #ya",
			"book #epic #lit #sf",
			"death #epic #lit #crime #hist",
			"life #lit #hist #rom",
			"memoir #lit #hist #short",
			"lament #epic #lit #hist",
			"inventory #lit #sf #short"
		],
		"seriesWord": [
			"Chronicles #epic #hist #sf *3 #ya",
			"Saga #epic #hist *2 #ya",
			"Cycle #epic #sf #lit #ya",
			"Sequence #epic #lit #sf",
			"Archive #epic #sf #lit #ya",
			"Files #crime #sf #horror #ya",
			"Annals #epic #hist",
			"Quartet #lit #hist #rom",
			"Papers #crime #hist #lit",
			"Dossier #crime #sf"
		],
		"refWord": [
			"Book #epic #lit #hist #ya",
			"Dictionary #lit #sf #short",
			"Encyclopaedia #lit #sf",
			"Field Guide #sf #lit #short #ya",
			"Catalogue #lit #sf #hist",
			"Anatomy #lit #horror #hist",
			"Rules #crime #lit #sf #ya",
			"Almanac #hist #epic #sf",
			"Register #hist #crime #lit",
			"Bestiary #epic #horror #sf"
		],
		"countWord": [
			"Trilogy #epic #sf #lit #ya",
			"Duology #epic #sf #lit #ya",
			"Quartet #lit #hist #rom",
			"Quintet #lit #sf #hist"
		],
		"storyWord": [
			"Stories #lit #short #crime #ya",
			"Tales #epic #hist #short #ya",
			"Cases #crime #short",
			"Sketches #lit #hist #short",
			"Fragments #lit #sf #short #ya",
			"Dispatches #sf #hist #crime #short"
		],
		"time": [
			"winter #epic #lit #hist #ya",
			"dusk #horror #lit #rom #ya",
			"the harvest #epic #hist #lit",
			"the thaw #epic #lit #hist",
			"the long night #horror #epic #sf #ya",
			"the last summer #lit #rom #short",
			"first light #epic #sf #lit #ya",
			"the small hours #crime #horror #lit",
			"the interregnum #hist #epic #sf",
			"the quiet years #lit #hist #sf"
		],
		"shortTime": [
			"day #lit #crime #short #ya",
			"night #horror #crime #lit #ya",
			"winter #epic #lit #hist",
			"summer #rom #lit #short #ya",
			"morning #lit #rom #short",
			"hour #crime #horror #sf #ya"
		],
		"season": [
			"Midsummer #rom #lit #epic #ya",
			"Michaelmas #hist #lit",
			"Monsoon #epic #hist #sf",
			"Lenten #hist #lit #horror",
			"Harvest #epic #hist #lit",
			"Candlemas #hist #horror #lit",
			"Equinox #sf #epic #lit #ya",
			"Solstice #epic #sf #horror #ya"
		],
		"era": [
			"Age #epic #sf #hist #ya",
			"Year #hist #lit #sf #ya",
			"Reign #epic #hist #ya",
			"Century #hist #sf #lit",
			"Season #lit #rom #epic",
			"Decade #hist #lit #sf"
		],
		"number": [
			"Seven #epic #horror #hist #ya",
			"Twelve #epic #crime #hist #ya",
			"Three #epic #lit #short #ya",
			"Nine #epic #sf #horror",
			"Forty #hist #lit #epic",
			"A Hundred #epic #lit #hist",
			"Thirteen #horror #crime #ya",
			"Five #crime #sf #short",
			"Twenty-One #crime #lit #sf"
		],
		"ordinal": [
			"First #epic #sf #hist #ya",
			"Second #lit #crime #sf #ya",
			"Third #lit #sf #horror",
			"Seventh #epic #horror #hist #ya",
			"Last #epic #sf #lit #ya",
			"Only #lit #rom #sf #ya"
		],
		"quantAll": [
			"All #lit #epic #hist #ya",
			"Everything #lit #sf #rom #ya"
		],
		"quantNo": [
			"Nothing #lit #crime #horror #ya",
			"Nobody #crime #lit #horror #ya",
			"No One #crime #horror #short #ya",
			"Something #horror #lit #short"
		],
		"possessive": [
			"My #lit #rom #short *2 #ya",
			"Her #lit #rom #crime #ya",
			"His #lit #epic #hist #ya",
			"Our #lit #hist #sf",
			"Their #lit #sf #hist #ya"
		],
		"manner": [
			"Regardless #lit #crime #short",
			"By Halves #lit #rom #short",
			"in Winter #epic #lit #hist",
			"without Asking #crime #lit #rom",
			"Hard #crime #sf",
			"Quietly #crime #lit #horror",
			"Twice #crime #lit #horror #ya",
			"Slowly #lit #horror #rom",
			"Alone #lit #sf #horror #ya",
			"Anyway #lit #rom #short #ya"
		],
		"warmAdj": [
			"forgiving #rom #lit #horror",
			"hospitable #lit #horror #crime",
			"devoted #rom #lit #horror",
			"tender #rom #lit #horror #ya",
			"gentle #rom #lit #horror #ya",
			"merciful #epic #hist #horror #ya",
			"patient #crime #horror #lit",
			"kindly #lit #horror #crime",
			"radiant #epic #sf #rom"
		],
		"coldNoun": [
			"attrition #sf #epic #hist",
			"quarantine #sf #horror #crime",
			"liquidation #crime #sf #lit",
			"slaughter #epic #horror #crime #ya",
			"famine #epic #hist #sf",
			"inquisition #hist #horror #epic",
			"autopsy #crime #horror #sf",
			"foreclosure #crime #lit",
			"extinction #sf #horror #epic #ya",
			"reckoning #epic #crime #horror #ya"
		]
	}
};
