import { describe, expect, it } from "vitest";
import { layoutConfig, SF_LAYOUTS } from "../layout";

describe("layoutConfig", () => {
	it("Codex: no top pane, codex only, no stats, no unplaced", () => {
		expect(layoutConfig("codex")).toEqual({
			topPane: "none",
			showCodex: true,
			showStats: false,
			showUnplaced: false,
		});
	});

	it("Series: series top, no codex, no stats, unplaced visible", () => {
		expect(layoutConfig("seriesBrowse")).toEqual({
			topPane: "series",
			showCodex: false,
			showStats: false,
			showUnplaced: true,
		});
	});

	it("Novel: novel top, no codex, no stats, unplaced visible", () => {
		expect(layoutConfig("novelBrowse")).toEqual({
			topPane: "novel",
			showCodex: false,
			showStats: false,
			showUnplaced: true,
		});
	});

	it("Chapter: novel top, codex + unplaced, no stats", () => {
		expect(layoutConfig("hybrid")).toEqual({
			topPane: "novel",
			showCodex: true,
			showStats: false,
			showUnplaced: true,
		});
	});

	it("the codex pane never pairs with the series list", () => {
		expect(layoutConfig("seriesBrowse").showCodex).toBe(false);
	});

	it("stats are never shown in the story library panel", () => {
		for (const layout of SF_LAYOUTS) {
			expect(layoutConfig(layout).showStats).toBe(false);
		}
	});

	it("covers every declared layout with no throw", () => {
		for (const layout of SF_LAYOUTS) {
			expect(() => layoutConfig(layout)).not.toThrow();
		}
	});

	it("falls back to Chapter composition for an unknown persisted layout", () => {
		expect(layoutConfig("codexFocus" as never)).toEqual({
			topPane: "novel",
			showCodex: true,
			showStats: false,
			showUnplaced: true,
		});
	});
});
