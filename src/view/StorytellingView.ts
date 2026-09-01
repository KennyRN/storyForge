import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { renderTopPanel } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, type StatsMode } from "./StatsPanel";
import { createCodexFolder, createCodexNote, readCodexFrontmatter } from "../codex";
import { displayedVaultTags } from "../vaultTags";
import { debounce } from "../debounce";
import { ICON_BOOK_OPEN } from "../icons";
import { countWords } from "../wordCount";
import { getBookWordStats } from "../history";
import { WordCountModal } from "./WordCountModal";
import { isDragInProgress } from "./dragLock";
import { createContinuingChapter } from "../chapterCreation";
import { getBookChapters } from "../book";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { STORYFORGE_CONTINUOUS_VIEW_TYPE, type ContinuousReadView } from "./ContinuousReadView";
import { emitContinuousScrollTo, onContinuousMode } from "./continuousEvents";

export const STORYTELLING_VIEW_TYPE = "storyforge-storytelling-view";

/**
 * "Codex focus" (compact chapter navigator + Codex + stats, no unplaced section), moved out of
 * the storyLibrary panel's own layout selector into its own always-available left-rail panel —
 * see layout.ts's header comment. Codex still embeds in the storyLibrary panel too, under the
 * "Chapter" layout; this view and StoryForgeView duplicate a fair amount of plumbing (continuous
 * mode tracking, stats, chapter/codex creation) because each owns a fully independent leaf.
 */
