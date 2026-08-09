/**
 * The three top-level panel layouts for the storyForge panel (see hand-off brief §2). A layout is
 * a pure declaration of which panes are present — it carries no state of its own. `layoutConfig`
 * is the single mapping from a chosen layout to its pane composition; `StoryForgeView.render()`
 * consults it rather than deciding pane visibility ad hoc.
 *
 * "Codex focus" used to live here as a fourth layout (navigator top pane + codex + stats, no
 * unplaced). It's since moved out into its own always-available "Storytelling" panel
 * (StorytellingView.ts) rather than being a mode you switch the storyForge panel into — that
 * panel reuses `renderTopPanel`'s "navigator" mode directly, bypassing this layout selector
 * entirely. Codex still embeds here too, under "Detailed".
 */
export type SfLayout = "seriesBrowse" | "novelBrowse" | "hybrid";

export const SF_LAYOUTS: SfLayout[] = ["seriesBrowse", "novelBrowse", "hybrid"];

export const SF_LAYOUT_LABELS: Record<SfLayout, string> = {
	seriesBrowse: "Series",
	novelBrowse: "Novel",
	hybrid: "Detailed",
};

/** Which top pane a layout shows, and whether the codex/stats panes and the unplaced section are present. */
export interface LayoutConfig {
	topPane: "series" | "novel";
	showCodex: boolean;
	showStats: boolean;
	showUnplaced: boolean;
}

/**
 * Maps a layout to its pane composition (hand-off brief §2 table). Series level is pure
 * navigation (no writing metrics, no codex); Novel is also navigation-only (no stats); stats
 * and the codex only appear together in Detailed. The codex is a within-a-novel companion,
 * so it never pairs with the series list.
 */
export function layoutConfig(layout: SfLayout): LayoutConfig {
	switch (layout) {
		case "seriesBrowse":
			return { topPane: "series", showCodex: false, showStats: false, showUnplaced: true };
		case "novelBrowse":
			return { topPane: "novel", showCodex: false, showStats: false, showUnplaced: true };
		case "hybrid":
			return { topPane: "novel", showCodex: true, showStats: true, showUnplaced: true };
	}
}
