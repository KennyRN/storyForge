import { describe, expect, it } from "vitest";
import { nextChapterCode } from "../chapterCode";

describe("nextChapterCode", () => {
	it("starts at 'aaa' when the book has no chapters yet", () => {
		expect(nextChapterCode("knna", [])).toBe("knna_chapter-aaa");
	});

	it("continues past the highest existing triple", () => {
		expect(nextChapterCode("knna", ["knna_chapter-aaa", "knna_chapter-aab"])).toBe("knna_chapter-aac");
	});

	it("ignores chapter ids belonging to other books", () => {
		expect(nextChapterCode("knna", ["book-1_chapter-zzz"])).toBe("knna_chapter-aaa");
	});

	it("never reuses a gap left by a deleted chapter", () => {
		expect(nextChapterCode("knna", ["knna_chapter-aaa", "knna_chapter-aac"])).toBe("knna_chapter-aad");
	});

	it("carries over correctly at a letter boundary (aaz -> aba)", () => {
		expect(nextChapterCode("knna", ["knna_chapter-aaz"])).toBe("knna_chapter-aba");
	});

	it("carries over correctly at a full wraparound (azz -> baa)", () => {
		expect(nextChapterCode("knna", ["knna_chapter-azz"])).toBe("knna_chapter-baa");
	});

	it("throws once all codes for a book are exhausted", () => {
		expect(() => nextChapterCode("knna", ["knna_chapter-zzz"])).toThrow(/exhausted chapter codes/);
	});
});
