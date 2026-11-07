import { describe, expect, it } from "vitest";
import { protectedRanges, touchesProtected, unclosedOnLine } from "../protectedText";
import { typeWith, undoAll } from "./simulate";

/** Typed text on the left, what the document holds after the aid on the right. */
const CASES: [string, string, string?][] = [
	// quotes and apostrophes
	['"Hello"', "“Hello”"],
	["'Hello'", "‘Hello’"],
	["don't", "don’t"],
	["Ælfric's sword", "Ælfric’s sword"],
	["it's the '90s", "it’s the ’90s"],
	["'90s", "’90s"],
	[`"I said 'no'."`, "“I said ‘no’.”"],
	[`"'Yes,' she said"`, "“‘Yes,’ she said”"],
	["(a \"b\")", "(a “b”)"],
	["said.'", "said.’"],
	["He said, 'Go.'", "He said, ‘Go.’"],
	// an apostrophe straight after an opening quote, and the elision list
	["''Tis night", "‘’Tis night"],
	["'twas night", "’twas night"],
	["'Twas night", "’Twas night"],
	["'em, I said", "’em, I said"],
	["'cause and effect", "’cause and effect"],
	["'em' said", "‘em’ said"], // a quoted word: finished by a quote mark
	["'hello there", "‘hello there"], // not on the list
	// dashes: the spaced hyphen and the double hyphen wait for the next character
	["well--then", "well—then"],
	["x -- y", "x — y"],
	["--I said", "—I said"],
	["a - b", "a – b"],
	["Chapter 5 - the storm", "Chapter 5 – the storm"],
	["5 - 3", "5 - 3"], // a digit straight after a number
	["a - 3", "a – 3"],
	["a - ", "a - "], // nothing typed after it yet
	["a --", "a --"],
	["---", "---"],
	["a ---b", "a ---b"],
	["- a list item", "- a list item"],
	["  - an indented list item", "  - an indented list item"],
	["-- ", "-- "],
	["|--|--|", "|--|--|"],
	["| a | b |\n| - | - |", "| a | b |\n| - | - |"], // the alignment row of a table (the parser needs the header row above it)
	["1990-95", "1990-95"],
	["well-known", "well-known"],
	// a dash completed by a quote, and the quote it is
	['she said--"no"', "she said—“no”"],
	['a - "b"', "a – “b”"],
	// the ellipsis
	["wait...", "wait…"],
	["wait....", "wait…."],
	["wait...what", "wait…what"],
	["a.. b", "a.. b"],
	// all together
	["'Don't say \"never\" - not yet,' she said.", "‘Don’t say “never” – not yet,’ she said."],
	// protected text: links, embeds, code, comments, URLs
	// `[[x]]` and `%% %%` are plain text now (decision 157): they are curled like any other words.
	["[[it's]]", "[[it’s]]"],
	["[[it]] it's", "[[it]] it’s"],
	["%% 'x' -- y... %% 'z'", "%% ‘x’ — y… %% ‘z’"],
	// What is typed one character at a time is protected from its unclosed opener to the caret (the unclosed-line rule, beside the tree), so the old cases hold again.
	["`don't` and don't", "`don't` and don’t"],
	["``a ` b 'c'`` 'd'", "``a ` b 'c'`` ‘d’"],
	["x [t](u's) it's", "x [t](u's) it’s"],
	["see https://a.b/it's and www.c.d/it's now it's", "see https://a.b/it's and www.c.d/it's now it’s"],
	["a <!-- 'x' -- y... --> 'z'", "a <!-- 'x' -- y... --> ‘z’"], // mid-line: protected while it is being typed, curled once it is closed
	["`don't`\nit's", "`don't`\nit’s"], // it stops at the line's end
	["`open\nit's", "`open\nit’s"], // an opener on an earlier line protects nothing on the next
	// An HTML comment that starts a line is a comment to the end (the parser's reading of an unclosed one).
	// (Text after `-->` on that same line belongs to the HTML block too, as on GitHub, so it is left alone.)
	["<!-- 'x' -- y... --> 'z'", "<!-- 'x' -- y... --> 'z'"],
	["<!-- a\n 'b' -- c --> 'd'", "<!-- a\n 'b' -- c --> 'd'"],
	["<!-- a --> 'b'\n\n'c'", "<!-- a --> 'b'\n\n‘c’"],
	["see https://a.b/it's -- now", "see https://a.b/it's — now"],
	["[x's](https://a.b/it's) 'y'", "[x’s](https://a.b/it's) ‘y’"],
	["```\nit's -- a...\n```\nit's", "```\nit's -- a...\n```\nit’s"],
	["~~~\n'x'\n~~~", "~~~\n'x'\n~~~"],
	["    it's indented prose", "    it’s indented prose"], // indented lines are prose, not code (decision 22)
];

