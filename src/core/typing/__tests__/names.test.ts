import { describe, expect, it } from "vitest";
import { countWords } from "../../wordCount";
import { buildNameIndex, foldForms, type NameSource } from "../names";
import { protectedRanges, touchesProtected } from "../protectedText";
import { typeWith, undoAll } from "./simulate";

const note = (spelling: string, origin = spelling): NameSource => ({ spelling, origin, title: true });
const alias = (spelling: string, origin: string): NameSource => ({ spelling, origin, title: false });

const SOURCES: NameSource[] = [
	note("Ælfric"),
	alias("Aelfric", "Ælfric"), // an alias that is only the plain spelling of its own title
	alias("Ælf", "Ælfric"),
	note("Zoë Åberg"),
	note("Red Blossom"),
	note("Red"),
	note("Sam"),
	note("Jane"),
	note("Eðel"),
	note("Thomas"),
	note("Mary-Anne"),
	note("Wynnflæd"),
	note("Ƿulf"),
	note("Ȝeoffrey"),
	note("Hrothgar", "word list"),
];
const index = (optOuts: string[] = []) => buildNameIndex(SOURCES, optOuts);

/** Typed text (every word finished by what follows it) and what the document holds. */
const CASES: [string, string][] = [
	["Aelfric ", "Ælfric "],
	["aelfric ", "Ælfric "], // lazy lowercase
	["AELFRIC ", "Ælfric "],
	["Ælfric ", "Ælfric "], // already right
	["Aelfric, said Sam.", "Ælfric, said Sam."],
	["Aelfric. ", "Ælfric. "],
	["(Aelfric) ", "(Ælfric) "],
	["He met aelfric and zoe aberg today.", "He met Ælfric and Zoë Åberg today."],
	["aelf ", "Ælf "], // an alias that is a real second name
	["Edel ", "Eðel "], // ð folds to d
	["ethel ", "Eðel "], // and to th
	["Wynnflaed ", "Wynnflæd "],
	["wulf ", "Ƿulf "], // wynn
	["geoffrey ", "Ȝeoffrey "], // yogh: g
	["yeoffrey ", "Ȝeoffrey "], // y
	["ghgeoffrey ", "ghgeoffrey "],
	["hrothgar ", "Hrothgar "], // a name from the project's word list
	["mary-anne ", "Mary-Anne "],
	["MARY-ANNE ", "Mary-Anne "],
	["sam, jane and aelfric.", "Sam, Jane and Ælfric."],
	// a possessive is kept, and curled
	["Aelfric's sword ", "Ælfric’s sword "],
	["thomas's hat ", "Thomas’s hat "],
	["jane's ", "Jane’s "],
	// only the word just finished, and only when it is finished
	["aelfric", "aelfric"],
	["aelfrics ", "aelfrics "],
	["unaelfric ", "unaelfric "],
	["aelfric-smith ", "aelfric-smith "],
	// no match, no change
	["Alfred ", "Alfred "],
	["Janet ", "Janet "],
	// multi-word names, the longest wins
	["zoe aberg ", "Zoë Åberg "],
	["Red blossom ", "Red Blossom "],
	["red blossom ", "Red Blossom "],
	["red ", "Red "],
	["a zoe ", "a zoe "], // half a name is not a name
	// protected text
	["[[aelfric]] ", "[[aelfric]] "],
	["`aelfric` ", "`aelfric` "],
	["%% aelfric %% ", "%% aelfric %% "],
	["see https://x.y/aelfric ", "see https://x.y/aelfric "],
	["~aelfric ", "~aelfric "], // a shortcode in progress
	["```\naelfric \n```", "```\naelfric \n```"],
];

describe("name autocorrect: what typing gives", () => {
	for (const [typed, expected] of CASES) {
		it(`${JSON.stringify(typed)} → ${JSON.stringify(expected)}`, () => {
			expect(typeWith(typed, { names: index() }).doc).toBe(expected);
		});
	}
});

describe("name autocorrect: folding", () => {
	it("joined letters, accents and capitals all fold away", () => {
		expect(foldForms("Ælfric")).toEqual(["aelfric"]);
		expect(foldForms("Zoë Åberg")).toEqual(["zoe aberg"]);
		expect(foldForms("ŒDIPUS")).toEqual(["oedipus"]);
		expect(foldForms("Eðel").sort()).toEqual(["edel", "ethel"]);
		expect(foldForms("Þórr")).toEqual(["thorr"]);
		expect(foldForms("Ƿulf")).toEqual(["wulf"]);
		expect(foldForms("Ȝeoffrey").sort()).toEqual(["geoffrey", "gheoffrey", "yeoffrey"]);
		expect(foldForms("Mary’s")).toEqual(["mary's"]);
	});
});

