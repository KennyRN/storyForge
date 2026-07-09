import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { getBookChapterFiles, readBookFrontmatter } from "../book";
import { renderTopPanel } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, nextStatsMode, type StatsMode } from "./StatsPanel";
import { SeriesModal } from "./SeriesModal";
import { ArchiveModal } from "./ArchiveModal";
import type { CodexViewMode } from "../codex";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import { countWords, sumWordCounts } from "../wordCount";
import { readHistory, todayISOInEngland, upsertTodayTotal, wordsThisWeek, wordsToday } from "../history";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private topMode: "book" | "series" = "book";
	private codexMode: CodexViewMode = "codex";
	private collapsedCodexFolders = new Set<string>();
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
			} else {
				this.activeChapterFilename = null;
			}
		} else {
			this.activeChapterFilename = null;
		}
		this.render();
	}

	render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-view");

		const topEl = container.createDiv({ cls: "sf-top-panel" });
		const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
		const statsEl = container.createDiv({ cls: "sf-stats-panel" });

		renderTopPanel(this.app, topEl, {
			mode: this.topMode,
			currentBookFolderName: this.currentBookFolderName,
			activeChapterFilename: this.activeChapterFilename,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			onToggleMode: () => {
				this.topMode = this.topMode === "book" ? "series" : "book";
				this.render();
			},
			onSelectBook: (name) => {
				this.currentBookFolderName = name;
				this.topMode = "book";
				this.render();
			},
			onOpenChapter: (bookName, filename) => void this.openChapter(bookName, filename),
			onOpenSeriesModal: () => new SeriesModal(this.app, () => this.render()).open(),
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
				this.codexMode = this.codexMode === "codex" ? "hidden" : "codex";
				this.render();
			},
			collapsedPaths: this.collapsedCodexFolders,
			onToggleFolder: (path) => {
				if (this.collapsedCodexFolders.has(path)) {
					this.collapsedCodexFolders.delete(path);
				} else {
					this.collapsedCodexFolders.add(path);
				}
				this.render();
			},
			activeFilePath,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
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

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}