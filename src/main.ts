import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, type PaneType } from "obsidian";
import { existingMainContentLeaf, resolveMainContentLeaf, type MainContentWorkspace } from "./mainContentLeaf";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { StoryContextView, STORY_CONTEXT_VIEW_TYPE, activateArchiveView, activateStoryContextView } from "./view/StoryContextView";
import { CODEX_TYPES, pruneMissingCodexNotes } from "./codex";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureTagRegistryFile, loadCodexTypesIntoRegistry } from "./tagRegistry";
import { createBook, createChapter, ensureAllChapterEntries, getBookChapters, pruneMissingChapterCodexRefs, pruneMissingChapterEntries, readBookFrontmatter, syncAllBookReferenceFields, writeBookChapterOrder } from "./book";
import { resolveStorytellingCenterPath } from "./storytellingCenter";
import type { NumberingStyle } from "./numberingStyle";
import { registerReconciliationEvents } from "./reconciliation";
import {
	isLibraryChapterPath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	libraryChapterPath,
	seriesFilePath,
	LIBRARY_ROOT,
	CODEX_ROOT,
	NOTES_ROOT,
} from "./paths";
import type { SfLayout } from "./layout";
import { recordChapterEdit } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { countWords } from "./wordCount";
import { registerCustomIcons } from "./icons";
import { runContentBackup } from "./backup";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";

export interface StoryForgePluginSettings {
	hideSeriesPane: boolean;
	/**
	 * Vault-open landing for the combined left-rail panel: on → storytelling mode + Focus on;
	 * off → storyforge + Focus off. Session face changes after that stay independent of this flag.
	 */
	autoFocus: boolean;
	/** The panel layout chosen from the layout selector menu (hand-off brief §2/§5.1). Persists across reloads. */
	layout: SfLayout;
	highlightActiveChapter: boolean;
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	automaticBackupEnabled: boolean;
	automaticBackupFrequency: AutomaticBackupFrequency;
	lastAutomaticBackupAt: number;
	/** Per Codex type id → H2 heading label used for structured Facts in notes. */
	codexFactSectionByType: Record<string, string>;
	/** How "#" resolves in book titles within a series (numberedBookTitle). */
	seriesNumberingStyle: NumberingStyle;
	/** How "#" resolves in chapter titles within a book (numberedChapterTitle). */
	chapterNumberingStyle: NumberingStyle;
}

/**
 * "Codex focus" was retired as a storyForge-panel layout (its navigator + codex + stats
 * composition moved out into its own always-available Storytelling panel — see layout.ts).
 * A saved `layout: "codexFocus"` from before that change is no longer a valid `SfLayout`, so
 * `layoutConfig()`'s switch would return `undefined` for it; migrate straight to "hybrid",
 * the remaining layout closest to what a "Codex focus" user was after (codex still visible).
 */
function migrateCodexFocusLayout(settings: StoryForgePluginSettings): void {
	if ((settings.layout as string) === "codexFocus") settings.layout = "hybrid";
}

export const DEFAULT_SETTINGS: StoryForgePluginSettings = {
	hideSeriesPane: false,
	autoFocus: true,
	layout: "novelBrowse",
	highlightActiveChapter: true,
	selectedNovel: null,
	selectedObject: null,
	collapsedCodexFolderIds: [],
	automaticBackupEnabled: false,
	automaticBackupFrequency: "daily",
	lastAutomaticBackupAt: 0,
	codexFactSectionByType: {
		person: "Facts",
		place: "Facts",
		populace: "Facts",
	},
	seriesNumberingStyle: "arabic",
	chapterNumberingStyle: "arabic",
};