describe("smart punctuation: what typing gives", () => {
	for (const [typed, expected] of CASES) {
		it(`${JSON.stringify(typed)} → ${JSON.stringify(expected)}`, () => {
			expect(typeWith(typed).doc).toBe(expected);
		});
	}
});

describe("smart punctuation: only text typed right now", () => {
	it("a hyphen, `--`, `...` or a quote that was already there is never reached back to", () => {
		expect(typeWith(" b", { initial: "a -" }).doc).toBe("a - b");
		expect(typeWith("x", { initial: "a--" }).doc).toBe("a--x");
		expect(typeWith(".", { initial: ".." }).doc).toBe("...");
		expect(typeWith("9", { initial: "‘" }).doc).toBe("‘9");
		expect(typeWith(" ", { initial: "‘tis" }).doc).toBe("‘tis ");
	});
	it("the typed character itself is still converted next to old text", () => {
		expect(typeWith("'", { initial: "don" }).doc).toBe("don’");
		expect(typeWith('"', { initial: "said " }).doc).toBe("said “");
	});
	it("a new line starts a new run", () => {
		expect(typeWith("a\n--I").doc).toBe("a\n—I");
	});
	it("text before the run is never changed, whatever is typed", () => {
		const initial = "He said 'no' -- and 'twas... 'it's' [[x's]]";
		expect(typeWith("-- 'ok' \"yes\" - maybe...", { initial }).doc.startsWith(initial)).toBe(true);
	});
});

describe("smart punctuation: the project's elision list", () => {
	it("a word on the list takes the apostrophe; one off it doesn't; the list is the author's", () => {
		expect(typeWith("'ere we go", { elisions: ["ere"] }).doc).toBe("’ere we go");
		expect(typeWith("'tis night", { elisions: ["ere"] }).doc).toBe("‘tis night");
		expect(typeWith("'tis night", { elisions: [] }).doc).toBe("‘tis night");
	});
});

describe("smart punctuation: one undo gives back exactly what was typed", () => {
	it("undoing every step of every case returns the typed text", () => {
		for (const [typed] of CASES) expect(undoAll(typeWith(typed)), typed).toBe(typed);
	});
	it("a keystroke that makes two changes undoes them together", () => {
		const sim = typeWith('she said--"no"');
		const two = sim.steps.find((s) => s.changes.length === 2);
		expect(two?.changes.map((c) => c.kind).sort()).toEqual(["em-dash", "quote"]);
	});
});

describe("protected text", () => {
	const at = (text: string, needle: string): number => text.indexOf(needle);
	it("finds code, HTML comments, URLs, link targets and fences", () => {
		const text = "a `c's` b <span x=\"y's\"> https://x.y/z's [t](u's) e's\n\n<!-- d's -->";
		const ranges = protectedRanges(text);
		for (const needle of ["c's", "y's", "https://x.y/z", "u's", "d's"]) expect(touchesProtected(ranges, at(text, needle)), needle).toBe(true);
		expect(touchesProtected(ranges, at(text, "e's") + 1)).toBe(false);
		expect(touchesProtected(ranges, at(text, "t](") + 0)).toBe(false); // a link's text is prose
	});
	it("an unclosed fence, or a comment that starts a line, protects to the end (the tree)", () => {
		for (const open of ["```\nab", "<!-- ab"]) {
			const text = `go\n\n${open}`;
			expect(touchesProtected(protectedRanges(text), text.length - 1), open).toBe(true);
		}
	});
	it("a closed one no longer does", () => {
		for (const text of ["`ab` cd", "[t](u) cd", "go <!-- ab --> cd", "https://a.b cd"]) expect(touchesProtected(protectedRanges(text), text.length - 1), text).toBe(false);
	});
	it("fences and table separator rows", () => {
		const text = "```js\nx\n```\nafter\n| a | b |\n|---|---|\ntail";
		const r = protectedRanges(text);
		expect(touchesProtected(r, at(text, "x\n"))).toBe(true);
		expect(touchesProtected(r, at(text, "after"))).toBe(false);
		expect(touchesProtected(r, at(text, "|---|"))).toBe(true);
		expect(touchesProtected(r, at(text, "tail"))).toBe(false);
	});
	it("indented text is not code", () => {
		const text = "    indented prose";
		expect(protectedRanges(text)).toEqual([]);
	});
});

