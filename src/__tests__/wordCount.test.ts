import { describe, expect, it } from "vitest";
import { countWords, excerpt, stripForCounting, sumWordCounts } from "../wordCount";

describe("stripForCounting", () => {
	it("strips a leading YAML frontmatter block", () => {
		const raw = "---\nstatus: draft\n---\nThe rain came sideways.";
		expect(stripForCounting(raw).trim()).toBe("The rain came sideways.");
	});

	it("leaves prose with no frontmatter untouched", () => {
		const raw = "The rain came sideways that morning.";
		expect(stripForCounting(raw)).toBe(raw);
	});

	it("strips %% ... %% comments, including multi-line ones", () => {
		const raw = "Before. %% cut this\nand this %% After.";
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
		expect(countWords("one %% two three %% four")).toBe(2);
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
