import { Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { Extension } from "@codemirror/state";
import { cyclingGuideViewPlugin } from "./cyclingGuide";
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
import { buildCustomFontFaceCSS, buildCustomFontFamilyDeclaration, CUSTOM_FONTS, CustomFontEntry } from "./fonts";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteMode, PaletteName } from "./colorPalettes";
import { OBSIDIAN_CSS_VARS, OBSIDIAN_SELECTORS } from "./obsidianInternals";
import { runContentBackup } from "./backup";

export type CodexFolderIndicatorThickness = "none" | "thin" | "medium" | "thick";

const CODEX_FOLDER_INDICATOR_WIDTH_PX: Record<CodexFolderIndicatorThickness, number> = {
	none: 0,
	thin: 1,
	medium: 2,
	thick: 4,
};

export type HeadingDividerThickness = "thin" | "medium" | "thick";

export type CustomFontFamily = "caroni" | "ibm-plex-sans-var" | "nunito";

export type FontWeight = "300" | "400" | "500" | "600" | "700" | "800" | "900";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";

export type StatusBarView = "hidden" | "sync-only" | "all";

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
	statusBarView: StatusBarView;
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
	bodyTextOverrideEmphasisColor: boolean;
	bodyTextBoldColor: string;
	bodyTextItalicColor: string;
	bodyTextOverrideFont: boolean;
	bodyTextFontWeight: FontWeight;
	bodyTextFontFamily: CustomFontFamily;
	heading1OverrideSize: boolean;
	heading1OverrideColor: boolean;
	heading1Size: number;
	heading1Color: string;
	heading1OverrideFont: boolean;
	heading1FontWeight: FontWeight;
	heading1FontFamily: CustomFontFamily;
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
	heading2FontWeight: FontWeight;
	heading2FontFamily: CustomFontFamily;
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
	heading3FontWeight: FontWeight;
	heading3FontFamily: CustomFontFamily;
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
	heading4FontWeight: FontWeight;
	heading4FontFamily: CustomFontFamily;
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
	heading5FontWeight: FontWeight;
	heading5FontFamily: CustomFontFamily;
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
	heading6FontWeight: FontWeight;
	heading6FontFamily: CustomFontFamily;
	heading6SmallCaps: boolean;
	heading6DividerAbove: boolean;
	heading6DividerAboveThickness: HeadingDividerThickness;
	heading6DividerBelow: boolean;
	heading6DividerBelowThickness: HeadingDividerThickness;
	useToolsPanel: boolean;
	colorPaletteName: PaletteName;
	colorPaletteMode: PaletteMode;
	customPaletteColors: PaletteColor[];
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	cyclingGuideEnabled: boolean;
	cyclingGuideThickness: HeadingDividerThickness;
	cyclingGuideColor: string;
	automaticBackupEnabled: boolean;
	automaticBackupFrequency: AutomaticBackupFrequency;
	automaticBackupFolder: string;
	lastAutomaticBackupAt: number;
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
	statusBarView: "all",
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
	bodyTextOverrideEmphasisColor: false,
	bodyTextBoldColor: "#c8c8c8",
	bodyTextItalicColor: "#c8c8c8",
	bodyTextOverrideFont: false,
	bodyTextFontWeight: "400",
	bodyTextFontFamily: "caroni",
	heading1OverrideSize: false,
	heading1OverrideColor: false,
	heading1Size: 1,
	heading1Color: "#c8c8c8",
	heading1OverrideFont: false,
	heading1FontWeight: "400",
	heading1FontFamily: "caroni",
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
	heading2FontWeight: "400",
	heading2FontFamily: "caroni",
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
	heading3FontWeight: "400",
	heading3FontFamily: "caroni",
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
	heading4FontWeight: "400",
	heading4FontFamily: "caroni",
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
	heading5FontWeight: "400",
	heading5FontFamily: "caroni",
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
	heading6FontWeight: "400",
	heading6FontFamily: "caroni",
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
	selectedNovel: null,
	selectedObject: null,
	collapsedCodexFolderIds: [],
	cyclingGuideEnabled: false,
	cyclingGuideThickness: "thin",
	cyclingGuideColor: "#f59e0b",
	automaticBackupEnabled: false,
	automaticBackupFrequency: "daily",
	automaticBackupFolder: "",
	lastAutomaticBackupAt: 0,
};

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	/** One `<style>` element per (style-id, document) pair, so injected styling also applies inside pop-out windows. */
	private styleEls = new Map<string, Map<Document, HTMLStyleElement>>();
	/** Documents of currently open pop-out windows, kept in sync via the "window-open"/"window-close" workspace events. */
	private extraDocs = new Set<Document>();
	/**
	 * Mutable extensions array registered once via `registerEditorExtension` - Obsidian rebuilds new
	 * `EditorState`s (e.g. when switching chapters) from this array's *current* contents, so mutating
	 * it plus `workspace.updateOptions()` keeps both open and freshly-opened editors in sync.
	 */
	private cyclingGuideExtensions: Extension[] = [];
	private backupInProgress = false;

	async onload(): Promise<void> {
		// Loaded first, before registerView() below - Obsidian can start restoring a previously-open
		// leaf of our view type as soon as it's registered, without waiting for the rest of onload()
		// to resolve, so StoryForgeView.onOpen() must never risk reading pre-load default settings.
		await this.loadSettings();

		// Defensively remove any style tags a previous (e.g. hot-reloaded) instance of this
		// plugin left behind - onunload() prevents this going forward, but existing sessions
		// may already have stale duplicates injected before that existed.
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-library-header-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles, #storyforge-heading1-link-styles, #storyforge-text-style-overrides, #storyforge-custom-fonts, #storyforge-cycling-guide-styles",
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

		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyHeading1LinkStyle();
		this.applyTextStyleOverrides();
		this.applyCustomFontFaces();
		this.applyCyclingGuideStyle();
		if (this.pluginSettings.cyclingGuideEnabled) this.cyclingGuideExtensions.push(cyclingGuideViewPlugin);
		this.registerEditorExtension(this.cyclingGuideExtensions);
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
				this.applyCustomFontFaces();
				this.applyCyclingGuideStyle();
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
			void this.maybeRunScheduledBackup("vault-open");
		});

		if (Platform.isDesktopApp) {
			this.registerInterval(window.setInterval(() => void this.maybeRunScheduledBackup("interval"), 30 * 60 * 1000));
		}
	}

	/**
	 * Runs the automatic backup if enabled, a folder is configured, and it's due. "every-open" only
	 * fires on `trigger === "vault-open"` - the recurring interval check exists purely to catch
	 * daily/weekly backups becoming due while Obsidian is left open across multiple days.
	 */
	private async maybeRunScheduledBackup(trigger: "vault-open" | "interval"): Promise<void> {
		if (!Platform.isDesktopApp || this.backupInProgress) return;
		const { automaticBackupEnabled, automaticBackupFrequency, automaticBackupFolder, lastAutomaticBackupAt } = this.pluginSettings;
		if (!automaticBackupEnabled || !automaticBackupFolder) return;

		const now = Date.now();
		let includeTime = false;
		if (automaticBackupFrequency === "every-open") {
			if (trigger !== "vault-open") return;
			includeTime = true;
		} else {
			const thresholdMs = (automaticBackupFrequency === "daily" ? 24 : 24 * 7) * 60 * 60 * 1000;
			if (lastAutomaticBackupAt !== 0 && now - lastAutomaticBackupAt < thresholdMs) return;
		}

		this.backupInProgress = true;
		try {
			await runContentBackup(this.app, automaticBackupFolder, includeTime);
			await this.updateSetting("lastAutomaticBackupAt", now);
		} catch (err) {
			new Notice(`storyForge: automatic backup failed — ${(err as Error).message}`);
		} finally {
			this.backupInProgress = false;
		}
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

	/** Replaces all settings with `data` (merged over defaults, same as `loadSettings`), persists, and re-applies every style/extension so the change takes effect immediately. */
	async importSettings(data: unknown): Promise<void> {
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		await this.saveSettings();

		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyHeading1LinkStyle();
		this.applyTextStyleOverrides();
		this.applyCustomFontFaces();
		this.applyCyclingGuideStyle();
		this.setCyclingGuideEnabled(this.pluginSettings.cyclingGuideEnabled);
		this.refreshStoryForgeViews();
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
		if (this.pluginSettings.statusBarView === "hidden") {
			rules.push(`${OBSIDIAN_SELECTORS.statusBar} { display: none !important; }`);
		} else if (this.pluginSettings.statusBarView === "sync-only") {
			rules.push(`${OBSIDIAN_SELECTORS.statusBarNonSyncItem} { display: none !important; }`);
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

	/** Restyles the "Cycling guide" floating divider (thickness/colour only - the CM6 extension itself is toggled by `setCyclingGuideEnabled`). */
	applyCyclingGuideStyle(): void {
		const s = this.pluginSettings;
		const px = HEADING_DIVIDER_WIDTH_PX[s.cyclingGuideThickness];
		const rules: string[] = [
			`.sf-cycling-guide-line { position: relative; }`,
			`.sf-cycling-guide-line::after { content: ""; position: absolute; left: 0; right: 0; top: 100%; height: ${px}px; background-color: ${s.cyclingGuideColor}; pointer-events: none; }`,
			// Box = the divider's own colour; the icon inside it is coloured with the editor's
			// background so it reads as "knocked out" of the coloured box, per the icon's design.
			`.sf-cycling-guide-badge { position: absolute; top: 100%; right: 0; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; background-color: ${s.cyclingGuideColor}; border-bottom-left-radius: 3px; border-bottom-right-radius: 3px; pointer-events: none; }`,
			`.sf-cycling-guide-badge-icon { display: flex; align-items: center; justify-content: center; color: var(--background-primary); font-size: 0.75em; }`,
			`.sf-cycling-guide-badge-icon svg { width: 1em; height: 1em; }`,
		];

		this.applyStyleToAllDocs("storyforge-cycling-guide-styles", rules.join("\n"));
	}

	/** Enables/disables the "Cycling guide" CM6 extension, applied to every currently-open editor and every editor opened from now on. */
	setCyclingGuideEnabled(enabled: boolean): void {
		this.cyclingGuideExtensions.length = 0;
		if (enabled) this.cyclingGuideExtensions.push(cyclingGuideViewPlugin);
		this.app.workspace.updateOptions();
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

	/** Registers the `@font-face` rules for every embedded custom font. Not settings-dependent, so this just needs re-running per pop-out window, like the other apply*Styles methods. */
	applyCustomFontFaces(): void {
		this.applyStyleToAllDocs("storyforge-custom-fonts", buildCustomFontFaceCSS());
	}

	/**
	 * CSS for switching `selector` to a custom embedded font at the given weight, when one is
	 * picked. Returns the matched font alongside the rule so callers can adjust other rules that
	 * depend on whether a custom font (rather than the theme's own) is active for that selector.
	 */
	private buildCustomFontFamilyRule(
		overrideFont: boolean,
		fontFamily: CustomFontFamily,
		fontWeight: FontWeight,
		selector: string,
	): { rule: string | null; font: CustomFontEntry | null } {
		if (!overrideFont) return { rule: null, font: null };
		const font = CUSTOM_FONTS.find((f) => f.id === fontFamily);
		if (!font) return { rule: null, font: null };
		return { rule: `${selector} { ${buildCustomFontFamilyDeclaration(font, Number(fontWeight))} }`, font };
	}

	/** Builds the size/colour/weight/small-caps/divider CSS rules for one heading level, across reading view and Live Preview. */
	private buildHeadingRules(
		level: 1 | 2 | 3 | 4 | 5 | 6,
		overrideSize: boolean,
		size: number,
		overrideColor: boolean,
		color: string,
		overrideFont: boolean,
		fontWeight: FontWeight,
		usingCustomFont: boolean,
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
		if (overrideColor) {
			// !important alone isn't enough - some themes (e.g. Minimal's "colourful headings")
			// set heading colour with !important too, and equal-importance ties still go to
			// specificity before source order. `:not(#id-that-never-exists)` is a standard trick
			// for adding ID-level specificity without needing a real ID, so this wins regardless
			// of what selector/!important combination the active theme throws at heading colour.
			const boost = ":not(#storyforge-specificity-boost)";
			rules.push(`${reading}${boost}, ${text}${boost} { color: ${color} !important; }`);
		}
		// Skipped when a custom font is active: buildCustomFontFamilyRule already handles weight for
		// that case (real interpolation for a variable font, a no-op for a fixed one) - applying this
		// literal font-weight on top would force the browser to synthesize a weight a fixed-weight
		// embedded font doesn't have, reintroducing fake bold.
		if (overrideFont && !usingCustomFont) rules.push(`${reading}, ${line} { font-weight: ${fontWeight}; }`);
		if (overrideFont) {
			// Forced either way (small-caps or normal), not just "on" - otherwise turning the
			// toggle off leaves whatever font-variant was already cascading in place (from the
			// theme, or a stale value), which read as the toggle being "stuck" on. !important plus
			// the specificity boost make this authoritative over the underwritten theme/editor CSS,
			// same technique as the colour override above.
			const boost = ":not(#storyforge-specificity-boost)";
			rules.push(`${reading}${boost}, ${line}${boost}, ${text}${boost} { font-variant: ${smallCaps ? "small-caps" : "normal"} !important; }`);
		}
		if (dividerAbove) {
			const thicknessPx = HEADING_DIVIDER_WIDTH_PX[dividerAboveThickness];
			rules.push(`${reading}, ${line} { border-top: ${thicknessPx}px solid ${overrideColor ? color : "currentColor"}; }`);
		}
		if (dividerBelow) {
			const thicknessPx = HEADING_DIVIDER_WIDTH_PX[dividerBelowThickness];
			rules.push(`${reading}, ${line} { border-bottom: ${thicknessPx}px solid ${overrideColor ? color : "currentColor"}; }`);
		}
		return rules;
	}

	applyTextStyleOverrides(): void {
		const s = this.pluginSettings;
		const rules: string[] = [];
		const bodySelector = `${OBSIDIAN_SELECTORS.bodyTextReading}, ${OBSIDIAN_SELECTORS.bodyTextLivePreview}`;
		if (s.bodyTextOverrideSize) {
			rules.push(`${bodySelector} { font-size: ${s.bodyTextSize}em; }`);
		}
		if (s.bodyTextOverrideColor) {
			rules.push(`${bodySelector} { color: ${s.bodyTextColor}; }`);
		}
		if (s.bodyTextOverrideEmphasisColor) {
			const boost = ":not(#storyforge-specificity-boost)";
			rules.push(
				`${OBSIDIAN_SELECTORS.bodyTextBoldReading}${boost}, ${OBSIDIAN_SELECTORS.bodyTextBoldLivePreview}${boost} { color: ${s.bodyTextBoldColor} !important; }`,
			);
			rules.push(
				`${OBSIDIAN_SELECTORS.bodyTextItalicReading}${boost}, ${OBSIDIAN_SELECTORS.bodyTextItalicLivePreview}${boost} { color: ${s.bodyTextItalicColor} !important; }`,
			);
		}
		const { rule: bodyFontFamilyRule, font: bodyCustomFont } = this.buildCustomFontFamilyRule(
			s.bodyTextOverrideFont,
			s.bodyTextFontFamily,
			s.bodyTextFontWeight,
			bodySelector,
		);
		if (s.bodyTextOverrideFont && !bodyCustomFont) rules.push(`${bodySelector} { font-weight: ${s.bodyTextFontWeight}; }`);
		if (bodyFontFamilyRule) rules.push(bodyFontFamilyRule);

		const heading1Selector = `${OBSIDIAN_SELECTORS.headingReading[1]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[1]}`;
		const heading1Font = this.buildCustomFontFamilyRule(s.heading1OverrideFont, s.heading1FontFamily, s.heading1FontWeight, heading1Selector);
		const heading2Selector = `${OBSIDIAN_SELECTORS.headingReading[2]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[2]}`;
		const heading2Font = this.buildCustomFontFamilyRule(s.heading2OverrideFont, s.heading2FontFamily, s.heading2FontWeight, heading2Selector);
		const heading3Selector = `${OBSIDIAN_SELECTORS.headingReading[3]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[3]}`;
		const heading3Font = this.buildCustomFontFamilyRule(s.heading3OverrideFont, s.heading3FontFamily, s.heading3FontWeight, heading3Selector);
		const heading4Selector = `${OBSIDIAN_SELECTORS.headingReading[4]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[4]}`;
		const heading4Font = this.buildCustomFontFamilyRule(s.heading4OverrideFont, s.heading4FontFamily, s.heading4FontWeight, heading4Selector);
		const heading5Selector = `${OBSIDIAN_SELECTORS.headingReading[5]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[5]}`;
		const heading5Font = this.buildCustomFontFamilyRule(s.heading5OverrideFont, s.heading5FontFamily, s.heading5FontWeight, heading5Selector);
		const heading6Selector = `${OBSIDIAN_SELECTORS.headingReading[6]}, ${OBSIDIAN_SELECTORS.headingLivePreviewLine[6]}`;
		const heading6Font = this.buildCustomFontFamilyRule(s.heading6OverrideFont, s.heading6FontFamily, s.heading6FontWeight, heading6Selector);

		rules.push(
			...this.buildHeadingRules(
				1,
				s.heading1OverrideSize,
				s.heading1Size,
				s.heading1OverrideColor,
				s.heading1Color,
				s.heading1OverrideFont,
				s.heading1FontWeight,
				Boolean(heading1Font.font),
				s.heading1SmallCaps,
				s.heading1DividerAbove,
				s.heading1DividerAboveThickness,
				s.heading1DividerBelow,
				s.heading1DividerBelowThickness,
			),
			...(heading1Font.rule ? [heading1Font.rule] : []),
			...this.buildHeadingRules(
				2,
				s.heading2OverrideSize,
				s.heading2Size,
				s.heading2OverrideColor,
				s.heading2Color,
				s.heading2OverrideFont,
				s.heading2FontWeight,
				Boolean(heading2Font.font),
				s.heading2SmallCaps,
				s.heading2DividerAbove,
				s.heading2DividerAboveThickness,
				s.heading2DividerBelow,
				s.heading2DividerBelowThickness,
			),
			...(heading2Font.rule ? [heading2Font.rule] : []),
			...this.buildHeadingRules(
				3,
				s.heading3OverrideSize,
				s.heading3Size,
				s.heading3OverrideColor,
				s.heading3Color,
				s.heading3OverrideFont,
				s.heading3FontWeight,
				Boolean(heading3Font.font),
				s.heading3SmallCaps,
				s.heading3DividerAbove,
				s.heading3DividerAboveThickness,
				s.heading3DividerBelow,
				s.heading3DividerBelowThickness,
			),
			...(heading3Font.rule ? [heading3Font.rule] : []),
			...this.buildHeadingRules(
				4,
				s.heading4OverrideSize,
				s.heading4Size,
				s.heading4OverrideColor,
				s.heading4Color,
				s.heading4OverrideFont,
				s.heading4FontWeight,
				Boolean(heading4Font.font),
				s.heading4SmallCaps,
				s.heading4DividerAbove,
				s.heading4DividerAboveThickness,
				s.heading4DividerBelow,
				s.heading4DividerBelowThickness,
			),
			...(heading4Font.rule ? [heading4Font.rule] : []),
			...this.buildHeadingRules(
				5,
				s.heading5OverrideSize,
				s.heading5Size,
				s.heading5OverrideColor,
				s.heading5Color,
				s.heading5OverrideFont,
				s.heading5FontWeight,
				Boolean(heading5Font.font),
				s.heading5SmallCaps,
				s.heading5DividerAbove,
				s.heading5DividerAboveThickness,
				s.heading5DividerBelow,
				s.heading5DividerBelowThickness,
			),
			...(heading5Font.rule ? [heading5Font.rule] : []),
			...this.buildHeadingRules(
				6,
				s.heading6OverrideSize,
				s.heading6Size,
				s.heading6OverrideColor,
				s.heading6Color,
				s.heading6OverrideFont,
				s.heading6FontWeight,
				Boolean(heading6Font.font),
				s.heading6SmallCaps,
				s.heading6DividerAbove,
				s.heading6DividerAboveThickness,
				s.heading6DividerBelow,
				s.heading6DividerBelowThickness,
			),
			...(heading6Font.rule ? [heading6Font.rule] : []),
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