// A small seeded generator, so a failure can be reproduced.
function rng(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe("smart punctuation: a fuzzer over random typing", () => {
	const ALPHABET = ["a", "b", "t", "e", "m", "s", "'", '"', "-", "-", ".", ".", " ", " ", "[", "]", "(", ")", "`", "%", "#", "|", ":", "9", "5", ",", "\n", "—", "‘", "’"];
	it("never touches text before the run, never acts in protected text, and always undoes to what was typed", () => {
		const next = rng(20261027);
		for (let n = 0; n < 4000; n++) {
			const pick = (len: number): string => Array.from({ length: len }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join("");
			const initial = pick(Math.floor(next() * 12));
			const typed = pick(1 + Math.floor(next() * 40));
			const sim = typeWith(typed, { initial });
			// never reaches into text that was already there
			expect(sim.doc.startsWith(initial), JSON.stringify({ initial, typed })).toBe(true);
			// every change was outside protected text at the time it was made
			for (const step of sim.steps) {
				const ranges = protectedRanges(step.docBefore);
				for (const c of step.changes) expect(touchesProtected(ranges, c.from, c.to), JSON.stringify({ initial, typed, c })).toBe(false);
			}
			// undoing every step gives exactly what was typed
			expect(undoAll(sim), JSON.stringify({ initial, typed })).toBe(sim.typed);
		}
	});
});

describe("the unclosed-line rule (Brief 20): from an unclosed opener to the caret, on the caret's line only", () => {
	const protectedAtEnd = (text: string): boolean => touchesProtected(protectedRanges(text), text.length - 1);
	it("each opener: a backtick, a link target, <!--, and a bare web address (http://, https://, www.)", () => {
		for (const text of ["go `ab", "go ``ab", "go [t](ab", "go <!-- ab", "go http://ab", "go https://ab", "go www.ab", "go HTTPS://ab", "http://ab"]) expect(protectedAtEnd(text), text).toBe(true);
	});
	it("it covers exactly from the opener to the caret", () => {
		const text = "before `ab cd";
		expect(unclosedOnLine(text, 0)).toEqual([[7, 13]]);
		expect(unclosedOnLine("x [t](ab", 10)).toEqual([[14, 18]]);
		expect(unclosedOnLine("see https://a.b/it", 0)).toEqual([[4, 18]]);
	});
	it("a closed construct protects nothing after it closes", () => {
		for (const text of ["go `ab` cd", "go ``a`b`` cd", "go [t](ab) cd", "go <!-- ab --> cd", "go https://ab cd"]) expect(unclosedOnLine(text, 0), text).toEqual([]);
	});
	it("a bare address ends at a space, and `www.` must start a word", () => {
		expect(unclosedOnLine("go https://ab cd", 0)).toEqual([]);
		expect(unclosedOnLine("awww.ab", 0)).toEqual([]);
		expect(unclosedOnLine("(www.ab", 0)).toEqual([[1, 7]]);
	});
	it("it stops at the line's end: an opener on an earlier line protects nothing on the caret's", () => {
		for (const opener of ["`ab", "[t](ab", "go <!-- ab", "https://ab"]) { // (a comment that starts its line is the tree's, and runs to the end)
			const text = `${opener}\nit's`;
			expect(touchesProtected(protectedRanges(text), text.length - 1), opener).toBe(false);
		}
	});
	it("it only adds: whatever the tree protects stays protected", () => {
		const text = "`code` and `open";
		const r = protectedRanges(text);
		expect(touchesProtected(r, 2)).toBe(true); // the closed span, from the tree
		expect(touchesProtected(r, text.length - 1)).toBe(true); // the open one, from the rule
		expect(touchesProtected(r, 8)).toBe(false); // the words between
	});
});
