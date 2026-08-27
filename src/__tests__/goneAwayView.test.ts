import { describe, expect, it } from "vitest";
import { isGoneAwayPlaceholder, viewTypeFromGoneAwayText, viewTypeFromLeafChrome } from "../goneAwayView";

describe("viewTypeFromGoneAwayText", () => {
	it("reads the view type out of Obsidian's EmptyView placeholder", () => {
		expect(
			viewTypeFromGoneAwayText("The plugin that created this view (storyforge-view) has gone away"),
		).toBe("storyforge-view");
	});

	it("accepts the older prefixed sentence", () => {
		expect(
			viewTypeFromGoneAwayText(
				"Plugin no longer active. The plugin that created this view (storyforge-storytelling-view) has gone away",
			),
		).toBe("storyforge-storytelling-view");
	});

	it("returns null when the placeholder is a plain empty editor", () => {
		expect(viewTypeFromGoneAwayText("Create new note")).toBeNull();
	});
});

describe("viewTypeFromLeafChrome", () => {
	const types = ["storyforge-view", "storyforge-storytelling-view", "storyforge-tools-view"];

	it("prefers the gone-away sentence", () => {
		expect(
			viewTypeFromLeafChrome("The plugin that created this view (storyforge-view) has gone away", types),
		).toBe("storyforge-view");
	});

	it("matches a tab title that is still the raw view-type id", () => {
		expect(viewTypeFromLeafChrome("empty\nstoryforge-storytelling-view", types)).toBe(
			"storyforge-storytelling-view",
		);
	});

	it("does not match Create new note", () => {
		expect(viewTypeFromLeafChrome("Create new note", types)).toBeNull();
	});
});

describe("isGoneAwayPlaceholder", () => {
	it("detects the EmptyView sentence", () => {
		expect(isGoneAwayPlaceholder("The plugin that created this view (storyforge-view) has gone away")).toBe(true);
		expect(isGoneAwayPlaceholder("Create new note")).toBe(false);
	});
});
