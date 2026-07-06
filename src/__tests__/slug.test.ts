import { describe, expect, it } from "vitest";
import { mintId, slugify } from "../slug";

describe("slugify", () => {
	it("lowercases and hyphenates a folder name", () => {
		expect(slugify("Book One")).toBe("book-one");
	});

	it("collapses punctuation and trims stray hyphens", () => {
		expect(slugify(" The Ninefold Saga! ")).toBe("the-ninefold-saga");
	});

	it("falls back to 'book' for a name with no alphanumeric characters", () => {
		expect(slugify("***")).toBe("book");
	});
});

describe("mintId", () => {
	it("uses the plain slug when it is not already taken", () => {
		expect(mintId("Book One", [])).toBe("book-one");
	});

	it("de-duplicates against existing ids with a numeric suffix", () => {
		expect(mintId("Book One", ["book-one"])).toBe("book-one-2");
		expect(mintId("Book One", ["book-one", "book-one-2"])).toBe("book-one-3");
	});
});
