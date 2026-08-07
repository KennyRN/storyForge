import { describe, expect, it } from "vitest";
import { canEnterContinuousMode, pickCurrentChapter, resolveEntryChapter } from "../continuousMode";

describe("canEnterContinuousMode", () => {
	it("is not offered for zero or one placed chapter", () => {
		expect(canEnterContinuousMode(0)).toBe(false);
		expect(canEnterContinuousMode(1)).toBe(false);
	});

	it("is offered once there are two or more", () => {
		expect(canEnterContinuousMode(2)).toBe(true);
		expect(canEnterContinuousMode(9)).toBe(true);
	});
});

describe("pickCurrentChapter", () => {
	it("returns null when nothing is visible yet", () => {
		expect(pickCurrentChapter([])).toBeNull();
		expect(pickCurrentChapter([{ filename: "a.md", ratio: 0 }])).toBeNull();
	});

	it("picks the most-visible chapter", () => {
		const result = pickCurrentChapter([
			{ filename: "a.md", ratio: 0.2 },
			{ filename: "b.md", ratio: 0.9 },
			{ filename: "c.md", ratio: 0 },
		]);
		expect(result).toBe("b.md");
	});

	it("keeps the earlier chapter on a tie", () => {
		const result = pickCurrentChapter([
			{ filename: "a.md", ratio: 0.5 },
			{ filename: "b.md", ratio: 0.5 },
		]);
		expect(result).toBe("a.md");
	});

	it("ignores negative-or-zero ratios entirely", () => {
		const result = pickCurrentChapter([
			{ filename: "a.md", ratio: 0 },
			{ filename: "b.md", ratio: 0 },
		]);
		expect(result).toBeNull();
	});
});

describe("resolveEntryChapter", () => {
	const ordered = ["a.md", "b.md", "c.md"];

	it("returns null for an empty spine", () => {
		expect(resolveEntryChapter([], "a.md")).toBeNull();
	});

	it("lands on the active chapter when it's on the spine", () => {
		expect(resolveEntryChapter(ordered, "b.md")).toBe("b.md");
	});

	it("falls back to the first placed chapter when the active chapter isn't on the spine", () => {
		expect(resolveEntryChapter(ordered, "idea.md")).toBe("a.md");
		expect(resolveEntryChapter(ordered, null)).toBe("a.md");
	});
});