describe("name autocorrect: ambiguity", () => {
	const two = buildNameIndex([note("Eðel"), note("Ethel"), note("Ælfred"), note("Aelfred the Elder")]);
	it("a form two different names share is never corrected", () => {
		expect(typeWith("ETHEL ", { names: two }).doc).toBe("ETHEL ");
		expect(typeWith("ethel ", { names: two }).doc).toBe("ethel ");
	});
	it("a name typed exactly as one of them is left alone", () => {
		expect(typeWith("Ethel ", { names: two }).doc).toBe("Ethel ");
		expect(typeWith("Eðel ", { names: two }).doc).toBe("Eðel ");
	});
	it("a form only one name has is still corrected", () => {
		expect(typeWith("edel ", { names: two }).doc).toBe("Eðel ");
		expect(typeWith("aelfred ", { names: two }).doc).toBe("Ælfred ");
	});
	it("a note's own title and its alias don't make each other ambiguous, but two notes do", () => {
		const aliased = buildNameIndex([note("Ælfric"), alias("Aelfric", "Ælfric")]);
		expect(typeWith("aelfric ", { names: aliased }).doc).toBe("Ælfric ");
		const clash = buildNameIndex([note("Ælfric"), note("Aelfríc")]);
		expect(typeWith("aelfric ", { names: clash }).doc).toBe("aelfric ");
	});
});

describe("name autocorrect: names that are also ordinary words", () => {
	it("an opted-out name is never put in place of an all-lower-case word, but is still corrected with any capital", () => {
		const opted = index(["Red Blossom", "Red", "Sam"]);
		expect(typeWith("the red blossom fell ", { names: opted }).doc).toBe("the red blossom fell ");
		expect(typeWith("red ", { names: opted }).doc).toBe("red ");
		expect(typeWith("Red blossom ", { names: opted }).doc).toBe("Red Blossom ");
		expect(typeWith("RED ", { names: opted }).doc).toBe("Red ");
		expect(typeWith("Sam ", { names: opted }).doc).toBe("Sam ");
		expect(typeWith("sam ", { names: opted }).doc).toBe("sam ");
	});
	it("names not opted out are corrected in lower case, as Kenny wants", () => {
		expect(typeWith("sam ", { names: index() }).doc).toBe("Sam ");
	});
	it("the opt-out compares names ignoring case", () => {
		expect(typeWith("red ", { names: index(["RED"]) }).doc).toBe("red ");
	});
});

describe("name autocorrect: only text typed right now", () => {
	it("a word that was already there is never corrected, even when a space is typed after it", () => {
		expect(typeWith(" ", { initial: "aelfric", names: index() }).doc).toBe("aelfric ");
		expect(typeWith(" there ", { initial: "zoe aberg", names: index() }).doc).toBe("zoe aberg there ");
	});
	it("half of a multi-word name that was already there isn't joined to what is typed", () => {
		expect(typeWith("aberg ", { initial: "zoe ", names: index() }).doc).toBe("zoe aberg ");
	});
	it("a new line starts a new run", () => {
		expect(typeWith("a\naelfric ", { names: index() }).doc).toBe("a\nÆlfric ");
	});
});

describe("name autocorrect with smart punctuation off", () => {
	it("keeps the possessive's apostrophe as typed", () => {
		expect(typeWith("Aelfric's ", { names: index(), smart: false }).doc).toBe("Ælfric's ");
	});
	it("works on its own, with the punctuation aid off", () => {
		expect(typeWith("aelfric 'tis ", { names: index(), smart: false }).doc).toBe("Ælfric 'tis ");
	});
	it("and does nothing when its own switch is off", () => {
		expect(typeWith("aelfric ", { names: index(), nameAutocorrect: false }).doc).toBe("aelfric ");
	});
});

describe("name autocorrect: undo, and the word count", () => {
	it("every correction undoes to exactly what was typed", () => {
		for (const [typed] of CASES) expect(undoAll(typeWith(typed, { names: index() })), typed).toBe(typed);
	});
	it("a name correction carries what was typed and whether it was lower case, for the opt-out offer", () => {
		const sim = typeWith("aelfric Aelfric ", { names: index() });
		const names = sim.steps.flatMap((s) => s.changes).filter((c) => c.kind === "name").map((c) => c.name);
		expect(names).toEqual([
			{ spelling: "Ælfric", original: "aelfric", lowercase: true },
			{ spelling: "Ælfric", original: "Aelfric", lowercase: false },
		]);
	});
	it("a name never changes the word count", () => {
		for (const [typed] of CASES) expect(countWords(typeWith(typed, { names: index() }).doc), typed).toBe(countWords(typed));
	});
});

function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("name autocorrect: a fuzzer over random typing", () => {
	const PIECES = ["aelfric", "Aelfric", "zoe", "aberg", "red", "blossom", "sam", "jane", "edel", "thomas", "the", "and", "'s", " ", " ", " ", ".", ",", "-", "'", '"', "[[", "]]", "`", "%%", "~", "\n", "x", "9", "Aelfric's", "mary-anne"];
	it("never changes text before the run or inside protected text, never changes the word count, and always undoes to what was typed", () => {
		const next = rng(20261028);
		const names = index(["Red", "Sam"]);
		for (let n = 0; n < 4000; n++) {
			const pick = (len: number): string => Array.from({ length: len }, () => PIECES[Math.floor(next() * PIECES.length)]).join("");
			const initial = pick(Math.floor(next() * 4));
			const typed = pick(1 + Math.floor(next() * 14));
			const sim = typeWith(typed, { initial, names });
			const label = JSON.stringify({ initial, typed });
			expect(sim.doc.startsWith(initial), label).toBe(true);
			for (const step of sim.steps) {
				const ranges = protectedRanges(step.docBefore);
				for (const c of step.changes) expect(touchesProtected(ranges, c.from, c.to), label + JSON.stringify(c)).toBe(false);
			}
			expect(undoAll(sim), label).toBe(sim.typed);
			expect(countWords(sim.doc), label).toBe(countWords(sim.typed));
		}
	});
});
