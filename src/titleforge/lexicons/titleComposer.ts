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
			"id": "heroic-fantasy",
			"label": "Heroic fantasy"
		},
		{
			"id": "sword-sorcery",
			"label": "Sword & Sorcery"
		},
		{
			"id": "urban-fantasy",
			"label": "Urban fantasy"
		},
		{
			"id": "sf",
			"label": "Science fiction"
		},
		{
			"id": "space-opera",
			"label": "Space opera"
		},
		{
			"id": "military-sf",
			"label": "Military SF"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"sf",
				"space-opera",
				"military-sf"
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
				"hist",
				"sword-sorcery"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
			"weight": 1,
			"genres": [
				"epic",
				"hist",
				"lit",
				"horror",
				"sf",
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy"
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
				"hist",
				"heroic-fantasy",
				"sword-sorcery"
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
				"lit",
				"heroic-fantasy",
				"sword-sorcery"
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
				"sf",
				"heroic-fantasy",
				"space-opera"
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
			"weight": 1,
			"genres": [
				"lit",
				"hist",
				"epic",
				"rom",
				"horror",
				"heroic-fantasy",
				"urban-fantasy"
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
				"ya",
				"space-opera"
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
				"epic",
				"heroic-fantasy"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy"
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
				"hist",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy"
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
				"epic",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"hist",
				"heroic-fantasy",
				"urban-fantasy",
				"space-opera"
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
				"epic",
				"heroic-fantasy",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"horror",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"epic",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy"
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
			"weight": 1,
			"genres": [
				"lit",
				"epic",
				"crime",
				"horror",
				"short",
				"ya",
				"heroic-fantasy",
				"urban-fantasy"
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
				"short",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy"
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
				"horror"
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
				"horror",
				"ya",
				"sword-sorcery"
			],
			"exemplar": "Conan the Barbarian; Danny, the Champion of the World",
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
				"lit"
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
				"lit"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
			"weight": 5,
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
			"weight": 5,
			"genres": [
				"lit",
				"epic",
				"hist",
				"horror",
				"short",
				"heroic-fantasy",
				"urban-fantasy"
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
				"sf",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"rom",
				"space-opera"
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
				"short",
				"heroic-fantasy",
				"space-opera"
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
				"ya",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"space-opera"
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
				"sf",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy"
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
				"sf",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"space-opera"
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
				"epic",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy"
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
				"hist",
				"heroic-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"urban-fantasy"
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
				"horror",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery",
				"urban-fantasy",
				"space-opera",
				"military-sf"
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
				"ya",
				"space-opera",
				"military-sf"
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
				"ya",
				"heroic-fantasy",
				"sword-sorcery"
			],
			"weight": 1,
			"exemplar": "How to Train Your Dragon",
			"note": "A clause/how-to umbrella (How to Train Your Dragon). Very rare; children's/comic register; low weight."
		}
	],
	"lexicon": {
		"adj": [
			"seldom-seen #lit #hist #short",
			"half-remembered #lit #horror #short #urban-fantasy",
			"unlucky #crime #lit #short #ya #urban-fantasy",
			"obliging #lit #crime #rom #urban-fantasy",
			"implacable #epic #crime #sf #heroic-fantasy #space-opera #urban-fantasy",
			"sunlit #rom #lit #short",
			"threadbare #lit #hist #short",
			"mutinous #hist #sf #epic #heroic-fantasy #space-opera",
			"uncharted #sf #epic #ya #heroic-fantasy #space-opera",
			"sealed #crime #horror #sf #ya #space-opera #urban-fantasy",
			"inherited #lit #hist #horror #urban-fantasy",
			"unfinished #lit #rom #short",
			"midnight #horror #crime #rom #ya #urban-fantasy",
			"dutiful #hist #rom #lit",
			"ravenous #horror #epic #heroic-fantasy #urban-fantasy",
			"saltworn #epic #hist #sf #heroic-fantasy #space-opera",
			"lucky #crime #lit #short #urban-fantasy",
			"apostate #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"mislaid #lit #crime #short #urban-fantasy",
			"irreparable #lit #sf #crime #space-opera #urban-fantasy",
			"last #epic #sf #lit #hist *3 #ya #heroic-fantasy #space-opera",
			"quiet #lit #horror #rom #short #urban-fantasy",
			"buried #epic #horror #crime #hist #heroic-fantasy #urban-fantasy",
			"hollow #epic #horror #lit #heroic-fantasy #urban-fantasy",
			"ashen #epic #horror #heroic-fantasy #sword-sorcery #urban-fantasy",
			"distant #sf #lit #rom #space-opera",
			"forgotten #epic #horror #hist #lit #heroic-fantasy #urban-fantasy",
			"sacred #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"iron #epic #hist #sf #heroic-fantasy #space-opera",
			"pale #horror #lit #short #urban-fantasy",
			"long #lit #hist #epic #heroic-fantasy",
			"broken #epic #crime #lit #rom #ya #heroic-fantasy #urban-fantasy",
			"faithful #hist #rom #lit",
			"unquiet #horror #lit #urban-fantasy",
			"grey #lit #crime #short #urban-fantasy",
			"deep #sf #epic #horror #heroic-fantasy #space-opera #urban-fantasy",
			"patient #crime #horror #lit #urban-fantasy",
			"crooked #crime #lit #short #urban-fantasy",
			"borrowed #crime #lit #rom #urban-fantasy",
			"sunken #epic #horror #sf #heroic-fantasy #space-opera #urban-fantasy",
			"gilded #hist #rom #epic #ya #heroic-fantasy",
			"bitter #lit #rom #hist #ya",
			"narrow #crime #lit #short #urban-fantasy",
			"vacant #sf #horror #crime #space-opera #urban-fantasy",
			"sleepless #horror #crime #lit #ya #urban-fantasy",
			"tender #rom #lit #short",
			"ruinous #epic #hist #heroic-fantasy #sword-sorcery",
			"wintering #epic #lit #hist #heroic-fantasy",
			"nameless #epic #horror #sf #ya #heroic-fantasy #space-opera #urban-fantasy",
			"unspoken #rom #lit #short",
			"reluctant #rom #lit #crime #ya #urban-fantasy",
			"improper #rom #hist",
			"scandalous #rom #hist",
			"wayward #rom #lit #hist",
			"untitled #lit #short",
			"provincial #lit #hist",
			"salvaged #sf #crime #space-opera #military-sf #urban-fantasy",
			"recursive #sf #space-opera",
			"derelict #sf #horror #space-opera #urban-fantasy",
			"terminal #sf #crime #horror #space-opera #urban-fantasy",
			"synthetic #sf #space-opera",
			"unmapped #sf #epic #heroic-fantasy #space-opera",
			"orbital #sf #space-opera",
			"lucid #sf #lit #horror #space-opera #urban-fantasy",
			"brittle #lit #horror #short #ya #urban-fantasy",
			"ordinary #lit #short #crime #urban-fantasy",
			"sufficient #lit #short",
			"imperial #hist #epic #sf #heroic-fantasy #space-opera",
			"sovereign #hist #epic #heroic-fantasy",
			"loyal #hist #epic #rom #heroic-fantasy",
			"northern #hist #epic #crime #heroic-fantasy #urban-fantasy",
			"feral #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"rotting #horror #urban-fantasy",
			"grinning #horror #crime #urban-fantasy",
			"weeping #horror #lit #rom #urban-fantasy",
			"hungry #horror #epic #lit #ya #heroic-fantasy #urban-fantasy",
			// hand-authored for the 5 new sibling genres - no corpus backs these (see
			// ACCURACY.md), so they're tagged with both the sibling and its parent
			"barbarian #sword-sorcery #epic",
			"reaver-scarred #sword-sorcery #epic",
			"blood-forged #sword-sorcery #epic",
			"oath-sworn #heroic-fantasy #epic",
			"dragon-scarred #heroic-fantasy #epic",
			"kingless #heroic-fantasy #epic",
			"neon-lit #urban-fantasy",
			"rain-slicked #urban-fantasy #horror",
			"unlicensed #urban-fantasy #crime",
			"starless #space-opera #sf",
			"faster-than-light #space-opera #sf",
			"colonized #space-opera #sf",
			"battle-worn #military-sf #sf",
			"frontline #military-sf #sf",
			"requisitioned #military-sf #sf"
		],
		"colour": [
			"scarlet #hist #rom #lit",
			"crimson #horror #epic #rom #ya #heroic-fantasy #urban-fantasy",
			"ashen #horror #epic #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"pale #horror #lit #urban-fantasy",
			"black #crime #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"white #lit #horror #short #urban-fantasy",
			"golden #hist #rom #epic #heroic-fantasy",
			"grey #crime #lit #sf #space-opera #urban-fantasy",
			"green #lit #short #epic #heroic-fantasy",
			"blue #lit #rom #sf #space-opera",
			"amber #sf #epic #lit #heroic-fantasy #space-opera",
			"russet #hist #lit",
			"indigo #sf #lit #rom #space-opera",
			"bone-white #horror #epic #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"ochre #hist #lit",
			"silver #epic #sf #rom #ya #heroic-fantasy #space-opera"
		],
		"noun": [
			"quarantine #sf #horror #crime #space-opera #urban-fantasy",
			"almshouse #hist #lit #horror #urban-fantasy",
			"scaffold #hist #horror #epic #heroic-fantasy #sword-sorcery #urban-fantasy",
			"weir #lit #epic #short #heroic-fantasy",
			"threnody #epic #lit #horror #heroic-fantasy #sword-sorcery #urban-fantasy",
			"manifest #sf #crime #hist #space-opera #military-sf #urban-fantasy",
			"turnpike #hist #crime #lit #urban-fantasy",
			"apiary #lit #hist #short",
			"pilgrimage #epic #hist #lit #heroic-fantasy #sword-sorcery",
			"recital #lit #rom #short",
			"dowry #hist #rom #epic #heroic-fantasy",
			"quarry #crime #horror #hist #urban-fantasy",
			"ferry #lit #hist #short",
			"sanction #sf #crime #hist #space-opera #urban-fantasy",
			"sluice #lit #horror #hist #urban-fantasy",
			"lighthouse #lit #horror #short #urban-fantasy",
			"armistice #hist #sf #epic #heroic-fantasy #space-opera #military-sf",
			"tithe #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"allotment #lit #short #hist",
			"scrimshaw #hist #lit #sf #space-opera",
			"watchtower #epic #sf #hist #heroic-fantasy #sword-sorcery #space-opera #military-sf",
			"undercroft #horror #epic #hist #heroic-fantasy #sword-sorcery #urban-fantasy",
			"granary #epic #hist #heroic-fantasy",
			"warden #epic #hist #crime #heroic-fantasy #sword-sorcery #urban-fantasy",
			"gate #epic #sf #hist #heroic-fantasy #sword-sorcery #space-opera #military-sf",
			"hearth #epic #lit #rom #hist #heroic-fantasy",
			"harvest #epic #hist #lit #heroic-fantasy",
			"river #lit #epic #hist #short #heroic-fantasy #sword-sorcery",
			"road #lit #epic #crime #heroic-fantasy #sword-sorcery #urban-fantasy",
			"oath #epic #hist #rom #ya #heroic-fantasy #sword-sorcery",
			"bell #epic #horror #lit #heroic-fantasy #urban-fantasy",
			"wall #epic #hist #sf #heroic-fantasy #sword-sorcery #space-opera #military-sf",
			"seed #epic #lit #sf #heroic-fantasy #space-opera",
			"ember #epic #horror #lit #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"ash #epic #horror #lit #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"keep #epic #hist #heroic-fantasy #sword-sorcery",
			"field #hist #lit #short",
			"crown #epic #hist #rom #ya #heroic-fantasy #sword-sorcery",
			"throne #epic #hist #ya #heroic-fantasy #sword-sorcery",
			"covenant #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"reckoning #epic #crime #horror #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"lantern #epic #horror #lit #heroic-fantasy #sword-sorcery #urban-fantasy",
			"compact #epic #sf #hist #heroic-fantasy #space-opera",
			"verdict #crime #hist #lit #ya #urban-fantasy",
			"bargain #epic #rom #crime #ya #heroic-fantasy #urban-fantasy",
			"marches #epic #hist #heroic-fantasy #sword-sorcery",
			"sword #epic #hist #heroic-fantasy #sword-sorcery",
			"banner #epic #hist #heroic-fantasy #sword-sorcery",
			"siege #epic #hist #ya #heroic-fantasy #sword-sorcery",
			"ledger #crime #hist #lit #urban-fantasy",
			"tenant #crime #lit #horror #urban-fantasy",
			"inquest #crime #hist #urban-fantasy",
			"alibi #crime #urban-fantasy",
			"confession #crime #lit #rom #ya #urban-fantasy",
			"witness #crime #lit #ya #urban-fantasy",
			"debt #crime #rom #lit #hist #ya #urban-fantasy",
			"errand #crime #lit #short #urban-fantasy",
			"warrant #crime #hist #urban-fantasy",
			"signal #sf #crime #space-opera #military-sf #urban-fantasy",
			"cascade #sf #space-opera",
			"threshold #sf #horror #epic #heroic-fantasy #space-opera #urban-fantasy",
			"archive #sf #lit #hist #space-opera",
			"lattice #sf #space-opera",
			"anomaly #sf #horror #space-opera #urban-fantasy",
			"aperture #sf #horror #space-opera #urban-fantasy",
			"relay #sf #space-opera #military-sf",
			"habitat #sf #space-opera #military-sf",
			"engine #sf #hist #epic #heroic-fantasy #space-opera #military-sf",
			"station #sf #crime #space-opera #military-sf #urban-fantasy",
			"nursery #horror #lit #urban-fantasy",
			"cellar #horror #crime #urban-fantasy",
			"congregation #horror #hist #urban-fantasy",
			"appetite #horror #lit #rom #urban-fantasy",
			"vigil #horror #lit #hist #urban-fantasy",
			"hymn #horror #hist #lit #urban-fantasy",
			"fever #horror #lit #rom #urban-fantasy",
			"teeth #horror #short #urban-fantasy",
			"season #lit #rom #short",
			"letter #rom #hist #lit",
			"waltz #rom #hist",
			"promise #rom #lit",
			"courtship #rom #hist",
			"interval #lit #sf #short #space-opera",
			"remainder #lit #short",
			"arrangement #lit #rom #short",
			"distance #lit #rom #sf #space-opera",
			"habit #lit #short",
			"return #lit #epic #sf #heroic-fantasy #space-opera",
			"regiment #hist",
			"charter #hist #sf #space-opera",
			"dynasty #hist #epic #heroic-fantasy",
			"treaty #hist #sf #space-opera",
			"mill #hist #lit",
			"estate #hist #lit #rom",
			"rebellion #hist #epic #sf #ya #heroic-fantasy #sword-sorcery #space-opera #military-sf",
			"passage #hist #lit #sf #space-opera",
			"threshing floor #epic #hist #heroic-fantasy",
			"watchfire #epic #hist #horror #heroic-fantasy #sword-sorcery #urban-fantasy",
			"furrow #hist #lit #epic #heroic-fantasy",
			"toll #epic #crime #hist #heroic-fantasy #urban-fantasy",
			"thresher #hist #epic #lit #heroic-fantasy",
			"breakwater #lit #sf #horror #space-opera #urban-fantasy",
			"coppice #lit #hist #epic #heroic-fantasy",
			"stipend #hist #lit #crime #urban-fantasy",
			"reliquary #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"trial #ya #epic #heroic-fantasy",
			"arena #ya #sf #space-opera",
			"cohort #ya #sf #space-opera",
			"uprising #ya #hist",
			"lottery #ya #horror #urban-fantasy",
			"curfew #ya #crime #urban-fantasy",
			"initiation #ya #epic #heroic-fantasy",
			"cage #ya #horror #urban-fantasy",
			"scholarship #ya #lit"
		],
		"abstract": [
			"insomnia #horror #lit #sf #space-opera #urban-fantasy",
			"gratitude #rom #lit #hist",
			"notoriety #crime #hist #rom #urban-fantasy",
			"symmetry #sf #lit #horror #space-opera #urban-fantasy",
			"cowardice #hist #lit #epic #ya #heroic-fantasy",
			"appetency #lit #horror #urban-fantasy",
			"credulity #crime #lit #hist #urban-fantasy",
			"stubbornness #lit #rom #hist #ya",
			"vertigo #sf #horror #lit #space-opera #urban-fantasy",
			"homesickness #lit #sf #rom #space-opera",
			"arithmetic #sf #crime #lit #space-opera #urban-fantasy",
			"weather #lit #epic #short #heroic-fantasy",
			"inheritance #lit #hist #rom",
			"diligence #hist #lit #crime #urban-fantasy",
			"temperance #hist #lit #rom",
			"mutiny #hist #sf #epic #heroic-fantasy #space-opera",
			"mercy #epic #lit #hist #heroic-fantasy",
			"sorrow #lit #rom #epic #heroic-fantasy",
			"ruin #epic #horror #hist #heroic-fantasy #sword-sorcery #urban-fantasy",
			"honour #epic #hist #rom #heroic-fantasy",
			"exile #epic #lit #hist #sf #ya #heroic-fantasy #space-opera",
			"silence #horror #lit #crime #short #urban-fantasy",
			"hunger #horror #lit #epic #ya #heroic-fantasy #urban-fantasy",
			"faith #lit #hist #horror #urban-fantasy",
			"grief #lit #rom #short #ya",
			"oblivion #sf #horror #epic #heroic-fantasy #space-opera #urban-fantasy",
			"valour #epic #hist #heroic-fantasy",
			"loyalty #epic #hist #rom #crime #ya #heroic-fantasy #urban-fantasy",
			"reckoning #epic #crime #heroic-fantasy #sword-sorcery #urban-fantasy",
			"patience #lit #rom #short",
			"appetite #horror #lit #urban-fantasy",
			"restraint #lit #rom #crime #urban-fantasy",
			"consequence #crime #lit #sf #space-opera #urban-fantasy",
			"suspicion #crime #lit #urban-fantasy",
			"duty #hist #epic #rom #heroic-fantasy",
			"longing #rom #lit #short #ya",
			"regret #rom #lit #crime #ya #urban-fantasy",
			"forgiveness #rom #lit #hist #ya",
			"inevitability #sf #crime #lit #space-opera #urban-fantasy",
			"entropy #sf #space-opera",
			"recursion #sf #space-opera",
			"solitude #lit #sf #short #space-opera",
			"tenderness #rom #lit #short",
			"disgrace #lit #hist",
			"atonement #lit #hist #rom",
			"persuasion #rom #hist #lit",
			"obligation #lit #hist #crime #urban-fantasy",
			"providence #hist #epic #horror #heroic-fantasy #urban-fantasy",
			"dread #horror #crime #ya #urban-fantasy",
			"consolation #lit #rom #short",
			"defiance #ya #epic #heroic-fantasy",
			"belonging #ya #lit",
			"notoriety #ya #crime #urban-fantasy"
		],
		"object": [
			"sextant #hist #sf #epic #heroic-fantasy #space-opera",
			"inkwell #hist #lit #short",
			"snuffbox #hist #crime #rom #urban-fantasy",
			"prosthetic hand #sf #horror #crime #space-opera #urban-fantasy",
			"ledger stone #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"wax cylinder #hist #crime #sf #space-opera #urban-fantasy",
			"sewing needle #lit #rom #horror #urban-fantasy",
			"bridle #epic #hist #lit #heroic-fantasy",
			"census roll #hist #sf #crime #space-opera #urban-fantasy",
			"tin whistle #lit #short #hist",
			"lantern #epic #horror #hist #heroic-fantasy #sword-sorcery #urban-fantasy",
			"blade #epic #crime #hist #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"key #crime #lit #epic #ya #heroic-fantasy #urban-fantasy",
			"crown #epic #hist #heroic-fantasy #sword-sorcery",
			"ledger #crime #hist #urban-fantasy",
			"seal #epic #hist #crime #heroic-fantasy #urban-fantasy",
			"loom #hist #lit #epic #heroic-fantasy",
			"plough #hist #epic #heroic-fantasy",
			"reliquary #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"compass #sf #epic #hist #heroic-fantasy #space-opera",
			"telescope #sf #hist #lit #space-opera",
			"locket #rom #hist #horror #ya #urban-fantasy",
			"photograph #crime #lit #short #ya #urban-fantasy",
			"tape recorder #crime #sf #space-opera #urban-fantasy",
			"mirror #horror #lit #rom #urban-fantasy",
			"music box #horror #rom #hist #ya #urban-fantasy",
			"kite #lit #short",
			"typewriter #lit #crime #hist #urban-fantasy",
			"wedding ring #rom #crime #lit #urban-fantasy",
			"signal flare #sf #crime #ya #space-opera #military-sf #urban-fantasy",
			"glass eye #horror #crime #short #urban-fantasy"
		],
		"symbol": [
			"tallow #hist #horror #lit #urban-fantasy",
			"lodestone #epic #sf #hist #heroic-fantasy #space-opera",
			"chalk #lit #horror #short #urban-fantasy",
			"amber #sf #epic #lit #heroic-fantasy #space-opera",
			"vellum #hist #epic #lit #heroic-fantasy",
			"tar #crime #horror #hist #urban-fantasy",
			"lichen #lit #sf #short #space-opera",
			"copper #sf #hist #crime #space-opera #urban-fantasy",
			"ash #epic #lit #horror #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"ember #epic #lit #ya #heroic-fantasy #sword-sorcery",
			"salt #epic #lit #hist #heroic-fantasy",
			"thread #lit #rom #epic #heroic-fantasy",
			"glass #lit #horror #sf #ya #space-opera #urban-fantasy",
			"iron #epic #hist #sf #heroic-fantasy #space-opera",
			"thorn #epic #rom #horror #ya #heroic-fantasy #urban-fantasy",
			"hearth #epic #lit #rom #heroic-fantasy",
			"tide #epic #lit #sf #heroic-fantasy #space-opera",
			"stone #epic #hist #lit #heroic-fantasy",
			"smoke #horror #crime #lit #ya #urban-fantasy",
			"rust #sf #crime #hist #space-opera #urban-fantasy",
			"frost #epic #lit #horror #ya #heroic-fantasy #urban-fantasy",
			"honey #rom #lit #short",
			"wire #sf #crime #horror #ya #space-opera #urban-fantasy",
			"feather #lit #rom #short"
		],
		"animal": [
			"corncrake #lit #hist #short",
			"lamprey #horror #sf #lit #space-opera #urban-fantasy",
			"jackdaw #crime #lit #hist #urban-fantasy",
			"lurcher #crime #hist #epic #heroic-fantasy #urban-fantasy",
			"sturgeon #lit #hist #sf #space-opera",
			"weevil #horror #hist #short #urban-fantasy",
			"peregrine #epic #sf #lit #heroic-fantasy #space-opera",
			"donkey #hist #lit #short",
			"raven #epic #horror #hist #ya #heroic-fantasy #urban-fantasy",
			"wolf #epic #horror #hist #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"hart #epic #hist #heroic-fantasy",
			"mare #hist #epic #lit #heroic-fantasy",
			"hound #crime #horror #epic #heroic-fantasy #urban-fantasy",
			"kestrel #epic #lit #sf #heroic-fantasy #space-opera",
			"boar #epic #hist #heroic-fantasy",
			"magpie #crime #lit #short #urban-fantasy",
			"heron #lit #short #epic #heroic-fantasy",
			"moth #horror #lit #short #ya #urban-fantasy",
			"fox #crime #lit #epic #ya #heroic-fantasy #urban-fantasy",
			"whale #lit #epic #sf #heroic-fantasy #space-opera",
			"starling #lit #short #rom",
			"adder #horror #epic #crime #heroic-fantasy #urban-fantasy"
		],
		"plant": [
			"hawthorn #epic #horror #hist #heroic-fantasy #urban-fantasy",
			"yarrow #lit #hist #short",
			"bindweed #horror #lit #crime #urban-fantasy",
			"sedge #lit #epic #short #heroic-fantasy",
			"juniper #epic #hist #rom #heroic-fantasy",
			"teasel #lit #short #horror #urban-fantasy",
			"briar #epic #rom #horror #ya #heroic-fantasy #urban-fantasy",
			"willow #lit #rom #short",
			"nettle #lit #horror #short #ya #urban-fantasy",
			"orchard #lit #hist #rom",
			"rye #hist #lit",
			"foxglove #horror #crime #rom #urban-fantasy",
			"laurel #hist #epic #heroic-fantasy",
			"bramble #epic #horror #lit #ya #heroic-fantasy #urban-fantasy"
		],
		"weather": [
			"hoarfrost #epic #horror #lit #heroic-fantasy #urban-fantasy",
			"sirocco #hist #sf #lit #space-opera",
			"gale #hist #epic #crime #heroic-fantasy #urban-fantasy",
			"haar #crime #horror #lit #urban-fantasy",
			"frost #epic #lit #horror #ya #heroic-fantasy #urban-fantasy",
			"thaw #epic #lit #hist #heroic-fantasy",
			"squall #sf #lit #hist #space-opera",
			"drought #epic #hist #sf #heroic-fantasy #space-opera",
			"monsoon #hist #lit",
			"blizzard #sf #epic #crime #ya #heroic-fantasy #space-opera #urban-fantasy",
			"fog #crime #horror #lit #ya #urban-fantasy",
			"heat #crime #lit #short #urban-fantasy"
		],
		"water": [
			"millpond #lit #horror #hist #urban-fantasy",
			"race #lit #crime #hist #urban-fantasy",
			"spillway #sf #crime #lit #space-opera #urban-fantasy",
			"tidewrack #epic #horror #lit #heroic-fantasy #urban-fantasy",
			"estuary #lit #crime #short #urban-fantasy",
			"shallows #lit #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"undertow #horror #crime #lit #ya #urban-fantasy",
			"harbour #hist #crime #lit #urban-fantasy",
			"flood #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"reservoir #crime #sf #lit #space-opera #urban-fantasy"
		],
		"body": [
			"knuckle #crime #lit #short #urban-fantasy",
			"eyelid #horror #lit #sf #space-opera #urban-fantasy",
			"marrow #horror #epic #sf #heroic-fantasy #space-opera #urban-fantasy",
			"tendon #horror #sf #crime #space-opera #urban-fantasy",
			"heart #rom #lit #horror #ya #urban-fantasy",
			"bone #horror #epic #lit #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"hand #lit #rom #crime #urban-fantasy",
			"throat #horror #crime #urban-fantasy",
			"spine #horror #sf #space-opera #urban-fantasy",
			"lung #horror #sf #lit #space-opera #urban-fantasy",
			"skin #horror #lit #urban-fantasy",
			"pulse #sf #crime #rom #ya #space-opera #urban-fantasy"
		],
		"food": [
			"bread #hist #lit #rom",
			"honey #rom #lit",
			"brine #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"pottage #hist #epic #heroic-fantasy",
			"marmalade #lit #short #rom",
			"salt cod #hist #lit"
		],
		"name": [
			"Wren #lit #crime #short #ya #urban-fantasy",
			"Osric #epic #hist #heroic-fantasy",
			"Talia #sf #rom #epic #ya #heroic-fantasy #space-opera",
			"Brannoc #epic #hist #heroic-fantasy",
			"Ludmila #hist #lit #sf #space-opera",
			"Fintan #epic #lit #hist #heroic-fantasy",
			"Aurelia #hist #rom #epic #heroic-fantasy",
			"Kestrel Vane #sf #crime #space-opera #urban-fantasy",
			"Josiah #hist #horror #lit #urban-fantasy",
			"Marguerite #hist #rom #lit",
			"Emeric #epic #hist #sf #heroic-fantasy #space-opera",
			"Suniva #epic #lit #rom #heroic-fantasy",
			"Cabot #crime #sf #hist #space-opera #urban-fantasy",
			"Lorna #lit #crime #rom #ya #urban-fantasy",
			"Absalom #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"Aldwyn #epic #hist #heroic-fantasy",
			"Carys #epic #hist #rom #ya #heroic-fantasy",
			"Maerin #epic #heroic-fantasy",
			"Bevan #epic #hist #crime #heroic-fantasy #urban-fantasy",
			"Enid #hist #lit #rom",
			"Tomas #hist #crime #lit #urban-fantasy",
			"Sela #epic #sf #ya #heroic-fantasy #space-opera",
			"Rhun #epic #heroic-fantasy",
			"Idris #epic #hist #lit #heroic-fantasy",
			"Nesta #hist #rom #lit",
			"Gwarin #epic #heroic-fantasy",
			"Alderic #epic #hist #heroic-fantasy",
			"Hesper #sf #lit #rom #ya #space-opera",
			"Corin #epic #sf #ya #heroic-fantasy #space-opera",
			"Merrow #crime #horror #epic #heroic-fantasy #urban-fantasy",
			"Ilse #lit #hist #crime #urban-fantasy",
			"Ottoline #lit #hist #rom",
			"Jerome #lit #crime #short #urban-fantasy",
			"Vesna #sf #lit #crime #space-opera #urban-fantasy",
			"Ansel #lit #short #sf #space-opera",
			"Rosalind #rom #hist #lit",
			"Halloway #crime #horror #lit #urban-fantasy",
			"Marchetti #crime #rom #urban-fantasy",
			"Okonkwo #lit #hist #short",
			"Nadia #sf #crime #rom #ya #space-opera #urban-fantasy",
			"Bram #horror #crime #short #ya #urban-fantasy",
			"Perpetua #hist #lit #horror #urban-fantasy"
		],
		"place": [
			"Widdershin #epic #horror #heroic-fantasy #urban-fantasy",
			"Greyhaven #epic #sf #crime #heroic-fantasy #space-opera #urban-fantasy",
			"Pennyfields #hist #crime #lit #urban-fantasy",
			"the Fetterlands #epic #hist #heroic-fantasy",
			"Coldharbour #crime #sf #hist #space-opera #urban-fantasy",
			"Lammas Green #hist #lit #rom",
			"the Shrouds #horror #epic #sf #ya #heroic-fantasy #space-opera #urban-fantasy",
			"Quill Row #crime #lit #hist #urban-fantasy",
			"Bittern Marsh #lit #horror #epic #heroic-fantasy #urban-fantasy",
			"the Umbral Shelf #sf #space-opera",
			"Fairwater #rom #lit #short",
			"Gallowgate #crime #horror #hist #urban-fantasy",
			"Folstoc #epic #hist #heroic-fantasy",
			"Carwin #epic #hist #heroic-fantasy",
			"the Marches #epic #hist #heroic-fantasy #sword-sorcery",
			"Blackmere #epic #horror #heroic-fantasy #urban-fantasy",
			"Stonefen #epic #hist #heroic-fantasy",
			"the Weald #epic #hist #lit #heroic-fantasy",
			"Ravenhollow #epic #horror #heroic-fantasy #urban-fantasy",
			"Saltmarsh #epic #hist #crime #heroic-fantasy #urban-fantasy",
			"the Deeping #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Wendover #hist #lit #crime #urban-fantasy",
			"Ashford #hist #lit",
			"the Long Coast #epic #sf #heroic-fantasy #space-opera",
			"Thornbury #crime #lit #hist #urban-fantasy",
			"Ashcombe #crime #lit #rom #urban-fantasy",
			"Halloway Reach #crime #horror #urban-fantasy",
			"the Fens #crime #horror #lit #urban-fantasy",
			"Milford #lit #short #rom",
			"Aldergrove #lit #hist #short",
			"the Estuary #lit #short #crime #urban-fantasy",
			"Cinderhall #epic #horror #sf #ya #heroic-fantasy #space-opera #urban-fantasy",
			"Tycho Deep #sf #space-opera",
			"the Bright Verge #sf #epic #heroic-fantasy #space-opera",
			"Cassian Reach #sf #space-opera",
			"the Kuiper Line #sf #space-opera",
			"Netherfell #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"Marrow Lane #horror #crime #urban-fantasy",
			"the Old Parish #horror #hist #urban-fantasy",
			"Rosemead #rom #hist #lit",
			"Havenhurst #rom #hist",
			"Kentmere #rom #hist #lit"
		],
		"placeBare": [
			"Folstoc #epic #hist #heroic-fantasy",
			"Carwin #epic #hist #heroic-fantasy",
			"Blackmere #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Stonefen #epic #hist #heroic-fantasy",
			"Ravenhollow #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Saltmarsh #epic #hist #crime #heroic-fantasy #urban-fantasy",
			"Wendover #hist #lit #crime #urban-fantasy",
			"Ashford #hist #lit",
			"Thornbury #crime #lit #hist #urban-fantasy",
			"Ashcombe #crime #lit #rom #urban-fantasy",
			"Milford #lit #short #rom",
			"Aldergrove #lit #hist #short",
			"Cinderhall #epic #horror #sf #ya #heroic-fantasy #space-opera #urban-fantasy",
			"Netherfell #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"Rosemead #rom #hist #lit",
			"Havenhurst #rom #hist",
			"Kentmere #rom #hist #lit",
			"Widdershin #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Greyhaven #epic #sf #crime #ya #heroic-fantasy #space-opera #urban-fantasy",
			"Coldharbour #crime #sf #hist #space-opera #urban-fantasy",
			"Fairwater #rom #lit #short",
			"Gallowgate #crime #horror #hist #ya #urban-fantasy",
			"Bittern Marsh #lit #horror #epic #heroic-fantasy #urban-fantasy",
			"Tycho Deep #sf #space-opera",
			"Hesperus #sf #space-opera",
			"Perihelion #sf #space-opera"
		],
		"kingdom": [
			"Threnody #epic #horror #sf #ya #heroic-fantasy #sword-sorcery #space-opera #urban-fantasy",
			"Aldermarch #epic #hist #heroic-fantasy",
			"Vayle #epic #ya #heroic-fantasy",
			"Ashlands #epic #sf #horror #heroic-fantasy #sword-sorcery #space-opera #urban-fantasy",
			"Corvath #epic #hist #ya #heroic-fantasy",
			"Elderreach #epic #heroic-fantasy",
			"Salt Kingdoms #epic #hist #heroic-fantasy",
			"Marrowen #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Nine Reaches #epic #sf #heroic-fantasy #space-opera",
			"Thessaly Minor #hist #sf #epic #heroic-fantasy #space-opera",
			"Pale Dominion #epic #horror #sf #heroic-fantasy #space-opera #urban-fantasy",
			"Free Cantons #hist #epic #heroic-fantasy"
		],
		"planet": [
			"Kestrel #sf #space-opera",
			"Tharsis #sf #space-opera",
			"Coriol #sf #space-opera",
			"Vheld #sf #space-opera",
			"Ashfall Station #sf #space-opera #military-sf",
			"Hesperus #sf #space-opera",
			"Ganymede Yards #sf #space-opera",
			"Cold Harbour #sf #crime #space-opera #urban-fantasy",
			"Perihelion #sf #space-opera"
		],
		"title": [
			"Coroner #crime #hist #horror #urban-fantasy",
			"Bailiff #hist #crime #epic #heroic-fantasy #urban-fantasy",
			"Envoy #sf #epic #hist #heroic-fantasy #space-opera",
			"Prioress #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"Wharfinger #hist #crime #lit #urban-fantasy",
			"Cartwright #hist #epic #lit #heroic-fantasy",
			"Warden #epic #hist #ya #heroic-fantasy #sword-sorcery",
			"Keeper #epic #hist #lit #ya #heroic-fantasy #sword-sorcery",
			"Marshal #epic #hist #crime #ya #heroic-fantasy #urban-fantasy",
			"Steward #epic #hist #heroic-fantasy",
			"Reeve #epic #hist #heroic-fantasy",
			"Bellringer #epic #horror #lit #heroic-fantasy #urban-fantasy",
			"Harrower #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Magistrate #hist #crime #epic #heroic-fantasy #urban-fantasy",
			"Vicereine #epic #sf #hist #heroic-fantasy #space-opera",
			"Quartermaster #hist #sf #crime #space-opera #urban-fantasy",
			"Archivist #sf #lit #epic #heroic-fantasy #space-opera",
			"Almoner #hist #lit",
			"Chancellor #hist #epic #sf #heroic-fantasy #space-opera",
			"Rook #crime #epic #ya #heroic-fantasy #urban-fantasy"
		],
		"role": [
			"coroner #crime #horror #hist #urban-fantasy",
			"harbourmaster #hist #crime #sf #space-opera #urban-fantasy",
			"almoner #hist #lit #epic #heroic-fantasy",
			"wheelwright #hist #epic #lit #heroic-fantasy",
			"rat-catcher #horror #hist #crime #urban-fantasy",
			"cellarer #hist #epic #horror #heroic-fantasy #urban-fantasy",
			"draughtsman #sf #lit #hist #space-opera",
			"signal officer #sf #hist #crime #space-opera #military-sf #urban-fantasy",
			"herbalist #epic #hist #lit #ya #heroic-fantasy",
			"pallbearer #horror #lit #hist #urban-fantasy",
			"auctioneer #crime #lit #short #urban-fantasy",
			"lay preacher #hist #horror #lit #urban-fantasy",
			"xenobotanist #sf #space-opera",
			"fence #crime #hist #urban-fantasy",
			"apothecary #hist #lit #epic #heroic-fantasy",
			"cartographer #sf #epic #lit #ya #heroic-fantasy #space-opera",
			"locksmith #crime #lit #hist #ya #urban-fantasy",
			"undertaker #horror #crime #hist #urban-fantasy",
			"midwife #hist #lit #horror #urban-fantasy",
			"glassblower #lit #hist #short",
			"translator #lit #sf #crime #space-opera #urban-fantasy",
			"lamplighter #hist #horror #lit #urban-fantasy",
			"bookbinder #lit #hist #short",
			"gravedigger #horror #hist #crime #ya #urban-fantasy",
			"tax collector #hist #crime #epic #heroic-fantasy #urban-fantasy",
			"seamstress #hist #rom #lit",
			"falconer #epic #hist #ya #heroic-fantasy",
			"clockmaker #sf #hist #lit #space-opera",
			"salvor #sf #crime #space-opera #urban-fantasy",
			"smuggler #crime #hist #sf #ya #space-opera #urban-fantasy",
			"governess #rom #hist #horror #urban-fantasy",
			"housekeeper #crime #horror #lit #urban-fantasy",
			"schoolmaster #hist #lit #horror #urban-fantasy"
		],
		"person": [
			"foreigner #hist #lit #crime #urban-fantasy",
			"apprentice #hist #epic #lit #ya #heroic-fantasy",
			"debtor #crime #hist #lit #urban-fantasy",
			"convalescent #lit #horror #short #urban-fantasy",
			"surveyor #sf #hist #crime #space-opera #urban-fantasy",
			"man #lit #crime #short #urban-fantasy",
			"woman #lit #crime #rom #short #urban-fantasy",
			"boy #lit #short #horror #ya #urban-fantasy",
			"girl #lit #crime #short #ya #urban-fantasy",
			"king #epic #hist #heroic-fantasy",
			"queen #epic #hist #rom #heroic-fantasy",
			"god #epic #horror #sf #heroic-fantasy #space-opera #urban-fantasy",
			"stranger #crime #horror #lit #short #ya #urban-fantasy",
			"widow #crime #hist #lit #rom #urban-fantasy",
			"heir #epic #hist #rom #ya #heroic-fantasy",
			"soldier #hist #epic #sf #ya #heroic-fantasy #space-opera",
			"sister #lit #rom #horror #short #ya #urban-fantasy",
			"neighbour #crime #horror #lit #short #urban-fantasy",
			"passenger #sf #crime #lit #space-opera #urban-fantasy",
			"tenant #crime #horror #lit #urban-fantasy",
			"child #horror #lit #short #ya #urban-fantasy",
			"tribute #ya",
			"initiate #ya #epic #heroic-fantasy",
			"runner #ya #sf #space-opera",
			"recruit #ya #hist",
			"volunteer #ya",
			"orphan #ya #lit"
		],
		"kin": [
			"daughter #lit #hist #rom #horror #ya #urban-fantasy",
			"son #lit #hist #epic #ya #heroic-fantasy",
			"mother #lit #horror #rom #ya #urban-fantasy",
			"father #lit #hist #crime #urban-fantasy",
			"brother #epic #crime #lit #ya #heroic-fantasy #urban-fantasy",
			"sister #lit #rom #horror #ya #urban-fantasy",
			"wife #rom #crime #lit #urban-fantasy",
			"husband #rom #crime #lit #urban-fantasy",
			"cousin #hist #lit #short #ya",
			"grandmother #lit #horror #short #urban-fantasy",
			"twin #horror #sf #lit #ya #space-opera #urban-fantasy"
		],
		"group": [
			"Wardens #epic #hist #heroic-fantasy #sword-sorcery",
			"Kept #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Faithful #epic #hist #horror #ya #heroic-fantasy #urban-fantasy",
			"Drowned #epic #horror #ya #heroic-fantasy #urban-fantasy",
			"Nameless #epic #sf #horror #ya #heroic-fantasy #space-opera #urban-fantasy",
			"Unbidden #horror #epic #ya #heroic-fantasy #urban-fantasy",
			"Quiet Men #crime #hist #urban-fantasy",
			"Salt Guild #epic #hist #crime #heroic-fantasy #urban-fantasy",
			"Long Company #epic #hist #sf #heroic-fantasy #space-opera",
			"Bereaved #lit #horror #hist #ya #urban-fantasy",
			"Tithed #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"Unnumbered #epic #sf #horror #heroic-fantasy #space-opera #urban-fantasy",
			"Wintering Host #epic #hist #heroic-fantasy"
		],
		"epithet": [
			"Unwitnessed #epic #horror #hist #heroic-fantasy #urban-fantasy",
			"Tithebreaker #epic #hist #heroic-fantasy",
			"Becalmed #epic #sf #lit #heroic-fantasy #space-opera",
			"Wintercome #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"Merciful #epic #hist #rom #heroic-fantasy"
		],
		"honorific": [
			"Mister #lit #crime #hist #short #urban-fantasy",
			"Missus #lit #hist #short",
			"Doctor #crime #horror #sf #lit #ya #space-opera #urban-fantasy",
			"Captain #hist #sf #epic #ya #heroic-fantasy #space-opera",
			"Sister #horror #hist #lit #ya #urban-fantasy",
			"Professor #sf #crime #lit #space-opera #urban-fantasy",
			"Madame #hist #rom #crime #urban-fantasy",
			"Inspector #crime #hist #urban-fantasy",
			"Brother #horror #hist #epic #heroic-fantasy #urban-fantasy"
		],
		"verb": [
			"witness #crime #lit #hist #urban-fantasy",
			"unmake #epic #sf #horror #heroic-fantasy #space-opera #urban-fantasy",
			"pardon #hist #crime #rom #urban-fantasy",
			"enumerate #sf #lit #crime #space-opera #urban-fantasy",
			"salvage #sf #crime #lit #space-opera #military-sf #urban-fantasy",
			"disown #lit #hist #rom",
			"winter #epic #lit #hist #heroic-fantasy",
			"hold #epic #crime #hist #heroic-fantasy #urban-fantasy",
			"keep #epic #lit #crime #heroic-fantasy #sword-sorcery #urban-fantasy",
			"guard #epic #crime #hist #heroic-fantasy #urban-fantasy",
			"burn #epic #horror #crime #ya #heroic-fantasy #urban-fantasy",
			"break #crime #lit #epic #ya #heroic-fantasy #urban-fantasy",
			"remember #lit #rom #short #ya",
			"leave #lit #rom #crime #short #ya #urban-fantasy",
			"bury #crime #horror #hist #urban-fantasy",
			"wake #horror #sf #lit #space-opera #urban-fantasy",
			"trust #crime #rom #lit #ya #urban-fantasy",
			"follow #crime #horror #sf #ya #space-opera #urban-fantasy",
			"defend #epic #hist #crime #ya #heroic-fantasy #urban-fantasy",
			"name #epic #lit #sf #heroic-fantasy #space-opera",
			"count #crime #sf #lit #space-opera #urban-fantasy",
			"answer #crime #lit #sf #space-opera #urban-fantasy",
			"ransom #epic #crime #hist #heroic-fantasy #urban-fantasy",
			"outlive #lit #hist #horror #ya #urban-fantasy",
			"inherit #hist #lit #rom",
			"forgive #rom #lit #hist"
		],
		"gerund": [
			"inventorying #sf #lit #crime #space-opera #urban-fantasy",
			"overwintering #epic #lit #hist #heroic-fantasy",
			"disinheriting #hist #lit #rom",
			"salvaging #sf #crime #lit #space-opera #urban-fantasy",
			"finding #lit #crime #short #urban-fantasy",
			"holding #lit #rom #epic #heroic-fantasy",
			"keeping #lit #epic #hist #heroic-fantasy #sword-sorcery",
			"burning #horror #epic #crime #ya #heroic-fantasy #urban-fantasy",
			"leaving #lit #rom #short #ya",
			"guarding #epic #crime #heroic-fantasy #urban-fantasy",
			"breaking #crime #lit #sf #ya #space-opera #urban-fantasy",
			"tending #lit #hist #rom",
			"burying #horror #crime #hist #urban-fantasy",
			"counting #crime #sf #lit #space-opera #urban-fantasy",
			"translating #lit #sf #short #space-opera",
			"mending #lit #rom #hist #short",
			"outrunning #crime #sf #epic #ya #heroic-fantasy #space-opera #urban-fantasy"
		],
		"pastVerb": [
			"recanted #hist #crime #epic #heroic-fantasy #urban-fantasy",
			"overwintered #epic #lit #hist #heroic-fantasy",
			"absconded #crime #hist #lit #urban-fantasy",
			"kept faith #epic #hist #rom #heroic-fantasy",
			"went quiet #crime #horror #lit #ya #urban-fantasy",
			"paid the tithe #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"learned to lie #crime #lit #rom #urban-fantasy",
			"fell #epic #hist #lit #ya #heroic-fantasy",
			"vanished #crime #horror #sf #ya #space-opera #urban-fantasy",
			"waited #lit #rom #short",
			"burned #horror #epic #crime #ya #heroic-fantasy #urban-fantasy",
			"returned #lit #epic #sf #heroic-fantasy #space-opera",
			"lied #crime #lit #rom #ya #urban-fantasy",
			"wept #lit #rom #hist",
			"knelt #epic #hist #rom #heroic-fantasy",
			"stayed #lit #rom #short",
			"forgot #lit #sf #short #space-opera",
			"remembered #lit #sf #rom #space-opera",
			"drowned #horror #epic #crime #heroic-fantasy #urban-fantasy",
			"endured #hist #lit #epic #ya #heroic-fantasy",
			"sang #epic #lit #short #heroic-fantasy",
			"confessed #crime #lit #hist #ya #urban-fantasy",
			"refused #lit #hist #crime #rom #ya #urban-fantasy",
			"counted #crime #sf #lit #space-opera #urban-fantasy",
			"walked away #lit #crime #short #ya #urban-fantasy"
		],
		"pastPart": [
			"disinherited #hist #lit #rom",
			"unwitnessed #crime #horror #lit #urban-fantasy",
			"becalmed #hist #lit #sf #space-opera",
			"shriven #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"outnumbered #epic #sf #hist #heroic-fantasy #space-opera",
			"gone #crime #lit #horror #urban-fantasy",
			"lost #lit #epic #sf #ya #heroic-fantasy #space-opera",
			"buried #horror #crime #hist #urban-fantasy",
			"broken #crime #lit #epic #ya #heroic-fantasy #urban-fantasy",
			"forgotten #epic #lit #hist #ya #heroic-fantasy",
			"drowned #horror #epic #heroic-fantasy #urban-fantasy",
			"taken #crime #horror #sf #ya #space-opera #urban-fantasy",
			"forsaken #epic #horror #hist #heroic-fantasy #urban-fantasy",
			"kept #lit #rom #epic #heroic-fantasy",
			"burned #horror #crime #epic #ya #heroic-fantasy #urban-fantasy",
			"unmourned #horror #hist #epic #heroic-fantasy #urban-fantasy",
			"unclaimed #crime #lit #sf #ya #space-opera #urban-fantasy"
		],
		"strikeVerb": [
			"rises #epic #sf #hist #ya #heroic-fantasy #space-opera",
			"falls #epic #hist #horror #ya #heroic-fantasy #urban-fantasy",
			"awakens #horror #sf #epic #ya #heroic-fantasy #space-opera #urban-fantasy",
			"answers #epic #sf #horror #heroic-fantasy #space-opera #urban-fantasy",
			"endures #hist #epic #lit #heroic-fantasy",
			"returns #epic #sf #crime #ya #heroic-fantasy #space-opera #urban-fantasy",
			"holds #epic #hist #lit #heroic-fantasy"
		],
		"riseFall": [
			"fall #epic #hist #sf #ya #heroic-fantasy #space-opera",
			"ruin #epic #hist #horror #heroic-fantasy #sword-sorcery #urban-fantasy",
			"rise #epic #hist #sf #ya #heroic-fantasy #space-opera",
			"siege #epic #hist #heroic-fantasy #sword-sorcery",
			"breaking #epic #hist #sf #heroic-fantasy #space-opera",
			"reckoning #epic #horror #crime #ya #heroic-fantasy #sword-sorcery #urban-fantasy",
			"sundering #epic #sf #horror #ya #heroic-fantasy #space-opera #urban-fantasy"
		],
		"taleWord": [
			"reckoning #epic #crime #hist #heroic-fantasy #sword-sorcery #urban-fantasy",
			"account #hist #crime #lit #urban-fantasy",
			"psalm #epic #hist #horror #heroic-fantasy #urban-fantasy",
			"almanac #hist #sf #epic #heroic-fantasy #space-opera",
			"song #epic #lit #hist #ya #heroic-fantasy",
			"ballad #epic #hist #lit #ya #heroic-fantasy",
			"tale #epic #hist #short #heroic-fantasy",
			"legend #epic #hist #ya #heroic-fantasy",
			"chronicle #epic #hist #sf #heroic-fantasy #space-opera",
			"testament #epic #hist #horror #ya #heroic-fantasy #urban-fantasy",
			"book #epic #lit #sf #heroic-fantasy #space-opera",
			"death #epic #lit #crime #hist #heroic-fantasy #urban-fantasy",
			"life #lit #hist #rom",
			"memoir #lit #hist #short",
			"lament #epic #lit #hist #heroic-fantasy",
			"inventory #lit #sf #short #space-opera"
		],
		"seriesWord": [
			"Chronicles #epic #hist #sf *3 #ya #heroic-fantasy #space-opera",
			"Saga #epic #hist *2 #ya #heroic-fantasy",
			"Cycle #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"Sequence #epic #lit #sf #heroic-fantasy #space-opera",
			"Archive #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"Files #crime #sf #horror #ya #space-opera #urban-fantasy",
			"Annals #epic #hist #heroic-fantasy",
			"Quartet #lit #hist #rom",
			"Papers #crime #hist #lit #urban-fantasy",
			"Dossier #crime #sf #space-opera #urban-fantasy"
		],
		"refWord": [
			"Book #epic #lit #hist #ya #heroic-fantasy",
			"Dictionary #lit #sf #short #space-opera",
			"Encyclopaedia #lit #sf #space-opera",
			"Field Guide #sf #lit #short #ya #space-opera",
			"Catalogue #lit #sf #hist #space-opera",
			"Anatomy #lit #horror #hist #urban-fantasy",
			"Rules #crime #lit #sf #ya #space-opera #urban-fantasy",
			"Almanac #hist #epic #sf #heroic-fantasy #space-opera",
			"Register #hist #crime #lit #urban-fantasy",
			"Bestiary #epic #horror #sf #heroic-fantasy #space-opera #urban-fantasy"
		],
		"countWord": [
			"Trilogy #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"Duology #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"Quartet #lit #hist #rom",
			"Quintet #lit #sf #hist #space-opera"
		],
		"storyWord": [
			"Stories #lit #short #crime #ya #urban-fantasy",
			"Tales #epic #hist #short #ya #heroic-fantasy",
			"Cases #crime #short #urban-fantasy",
			"Sketches #lit #hist #short",
			"Fragments #lit #sf #short #ya #space-opera",
			"Dispatches #sf #hist #crime #short #space-opera #urban-fantasy"
		],
		"time": [
			"winter #epic #lit #hist #ya #heroic-fantasy",
			"dusk #horror #lit #rom #ya #urban-fantasy",
			"the harvest #epic #hist #lit #heroic-fantasy",
			"the thaw #epic #lit #hist #heroic-fantasy",
			"the long night #horror #epic #sf #ya #heroic-fantasy #space-opera #urban-fantasy",
			"the last summer #lit #rom #short",
			"first light #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"the small hours #crime #horror #lit #urban-fantasy",
			"the interregnum #hist #epic #sf #heroic-fantasy #space-opera",
			"the quiet years #lit #hist #sf #space-opera"
		],
		"shortTime": [
			"day #lit #crime #short #ya #urban-fantasy",
			"night #horror #crime #lit #ya #urban-fantasy",
			"winter #epic #lit #hist #heroic-fantasy",
			"summer #rom #lit #short #ya",
			"morning #lit #rom #short",
			"hour #crime #horror #sf #ya #space-opera #urban-fantasy"
		],
		"season": [
			"Midsummer #rom #lit #epic #ya #heroic-fantasy",
			"Michaelmas #hist #lit",
			"Monsoon #epic #hist #sf #heroic-fantasy #space-opera",
			"Lenten #hist #lit #horror #urban-fantasy",
			"Harvest #epic #hist #lit #heroic-fantasy",
			"Candlemas #hist #horror #lit #urban-fantasy",
			"Equinox #sf #epic #lit #ya #heroic-fantasy #space-opera",
			"Solstice #epic #sf #horror #ya #heroic-fantasy #space-opera #urban-fantasy"
		],
		"era": [
			"Age #epic #sf #hist #ya #heroic-fantasy #space-opera",
			"Year #hist #lit #sf #ya #space-opera",
			"Reign #epic #hist #ya #heroic-fantasy",
			"Century #hist #sf #lit #space-opera",
			"Season #lit #rom #epic #heroic-fantasy",
			"Decade #hist #lit #sf #space-opera"
		],
		"number": [
			"Seven #epic #horror #hist #ya #heroic-fantasy #urban-fantasy",
			"Twelve #epic #crime #hist #ya #heroic-fantasy #urban-fantasy",
			"Three #epic #lit #short #ya #heroic-fantasy",
			"Nine #epic #sf #horror #heroic-fantasy #space-opera #urban-fantasy",
			"Forty #hist #lit #epic #heroic-fantasy",
			"A Hundred #epic #lit #hist #heroic-fantasy",
			"Thirteen #horror #crime #ya #urban-fantasy",
			"Five #crime #sf #short #space-opera #urban-fantasy",
			"Twenty-One #crime #lit #sf #space-opera #urban-fantasy"
		],
		"ordinal": [
			"First #epic #sf #hist #ya #heroic-fantasy #space-opera",
			"Second #lit #crime #sf #ya #space-opera #urban-fantasy",
			"Third #lit #sf #horror #space-opera #urban-fantasy",
			"Seventh #epic #horror #hist #ya #heroic-fantasy #urban-fantasy",
			"Last #epic #sf #lit #ya #heroic-fantasy #space-opera",
			"Only #lit #rom #sf #ya #space-opera"
		],
		"quantAll": [
			"All #lit #epic #hist #ya #heroic-fantasy",
			"Everything #lit #sf #rom #ya #space-opera"
		],
		"quantNo": [
			"Nothing #lit #crime #horror #ya #urban-fantasy",
			"Nobody #crime #lit #horror #ya #urban-fantasy",
			"No One #crime #horror #short #ya #urban-fantasy",
			"Something #horror #lit #short #urban-fantasy"
		],
		"possessive": [
			"My #lit #rom #short *2 #ya",
			"Her #lit #rom #crime #ya #urban-fantasy",
			"His #lit #epic #hist #ya #heroic-fantasy",
			"Our #lit #hist #sf #space-opera",
			"Their #lit #sf #hist #ya #space-opera"
		],
		"manner": [
			"Regardless #lit #crime #short #urban-fantasy",
			"By Halves #lit #rom #short",
			"in Winter #epic #lit #hist #heroic-fantasy",
			"without Asking #crime #lit #rom #urban-fantasy",
			"Hard #crime #sf #space-opera #urban-fantasy",
			"Quietly #crime #lit #horror #urban-fantasy",
			"Twice #crime #lit #horror #ya #urban-fantasy",
			"Slowly #lit #horror #rom #urban-fantasy",
			"Alone #lit #sf #horror #ya #space-opera #urban-fantasy",
			"Anyway #lit #rom #short #ya"
		],
		"warmAdj": [
			"forgiving #rom #lit #horror #urban-fantasy",
			"hospitable #lit #horror #crime #urban-fantasy",
			"devoted #rom #lit #horror #urban-fantasy",
			"tender #rom #lit #horror #ya #urban-fantasy",
			"gentle #rom #lit #horror #ya #urban-fantasy",
			"merciful #epic #hist #horror #ya #heroic-fantasy #urban-fantasy",
			"patient #crime #horror #lit #urban-fantasy",
			"kindly #lit #horror #crime #urban-fantasy",
			"radiant #epic #sf #rom #heroic-fantasy #space-opera"
		],
		"coldNoun": [
			"attrition #sf #epic #hist #heroic-fantasy #space-opera",
			"quarantine #sf #horror #crime #space-opera #urban-fantasy",
			"liquidation #crime #sf #lit #space-opera #urban-fantasy",
			"slaughter #epic #horror #crime #ya #heroic-fantasy #urban-fantasy",
			"famine #epic #hist #sf #heroic-fantasy #space-opera",
			"inquisition #hist #horror #epic #heroic-fantasy #urban-fantasy",
			"autopsy #crime #horror #sf #space-opera #urban-fantasy",
			"foreclosure #crime #lit #urban-fantasy",
			"extinction #sf #horror #epic #ya #heroic-fantasy #space-opera #urban-fantasy",
			"reckoning #epic #crime #horror #ya #heroic-fantasy #sword-sorcery #urban-fantasy"
		]
	}
};
