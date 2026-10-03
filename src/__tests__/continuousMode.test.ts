import { describe, expect, it } from "vitest";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";

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
