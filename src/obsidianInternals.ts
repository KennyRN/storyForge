/**
 * Undocumented Obsidian DOM selectors this plugin uses at runtime.
 * None of these are part of Obsidian's public API/theming contract — a future
 * Obsidian release could rename or restructure any of them.
 *
 * CSS hide/restyle rules live in styles.css's "Dynamic Styling" section (plugins
 * may not create `<style>` elements). Keep those CSS selectors in sync with
 * Obsidian's DOM when they break; they are intentionally not duplicated here.
 */
export const OBSIDIAN_SELECTORS = {
	/** Used by ToolsPanel to relocate the ribbon into the Tools pane. */
	workspaceRibbon: ".workspace-ribbon",
	ribbonAction: ".side-dock-ribbon-action",
} as const;
