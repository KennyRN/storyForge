import { describe, expect, it } from "vitest";
import { isRecommendTabActive } from "../view/recommendTabActive";

const TABS = ["novel", "chapter", "forge", "archive", "ideas"] as const;

function activeTabs(state: {
	forgeFamilyExpanded: boolean;
	showingArchive: boolean;
	showingIdeas: boolean;
	mode: "novel" | "chapter";
}): string[] {
	return TABS.filter((tab) => isRecommendTabActive(tab, state));
}

describe("isRecommendTabActive", () => {
	it("highlights only the current mode tab", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: false, showingArchive: false, showingIdeas: false, mode: "chapter" }),
		).toEqual(["chapter"]);
		expect(
			activeTabs({ forgeFamilyExpanded: false, showingArchive: false, showingIdeas: false, mode: "novel" }),
		).toEqual(["novel"]);
	});

	it("highlights only Forge family while that overlay is open, even if a mode is still selected", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: true, showingArchive: false, showingIdeas: false, mode: "chapter" }),
		).toEqual(["forge"]);
		expect(
			activeTabs({ forgeFamilyExpanded: true, showingArchive: false, showingIdeas: false, mode: "novel" }),
		).toEqual(["forge"]);
	});

	it("highlights only Archive while that overlay is open", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: false, showingArchive: true, showingIdeas: false, mode: "chapter" }),
		).toEqual(["archive"]);
	});

	it("highlights only Notebook while that overlay is open", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: false, showingArchive: false, showingIdeas: true, mode: "chapter" }),
		).toEqual(["ideas"]);
	});

	it("prefers Forge family if both overlays were somehow set", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: true, showingArchive: true, showingIdeas: true, mode: "novel" }),
		).toEqual(["forge"]);
	});

	it("prefers Archive over Notebook if both overlays were somehow set", () => {
		expect(
			activeTabs({ forgeFamilyExpanded: false, showingArchive: true, showingIdeas: true, mode: "novel" }),
		).toEqual(["archive"]);
	});

	it("does not keep Chapter highlighted when switching to Forge family", () => {
		expect(
			isRecommendTabActive("chapter", {
				forgeFamilyExpanded: true,
				showingArchive: false,
				showingIdeas: false,
				mode: "chapter",
			}),
		).toBe(false);
		expect(
			isRecommendTabActive("forge", {
				forgeFamilyExpanded: true,
				showingArchive: false,
				showingIdeas: false,
				mode: "chapter",
			}),
		).toBe(true);
	});
});
