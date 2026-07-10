import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { ToolsView, TOOLS_VIEW_TYPE } from "./view/ToolsPanel";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureAllChapterEntries, getBookChapterFiles, readBookFrontmatter, syncAllBookReferenceFields } from "./book";
import { migrateVaultSchema } from "./migration";
import { registerReconciliationEvents } from "./reconciliation";
import { isLibraryChapterPath, bookFolderNameFromChapterPath } from "./paths";
import { sumWordCounts } from "./wordCount";
import { upsertTodayTotal } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { registerCustomIcons } from "./icons";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteMode, PaletteName } from "./colorPalettes";
import { OBSIDIAN_CSS_VARS, OBSIDIAN_SELECTORS } from "./obsidianInternals";

export type CodexFolderIndicatorThickness = "none" | "thin" | "medium" | "thick";

const CODEX_FOLDER_INDICATOR_WIDTH_PX: Record<CodexFolderIndicatorThickness, number> = {
	none: 0,
	thin: 1,
	medium: 2,
	thick: 4,
};

export type HeadingDividerThickness = "thin" | "medium" | "thick";

export type HeadingFontWeight = "theme" | "300" | "400" | "500" | "600" | "700" | "800" | "900";

export type FontWeight = "300" | "400" | "500" | "600" | "700" | "800" | "900";

const HEADING_DIVIDER_WIDTH_PX: Record<HeadingDividerThickness, number> = {
	thin: 1,
	medium: 2,
	thick: 4,
};

export interface StoryForgePluginSettings {
	hideHelp: boolean;
	hideSearch: boolean;
	hideBookmarks: boolean;
	hideFiles: boolean;
	hideLeftPanel: boolean;
	hideRightPanel: boolean;
	hideFileNameBar: boolean;
	hideNavRow: boolean;
	highlightActiveChapter: boolean;
	highlightColor: string;
	highlightTextColor: string;
	librarySeriesTitleFontSize: number;
	librarySeriesTitleFontWeight: FontWeight;
	librarySeriesTitleColor: string;
	librarySeriesTitleSmallCaps: boolean;
	libraryBookTitleFontSize: number;
	libraryBookTitleFontWeight: FontWeight;
	libraryBookTitleColor: string;
	libraryBookTitleSmallCaps: boolean;
	libraryBookSubtitleFontSize: number;
	libraryBookSubtitleFontWeight: FontWeight;
	libraryBookSubtitleSmallCaps: boolean;
	libraryHeaderDividerBelow: boolean;
	unplacedHighlightColor: string;
	unplacedHighlightTextColor: string;
	codexHighlightColor: string;
	codexHighlightTextColor: string;
	unplacedMuted: boolean;
	unplacedSmallCaps: boolean;
	unplacedColor: string;
	unplacedFontSize: number;
	unplacedFontWeight: FontWeight;
	unplacedItemsFontSize: number;
	unplacedItemsColor: string;
	unplacedItemsMuted: boolean;
	unplacedUseHeaderColorForAll: boolean;
	codexMuted: boolean;
	codexSmallCaps: boolean;
	codexColor: string;
	codexFontSize: number;
	codexFontWeight: FontWeight;
	codexFolderFontSize: number;
	codexFolderFontWeight: FontWeight;
	codexFolderColor: string;
	codexFolderIndicatorThickness: CodexFolderIndicatorThickness;
	codexNoteLabelFontSize: number;
	codexNoteLabelFontWeight: FontWeight;
	codexNoteLabelColor: string;
	codexNoteLabelUseDefaultColor: boolean;
	codexNoteLabelUseFolderColor: boolean;
	codexUseHeaderColorForAll: boolean;
	hideHeading1Links: boolean;
	bodyTextOverrideSize: boolean;
	bodyTextOverrideColor: boolean;
	bodyTextSize: number;
	bodyTextColor: string;
	heading1OverrideSize: boolean;
	heading1OverrideColor: boolean;
	heading1Size: number;
	heading1Color: string;
	heading1OverrideFont: boolean;
	heading1FontWeight: HeadingFontWeight;
	heading1SmallCaps: boolean;
	heading1DividerAbove: boolean;
	heading1DividerAboveThickness: HeadingDividerThickness;
	heading1DividerBelow: boolean;
	heading1DividerBelowThickness: HeadingDividerThickness;
	heading2OverrideSize: boolean;
	heading2OverrideColor: boolean;
	heading2Size: number;
	heading2Color: string;
	heading2OverrideFont: boolean;
	heading2FontWeight: HeadingFontWeight;
	heading2SmallCaps: boolean;
	heading2DividerAbove: boolean;
	heading2DividerAboveThickness: HeadingDividerThickness;
	heading2DividerBelow: boolean;
	heading2DividerBelowThickness: HeadingDividerThickness;
	heading3OverrideSize: boolean;
	heading3OverrideColor: boolean;
	heading3Size: number;
	heading3Color: string;
	heading3OverrideFont: boolean;
	heading3FontWeight: HeadingFontWeight;
	heading3SmallCaps: boolean;
	heading3DividerAbove: boolean;
	heading3DividerAboveThickness: HeadingDividerThickness;
	heading3DividerBelow: boolean;
	heading3DividerBelowThickness: HeadingDividerThickness;
	heading4OverrideSize: boolean;
	heading4OverrideColor: boolean;
	heading4Size: number;
	heading4Color: string;
	heading4OverrideFont: boolean;
	heading4FontWeight: HeadingFontWeight;
	heading4SmallCaps: boolean;
	heading4DividerAbove: boolean;
	heading4DividerAboveThickness: HeadingDividerThickness;
	heading4DividerBelow: boolean;
	heading4DividerBelowThickness: HeadingDividerThickness;
	heading5OverrideSize: boolean;
	heading5OverrideColor: boolean;
	heading5Size: number;
	heading5Color: string;
	heading5OverrideFont: boolean;
	heading5FontWeight: HeadingFontWeight;
	heading5SmallCaps: boolean;
	heading5DividerAbove: boolean;
	heading5DividerAboveThickness: HeadingDividerThickness;
	heading5DividerBelow: boolean;
	heading5DividerBelowThickness: HeadingDividerThickness;
	heading6OverrideSize: boolean;
	heading6OverrideColor: boolean;
	heading6Size: number;
	heading6Color: string;
	heading6OverrideFont: boolean;
	heading6FontWeight: HeadingFontWeight;
	heading6SmallCaps: boolean;
	heading6DividerAbove: boolean;
	heading6DividerAboveThickness: HeadingDividerThickness;
	heading6DividerBelow: boolean;
	heading6DividerBelowThickness: HeadingDividerThickness;
	useToolsPanel: boolean;
	colorPaletteName: PaletteName;
	colorPaletteMode: PaletteMode;
	customPaletteColors: PaletteColor[];
}

