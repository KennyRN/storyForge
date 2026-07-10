/**
 * Undocumented Obsidian DOM selectors and CSS custom properties this plugin relies on to hide
 * native chrome and relocate the ribbon. None of these are part of Obsidian's public API/theming
 * contract - a future Obsidian release could rename or restructure any of them. Centralized here
 * so a breaking Obsidian update only requires touching this one file.
 */
export const OBSIDIAN_SELECTORS = {
	vaultActions: ".workspace-drawer-vault-actions",
	helpButton: ".workspace-drawer-vault-actions .clickable-icon:has(.help)",
	searchNav: "div[aria-label='Search']",
	bookmarksNav: "div[aria-label='Bookmarks']",
	filesNav: "div[aria-label='Files']",
	sidebarToggleLeft: ".sidebar-toggle-button.mod-left",
	sidebarToggleRight: ".sidebar-toggle-button.mod-right",
	inlineTitle: ".inline-title",
	viewHeader: ".view-header",
	workspaceRibbon: ".workspace-ribbon",
	ribbonAction: ".side-dock-ribbon-action",
	tabHeaderContainer: ".mod-left-split .workspace-tab-header-container",
} as const;

export const OBSIDIAN_CSS_VARS = {
	ribbonWidth: "--ribbon-width",
	frameLeftSpace: "--frame-left-space",
} as const;
