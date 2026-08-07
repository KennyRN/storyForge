import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { renderTopPanel, type UnplacedViewMode } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, nextStatsMode, type StatsMode } from "./StatsPanel";
import { SeriesModal } from "./SeriesModal";
import { createCodexFolder, createCodexNote, readCodexFrontmatter, type CodexViewMode } from "../codex";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import { countWords } from "../wordCount";
import { getBookWordStats } from "../history";
import { WordCountModal } from "./WordCountModal";
import { isDragInProgress } from "./dragLock";
import { layoutConfig, type SfLayout } from "../layout";
import { createContinuingChapter } from "../chapterCreation";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private layout: SfLayout = "hybrid";
	/** Codex-focus navigator's continuous read-and-write mode (continuous-mode hand-off brief §2).
	 * Not persisted — like unplacedMode/codexMode/statsMode, it resets on a fresh session. */
	private continuousMode = false;
	/** Wherever the reader last scrolled to while in continuous mode, so an incidental re-render
	 * lands back where they were rather than at the top. */
	private continuousCurrentFilename: string | null = null;
	/** Tears down the continuous read-through's observers and vault listener — must run before the
	 * next render discards its DOM, since render() rebuilds the whole panel from scratch. */
	private continuousCleanup: (() => void) | null = null;
	private unplacedMode: UnplacedViewMode = "unplaced";
	private codexMode: CodexViewMode = "codex";
	private collapsedCodexFolders = new Set<string>();
	private activeCodexFolderId: string | null = null;
	private statsMode: StatsMode = "daily";
	private statsCounts: Record<StatsMode, number> = { daily: 0, weekly: 0, chapter: 0, story: 0 };

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYFORGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "storyForge";
	}

	getIcon(): string {
		return ICON_SERIES;
	}

	private readonly debouncedRender = debounce(() => {
		if (!isDragInProgress()) this.render();
	}, 400);
	private closed = false;

	async onOpen(): Promise<void> {
		const settings = this.plugin.getSettings();
		this.currentBookFolderName = settings.selectedNovel;
		this.activeChapterFilename = settings.selectedObject;
		this.layout = settings.layout;
		this.collapsedCodexFolders = new Set(settings.collapsedCodexFolderIds);
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(this.app.vault.on("rename", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.vault.on("create", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		// While reading continuously, ContinuousReadThrough refreshes its own mounted chapters on
		// modify (continuous-mode hand-off brief §2.5) — a full panel rebuild here would otherwise
		// reset the reader's scroll position on every edit made elsewhere.
		this.registerEvent(this.app.vault.on("modify", (file) => { if (!isBackstageBookkeepingPath(file.path) && !this.continuousMode) this.debouncedRender(); }));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRender()));
		this.followActiveFile();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedRender.cancel();
		this.continuousCleanup?.();
	}

	private followActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const bookName = bookFolderNameFromChapterPath(file.path);
			if (bookName) {
				// A different book opened while reading continuously — that continuous session no
				// longer refers to anything on screen, so drop out of it rather than carry it over.
				if (this.continuousMode && bookName !== this.currentBookFolderName) {
					this.continuousMode = false;
					this.continuousCurrentFilename = null;
				}
				this.currentBookFolderName = bookName;
				this.activeChapterFilename = file.name;
				void this.persistSelection();
			} else if (this.activeChapterFilename !== null) {
				// Codex (or any non-chapter) is open — clear library row highlight so only the editor file is selected.
				this.activeChapterFilename = null;
				void this.persistSelection();
			}
		}
		this.render();
	}

	/** Mirrors the panel's current book/chapter selection into settings, so leaving and returning to storyForge (even across a full close/reopen) picks up where it left off. */
	private async persistSelection(): Promise<void> {
		await this.plugin.updateSetting("selectedNovel", this.currentBookFolderName);
		await this.plugin.updateSetting("selectedObject", this.activeChapterFilename);
	}

	/** Which top pane the declared layout selects, clamped to "novel" while the series pane is hidden
	 * entirely, without discarding the user's chosen layout - so re-enabling the pane later in Settings
	 * restores it. */
	private effectiveTopPane(): "series" | "novel" | "navigator" {
		if (this.plugin.getSettings().hideSeriesPane) return "novel";
		return layoutConfig(this.layout).topPane;
	}

	render(): void {
		if (this.closed) return;
		if (isDragInProgress()) return;
		// Tear down the previous render's continuous read-through (if any) before its DOM goes away
		// — the observers and vault listener it registered would otherwise keep firing against
		// detached nodes.
		this.continuousCleanup?.();
		this.continuousCleanup = null;
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-view");

		const config = layoutConfig(this.layout);
		// Codex focus's navigator is short and fixed-height, unlike the full chapter tree the
		// shared grid rows are tuned for — let its row size to content so Codex sits right below it.
		// Continuous mode is the exception: its manuscript scroll needs real height, so it gets its
		// own grid row split (see styles.css's [data-top-pane="continuous"] rule).
		const inContinuousMode = this.continuousMode && config.topPane === "navigator";
		container.dataset.topPane = inContinuousMode ? "continuous" : config.topPane;

		const topEl = container.createDiv({ cls: "sf-top-panel" });

		renderTopPanel(this.app, topEl, {
			mode: this.effectiveTopPane(),
			hideSeriesPane: this.plugin.getSettings().hideSeriesPane,
			showUnplacedSection: config.showUnplaced,
			layout: this.layout,
			currentBookFolderName: this.currentBookFolderName,
			activeChapterFilename: this.activeChapterFilename,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			unplacedMode: this.unplacedMode,
			onSelectLayout: (layout) => {
				this.layout = layout;
				this.continuousMode = false;
				this.continuousCurrentFilename = null;
				void this.plugin.updateSetting("layout", layout);
				this.render();
			},
			onToggleUnplacedMode: () => {
				this.unplacedMode = this.unplacedMode === "unplaced" ? "unplacedHidden" : "unplaced";
				this.render();
			},
			onSelectBook: (name) => {
				this.currentBookFolderName = name;
				this.activeChapterFilename = null;
				this.continuousMode = false;
				this.continuousCurrentFilename = null;
				void this.persistSelection();
				this.render();
			},
			onOpenChapter: (bookName, filename) => void this.openChapter(bookName, filename),
			onOpenSeriesModal: () => new SeriesModal(this.app, () => this.render()).open(),
			onCreateContinuingChapter: (bookFolderName) => void this.handleCreateContinuingChapter(bookFolderName),
			onArchiveChapter: async () => {
				if (this.closed) return;
				await this.refreshStats();
			},
			continuousMode: inContinuousMode,
			continuousCurrentFilename: this.continuousCurrentFilename,
			onToggleContinuousMode: () => {
				this.continuousMode = !this.continuousMode;
				this.continuousCurrentFilename = this.continuousMode ? this.activeChapterFilename : null;
				this.render();
			},
			onExitContinuousMode: (bookFolderName, filename) => {
				this.continuousMode = false;
				this.continuousCurrentFilename = null;
				void this.openChapter(bookFolderName, filename);
			},
			onContinuousPositionChange: (filename) => {
				this.continuousCurrentFilename = filename;
			},
			registerContinuousCleanup: (dispose) => {
				this.continuousCleanup = dispose;
			},
		});

		if (config.showCodex) {
			const currentBookId = this.currentBookFolderName ? getBookId(this.app, this.currentBookFolderName) : null;
			const activeFile = this.app.workspace.getActiveFile();
			const activeFilePath = activeFile?.path ?? null;

			const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
			renderBottomPanel(this.app, bottomEl, {
				currentBookId,
				mode: this.codexMode,
				onToggleMode: () => {
					this.codexMode = this.codexMode === "codex" ? "codexHidden" : "codex";
					this.render();
				},
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
			});
		}

		if (config.showStats) {
			const statsEl = container.createDiv({ cls: "sf-stats-panel" });
			renderStatsPanel(statsEl, {
				mode: this.statsMode,
				counts: this.statsCounts,
				onToggleMode: () => {
					this.statsMode = nextStatsMode(this.statsMode);
					this.render();
				},
				onOpenHistory: () => {
					if (this.currentBookFolderName) {
						new WordCountModal(this.app, this.currentBookFolderName).open();
					}
				},
			});
		}
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

	/** Codex focus's forward-only `[+]` (hand-off brief §5.2): create a chapter, append it to the
	 * end of chapter-order, and open it — createContinuingChapter already opens the file. */
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
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			new Notice(`storyForge: could not create file — ${(err as Error).message}`);
		}
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}