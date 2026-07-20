/**
 * Undocumented Obsidian DOM selectors this plugin relies on to hide native chrome and relocate
 * the ribbon. None of these are part of Obsidian's public API/theming contract - a future
 * Obsidian release could rename or restructure any of them.
 *
 * Most of these are also hardcoded directly as static rules in styles.css's "Dynamic Styling"
 * section (Obsidian plugins may not create or attach `<style>` elements, so that duplication is
 * unavoidable) - the two aren't structurally linked, so if Obsidian renames/restructures a
 * selector, update it in BOTH this file and styles.css. `workspaceRibbon`/`ribbonAction` are
 * additionally used live at runtime, by ToolsPanel.ts, to relocate the ribbon into the Tools pane.
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
	statusBar: ".status-bar",
	statusBarNonSyncItem: ".status-bar-item:not(.plugin-sync)",
	workspaceRibbon: ".workspace-ribbon",
	ribbonAction: ".side-dock-ribbon-action",
	tabHeaderContainer: ".mod-left-split .workspace-tab-header-container",
	/**
	 * Links inside a note's rendered H1: real `<a>` tags in reading view, but CM6 live-preview/edit
	 * mode renders no `<a>` at all - links are `.cm-hmd-internal-link`/`.cm-link` spans (co-classed
	 * with `.cm-header-1`) wrapping a `.cm-underline` span that carries the actual underline.
	 */
	h1Links:
		".markdown-reading-view h1 a, .cm-header-1.cm-hmd-internal-link, .cm-header-1.cm-link, .cm-header-1.cm-hmd-internal-link .cm-underline, .cm-header-1.cm-link .cm-underline",
	/**
	 * Whole-heading selectors for H1-H3, per view mode: `headingReading` matches the real `<hN>` tag
	 * in reading view; `headingLivePreviewLine` matches the CM6 line wrapper (`.HyperMD-header-N`,
	 * confirmed for H1 - same class family expected for H2/H3, verify live); `headingLivePreviewText`
	 * matches the inline `.cm-header-N` text spans within that line, used where colour must be set on
	 * the actual text run rather than just the line container.
	 */
	headingReading: {
		1: ".markdown-reading-view h1",
		2: ".markdown-reading-view h2",
		3: ".markdown-reading-view h3",
		4: ".markdown-reading-view h4",
		5: ".markdown-reading-view h5",
		6: ".markdown-reading-view h6",
	},
	headingLivePreviewLine: {
		1: ".HyperMD-header-1",
		2: ".HyperMD-header-2",
		3: ".HyperMD-header-3",
		4: ".HyperMD-header-4",
		5: ".HyperMD-header-5",
		6: ".HyperMD-header-6",
	},
	headingLivePreviewText: {
		1: ".cm-header-1",
		2: ".cm-header-2",
		3: ".cm-header-3",
		4: ".cm-header-4",
		5: ".cm-header-5",
		6: ".cm-header-6",
	},
	/**
	 * Body/paragraph text, per view mode. `bodyTextLivePreview` is a first guess (any CM6 line
	 * without a heading class) - verify against real paragraph/list-item DOM before trusting it.
	 */
	bodyTextReading: ".markdown-reading-view p",
	bodyTextLivePreview: ".cm-line:not(.HyperMD-header)",
	/**
	 * Bold/italic emphasis within body text, per view mode: real `<strong>`/`<em>` tags in reading
	 * view; `.cm-strong`/`.cm-em` are CM6's markdown-parser-generated classes in Live Preview (same
	 * family as `.cm-header-N` above) - verify against real bold/italic text before trusting it.
	 */
	bodyTextBoldReading: ".markdown-reading-view strong",
	bodyTextBoldLivePreview: ".cm-strong",
	bodyTextItalicReading: ".markdown-reading-view em",
	bodyTextItalicLivePreview: ".cm-em",
} as const;
