import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureAllChapterEntries, getBookChapterFiles, syncAllBookReferenceFields } from "./book";
import { migrateVaultSchema } from "./migration";
import { registerReconciliationEvents, reconcileBookOnLoad } from "./reconciliation";
import { isLibraryChapterPath, bookFolderNameFromChapterPath } from "./paths";
import { sumWordCounts } from "./wordCount";
import { upsertTodayTotal } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { registerCustomIcons } from "./icons";

export interface StoryForgePluginSettings {
	hideHelp: boolean;
	hideSearch: boolean;
	hideBookmarks: boolean;
	hideLeftPanel: boolean;
	hideRightPanel: boolean;
	hideFileNameBar: boolean;
	hideNavRow: boolean;
	highlightActiveChapter: boolean;
	unplacedMuted: boolean;
	unplacedSmallCaps: boolean;
	unplacedColor: string;
	unplacedFontSize: number;
	unplacedItemsFontSize: number;
	codexMuted: boolean;
	codexSmallCaps: boolean;
	codexColor: string;
	codexFontSize: number;
	collapsedSections: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: StoryForgePluginSettings = {
	hideHelp: true,
	hideSearch: true,
	hideBookmarks: true,
	hideLeftPanel: false,
	hideRightPanel: true,
	hideFileNameBar: true,
	hideNavRow: true,
	highlightActiveChapter: true,
	unplacedMuted: false,
	unplacedSmallCaps: true,
	unplacedColor: "#ffff00",
	unplacedFontSize: 1,
	unplacedItemsFontSize: 1,
	codexMuted: false,
	codexSmallCaps: true,
	codexColor: "#bf00ff",
	codexFontSize: 1,
	collapsedSections: {},
};

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	private styleEl: HTMLStyleElement | null = null;
	private headerStyleEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));

		this.addCommand({
			id: "open-storyforge-view",
			name: "Open storyForge panel",
			callback: () => void this.activateView(),
		});

		await this.loadSettings();
		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
		this.applyVisibilityStyles();
		this.applyHeaderStyles();

		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => void this.initializeVaultState());
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
			rules.push(".help { display: none !important; }");
		}
		if (this.pluginSettings.hideSearch) {
			rules.push("div[aria-label='Search'] { display: none !important; }");
		}
		if (this.pluginSettings.hideBookmarks) {
			rules.push("div[aria-label='Bookmarks'] { display: none !important; }");
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
		const rules: string[] = [
			`.sf-header-unplaced { color: ${unplacedColor}; font-variant: ${s.unplacedSmallCaps ? "small-caps" : "normal"}; font-size: ${s.unplacedFontSize}em; }`,
			`.sf-unplaced-header > .sf-icon { color: ${unplacedColor}; font-size: ${s.unplacedFontSize}em; }`,
			`.sf-unplaced-header > .sf-icon svg { width: 1em; height: 1em; }`,
			`.sf-unplaced-list { font-size: ${s.unplacedItemsFontSize}em; }`,
			`.sf-header-codex { color: ${codexColor}; font-variant: ${s.codexSmallCaps ? "small-caps" : "normal"}; font-size: ${s.codexFontSize}em; }`,
			`.sf-bottom-header:not(.sf-codex-hidden) > .sf-icon { color: ${codexColor}; font-size: ${s.codexFontSize}em; }`,
			`.sf-bottom-header:not(.sf-codex-hidden) > .sf-icon svg { width: 1em; height: 1em; }`,
		];

		if (!this.headerStyleEl) {
			this.headerStyleEl = document.createElement("style");
			this.headerStyleEl.id = "storyforge-header-styles";
			document.head.appendChild(this.headerStyleEl);
		}
		this.headerStyleEl.textContent = rules.join("\n");
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
		const contents = await Promise.all(chapterFiles.map((f) => this.app.vault.read(f)));
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
}