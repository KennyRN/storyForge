import { describe, expect, it } from "vitest";
import { buildNameIndex, EMPTY_NAMES } from "../names";
import { POPUP_LIMIT, shortcodeEntries, shortcodeTrigger } from "../shortcodes";

describe("when a ~ opens the popup", () => {
	it.each([
		["~t", { tilde: 0, query: "t" }],
		["~th", { tilde: 0, query: "th" }],
		["He said ~th", { tilde: 8, query: "th" }],
		["(~th", { tilde: 1, query: "th" }],
		["“~ælf", { tilde: 1, query: "ælf" }],
		["a —~x", { tilde: 3, query: "x" }],
	])("%s opens it", (line, expected) => {
		expect(shortcodeTrigger(line)).toEqual(expected);
	});
	it.each([
		["~", "a ~ alone"],
		["a ~ b", "a ~ with a space after it"],
		["~9", "a ~ followed by a digit"],
		["a~th", "a ~ in the middle of a word"],
		["~~th", "~~ (strikethrough)"],
		["a ~~strike~~ ~th", "a ~ after a closed strikethrough still opens"],
	])("%s: %s", (line) => {
		const result = shortcodeTrigger(line);
		if (line === "a ~~strike~~ ~th") expect(result).toEqual({ tilde: 13, query: "th" });
		else expect(result).toBeNull();
	});
	it("a ~ inside an open ~~strikethrough~~ doesn't open it", () => {
		expect(shortcodeTrigger("~~struck ~th")).toBeNull();
		expect(shortcodeTrigger("~~struck~~ then ~th")).toEqual({ tilde: 16, query: "th" });
	});
	it("a ~ that follows a punctuation-free word does not (the ~ must start a word)", () => {
		expect(shortcodeTrigger("word~th")).toBeNull();
		expect(shortcodeTrigger("word.~th")).toBeNull();
	});
});

describe("what the popup offers", () => {
	const codes = { th: "the Right Honourable", tm: "the Master", TX: "the Exile", other: "something else" };
	const names = buildNameIndex([
		{ spelling: "Thomas", origin: "Codex/Thomas.md", title: true },
		{ spelling: "Þórr", origin: "Codex/Þórr.md", title: true },
		{ spelling: "Eðel", origin: "Codex/Eðel.md", title: true },
		{ spelling: "Red Blossom", origin: "Codex/Red Blossom.md", title: true },
	]);
	it("the author's codes first, matching by prefix ignoring case, alphabetical", () => {
		expect(shortcodeEntries("t", codes, EMPTY_NAMES, false).map((e) => e.label)).toEqual(["~th", "~tm", "~TX"]);
		expect(shortcodeEntries("TH", codes, EMPTY_NAMES, false).map((e) => e.text)).toEqual(["the Right Honourable"]);
		expect(shortcodeEntries("z", codes, EMPTY_NAMES, false)).toEqual([]);
	});
	it("Codex names follow, matched by their folded spelling, only when asked", () => {
		expect(shortcodeEntries("th", codes, names, true).map((e) => [e.label, e.kind])).toEqual([
			["~th", "code"],
			["Thomas", "name"],
			["Þórr", "name"], // þ folds to th
		]); // not Eðel: its first word folds to ethel or edel, which don't begin with th
		expect(shortcodeEntries("th", codes, names, false).map((e) => e.label)).toEqual(["~th"]);
		expect(shortcodeEntries("red", {}, names, true).map((e) => e.label)).toEqual(["Red Blossom"]);
		expect(shortcodeEntries("edel", {}, names, true).map((e) => e.text)).toEqual(["Eðel"]); // ð folds to d
	});
	it("at most the limit", () => {
		const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`a${String.fromCharCode(97 + i)}`, `text ${i}`]));
		expect(shortcodeEntries("a", many, EMPTY_NAMES, false)).toHaveLength(POPUP_LIMIT);
	});
});
