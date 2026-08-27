import { describe, expect, it } from "vitest";
import { isRecommendTabActive } from "../view/recommendTabActive";

const TABS = ["novel", "chapter", "details", "dossier", "forge", "archive"] as const;

function activeTabs(state: {
	forgeFamilyExpanded: boolean;
	showingArchive: boolean;
	mode: "novel" | "chapter" | "details" | "dossier";
}): string[] {
	return TABS.filter((tab) => isRecommendTabActive(tab, state));
}

describe("isRecommendTabActive", () => {
	it("highlights only the current mode tab", () => {
		expect(activeTabs({ forgeFamilyExpanded: false, showingArchive: false, mode: "chapter" })).toEqual([
			"chapter",
		]);
		expect(activeTabs({ forgeFamilyExpanded: false, showingArchive: false, mode: "novel" })).toEqual([
			"novel",
		]);
	});

	it("highlights only Forge family while that overlay is open, even if a mode is still selected", () => {
		expect(activeTabs({ forgeFamilyExpanded: true, showingArchive: false, mode: "chapter" })).toEqual([
			"forge",
		]);
		expect(activeTabs({ forgeFamilyExpanded: true, showingArchive: false, mode: "dossier" })).toEqual([
			"forge",
		]);
	});

	it("highlights only Archive while that overlay is open", () => {
		expect(activeTabs({ forgeFamilyExpanded: false, showingArchive: true, mode: "details" })).toEqual([
			"archive",
		]);
	});

	it("prefers Forge family if both overlays were somehow set", () => {
		expect(activeTabs({ forgeFamilyExpanded: true, showingArchive: true, mode: "novel" })).toEqual([
			"forge",
		]);
	});

	it("does not keep Dossier (or any mode) highlighted when switching to Forge family", () => {
		expect(isRecommendTabActive("dossier", { forgeFamilyExpanded: true, showingArchive: false, mode: "dossier" })).toBe(
			false,
		);
		expect(isRecommendTabActive("forge", { forgeFamilyExpanded: true, showingArchive: false, mode: "dossier" })).toBe(
			true,
		);
	});
});
