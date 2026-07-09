import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { ToolsView, TOOLS_VIEW_TYPE } from "./view/ToolsPanel";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureAllChapterEntries, getBookChapterFiles, readBookFrontmatter, syncAllBookReferenceFields } from "./book";
import { migrateVaultSchema } from "./migration";
import { registerReconciliationEvents, reconcileBookOnLoad } from "./reconciliation";
import { isLibraryChapterPath, bookFolderNameFromChapterPath } from "./paths";
import { sumWordCounts } from "./wordCount";
import { upsertTodayTotal } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { registerCustomIcons } from "./icons";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteMode, PaletteName } from "./colorPalettes";

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
	perPanelHighlighting: boolean;
	highlightColor: string;
	highlightTextColor: string;
	unplacedHighlightColor: string;
	unplacedHighlightTextColor: string;
	codexHighlightColor: string;
	codexHighlightTextColor: string;
	unplacedMuted: boolean;
	unplacedSmallCaps: boolean;
	unplacedColor: string;
	unplacedFontSize: number;
	unplacedItemsFontSize: number;
	unplacedItemsColor: string;
	unplacedItemsMuted: boolean;
	unplacedItemsUseHeaderColor: boolean;
	codexMuted: boolean;
	codexSmallCaps: boolean;
	codexColor: string;
	codexFontSize: number;
	codexFolderFontSize: number;
	codexFolderColor: string;
	codexNoteLabelFontSize: number;
	codexNoteLabelColor: string;
	codexNoteLabelUseDefaultColor: boolean;
	codexNoteLabelUseFolderColor: boolean;
	collapsedSections: Record<string, boolean>;
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
	perPanelHighlighting: false,
	highlightColor: "#fef3c7",
	highlightTextColor: "#1f2937",
	unplacedHighlightColor: "#fef3c7",
	unplacedHighlightTextColor: "#1f2937",
	codexHighlightColor: "#fef3c7",
	codexHighlightTextColor: "#1f2937",
	unplacedMuted: false,
	unplacedSmallCaps: true,
	unplacedColor: "#ffff00",
	unplacedFontSize: 1,
	unplacedItemsFontSize: 1,
	unplacedItemsColor: "#c8c8c8",
	unplacedItemsMuted: false,
	unplacedItemsUseHeaderColor: false,
	codexMuted: false,
	codexSmallCaps: true,
	codexColor: "#bf00ff",
	codexFontSize: 1,
	codexFolderFontSize: 1,
	codexFolderColor: "#4ade80",
	codexNoteLabelFontSize: 1,
	codexNoteLabelColor: "#c8c8c8",
	codexNoteLabelUseDefaultColor: false,
	codexNoteLabelUseFolderColor: false,
	collapsedSections: {},
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
	private styleEl: HTMLStyleElement | null = null;
	private headerStyleEl: HTMLStyleElement | null = null;
	private highlightStyleEl: HTMLStyleElement | null = null;
	private codexFolderStyleEl: HTMLStyleElement | null = null;
	private codexNoteLabelStyleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		// Defensively remove any style tags a previous (e.g. hot-reloaded) instance of this
		// plugin left behind - onunload() prevents this going forward, but existing sessions
		// may already have stale duplicates injected before that existed.
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles",
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
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		registerTabTitleOverrides(this.app, (eventRef) => this.registerEvent(eventRef));

		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
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
		for (const el of [
			this.styleEl,
			this.headerStyleEl,
			this.highlightStyleEl,
			this.codexFolderStyleEl,
			this.codexNoteLabelStyleEl,
		]) {
			el?.remove();
		}
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

	applyVisibilityStyles(): void {
		const rules: string[] = [];

		if (this.pluginSettings.hideHelp) {
			// Hides the Help button's own clickable wrapper (not just the icon glyph), so no empty
			// ghost button is left behind. Scoped to the vault-actions row so it doesn't affect
			// any other ".help"-classed element elsewhere.
			rules.push(".workspace-drawer-vault-actions .clickable-icon:has(.help) { display: none !important; }");
		} else {
			// Obsidian only reveals this row (Help + Settings icons) on hover of the vault-name area
			// (display: var(--vault-profile-actions-display)); force it permanently visible so "off"
			// genuinely means "shown", not "hover to reveal". Settings gear icon becomes always-visible
			// too, since it shares this same container - confirmed acceptable.
			rules.push(".workspace-drawer-vault-actions { display: flex !important; }");
		}
		if (this.pluginSettings.hideSearch) {
			rules.push("div[aria-label='Search'] { display: none !important; }");
		}
		if (this.pluginSettings.hideBookmarks) {
			rules.push("div[aria-label='Bookmarks'] { display: none !important; }");
		}
		if (this.pluginSettings.hideFiles) {
			rules.push("div[aria-label='Files'] { display: none !important; }");
		}
		if (this.pluginSettings.hideLeftPanel) {
			rules.push(".sidebar-toggle-button.mod-left { display: none !important; }");
		}
		if (this.pluginSettings.hideRightPanel) {
			rules.push(".sidebar-toggle-button.mod-right { display: none !important; }");
		}
		if (this.pluginSettings.hideFileNameBar) {
			rules.push(".inline-title { display: none !important; }");
		}
		if (this.pluginSettings.hideNavRow) {
			rules.push(".view-header { display: none !important; }");
		}
		if (this.pluginSettings.useToolsPanel) {
			document.body.classList.add("sf-use-tools-panel");
			// Match Obsidian's own ribbon-width accounting (see its `show-ribbon` class) so the
			// macOS traffic-light spacing math (--frame-left-space) recalculates correctly.
			rules.push("body.sf-use-tools-panel { --ribbon-width: 0px; }");
			// The native ribbon is hidden everywhere except while it's physically parented
			// inside the open Tools pane (see ToolsView.mountRibbon).
			rules.push("body.sf-use-tools-panel .workspace-ribbon { display: none !important; }");
			// Must be at least as specific as the hide rule above (both use !important) - a plain
			// ".sf-tools-view .workspace-ribbon" selector is weaker (no `body` element selector) and
			// silently loses to it regardless of source order, leaving the ribbon `display: none`.
			rules.push("body.sf-use-tools-panel .sf-tools-view .workspace-ribbon { display: flex !important; }");
			rules.push(
				"body.sf-use-tools-panel .mod-left-split .workspace-tab-header-container { padding-left: calc(var(--size-4-2) + var(--frame-left-space)) !important; }",
			);
		} else {
			document.body.classList.remove("sf-use-tools-panel");
		}

		// Always keep the style element and update its content
		if (!this.styleEl) {
			this.styleEl = document.createElement("style");
			this.styleEl.id = "storyforge-visibility-styles";
			document.head.appendChild(this.styleEl);
		}
		this.styleEl.textContent = rules.join("\n");
	}

	applyHeaderStyles(): void {
		const s = this.pluginSettings;
		const unplacedColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		const codexColor = s.codexMuted ? "var(--text-muted)" : s.codexColor;
		let unplacedItemsColor: string;
		if (s.unplacedItemsUseHeaderColor) {
			unplacedItemsColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		} else if (s.unplacedItemsMuted) {
			unplacedItemsColor = "var(--text-muted)";
		} else {
			unplacedItemsColor = s.unplacedItemsColor;
		}
		const rules: string[] = [
			`.sf-header-unplaced { color: ${unplacedColor}; font-variant: ${s.unplacedSmallCaps ? "small-caps" : "normal"}; font-size: ${s.unplacedFontSize}em; }`,
			`.sf-unplaced-header > .sf-icon { color: ${unplacedColor}; font-size: ${s.unplacedFontSize}em; }`,
			`.sf-unplaced-header > .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-unplaced-list { font-size: ${s.unplacedItemsFontSize}em; color: ${unplacedItemsColor}; }`,
			`.sf-header-codex { color: ${codexColor}; font-variant: ${s.codexSmallCaps ? "small-caps" : "normal"}; font-size: ${s.codexFontSize}em; }`,
			`.sf-bottom-header > .sf-icon { font-size: ${s.codexFontSize}em; }`,
			`.sf-bottom-header > .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-bottom-header:not(.sf-codex-hidden) > .sf-icon { color: ${codexColor}; }`,
		];

		if (!this.headerStyleEl) {
			this.headerStyleEl = document.createElement("style");
			this.headerStyleEl.id = "storyforge-header-styles";
			document.head.appendChild(this.headerStyleEl);
		}
		this.headerStyleEl.textContent = rules.join("\n");
	}

	applyHighlightStyle(): void {
		const s = this.pluginSettings;
		const rules: string[] = s.perPanelHighlighting
			? [
					`.sf-top-list:not(.sf-unplaced-list) .sf-row.sf-row-selected { background: ${s.highlightColor}; color: ${s.highlightTextColor}; }`,
					`.sf-unplaced-list .sf-row.sf-row-selected { background: ${s.unplacedHighlightColor}; color: ${s.unplacedHighlightTextColor}; }`,
					`.sf-codex-file.sf-row-selected { background: ${s.codexHighlightColor}; color: ${s.codexHighlightTextColor}; }`,
				]
			: [
					`.sf-row.sf-row-selected { background: ${s.highlightColor}; color: ${s.highlightTextColor}; }`,
					`.sf-codex-file.sf-row-selected { background: ${s.highlightColor}; color: ${s.highlightTextColor}; }`,
				];

		if (!this.highlightStyleEl) {
			this.highlightStyleEl = document.createElement("style");
			this.highlightStyleEl.id = "storyforge-highlight-styles";
			document.head.appendChild(this.highlightStyleEl);
		}
		this.highlightStyleEl.textContent = rules.join("\n");
	}

	applyCodexFolderStyle(): void {
		const s = this.pluginSettings;
		const rules: string[] = [
			`.sf-codex-folder-name, .sf-codex-folder-name.sf-styled-heading { color: ${s.codexFolderColor}; font-size: ${s.codexFolderFontSize}em; }`,
			`.sf-codex-chevron { color: ${s.codexFolderColor}; font-size: ${s.codexFolderFontSize}em; }`,
		];

		if (!this.codexFolderStyleEl) {
			this.codexFolderStyleEl = document.createElement("style");
			this.codexFolderStyleEl.id = "storyforge-codex-folder-styles";
			document.head.appendChild(this.codexFolderStyleEl);
		}
		this.codexFolderStyleEl.textContent = rules.join("\n");
	}

	applyCodexNoteLabelStyle(): void {
		const s = this.pluginSettings;
		let color: string;
		if (s.codexNoteLabelUseFolderColor) {
			color = s.codexFolderColor;
		} else if (s.codexNoteLabelUseDefaultColor) {
			color = "var(--text-normal)";
		} else {
			color = s.codexNoteLabelColor;
		}
		const rules: string[] = [
			`.sf-codex-file { color: ${color}; font-size: ${s.codexNoteLabelFontSize}em; }`,
		];

		if (!this.codexNoteLabelStyleEl) {
			this.codexNoteLabelStyleEl = document.createElement("style");
			this.codexNoteLabelStyleEl.id = "storyforge-codex-note-label-styles";
			document.head.appendChild(this.codexNoteLabelStyleEl);
		}
		this.codexNoteLabelStyleEl.textContent = rules.join("\n");
	}

	private async initializeVaultState(): Promise<void> {
		await ensureSeriesFile(this.app);
		await migrateVaultSchema(this.app);
		const books = await ensureAllSeriesBookEntries(this.app);
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
			await reconcileBookOnLoad(this.app, folder.name);
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
