import { describe, expect, it } from "vitest";
import {
	focusModeForStorytellingMode,
	LEGACY_STORYTELLING_VIEW_TYPE,
	mapLegacyLeftRailViewType,
	storytellingModeForAutoFocus,
} from "../view/leftPanelMode";

describe("left panel / Focus pairing", () => {
	it("turns Focus on for storytelling mode and off for storyforge", () => {
		expect(focusModeForStorytellingMode(true)).toBe(true);
		expect(focusModeForStorytellingMode(false)).toBe(false);
	});

	it("lands in storytelling mode when autoFocus is on, storyforge when off", () => {
		expect(storytellingModeForAutoFocus(true)).toBe(true);
		expect(storytellingModeForAutoFocus(false)).toBe(false);
	});
});

describe("mapLegacyLeftRailViewType", () => {
	it("maps the retired storytelling leaf onto storyforge-view", () => {
		expect(mapLegacyLeftRailViewType(LEGACY_STORYTELLING_VIEW_TYPE)).toBe("storyforge-view");
		expect(mapLegacyLeftRailViewType("storyforge-view")).toBe("storyforge-view");
		expect(mapLegacyLeftRailViewType("storyforge-tools-view")).toBe("storyforge-tools-view");
	});
});
