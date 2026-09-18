import { describe, expect, it } from "vitest";
import { resolveCurrentChapterIndex } from "../spineWindow";

interface Chapter {
	name: string;
}
const ch = (name: string): Chapter => ({ name });
const keyOf = (c: Chapter) => c.name;

describe("resolveCurrentChapterIndex", () => {
	const spine = [ch("a.md"), ch("b.md"), ch("c.md"), ch("d.md"), ch("e.md")];

	it("resolves the index of the current chapter", () => {
		expect(resolveCurrentChapterIndex(spine, "a.md", keyOf)).toBe(0);
		expect(resolveCurrentChapterIndex(spine, "c.md", keyOf)).toBe(2);
		expect(resolveCurrentChapterIndex(spine, "e.md", keyOf)).toBe(4);
	});

	it("falls back to the first placed chapter when currentKey is an idea/unplaced chapter not on the spine", () => {
		expect(resolveCurrentChapterIndex(spine, "idea.md", keyOf)).toBe(0);
	});

	it("falls back to the first placed chapter when currentKey is null (nothing open yet)", () => {
		expect(resolveCurrentChapterIndex(spine, null, keyOf)).toBe(0);
	});
});
