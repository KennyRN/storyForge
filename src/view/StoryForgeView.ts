import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { getBookChapterFiles, readBookFrontmatter } from "../book";
import { renderTopPanel, type UnplacedViewMode } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, nextStatsMode, type StatsMode } from "./StatsPanel";
import { SeriesModal } from "./SeriesModal";
import { BookSynopsisModal } from "./BookSynopsisModal";
import { ArchiveModal } from "./ArchiveModal";
import { CodexArchiveModal } from "./CodexArchiveModal";
import { createCodexFolder, createCodexNote, readCodexFrontmatter, type CodexViewMode } from "../codex";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import { countWords, sumWordCounts } from "../wordCount";
import { readHistory, todayISOInEngland, upsertTodayTotal, wordsThisWeek, wordsToday } from "../history";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private topMode: "book" | "series" = "series";
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

	private readonly debouncedRender = debounce(() => this.render(), 400);

	async onOpen(): Promise<void> {
		const settings = this.plugin.getSettings();
		this.currentBookFolderName = settings.selectedNovel;
		this.activeChapterFilename = settings.selectedObject;
		this.topMode = this.currentBookFolderName ? "book" : "series";
		this.collapsedCodexFolders = new Set(settings.collapsedCodexFolderIds);
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(this.app.vault.on("rename", () => this.debouncedRender()));
		this.registerEvent(this.app.vault.on("create", () => this.debouncedRender()));
		this.registerEvent(this.app.vault.on("modify", () => this.debouncedRender()));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRender()));
		this.followActiveFile();
	}

	private followActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const bookName = bookFolderNameFromChapterPath(file.path);
			if (bookName) {
				this.currentBookFolderName = bookName;
				this.topMode = "book";
				this.activeChapterFilename = file.name;
				void this.persistSelection();
			}
		}
		if (!this.currentBookFolderName) {
			this.topMode = "series";
		}
		this.render();
	}

	/** Mirrors the panel's current book/chapter selection into settings, so leaving and returning to storyForge (even across a full close/reopen) picks up where it left off. */
	private async persistSelection(): Promise<void> {
		await this.plugin.updateSetting("selectedNovel", this.currentBookFolderName);
		await this.plugin.updateSetting("selectedObject", this.activeChapterFilename);
	}

	/** Clamps to "book" while the series pane is hidden, without discarding the user's underlying
	 * topMode intent - so re-enabling the pane later in Settings restores a sane view. */
	private effectiveTopMode(): "book" | "series" {
		return this.plugin.getSettings().hideSeriesPane ? "book" : this.topMode;
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-view");

		const topEl = container.createDiv({ cls: "sf-top-panel" });
		const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
		const statsEl = container.createDiv({ cls: "sf-stats-panel" });

		renderTopPanel(this.app, topEl, {
			mode: this.effectiveTopMode(),
			hideSeriesPane: this.plugin.getSettings().hideSeriesPane,
			currentBookFolderName: this.currentBookFolderName,
			activeChapterFilename: this.activeChapterFilename,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			unplacedMode: this.unplacedMode,
			onToggleMode: () => {
				if (this.plugin.getSettings().hideSeriesPane) return;
				this.topMode = this.topMode === "book" ? "series" : this.currentBookFolderName ? "book" : "series";
				this.render();
			},
			onToggleUnplacedMode: () => {
				this.unplacedMode = this.unplacedMode === "unplaced" ? "unplacedHidden" : "unplaced";
				this.render();
			},
			onSelectBook: (name) => {
				this.currentBookFolderName = name;
				this.topMode = "book";
				this.activeChapterFilename = null;
				void this.persistSelection();
				this.render();
			},
			onOpenChapter: (bookName, filename) => void this.openChapter(bookName, filename),
			onOpenSeriesModal: () => new SeriesModal(this.app, () => this.render()).open(),
			onOpenBookSynopsisModal: (bookFolderName) => new BookSynopsisModal(this.app, bookFolderName, () => this.render()).open(),
			onOpenArchive: () => {
				if (this.currentBookFolderName) {
					new ArchiveModal(this.app, this.currentBookFolderName, () => this.render()).open();
				}
			},
			onArchiveChapter: async () => {
				if (this.currentBookFolderName) {
					await this.recomputeWordCount(this.currentBookFolderName);
					await this.refreshStats();
				}
			},
		});

		const currentBookId = this.currentBookFolderName ? getBookId(this.app, this.currentBookFolderName) : null;
		const activeFile = this.app.workspace.getActiveFile();
		const activeFilePath = activeFile?.path ?? null;

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
			onOpenArchive: () => new CodexArchiveModal(this.app, () => this.render()).open(),
		});

		renderStatsPanel(statsEl, {
			mode: this.statsMode,
			counts: this.statsCounts,
			onToggleMode: () => {
				this.statsMode = nextStatsMode(this.statsMode);
				this.render();
			},
		});
		void this.refreshStats();
	}

	private async refreshStats(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const chapter =
			activeFile && isLibraryChapterPath(activeFile.path)
				? countWords(await this.app.vault.read(activeFile))
				: 0;

		let daily = 0;
		let weekly = 0;
		let story = 0;
		if (this.currentBookFolderName) {
			// All stats are computed from live (non-archived) chapter files.
			const chapterFiles = getBookChapterFiles(this.app, this.currentBookFolderName);
			const archived = new Set(readBookFrontmatter(this.app, this.currentBookFolderName)?.archive ?? []);
			const liveFiles = chapterFiles.filter((f) => !archived.has(f.name));
			const contents = await Promise.all(liveFiles.map((f) => this.app.vault.read(f)));
			story = sumWordCounts(contents);

			// "daily"/"weekly" are deltas against history, not the running total. Splice in
			// today's live total in case the debounced background persist hasn't flushed yet.
			const { totals } = await readHistory(this.app, this.currentBookFolderName);
			const todayISO = todayISOInEngland();
			const totalsWithLive = { ...totals, [todayISO]: story };
			daily = wordsToday(totalsWithLive, todayISO);
			weekly = wordsThisWeek(totalsWithLive, todayISO);
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

	/** Re-computes the book's total wordcount (excluding archived chapters) and persists it to wordcount.md. */
	private async recomputeWordCount(bookFolderName: string): Promise<void> {
		const chapterFiles = getBookChapterFiles(this.app, bookFolderName);
		const archived = new Set(readBookFrontmatter(this.app, bookFolderName)?.archive ?? []);
		const liveFiles = chapterFiles.filter((f) => !archived.has(f.name));
		const contents = await Promise.all(liveFiles.map((f) => this.app.vault.read(f)));
		const total = sumWordCounts(contents);
		await upsertTodayTotal(this.app, bookFolderName, total);
	}

	private codexTargetFolderId(): string | null {
		const id = this.activeCodexFolderId;
		return id && readCodexFrontmatter(this.app).folders[id] ? id : null;
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