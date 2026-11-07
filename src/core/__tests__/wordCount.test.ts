import { describe, expect, it } from "vitest";
import { countWords, excerpt, formatWordCount, stripForCounting, sumWordCounts } from "../wordCount";

describe("stripForCounting", () => {
	it("strips a leading YAML frontmatter block", () => {
		const raw = "---\nstatus: draft\n---\nThe rain came sideways.";
		expect(stripForCounting(raw).trim()).toBe("The rain came sideways.");
	});

	it("leaves prose with no frontmatter untouched", () => {
		const raw = "The rain came sideways that morning.";
		expect(stripForCounting(raw)).toBe(raw);
	});

	it("strips <!-- ... --> comments, including multi-line ones", () => {
		const raw = "Before. <!-- cut this\nand this --> After.";
		expect(stripForCounting(raw)).toBe("Before.  After.");
	});

	it("does not treat a lone leading '---' with no closing delimiter as frontmatter", () => {
		const raw = "---\nThis is actually a horizontal rule paragraph.";
		expect(stripForCounting(raw)).toBe(raw);
	});
});

describe("countWords", () => {
	it("counts whitespace-delimited words", () => {
		expect(countWords("one two three")).toBe(3);
	});

	it("returns 0 for empty or frontmatter-only content", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("---\nstatus: draft\n---\n")).toBe(0);
	});

	it("ignores stripped comments when counting", () => {
		expect(countWords("one <!-- two three --> four")).toBe(2);
	});
});

describe("dashes and ellipses (decision 49)", () => {
	const CASES: [string, number][] = [
		// separators: em dash, en dash, two hyphens, ellipsis
		["word—word", 2],
		["word–word", 2],
		["word--word", 2],
		["word---word", 2],
		["wait…what", 2],
		["wait...what", 2],
		["wait....what", 2],
		["wait..what", 1],
		["a—b—c", 3],
		["end of line—", 3],
		["trailing...", 1],
		["…and then", 2],
		// a single hyphen joins
		["well-known", 1],
		["mother-in-law", 1],
		["well-known—word", 2],
		// a run with no letter or digit is not a word
		["word – word", 2],
		["word — word", 2],
		["word - word", 2],
		["word -- word", 2],
		["…", 0],
		["...", 0],
		["word … word", 2],
		["# Heading", 1],
		["- item", 1],
		["***", 0],
		// number ranges are as they always were: one word
		["1990–95", 1],
		["1990-95", 1],
		["1990—95", 1],
		["1990--95", 1],
		["pp. 12–14", 2],
		["12–14", 1],
		["12 – 14", 2],
		["a–5", 2],
		["5–a", 2],
		["5–", 1],
		// accents, marks and other scripts are letters
		["Zoë—Åberg", 2],
		["日本語—日本語", 2],
	];
	for (const [text, words] of CASES) it(`${JSON.stringify(text)} is ${words}`, () => expect(countWords(text)).toBe(words));

	it("a comment's dashes are not counted, and a line's count adds up", () => {
		expect(countWords("one <!-- a—b—c --> two—three")).toBe(3);
		expect(countWords("one—two\n\nthree – four\n")).toBe(4);
	});
});

describe("formatWordCount", () => {
	it("groups thousands and does not append a unit word", () => {
		expect(formatWordCount(0)).toBe("0");
		expect(formatWordCount(312)).toBe("312");
		expect(formatWordCount(1234)).toBe("1,234");
		expect(formatWordCount(1_000_000)).toBe("1,000,000");
	});
});

describe("sumWordCounts", () => {
	it("sums counts across chapters", () => {
		expect(sumWordCounts(["one two", "three four five", ""])).toBe(5);
	});
});

describe("excerpt", () => {
	it("returns short text unchanged", () => {
		expect(excerpt("The rain came sideways.")).toBe("The rain came sideways.");
	});

	it("truncates text over maxLength with a trailing ellipsis and no dangling whitespace", () => {
		const long = "word ".repeat(100).trim();
		const result = excerpt(long);
		expect(result.endsWith("…")).toBe(true);
		expect(result.length).toBe(200);
		expect(result[result.length - 2]).not.toBe(" ");
	});

	it("returns an empty string for empty or whitespace-only input", () => {
		expect(excerpt("")).toBe("");
		expect(excerpt("   \n\t  ")).toBe("");
	});

	it("respects a custom maxLength", () => {
		expect(excerpt("one two three four five", 8)).toBe("one two…");
	});
});
