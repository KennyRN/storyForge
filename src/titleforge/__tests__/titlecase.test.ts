import { describe, expect, it } from "vitest";
import { countWords, titleCase } from "../engine/titlecase.js";

describe("titleforge titleCase", () => {
	it("lowercases small words in the middle but not at the edges", () => {
		expect(titleCase("the lord of the rings")).toBe("The Lord of the Rings");
	});

	it("capitalises the first and last word even if they're small words", () => {
		expect(titleCase("of mice and men")).toBe("Of Mice and Men");
	});

	it("never relowercases an acronym that already arrives uppercase", () => {
		// This is the real-world shape: a lexicon gloss like "a NEET" is already
		// correctly cased before it reaches titleCase, which must leave it alone.
		expect(titleCase("a NEET gets reincarnated")).toBe("A NEET Gets Reincarnated");
	});

	it("capitalises the word right after a colon", () => {
		expect(titleCase("star wars: a new hope")).toBe("Star Wars: A New Hope");
	});

	it("capitalises each half of a hyphenated word", () => {
		expect(titleCase("the bone-white throne")).toBe("The Bone-White Throne");
	});

	it("fixes a/an to match the following word's sound", () => {
		expect(titleCase("a american tragedy")).toBe("An American Tragedy");
		expect(titleCase("an clockwork orange")).toBe("A Clockwork Orange");
	});

	it("handles the university/hour a-an exceptions", () => {
		expect(titleCase("a university guide")).toBe("A University Guide");
		expect(titleCase("a hour of reckoning")).toBe("An Hour of Reckoning");
	});

	it("returns an empty string for empty input", () => {
		expect(titleCase("")).toBe("");
		expect(titleCase("   ")).toBe("");
	});
});

describe("titleforge countWords", () => {
	it("counts words separated by whitespace", () => {
		expect(countWords("The Lord of the Rings")).toBe(5);
	});

	it("returns 0 for empty input", () => {
		expect(countWords("")).toBe(0);
		expect(countWords("   ")).toBe(0);
	});

	it("collapses runs of whitespace", () => {
		expect(countWords("The   Lord   of the Rings")).toBe(5);
	});
});
