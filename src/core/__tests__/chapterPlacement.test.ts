import { describe, expect, it } from "vitest";
import { computeChapterOrderAfterCreation } from "../chapterPlacement";

describe("computeChapterOrderAfterCreation", () => {
	it("inserts after the anchor, in the middle of the order", () => {
		const next = computeChapterOrderAfterCreation(["a.md", "b.md", "c.md"], "new.md", { type: "after", anchor: "a.md" });
		expect(next).toEqual(["a.md", "new.md", "b.md", "c.md"]);
	});

	it("inserting after the last chapter is equivalent to appending", () => {
		const next = computeChapterOrderAfterCreation(["a.md", "b.md"], "new.md", { type: "after", anchor: "b.md" });
		expect(next).toEqual(["a.md", "b.md", "new.md"]);
	});

	it("falls back to append when the anchor isn't in the order", () => {
		const next = computeChapterOrderAfterCreation(["a.md", "b.md"], "new.md", { type: "after", anchor: "missing.md" });
		expect(next).toEqual(["a.md", "b.md", "new.md"]);
	});

	it("appends explicitly onto a non-empty order", () => {
		const next = computeChapterOrderAfterCreation(["a.md", "b.md"], "new.md", { type: "append" });
		expect(next).toEqual(["a.md", "b.md", "new.md"]);
	});

	it("appends onto an empty order (no placed chapters yet)", () => {
		const next = computeChapterOrderAfterCreation([], "new.md", { type: "append" });
		expect(next).toEqual(["new.md"]);
	});

	it("leaves the order untouched for an idea chapter (unplaced)", () => {
		const next = computeChapterOrderAfterCreation(["a.md", "b.md"], "new.md", { type: "unplaced" });
		expect(next).toEqual(["a.md", "b.md"]);
	});

	it("leaves an empty order untouched for an idea chapter", () => {
		const next = computeChapterOrderAfterCreation([], "new.md", { type: "unplaced" });
		expect(next).toEqual([]);
	});
});
