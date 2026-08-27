import { describe, expect, it } from "vitest";
import { libraryChapterPath } from "../paths";
import { resolveStorytellingCenterPath } from "../storytellingCenter";

const book = "TECa";
const selected = "chapter-one.md";
const first = "chapter-zero.md";

describe("resolveStorytellingCenterPath", () => {
	it("returns null when no book is selected", () => {
		expect(resolveStorytellingCenterPath(null, selected, () => true, first)).toBeNull();
	});

	it("prefers the persisted chapter when that file still exists", () => {
		expect(resolveStorytellingCenterPath(book, selected, (path) => path.endsWith(selected), first)).toBe(
			libraryChapterPath(book, selected),
		);
	});

	it("falls back to the first placed chapter when the persisted file is gone", () => {
		expect(resolveStorytellingCenterPath(book, selected, () => false, first)).toBe(libraryChapterPath(book, first));
	});

	it("opens the first placed chapter when nothing is persisted yet", () => {
		expect(resolveStorytellingCenterPath(book, null, () => true, first)).toBe(libraryChapterPath(book, first));
	});

	it("returns null when the book has no chapter to open", () => {
		expect(resolveStorytellingCenterPath(book, null, () => false, null)).toBeNull();
	});
});