/** View types of removed features, still possibly present in a saved layout. */
const RETIRED_VIEW_TYPES = [
	"storyforge-storytelling-view",
	"storyforge-tools-view",
	"storyforge-archive-view",
	"storyforge-forge-view",
	"storyforge-continuous-view",
	"storyforge-series-overview-view",
	"storyforge-novel-overview-view",
	"storyforge-new-chapter-view",
];

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	private backupInProgress = false;
	/** Serialises ensureSidePanels / ensureRightRailPanels so overlapping calls cannot create duplicate tabs. */
	private ensurePanelsChain: Promise<void> = Promise.resolve();
	/** The one main-area tab storyForge's own navigation (Series overview, continuous read, chapter
	 * opens, the new-chapter page, …) always reuses — see getMainContentLeaf(). Not persisted:
	 * starts fresh (null) every session, adopting whatever leaf the first such navigation touches. */
	private mainContentLeafId: string | null = null;

	async onload(): Promise<void> {
		// Nothing that awaits may run before registerView(). Workspace restore races plugin
		// onload; if our types are missing (or Plugin.registerView unregisters them first),
		// saved tabs become EmptyView ("plugin has gone away"). Settings/API/icons are all
		// synchronous here so nameForge can touch `plugin.api` the moment those tabs restore.
		this.syncObsidianSettingsRef();
		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));
		this.registerView(STORY_CONTEXT_VIEW_TYPE, (leaf) => new StoryContextView(leaf, this));

		await this.loadSettings();
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-library-header-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles, #storyforge-heading1-link-styles, #storyforge-text-style-overrides, #storyforge-custom-fonts, #storyforge-cycling-guide-styles",
			)
			.forEach((el) => el.remove());

		this.addCommand({
			id: "open-story-context",
			name: "Open Context panel",
			callback: () => void this.activateStoryContextView(),
		});

		this.addCommand({
			id: "open-archive",
			name: "Open Archive",
			callback: () => void this.activateArchiveView("codex"),
		});

		this.addCommand({
			id: "open-view",
			name: "Open story library",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-storytelling-view",
			name: "Open storytelling mode",
			callback: () => void this.activateStorytellingView(),
		});

		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.onWorkspaceLayoutReady();
		});

		// Switching onto the combined left-rail tab in storytelling mode is a leaf activation like
		// any other (it's a sidebar tab) rather than something StoryForgeView's own layout-tab click
		// handler can see, so this is a separate, plugin-level listener rather than living next to
		// the Novel/Chapter handling in StoryForgeView.ts's selectLayout().
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof StoryForgeView && leaf.view.isStorytellingMode()) {
					void this.restoreStorytellingCenterEditor(false);
				}
			}),
		);

		this.registerInterval(window.setInterval(() => void this.maybeRunScheduledBackup("interval"), 30 * 60 * 1000));
	}

	/**
	 * Runs the automatic backup if enabled, a folder is configured, and it's due. "every-open" only
	 * fires on `trigger === "vault-open"` - the recurring interval check exists purely to catch
	 * daily/weekly backups becoming due while Obsidian is left open across multiple days.
	 */
	private async maybeRunScheduledBackup(trigger: "vault-open" | "interval"): Promise<void> {
		if (this.backupInProgress) return;
		const { automaticBackupEnabled, automaticBackupFrequency, lastAutomaticBackupAt } = this.pluginSettings;
		if (!automaticBackupEnabled) return;

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
			await runContentBackup(this.app, includeTime);
			await this.updateSetting("lastAutomaticBackupAt", now);
		} catch (err) {
			new Notice(`storyForge: automatic backup failed — ${(err as Error).message}`);
		} finally {
			this.backupInProgress = false;
		}
	}

	/**
	 * Vault I/O and leaf recovery wait for layout-ready: the in-memory vault index is not
	 * guaranteed during onload. A throw here must not unload the plugin — that is what turns restored
	 * leaves into "plugin has gone away".
	 */
	private async onWorkspaceLayoutReady(): Promise<void> {
		void (async () => {
			try {
				await this.initializeVaultState();
			} catch (err) {
				console.error("storyForge: vault initialization failed", err);
			}
		})();
		void this.enqueueEnsurePanels(async () => {
			this.detachRetiredLeaves();
			await this.ensureSidePanelsUnlocked();
			await this.hydratePluginViews();
			this.applyLeftPanelLanding();
			if (this.pluginSettings.autoFocus) {
				await this.restoreStorytellingCenterEditor(true);
			}
		});
		void this.maybeRunScheduledBackup("vault-open");
	}

	private allPluginViewTypes(): string[] {
		return [STORYFORGE_VIEW_TYPE, STORY_CONTEXT_VIEW_TYPE];
	}

	/**
	 * View types of features that have been removed. A saved layout can still hold a leaf of one of
	 * these; with no view registered it would show as "plugin has gone away", so close it.
	 */
	private detachRetiredLeaves(): void {
		for (const type of RETIRED_VIEW_TYPES) this.app.workspace.detachLeavesOfType(type);
	}

	/**
	 * Inactive sidebar tabs often restore as DeferredView. Load them so tab headers pick up
	 * registered custom icons. Do not rebuildView() here: that round-trips through EmptyView
	 * and is what turns a healthy restore into "plugin has gone away" on quit/reopen.
	 */
	private async hydratePluginViews(): Promise<void> {
		for (const type of this.allPluginViewTypes()) {
			this.dedupeLeavesOfType(type);
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				try {
					await leaf.loadIfDeferred();
				} catch (err) {
					console.error(`storyForge: loadIfDeferred failed for ${type}`, err);
				}
			}
		}
	}

	/**
	 * Forces any open storyForge view(s) to re-render, e.g. after a settings change with no other
	 * trigger. Inactive sidebar tabs restore as DeferredView and have no `render()` of their own,
	 */
	refreshStoryForgeViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) leaf.view.render();
		}
	}

	/** Series panel's onSelectBook nudge (StoryForgeView.ts) — an already-open Story Context panel
	 * (right sidebar) should jump to its Novel tab and show the newly-picked book. A no-op if it
	 * isn't currently open anywhere. */
	focusStoryContextOnNovel(bookFolderName: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.focusNovel(bookFolderName);
		}
	}

	/** Novel panel's own entry nudge (StoryForgeView.ts's openNovelOverview), also fired from the
	 * storyLibrary panel's own Chapter layout tab whenever a chapter there is selected or opened
	 * (or that tab itself is switched into) — an already-open Story Context panel (right sidebar)
	 * should jump to its own Chapter tab and show the given chapter. A no-op if it isn't currently
	 * open anywhere. */
	focusStoryContextOnChapter(bookFolderName: string, filename: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.focusChapter(bookFolderName, filename);
		}
	}

	/** storyTelling Codex lore click — show the note in Focus Mode's `.sf-codex-page` when that
	 * panel is in Focus Mode. Returns false so the caller can open the note in the center pane. */
	openCodexLoreInFocusPage(path: string): boolean {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView && leaf.view.openCodexLore(path)) return true;
		}
		return false;
	}

	/** Path currently shown in Focus Mode's `.sf-codex-page`, or null. storyTelling uses this to
	 * highlight the matching lore row without making the note the active file. */
	codexFocusPagePath(): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) {
				const path = leaf.view.codexPagePath();
				if (path) return path;
			}
		}
		return null;
	}

	/** Nudge storytelling mode after Focus Mode's lore page opens or closes, so its Codex
	 * highlight agrees with `.sf-codex-page` without a full storyforge re-render. */
	refreshStorytellingView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView && leaf.view.isStorytellingMode()) leaf.view.render();
		}
	}

	setStoryContextFocusMode(on: boolean): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.setFocusMode(on);
		}
	}

	applyLeftPanelLanding(options?: { restoreCenter?: boolean }): void {
		const storytelling = this.pluginSettings.autoFocus;
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) {
				leaf.view.setStorytellingMode(storytelling, { restoreCenter: options?.restoreCenter ?? false });
			}
		}
	}

	/** Novel overview page's own chapter-title click (NovelOverviewView.ts) — an already-open
	 * storyLibrary panel should select (not open) the same chapter, so its own Novel-pane list
	 * agrees with whichever chapter was clicked without leaving the Novel overview page. A no-op if
	 * the storyLibrary panel isn't currently open anywhere. */
	focusStoryLibraryOnChapter(bookFolderName: string, filename: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) leaf.view.selectChapter(bookFolderName, filename);
		}
	}

	/** Workspace adapter for {@link resolveMainContentLeaf}: never asks `getLeaf(false)`, which
	 * returns the active sidebar after storyTelling / Story Context is focused. */
	private mainContentWorkspace(): MainContentWorkspace<WorkspaceLeaf> {
		const ws = this.app.workspace;
		return {
			rootSplit: ws.rootSplit,
			getLeafById: (id) => ws.getLeafById(id),
			getMostRecentLeaf: (root) => ws.getMostRecentLeaf(root as typeof ws.rootSplit),
			getLeaf: (newLeaf) => ws.getLeaf(newLeaf as PaneType | boolean),
		};
	}

	/** The tracked leaf if it still exists in the center pane — null rather than creating one, for
	 * callers that only want to act on it if it's already open (Notebook auto-naming, restore).
	 * A sidebar leaf that was adopted by an older getLeaf(false) is treated as gone so the next
	 * open self-heals into the root split. */
	peekMainContentLeaf(): WorkspaceLeaf | null {
		return this.getMainContentLeafIfExists();
	}

	private getMainContentLeafIfExists(): WorkspaceLeaf | null {
		return existingMainContentLeaf(this.mainContentWorkspace(), this.mainContentLeafId);
	}

	/**
	 * The one main-area tab all of storyForge's own navigation shares — Series overview, continuous
	 * read, chapter opens from the storyForge/storyTelling panels, the new-chapter page. Reusing a
	 * leaf by its own id (rather than `workspace.getLeaf(false)`'s "whatever's currently active")
	 * guarantees these transitions land on the *same* tab every time regardless of what else the
	 * user has since clicked into, so switching between Series/Novel/Chapter/storyTelling never
	 * piles up extra tabs of our own making. Adoption is restricted to the root split so a click
	 * from the storyTelling sidebar cannot replace that sidebar with the editor.
	 */
	getMainContentLeaf(): WorkspaceLeaf {
		const leaf = resolveMainContentLeaf(this.mainContentWorkspace(), this.mainContentLeafId);
		// `id` is runtime-public on WorkspaceLeaf but not in the published typings (same situation
		// as rebuildView() elsewhere in this file).
		this.mainContentLeafId = (leaf as WorkspaceLeaf & { id: string }).id;
		return leaf;
	}

	/**
	 * Puts the chapter the storyTelling sidebar is pointing at into the center editor, without
	 * waiting for a row click. `force` is for layout-ready (plugin reload / vault open): replace
	 * whatever the workspace restored in the root split. Without `force` (switching onto the
	 * storyTelling tab), an already-open markdown file is left alone so a Codex note the user just
	 * opened isn't yanked back to the chapter.
	 */
	async restoreStorytellingCenterEditor(force = false): Promise<void> {
		if (!force) {
			const existing = this.getMainContentLeafIfExists();
			if (existing?.view instanceof MarkdownView && existing.view.file) return;
		}
		const file = this.resolveStorytellingCenterFile();
		if (file) {
			const leaf = this.getMainContentLeaf();
			await leaf.openFile(file, { active: true });
			await this.app.workspace.revealLeaf(leaf);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			return;
		}
	}

	private resolveStorytellingCenterFile(): TFile | null {
		const { selectedNovel, selectedObject } = this.getSettings();
		const firstOrdered = selectedNovel ? (getBookChapters(this.app, selectedNovel).ordered[0]?.name ?? null) : null;
		const path = resolveStorytellingCenterPath(selectedNovel, selectedObject, (p) => {
			return this.app.vault.getAbstractFileByPath(p) instanceof TFile;
		}, firstOrdered);
		if (!path) return null;
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateCodexFocusLayout(this.pluginSettings);
		const sections = { ...DEFAULT_SETTINGS.codexFactSectionByType, ...this.pluginSettings.codexFactSectionByType };
		for (const opt of CODEX_TYPES) {
			if (!sections[opt.type]) sections[opt.type] = "Facts";
		}
		this.pluginSettings.codexFactSectionByType = sections;
		this.syncObsidianSettingsRef();
	}

	async saveSettings(): Promise<void> {
		this.syncObsidianSettingsRef();
		await this.saveData(this.pluginSettings);
	}

	getSettings(): StoryForgePluginSettings {
		return this.pluginSettings;
	}

	/**
	 * Obsidian 1.13+ settings UI reads `plugin.settings`. Keep that mirror in sync with
	 * our real store so the settings tab (and search) never render against `undefined`.
	 */
	private syncObsidianSettingsRef(): void {
		this.settings = this.pluginSettings;
	}

	async updateSetting<K extends keyof StoryForgePluginSettings>(key: K, value: StoryForgePluginSettings[K]): Promise<void> {
		await this.updateSettings({ [key]: value });
	}

	/** Persist a validated settings patch in one save, rolling memory back on failure. */
	async updateSettings(partial: Partial<StoryForgePluginSettings>): Promise<void> {
		const previous = { ...this.pluginSettings };
		Object.assign(this.pluginSettings, partial);
		try {
			await this.saveSettings();
		} catch (error) {
			this.pluginSettings = previous;
			this.syncObsidianSettingsRef();
			throw error;
		}
	}

	/** Eagerly creates the story library and Codex root folders (mirrors the already-eager _backstage/storyforge
	 * creation that modifyBackstageFrontmatter performs), so a fresh vault immediately has a place to drop
	 * in existing notes. Each check is independent and idempotent - a no-op on every load after the first.
	 * Bypasses writeGuard: LIBRARY_ROOT/CODEX_ROOT are paths its assertBackstagePath() forbids outright,
	 * same as the existing lazy-creation call sites in book.ts and codex.ts. */
	private async ensureEagerFolders(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(LIBRARY_ROOT)) {
			await this.app.vault.createFolder(LIBRARY_ROOT);
		}
		if (!this.app.vault.getAbstractFileByPath(CODEX_ROOT)) {
			await this.app.vault.createFolder(CODEX_ROOT);
		}
		if (!this.app.vault.getAbstractFileByPath(NOTES_ROOT)) {
			await this.app.vault.createFolder(NOTES_ROOT);
		}
	}

	/** True first run only (see initializeVaultState's isFirstRun): seeds one book and one chapter,
	 * both placed (in series order / chapter-order, not left unplaced), so a brand-new vault opens
	 * with something in the library rather than an empty shelf. Both pick up their "#"-numbered
	 * defaults ("Novel #" / "Chapter #") from createBook/createChapter — no title passed here.
	 * Neither is opened: onboarding chooses the first selected item (welcome note, or chapter 1). */
	private async createFirstRunBookAndChapter(): Promise<void> {
		const { folderName } = await createBook(this.app);
		const { filename } = await createChapter(this.app, folderName, { openFile: false });
		await writeBookChapterOrder(this.app, folderName, [filename]);
	}

	private async initializeVaultState(): Promise<void> {
		await this.ensureEagerFolders();
		const isFirstRun = !this.app.vault.getAbstractFileByPath(seriesFilePath());
		await ensureSeriesFile(this.app);
		if (isFirstRun) await this.createFirstRunBookAndChapter();
		const tagRegistry = await ensureTagRegistryFile(this.app);
		loadCodexTypesIntoRegistry(this.app, tagRegistry);
		await pruneMissingCodexNotes(this.app);
		await pruneMissingChapterCodexRefs(this.app);
		const books = await ensureAllSeriesBookEntries(this.app, (folderName) => {
			const fm = readBookFrontmatter(this.app, folderName);
			if (!fm?.bookIdReference) return null;
			return { bookId: fm.bookIdReference, bookTitle: fm.bookTitleReference || folderName };
		});
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
			await pruneMissingChapterEntries(this.app, folder.name);
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
		await recordChapterEdit(this.app, bookFolderName, file.name, countWords(raw));
	}

	async activateStoryContextView(): Promise<void> {
		await activateStoryContextView(this);
	}

	async activateArchiveView(tab: "codex" | "novel" = "codex"): Promise<void> {
		await activateArchiveView(this, tab);
	}

	async activateView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof StoryForgeView) leaf.view.setStorytellingMode(false);
		}
	}

	async activateStorytellingView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof StoryForgeView) leaf.view.setStorytellingMode(true);
		}
	}

	/** Runs panel-ensure work one-at-a-time (layout-ready + hosted registrations can overlap). */
	private enqueueEnsurePanels(work: () => Promise<void>): Promise<void> {
		const run = this.ensurePanelsChain.then(work, work);
		this.ensurePanelsChain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/**
	 * Creates missing storyForge / Tools / right-rail leaves and focuses storyForge on the
	 * left (Tools stays as a sibling tab, not the active one). Expands the right rail so
	 * Story Context is ready the same way the left panels are.
	 */
	private async ensureSidePanels(): Promise<void> {
		return this.enqueueEnsurePanels(() => this.ensureSidePanelsUnlocked());
	}

	private async ensureSidePanelsUnlocked(): Promise<void> {
		// Strip stacked copies from prior hot-reloads / raced ensures before creating anything.
		for (const type of this.allPluginViewTypes()) this.dedupeLeavesOfType(type);

		// Combined left panel: one leaf. Detach the retired storytelling tab from saved layouts.
		this.app.workspace.detachLeavesOfType("storyforge-storytelling-view");
		await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		await this.ensureLeaf(STORY_CONTEXT_VIEW_TYPE, "right", true);

		const storyforgeLeaf = this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)[0] ?? null;
		if (storyforgeLeaf) await this.app.workspace.revealLeaf(storyforgeLeaf);

		const right = this.app.workspace.rightSplit;
		if (typeof right.expand === "function") right.expand();
		const contextLeaf = this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)[0] ?? null;
		if (contextLeaf) {
			await contextLeaf.setViewState({ type: STORY_CONTEXT_VIEW_TYPE, active: true });
		}
	}

	/** Keeps the first leaf of `type` and detaches any extras (duplicate tab icons). */
	private dedupeLeavesOfType(type: string): void {
		const leaves = this.app.workspace.getLeavesOfType(type);
		for (let i = 1; i < leaves.length; i++) leaves[i].detach();
	}

	/**
	 * Ensure a leaf of `type` exists in the left or right sidebar. Does not reveal/focus.
	 * Uses Obsidian's `ensureSideLeaf` (reuses an existing leaf) and strips duplicates first —
	 * `getLeftLeaf`/`getRightLeaf` always insert a new tab, which previously stacked copies.
	 */
	private async ensureLeaf(
		type: string,
		side: "left" | "right",
		active: boolean,
	): Promise<WorkspaceLeaf | null> {
		this.dedupeLeavesOfType(type);
		return this.app.workspace.ensureSideLeaf(type, side, {
			active,
			reveal: false,
			split: false,
		});
	}
}
