/**
 * The four top-level panel layouts (see hand-off brief §2). A layout is a pure declaration of
 * which panes are present — it carries no state of its own. `layoutConfig` is the single mapping
 * from a chosen layout to its pane composition; `StoryForgeView.render()` consults it rather than
 * deciding pane visibility ad hoc.
 */
export type SfLayout = "seriesBrowse" | "novelBrowse" | "codexFocus" | "hybrid";

export const SF_LAYOUTS: SfLayout[] = ["seriesBrowse", "novelBrowse", "codexFocus", "hybrid"];

export const SF_LAYOUT_LABELS: Record<SfLayout, string> = {
	seriesBrowse: "Series browse",
	novelBrowse: "Novel browse",
	codexFocus: "Codex focus",
	hybrid: "Hybrid",
};

/** Which top pane a layout shows, and whether the codex/stats panes and the unplaced section are present. */
export interface LayoutConfig {
	topPane: "series" | "novel" | "navigator";
	showCodex: boolean;
	showStats: boolean;
	showUnplaced: boolean;
}

/**
 * Maps a layout to its pane composition (hand-off brief §2 table). Series level is pure
 * navigation (no writing metrics, no codex); once inside a novel, stats appear; the codex is a
 * within-a-novel companion, so it never pairs with the series list.
 */
export function layoutConfig(layout: SfLayout): LayoutConfig {
	switch (layout) {
		case "seriesBrowse":
			return { topPane: "series", showCodex: false, showStats: false, showUnplaced: true };
		case "novelBrowse":
			return { topPane: "novel", showCodex: false, showStats: true, showUnplaced: true };
		case "codexFocus":
			return { topPane: "navigator", showCodex: true, showStats: true, showUnplaced: false };
		case "hybrid":
			return { topPane: "novel", showCodex: true, showStats: true, showUnplaced: true };
	}
}