export const DEFAULT_SETTINGS: StoryForgePluginSettings = {
	hideHelp: true,
	hideSearch: true,
	hideBookmarks: true,
	hideFiles: true,
	hideLeftPanel: false,
	hideRightPanel: true,
	hideFileNameBar: true,
	hideNavRow: true,
	highlightActiveChapter: true,
	highlightColor: "#fef3c7",
	highlightTextColor: "#1f2937",
	librarySeriesTitleFontSize: 1,
	librarySeriesTitleFontWeight: "600",
	librarySeriesTitleColor: "#dcdcdc",
	librarySeriesTitleSmallCaps: false,
	libraryBookTitleFontSize: 0.75,
	libraryBookTitleFontWeight: "400",
	libraryBookTitleColor: "#9a9a9a",
	libraryBookTitleSmallCaps: false,
	libraryBookSubtitleFontSize: 0.5,
	libraryBookSubtitleFontWeight: "400",
	libraryBookSubtitleSmallCaps: false,
	libraryHeaderDividerBelow: false,
	unplacedHighlightColor: "#fef3c7",
	unplacedHighlightTextColor: "#1f2937",
	codexHighlightColor: "#fef3c7",
	codexHighlightTextColor: "#1f2937",
	unplacedMuted: false,
	unplacedSmallCaps: true,
	unplacedColor: "#ffff00",
	unplacedFontSize: 1,
	unplacedFontWeight: "400",
	unplacedItemsFontSize: 1,
	unplacedItemsColor: "#c8c8c8",
	unplacedItemsMuted: false,
	unplacedUseHeaderColorForAll: false,
	codexMuted: false,
	codexSmallCaps: true,
	codexColor: "#bf00ff",
	codexFontSize: 1,
	codexFontWeight: "400",
	codexFolderFontSize: 1,
	codexFolderFontWeight: "400",
	codexFolderColor: "#4ade80",
	codexFolderIndicatorThickness: "medium",
	codexNoteLabelFontSize: 1,
	codexNoteLabelFontWeight: "400",
	codexNoteLabelColor: "#c8c8c8",
	codexNoteLabelUseDefaultColor: false,
	codexNoteLabelUseFolderColor: false,
	codexUseHeaderColorForAll: false,
	hideHeading1Links: true,
	bodyTextOverrideSize: false,
	bodyTextOverrideColor: false,
	bodyTextSize: 1,
	bodyTextColor: "#c8c8c8",
	heading1OverrideSize: false,
	heading1OverrideColor: false,
	heading1Size: 1,
	heading1Color: "#c8c8c8",
	heading1OverrideFont: false,
	heading1FontWeight: "theme",
	heading1SmallCaps: false,
	heading1DividerAbove: false,
	heading1DividerAboveThickness: "medium",
	heading1DividerBelow: false,
	heading1DividerBelowThickness: "medium",
	heading2OverrideSize: false,
	heading2OverrideColor: false,
	heading2Size: 1,
	heading2Color: "#c8c8c8",
	heading2OverrideFont: false,
	heading2FontWeight: "theme",
	heading2SmallCaps: false,
	heading2DividerAbove: false,
	heading2DividerAboveThickness: "medium",
	heading2DividerBelow: false,
	heading2DividerBelowThickness: "medium",
	heading3OverrideSize: false,
	heading3OverrideColor: false,
	heading3Size: 1,
	heading3Color: "#c8c8c8",
	heading3OverrideFont: false,
	heading3FontWeight: "theme",
	heading3SmallCaps: false,
	heading3DividerAbove: false,
	heading3DividerAboveThickness: "medium",
	heading3DividerBelow: false,
	heading3DividerBelowThickness: "medium",
	heading4OverrideSize: false,
	heading4OverrideColor: false,
	heading4Size: 1,
	heading4Color: "#c8c8c8",
	heading4OverrideFont: false,
	heading4FontWeight: "theme",
	heading4SmallCaps: false,
	heading4DividerAbove: false,
	heading4DividerAboveThickness: "medium",
	heading4DividerBelow: false,
	heading4DividerBelowThickness: "medium",
	heading5OverrideSize: false,
	heading5OverrideColor: false,
	heading5Size: 1,
	heading5Color: "#c8c8c8",
	heading5OverrideFont: false,
	heading5FontWeight: "theme",
	heading5SmallCaps: false,
	heading5DividerAbove: false,
	heading5DividerAboveThickness: "medium",
	heading5DividerBelow: false,
	heading5DividerBelowThickness: "medium",
	heading6OverrideSize: false,
	heading6OverrideColor: false,
	heading6Size: 1,
	heading6Color: "#c8c8c8",
	heading6OverrideFont: false,
	heading6FontWeight: "theme",
	heading6SmallCaps: false,
	heading6DividerAbove: false,
	heading6DividerAboveThickness: "medium",
	heading6DividerBelow: false,
	heading6DividerBelowThickness: "medium",
	useToolsPanel: true,
	colorPaletteName: "Nord",
	colorPaletteMode: "dark",
	customPaletteColors: [
		{ name: "Custom 1", hex: "#ff6b6b" },
		{ name: "Custom 2", hex: "#ffd93d" },
		{ name: "Custom 3", hex: "#6bcb77" },
		{ name: "Custom 4", hex: "#4d96ff" },
		{ name: "Custom 5", hex: "#9d4edd" },
	],
};

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	/** One `<style>` element per (style-id, document) pair, so injected styling also applies inside pop-out windows. */
	private styleEls = new Map<string, Map<Document, HTMLStyleElement>>();
	/** Documents of currently open pop-out windows, kept in sync via the "window-open"/"window-close" workspace events. */
	private extraDocs = new Set<Document>();

	async onload(): Promise<void> {
		// Defensively remove any style tags a previous (e.g. hot-reloaded) instance of this
		// plugin left behind - onunload() prevents this going forward, but existing sessions
		// may already have stale duplicates injected before that existed.
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-library-header-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles, #storyforge-heading1-link-styles, #storyforge-text-style-overrides",
			)
			.forEach((el) => el.remove());

		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));
		this.registerView(TOOLS_VIEW_TYPE, (leaf) => new ToolsView(leaf));

		this.addCommand({
			id: "open-storyforge-view",
			name: "Open storyForge panel",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-tools-view",
			name: "Open Tools panel",
			callback: () => void this.activateToolsView(),
		});

		await this.loadSettings();
		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyHeading1LinkStyle();
		this.applyTextStyleOverrides();
		registerTabTitleOverrides(this.app, (eventRef) => this.registerEvent(eventRef));

		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		// Injected <style> tags only exist in the document they were appended to, so a pane
		// detached into its own OS window (a WorkspaceWindow, with its own `doc`) starts out
		// with none of this plugin's styling. Track it and re-apply everything into it.
		this.registerEvent(
			this.app.workspace.on("window-open", (win) => {
				this.extraDocs.add(win.doc);
				this.applyVisibilityStyles();
				this.applyHeaderStyles();
				this.applyHighlightStyle();
				this.applyLibraryHeaderStyles();
				this.applyCodexFolderStyle();
				this.applyCodexNoteLabelStyle();
				this.applyHeading1LinkStyle();
				this.applyTextStyleOverrides();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				this.extraDocs.delete(win.doc);
				for (const perDoc of this.styleEls.values()) perDoc.delete(win.doc);
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.initializeVaultState();
			if (this.pluginSettings.useToolsPanel && this.app.workspace.getLeavesOfType(TOOLS_VIEW_TYPE).length === 0) {
				void this.activateToolsView();
			}
			this.refreshCustomIcons();
			refreshTabTitles(this.app);
		});
	}

	/**
	 * Leaves restored from a saved workspace layout can draw their tab icon before this
	 * plugin's custom icons finish registering, leaving Obsidian's fallback icon stuck in
	 * the tab header. Re-applying each leaf's own view state forces Obsidian to redraw it.
	 */
	private refreshCustomIcons(): void {
		for (const type of [STORYFORGE_VIEW_TYPE, TOOLS_VIEW_TYPE]) {
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				void leaf.setViewState(leaf.getViewState());
			}
		}
	}

	/** Forces any open storyForge view(s) to re-render, e.g. after a settings change with no other trigger. */
	refreshStoryForgeViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			(leaf.view as StoryForgeView).render();
		}
	}

	onunload(): void {
		// Detaching first runs ToolsView.onClose(), which restores the ribbon to its native parent.
		this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
		document.body.classList.remove("sf-use-tools-panel", "sf-tools-open");
		for (const perDoc of this.styleEls.values()) {
			for (const el of perDoc.values()) el.remove();
		}
		this.styleEls.clear();
		this.extraDocs.clear();
	}

	async loadSettings(): Promise<void> {
		const data = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.pluginSettings);
	}

	getSettings(): StoryForgePluginSettings {
		return this.pluginSettings;
	}

	async updateSetting<K extends keyof StoryForgePluginSettings>(key: K, value: StoryForgePluginSettings[K]): Promise<void> {
		this.pluginSettings[key] = value;
		await this.saveSettings();
	}

	/** Injects/updates a named `<style>` element with `css` in `doc`, creating it if needed. */
	private injectStyle(id: string, css: string, doc: Document): void {
		let perDoc = this.styleEls.get(id);
		if (!perDoc) {
			perDoc = new Map();
			this.styleEls.set(id, perDoc);
		}
		let el = perDoc.get(doc);
		if (!el) {
			el = doc.createElement("style");
			el.id = id;
			doc.head.appendChild(el);
			perDoc.set(doc, el);
		}
		el.textContent = css;
	}

	/** Applies `css` under `id` to the main document and every open pop-out window. */
	private applyStyleToAllDocs(id: string, css: string): void {
		this.injectStyle(id, css, document);
		for (const doc of this.extraDocs) {
			this.injectStyle(id, css, doc);
		}
	}

	applyVisibilityStyles(): void {
		const rules: string[] = [];

		if (this.pluginSettings.hideHelp) {
			// Hides the Help button's own clickable wrapper (not just the icon glyph), so no empty
			// ghost button is left behind. Scoped to the vault-actions row so it doesn't affect
			// any other ".help"-classed element elsewhere.
			rules.push(`${OBSIDIAN_SELECTORS.helpButton} { display: none !important; }`);
		} else {
			// Obsidian only reveals this row (Help + Settings icons) on hover of the vault-name area
			// (display: var(--vault-profile-actions-display)); force it permanently visible so "off"
			// genuinely means "shown", not "hover to reveal". Settings gear icon becomes always-visible
			// too, since it shares this same container - confirmed acceptable.
			rules.push(`${OBSIDIAN_SELECTORS.vaultActions} { display: flex !important; }`);
		}
		if (this.pluginSettings.hideSearch) {
			rules.push(`${OBSIDIAN_SELECTORS.searchNav} { display: none !important; }`);
		}
		if (this.pluginSettings.hideBookmarks) {
			rules.push(`${OBSIDIAN_SELECTORS.bookmarksNav} { display: none !important; }`);
		}
		if (this.pluginSettings.hideFiles) {
			rules.push(`${OBSIDIAN_SELECTORS.filesNav} { display: none !important; }`);
		}
		if (this.pluginSettings.hideLeftPanel) {
			rules.push(`${OBSIDIAN_SELECTORS.sidebarToggleLeft} { display: none !important; }`);
		}
		if (this.pluginSettings.hideRightPanel) {
			rules.push(`${OBSIDIAN_SELECTORS.sidebarToggleRight} { display: none !important; }`);
		}
		if (this.pluginSettings.hideFileNameBar) {
			rules.push(`${OBSIDIAN_SELECTORS.inlineTitle} { display: none !important; }`);
		}
		if (this.pluginSettings.hideNavRow) {
			rules.push(`${OBSIDIAN_SELECTORS.viewHeader} { display: none !important; }`);
		}
		if (this.pluginSettings.useToolsPanel) {
			document.body.classList.add("sf-use-tools-panel");
			// Match Obsidian's own ribbon-width accounting (see its `show-ribbon` class) so the
			// macOS traffic-light spacing math (--frame-left-space) recalculates correctly.
			rules.push(`body.sf-use-tools-panel { ${OBSIDIAN_CSS_VARS.ribbonWidth}: 0px; }`);
			// The native ribbon is hidden everywhere except while it's physically parented
			// inside the open Tools pane (see ToolsView.mountRibbon).
			rules.push(`body.sf-use-tools-panel ${OBSIDIAN_SELECTORS.workspaceRibbon} { display: none !important; }`);
			// Must be at least as specific as the hide rule above (both use !important) - a plain
			// ".sf-tools-view .workspace-ribbon" selector is weaker (no `body` element selector) and
			// silently loses to it regardless of source order, leaving the ribbon `display: none`.
			rules.push(
				`body.sf-use-tools-panel .sf-tools-view ${OBSIDIAN_SELECTORS.workspaceRibbon} { display: flex !important; }`,
			);
			rules.push(
				`body.sf-use-tools-panel ${OBSIDIAN_SELECTORS.tabHeaderContainer} { padding-left: calc(var(--size-4-2) + var(${OBSIDIAN_CSS_VARS.frameLeftSpace})) !important; }`,
			);
		} else {
			document.body.classList.remove("sf-use-tools-panel");
		}

		this.applyStyleToAllDocs("storyforge-visibility-styles", rules.join("\n"));
	}

	applyHeaderStyles(): void {
		const s = this.pluginSettings;
		const unplacedColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		const codexColor = s.codexMuted ? "var(--text-muted)" : s.codexColor;
		let unplacedItemsColor: string;
		if (s.unplacedUseHeaderColorForAll) {
			unplacedItemsColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		} else if (s.unplacedItemsMuted) {
			unplacedItemsColor = "var(--text-muted)";
		} else {
			unplacedItemsColor = s.unplacedItemsColor;
		}
		const rules: string[] = [
			`.sf-header-unplaced { color: ${unplacedColor}; font-variant: ${s.unplacedSmallCaps ? "small-caps" : "normal"}; font-size: ${s.unplacedFontSize}em; font-weight: ${s.unplacedFontWeight}; }`,
			`.sf-unplaced-header > .sf-icon { color: ${unplacedColor}; font-size: ${s.unplacedFontSize}em; }`,
			`.sf-unplaced-header > .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-unplaced-list { font-size: ${s.unplacedItemsFontSize}em; color: ${unplacedItemsColor}; }`,
			`.sf-unplaced-new-file:hover, .sf-unplaced-archive-btn:hover { color: ${unplacedColor}; }`,
			`.sf-header-codex { color: ${codexColor}; font-variant: ${s.codexSmallCaps ? "small-caps" : "normal"}; font-size: ${s.codexFontSize}em; font-weight: ${s.codexFontWeight}; }`,
			`.sf-bottom-header > .sf-icon { font-size: ${s.codexFontSize}em; }`,
			`.sf-bottom-header > .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-bottom-header:not(.sf-codex-hidden) > .sf-icon { color: ${codexColor}; }`,
			`.sf-codex-new-file-btn:hover, .sf-codex-new-folder-btn:hover, .sf-codex-archive-btn:hover { color: ${codexColor}; }`,
		];

		this.applyStyleToAllDocs("storyforge-header-styles", rules.join("\n"));
	}

	/** Resolves the codex folder colour, respecting `codexUseHeaderColorForAll`'s override of the folder colour picker. */
	private resolveCodexFolderColor(): string {
		const s = this.pluginSettings;
		return s.codexUseHeaderColorForAll ? (s.codexMuted ? "var(--text-muted)" : s.codexColor) : s.codexFolderColor;
	}

	/** Flat highlight with a hard edge starting at the folder's indent guide line, so it appears to expand out of the line. */
	private codexSelectedBackground(flatColor: string): string {
		const s = this.pluginSettings;
		if (s.codexFolderIndicatorThickness === "none") return flatColor;
		const x = "calc(var(--sf-codex-indent-guide-x, 0px) - var(--sf-codex-child-indent, 0px))";
		return `linear-gradient(to right, transparent 0, transparent ${x}, ${flatColor} ${x})`;
	}

	applyHighlightStyle(): void {
		const s = this.pluginSettings;
		const unplacedHighlightColor = s.unplacedUseHeaderColorForAll
			? s.unplacedMuted
				? "var(--text-muted)"
				: s.unplacedColor
			: s.unplacedHighlightColor;
		const codexHighlightColor = s.codexUseHeaderColorForAll
			? s.codexMuted
				? "var(--text-muted)"
				: s.codexColor
			: s.codexHighlightColor;
		const rules: string[] = [
			`.sf-top-list:not(.sf-unplaced-list) .sf-row.sf-row-selected { background: ${s.highlightColor}; color: ${s.highlightTextColor}; }`,
			`.sf-unplaced-list .sf-row.sf-row-selected { background: ${unplacedHighlightColor}; color: ${s.unplacedHighlightTextColor}; }`,
			`.sf-codex-file.sf-row-selected { background: ${this.codexSelectedBackground(codexHighlightColor)}; color: ${s.codexHighlightTextColor}; }`,
		];

		this.applyStyleToAllDocs("storyforge-highlight-styles", rules.join("\n"));
	}

	applyLibraryHeaderStyles(): void {
		const s = this.pluginSettings;
		const rules: string[] = [
			`.sf-series-line .sf-header-text { font-size: ${s.librarySeriesTitleFontSize}em; font-weight: ${s.librarySeriesTitleFontWeight}; color: ${s.librarySeriesTitleColor}; font-variant: ${s.librarySeriesTitleSmallCaps ? "small-caps" : "normal"}; }`,
			`.sf-series-line .sf-icon { color: ${s.librarySeriesTitleColor}; font-size: ${s.librarySeriesTitleFontSize}em; }`,
			`.sf-series-line .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-series-filter-btn:hover { color: ${s.librarySeriesTitleColor}; }`,
			`.sf-book-line .sf-header-text { font-size: ${s.libraryBookTitleFontSize}em; font-weight: ${s.libraryBookTitleFontWeight}; color: ${s.libraryBookTitleColor}; font-variant: ${s.libraryBookTitleSmallCaps ? "small-caps" : "normal"}; line-height: 1; }`,
			`.sf-book-line .sf-icon { color: ${s.libraryBookTitleColor}; font-size: ${s.libraryBookTitleFontSize}em; }`,
			`.sf-book-line .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-book-filter-btn:hover { color: ${s.libraryBookTitleColor}; }`,
			`.sf-book-line .sf-book-subtitle-text { font-size: ${s.libraryBookSubtitleFontSize}em; font-weight: ${s.libraryBookSubtitleFontWeight}; color: ${s.libraryBookTitleColor}; font-variant: ${s.libraryBookSubtitleSmallCaps ? "small-caps" : "normal"}; }`,
			`.sf-top-header { border-bottom: ${s.libraryHeaderDividerBelow ? "1px solid var(--background-modifier-border)" : "none"}; }`,
		];

		this.applyStyleToAllDocs("storyforge-library-header-styles", rules.join("\n"));
	}

	applyCodexFolderStyle(): void {
		const s = this.pluginSettings;
		const indicatorWidth = CODEX_FOLDER_INDICATOR_WIDTH_PX[s.codexFolderIndicatorThickness];
		const folderColor = this.resolveCodexFolderColor();
		const rules: string[] = [
			`.sf-codex-folder-name, .sf-codex-folder-name.sf-styled-heading { color: ${folderColor}; font-size: ${s.codexFolderFontSize}em; font-weight: ${s.codexFolderFontWeight}; }`,
			`.sf-codex-chevron { color: ${folderColor}; font-size: ${s.codexFolderFontSize}em; }`,
			`.sf-codex-folder-indicator { width: ${indicatorWidth}px; background: ${folderColor}; }`,
		];

		this.applyStyleToAllDocs("storyforge-codex-folder-styles", rules.join("\n"));
	}

	applyCodexNoteLabelStyle(): void {
		const s = this.pluginSettings;
		let color: string;
		if (s.codexUseHeaderColorForAll) {
			color = s.codexMuted ? "var(--text-muted)" : s.codexColor;
		} else if (s.codexNoteLabelUseFolderColor) {
			color = s.codexFolderColor;
		} else if (s.codexNoteLabelUseDefaultColor) {
			color = "var(--text-normal)";
		} else {
			color = s.codexNoteLabelColor;
		}
		const rules: string[] = [
			`.sf-codex-file { color: ${color}; font-size: ${s.codexNoteLabelFontSize}em; font-weight: ${s.codexNoteLabelFontWeight}; }`,
		];

		this.applyStyleToAllDocs("storyforge-codex-note-label-styles", rules.join("\n"));
	}

	applyHeading1LinkStyle(): void {
		const rules: string[] = this.pluginSettings.hideHeading1Links
			? [`${OBSIDIAN_SELECTORS.h1Links} { color: inherit !important; text-decoration: inherit !important; }`]
			: [];

		this.applyStyleToAllDocs("storyforge-heading1-link-styles", rules.join("\n"));
	}

	/** Builds the size/colour/weight/small-caps/divider CSS rules for one heading level, across reading view and Live Preview. */
	private buildHeadingRules(
		level: 1 | 2 | 3 | 4 | 5 | 6,
		overrideSize: boolean,
		size: number,
		overrideColor: boolean,
		color: string,
		fontWeight: HeadingFontWeight,
		smallCaps: boolean,
		dividerAbove: boolean,
		dividerAboveThickness: HeadingDividerThickness,
		dividerBelow: boolean,
		dividerBelowThickness: HeadingDividerThickness,
	): string[] {
		const reading = OBSIDIAN_SELECTORS.headingReading[level];
		const line = OBSIDIAN_SELECTORS.headingLivePreviewLine[level];
		const text = OBSIDIAN_SELECTORS.headingLivePreviewText[level];
		const rules: string[] = [];
		if (overrideSize) rules.push(`${reading}, ${line} { font-size: ${size}em; }`);
		if (overrideColor) rules.push(`${reading}, ${text} { color: ${color}; }`);
		if (fontWeight !== "theme") rules.push(`${reading}, ${line} { font-weight: ${fontWeight}; }`);
		if (smallCaps) rules.push(`${reading}, ${line} { font-variant: small-caps; }`);
		if (dividerAbove) {
			const thicknessPx = HEADING_DIVIDER_WIDTH_PX[dividerAboveThickness];
			rules.push(`${reading}, ${line} { border-top: ${thicknessPx}px solid currentColor; }`);
		}
		if (dividerBelow) {
			const thicknessPx = HEADING_DIVIDER_WIDTH_PX[dividerBelowThickness];
			rules.push(`${reading}, ${line} { border-bottom: ${thicknessPx}px solid currentColor; }`);
		}
		return rules;
	}

	applyTextStyleOverrides(): void {
		const s = this.pluginSettings;
		const rules: string[] = [];
		if (s.bodyTextOverrideSize) {
			rules.push(`${OBSIDIAN_SELECTORS.bodyTextReading}, ${OBSIDIAN_SELECTORS.bodyTextLivePreview} { font-size: ${s.bodyTextSize}em; }`);
		}
		if (s.bodyTextOverrideColor) {
			rules.push(`${OBSIDIAN_SELECTORS.bodyTextReading}, ${OBSIDIAN_SELECTORS.bodyTextLivePreview} { color: ${s.bodyTextColor}; }`);
		}
		rules.push(
			...this.buildHeadingRules(
				1,
				s.heading1OverrideSize,
				s.heading1Size,
				s.heading1OverrideColor,
				s.heading1Color,
				s.heading1FontWeight,
				s.heading1SmallCaps,
				s.heading1DividerAbove,
				s.heading1DividerAboveThickness,
				s.heading1DividerBelow,
				s.heading1DividerBelowThickness,
			),
			...this.buildHeadingRules(
				2,
				s.heading2OverrideSize,
				s.heading2Size,
				s.heading2OverrideColor,
				s.heading2Color,
				s.heading2FontWeight,
				s.heading2SmallCaps,
				s.heading2DividerAbove,
				s.heading2DividerAboveThickness,
				s.heading2DividerBelow,
				s.heading2DividerBelowThickness,
			),
			...this.buildHeadingRules(
				3,
				s.heading3OverrideSize,
				s.heading3Size,
				s.heading3OverrideColor,
				s.heading3Color,
				s.heading3FontWeight,
				s.heading3SmallCaps,
				s.heading3DividerAbove,
				s.heading3DividerAboveThickness,
				s.heading3DividerBelow,
				s.heading3DividerBelowThickness,
			),
			...this.buildHeadingRules(
				4,
				s.heading4OverrideSize,
				s.heading4Size,
				s.heading4OverrideColor,
				s.heading4Color,
				s.heading4FontWeight,
				s.heading4SmallCaps,
				s.heading4DividerAbove,
				s.heading4DividerAboveThickness,
				s.heading4DividerBelow,
				s.heading4DividerBelowThickness,
			),
			...this.buildHeadingRules(
				5,
				s.heading5OverrideSize,
				s.heading5Size,
				s.heading5OverrideColor,
				s.heading5Color,
				s.heading5FontWeight,
				s.heading5SmallCaps,
				s.heading5DividerAbove,
				s.heading5DividerAboveThickness,
				s.heading5DividerBelow,
				s.heading5DividerBelowThickness,
			),
			...this.buildHeadingRules(
				6,
				s.heading6OverrideSize,
				s.heading6Size,
				s.heading6OverrideColor,
				s.heading6Color,
				s.heading6FontWeight,
				s.heading6SmallCaps,
				s.heading6DividerAbove,
				s.heading6DividerAboveThickness,
				s.heading6DividerBelow,
				s.heading6DividerBelowThickness,
			),
		);

		this.applyStyleToAllDocs("storyforge-text-style-overrides", rules.join("\n"));
	}

	private async initializeVaultState(): Promise<void> {
		await ensureSeriesFile(this.app);
		await migrateVaultSchema(this.app);
		const books = await ensureAllSeriesBookEntries(this.app);
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
		}
	}

	private scheduleRecompute(chapterPath: string): void {
		const bookFolderName = bookFolderNameFromChapterPath(chapterPath);
		if (!bookFolderName) return;
		let debounced = this.recomputeDebouncers.get(chapterPath);
		if (!debounced) {
			debounced = debounce(() => void this.recomputeChapter(bookFolderName, chapterPath), 1500);
			this.recomputeDebouncers.set(chapterPath, debounced);
		}
		debounced();
	}

	private async recomputeChapter(bookFolderName: string, chapterPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(chapterPath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const fingerprint = extractFingerprint(raw);
		await updateChapterFingerprint(this.app, bookFolderName, file.name, fingerprint);

		const chapterFiles = getBookChapterFiles(this.app, bookFolderName);
		const archived = new Set(readBookFrontmatter(this.app, bookFolderName)?.archive ?? []);
		const liveFiles = chapterFiles.filter((f) => !archived.has(f.name));
		const contents = await Promise.all(liveFiles.map((f) => this.app.vault.read(f)));
		const total = sumWordCounts(contents);
		await upsertTodayTotal(this.app, bookFolderName, total);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: STORYFORGE_VIEW_TYPE, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	async activateToolsView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(TOOLS_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeftLeaf(false);
			await leaf?.setViewState({ type: TOOLS_VIEW_TYPE, active: true });
		}
		if (leaf) workspace.revealLeaf(leaf);
	}
}