export class StorytellingView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private collapsedCodexFolders = new Set<string>();
	private activeCodexFolderId: string | null = null;
	/** codexTypes ids currently filtering the Codex tree — session-only. */
	private codexTypeFilter = new Set<string>();
	/** Vault `#tag` currently filtering the Codex tree — session-only, single-select. */
	private vaultTagFilter: string | null = null;
	private statsMode: StatsMode = "daily";
	private statsCounts: Record<StatsMode, number> = { daily: 0, weekly: 0, chapter: 0, story: 0 };
	/** Tears down the live position indicator's event-listener — must run before the next render
	 * discards its DOM (see render()). */
	private continuousCleanup: (() => void) | null = null;
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYTELLING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "storyTelling";
	}

	getIcon(): string {
		return ICON_BOOK_OPEN;
	}

	private readonly debouncedRender = debounce(() => {
		if (!isDragInProgress()) this.render();
	}, 400);

	async onOpen(): Promise<void> {
		const settings = this.plugin.getSettings();
		this.currentBookFolderName = settings.selectedNovel;
		this.activeChapterFilename = settings.selectedObject;
		this.collapsedCodexFolders = new Set(settings.collapsedCodexFolderIds);
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(this.app.vault.on("rename", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.vault.on("create", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.vault.on("modify", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRender()));
		// Same safety net as StoryForgeView's — see there for why active:true is ignored.
		this.registerEvent(onContinuousMode(this.app, (payload) => { if (!payload.active) this.render(); }));
		try {
			this.followActiveFile();
		} catch (err) {
			console.error("storyForge: storyTelling failed to open", err);
		}
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedRender.cancel();
		this.continuousCleanup?.();
	}

	/** The read view's leaf open on `bookFolderName`, if any — see StoryForgeView's twin for why. */
	private findContinuousReadLeaf(bookFolderName: string): WorkspaceLeaf | null {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_CONTINUOUS_VIEW_TYPE)) {
			const view = leaf.view as ContinuousReadView;
			if (typeof view.getBookFolderName === "function" && view.getBookFolderName() === bookFolderName) return leaf;
		}
		return null;
	}

	private followActiveFile(): void {
		// Focusing this sidebar is not a file navigation. getActiveFile() often still reports the
		// last markdown file (or a restored non-chapter), and treating that as a change would wipe
		// the persisted chapter before restoreStorytellingCenterEditor() can open it.
		if (this.app.workspace.getActiveViewOfType(StorytellingView) === this) {
			this.render();
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const bookName = bookFolderNameFromChapterPath(file.path);
			if (bookName) {
				this.currentBookFolderName = bookName;
				this.activeChapterFilename = file.name;
				void this.persistSelection();
			} else if (this.activeChapterFilename !== null) {
				this.activeChapterFilename = null;
				void this.persistSelection();
			}
		}
		this.render();
	}

	/** Shares the same selection settings as StoryForgeView, so the two panels always agree on
	 * "the current book/chapter" regardless of which one last changed it. */
	private async persistSelection(): Promise<void> {
		await this.plugin.updateSetting("selectedNovel", this.currentBookFolderName);
		await this.plugin.updateSetting("selectedObject", this.activeChapterFilename);
		// The Series overview page (if open) reads selectedNovel straight from settings — nudge it
		// to re-render so a book picked here is reflected there too.
		this.plugin.refreshSeriesOverviewView();
	}

	render(): void {
		if (this.closed) return;
		if (isDragInProgress()) return;
		this.continuousCleanup?.();
		this.continuousCleanup = null;
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-storytelling-view");

		// Same clamp as StoryForgeView.effectiveTopPane(): while the series pane is hidden
		// entirely, fall back to the full book view rather than the compact navigator.
		const mode = this.plugin.getSettings().hideSeriesPane ? "novel" : "navigator";

		const continuousReadLeaf = this.currentBookFolderName ? this.findContinuousReadLeaf(this.currentBookFolderName) : null;
		const continuousActiveFilename = continuousReadLeaf ? (continuousReadLeaf.view as ContinuousReadView).getCurrentFilename() : null;

		const topEl = container.createDiv({ cls: "sf-top-panel sf-top-panel--above-codex" });
		renderTopPanel(this.app, topEl, {
			mode,
			hideSeriesPane: this.plugin.getSettings().hideSeriesPane,
			seriesNumberingStyle: this.plugin.getSettings().seriesNumberingStyle,
			chapterNumberingStyle: this.plugin.getSettings().chapterNumberingStyle,
			showUnplacedSection: false,
			currentBookFolderName: this.currentBookFolderName,
			activeChapterFilename: this.activeChapterFilename,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			unplacedMode: "unplaced",
			onToggleUnplacedMode: () => {
				/* no unplaced section here */
			},
			onSelectBook: (name) => {
				this.currentBookFolderName = name;
				this.activeChapterFilename = null;
				void this.persistSelection();
				this.render();
			},
			onOpenChapter: (bookName, filename) => void this.openChapter(bookName, filename),
			onCreateContinuingChapter: (bookFolderName) => void this.handleCreateContinuingChapter(bookFolderName),
			onArchiveChapter: async () => {
				if (this.closed) return;
				await this.refreshStats();
			},
			continuousActiveFilename,
			onOpenContinuousRead: (bookFolderName) => void this.openContinuousRead(bookFolderName),
			onExitContinuousRead: (bookFolderName) => void this.exitContinuousRead(bookFolderName),
			onContinuousScrollTo: (bookFolderName, filename) => emitContinuousScrollTo(this.app, { bookFolderName, filename }),
			registerContinuousCleanup: (dispose) => {
				this.continuousCleanup = dispose;
			},
		});

		const currentBookId = this.currentBookFolderName ? getBookId(this.app, this.currentBookFolderName) : null;
		const activeFile = this.app.workspace.getActiveFile();
		const activeFilePath = activeFile?.path ?? null;

		if (this.vaultTagFilter && !displayedVaultTags(this.app).some((tag) => tag.id === this.vaultTagFilter)) {
			this.vaultTagFilter = null;
		}

		const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
		renderBottomPanel(this.app, bottomEl, {
			currentBookId,
			mode: "codex",
			collapsedPaths: this.collapsedCodexFolders,
			onToggleFolder: (folderId) => {
				if (this.collapsedCodexFolders.has(folderId)) {
					this.collapsedCodexFolders.delete(folderId);
				} else {
					this.collapsedCodexFolders.add(folderId);
				}
				this.activeCodexFolderId = folderId;
				void this.plugin.updateSetting("collapsedCodexFolderIds", Array.from(this.collapsedCodexFolders));
				this.render();
			},
			activeFilePath,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			onCreateFolder: () => void this.handleCreateCodexFolder(),
			onCreateFile: () => void this.handleCreateCodexFile(),
			typeFilter: this.codexTypeFilter,
			onChangeTypeFilter: (next: string[]) => {
				this.codexTypeFilter = new Set(next);
				this.render();
			},
			tagFilter: this.vaultTagFilter,
			onChangeTagFilter: (next) => {
				this.vaultTagFilter = next;
				this.render();
			},
			onOpenFile: (path) => void this.openCodexFile(path),
		});

		const statsEl = container.createDiv({ cls: "sf-stats-panel" });
		renderStatsPanel(statsEl, {
			mode: this.statsMode,
			counts: this.statsCounts,
			onOpenHistory: () => {
				if (this.currentBookFolderName) {
					new WordCountModal(this.app, this.currentBookFolderName, {
						statsMode: this.statsMode,
						seriesNumberingStyle: this.plugin.getSettings().seriesNumberingStyle,
						chapterNumberingStyle: this.plugin.getSettings().chapterNumberingStyle,
						onSelectStatsMode: (mode) => {
							this.statsMode = mode;
							this.render();
						},
					}).open();
				}
			},
		});

		void this.refreshStats();
	}

	private async refreshStats(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const chapter =
			activeFile && isLibraryChapterPath(activeFile.path)
				? countWords(await this.app.vault.cachedRead(activeFile))
				: 0;
		if (this.closed) return;

		let daily = 0;
		let weekly = 0;
		let story = 0;
		if (this.currentBookFolderName) {
			const stats = await getBookWordStats(this.app, this.currentBookFolderName);
			if (this.closed) return;
			daily = stats.todayNet;
			weekly = stats.weekNet;
			story = stats.current;
		}

		const next: Record<StatsMode, number> = { daily, weekly, chapter, story };
		const prev = this.statsCounts;
		if (
			next.daily !== prev.daily ||
			next.weekly !== prev.weekly ||
			next.chapter !== prev.chapter ||
			next.story !== prev.story
		) {
			this.statsCounts = next;
			this.render();
		}
	}

	private codexTargetFolderId(): string | null {
		const id = this.activeCodexFolderId;
		return id && readCodexFrontmatter(this.app).folders[id] ? id : null;
	}

	private async handleCreateContinuingChapter(bookFolderName: string): Promise<void> {
		try {
			await createContinuingChapter(this.app, bookFolderName, null);
			if (this.closed) return;
			this.render();
		} catch (err) {
			new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
		}
	}

	private async handleCreateCodexFolder(): Promise<void> {
		try {
			await createCodexFolder(this.app, this.codexTargetFolderId());
		} catch (err) {
			new Notice(`storyForge: could not create folder — ${(err as Error).message}`);
		}
	}

	private async handleCreateCodexFile(): Promise<void> {
		try {
			const file = await createCodexNote(this.app, this.codexTargetFolderId());
			await this.openInMainContentLeaf(file);
		} catch (err) {
			new Notice(`storyForge: could not create file — ${(err as Error).message}`);
		}
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.openInMainContentLeaf(file);
		}
	}

	/** BottomPanel.ts's onOpenFile — a Codex note click, same "force it active" treatment as
	 * openChapter() needs, and for the same reason (see openInMainContentLeaf's doc comment):
	 * without it, clicking off a chapter and onto a Codex entry left the chapter's row still
	 * highlighted, since followActiveFile() never got the active-leaf-change to run on. */
	private async openCodexFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.openInMainContentLeaf(file);
		}
	}

	/** `leaf.openFile()` alone doesn't reliably flip the workspace's own idea of "the active leaf"
	 * when the click originated in a sidebar view — active-leaf-change then never fires, so
	 * followActiveFile() never runs and the highlighted row goes stale even though the editor
	 * itself did switch chapters. Same fix StoryForgeView's twin needs, and exitContinuousRead()
	 * already needed, for the same reason. */
	private async openInMainContentLeaf(file: TFile): Promise<void> {
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.openFile(file, { active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private async openContinuousRead(bookFolderName: string): Promise<void> {
		const { ordered } = getBookChapters(this.app, bookFolderName);
		if (!canEnterContinuousMode(ordered.length)) return;
		const entryFilename = resolveEntryChapter(
			ordered.map((file) => file.name),
			this.activeChapterFilename,
		);
		if (!entryFilename) return;
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.setViewState({ type: STORYFORGE_CONTINUOUS_VIEW_TYPE, active: true, state: { bookFolderName, entryFilename } });
		await this.app.workspace.revealLeaf(leaf);
		if (!this.closed) this.render();
	}

	private async exitContinuousRead(bookFolderName: string): Promise<void> {
		const leaf = this.findContinuousReadLeaf(bookFolderName);
		const filename = leaf ? (leaf.view as ContinuousReadView).getCurrentFilename() : null;
		if (!leaf || !filename) return;
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await leaf.openFile(file, { active: true });
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		if (!this.closed) this.render();
	}
}
