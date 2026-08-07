import { describe, expect, it } from "vitest";
import { layoutConfig, SF_LAYOUTS } from "../layout";

describe("layoutConfig", () => {
	it("Series browse: series top, no codex, no stats, unplaced visible", () => {
		expect(layoutConfig("seriesBrowse")).toEqual({
			topPane: "series",
			showCodex: false,
			showStats: false,
			showUnplaced: true,
		});
	});

	it("Novel browse: novel top, no codex, stats visible, unplaced visible", () => {
		expect(layoutConfig("novelBrowse")).toEqual({
			topPane: "novel",
			showCodex: false,
			showStats: true,
			showUnplaced: true,
		});
	});

	it("Codex focus: navigator top (not the full tree), codex + stats visible, no unplaced section", () => {
		expect(layoutConfig("codexFocus")).toEqual({
			topPane: "navigator",
			showCodex: true,
			showStats: true,
			showUnplaced: false,
		});
	});

	it("Hybrid: novel top, codex + stats + unplaced all visible", () => {
		expect(layoutConfig("hybrid")).toEqual({
			topPane: "novel",
			showCodex: true,
			showStats: true,
			showUnplaced: true,
		});
	});

	it("the codex pane never pairs with the series list", () => {
		expect(layoutConfig("seriesBrowse").showCodex).toBe(false);
	});

	it("stats are hidden only at series level", () => {
		for (const layout of SF_LAYOUTS) {
			expect(layoutConfig(layout).showStats).toBe(layout !== "seriesBrowse");
		}
	});

	it("covers every declared layout with no throw", () => {
		for (const layout of SF_LAYOUTS) {
			expect(() => layoutConfig(layout)).not.toThrow();
		}
	});
});
