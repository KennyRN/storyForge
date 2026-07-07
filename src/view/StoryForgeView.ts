import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { renderTopPanel } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, nextStatsMode, type StatsMode } from "./StatsPanel";
import { SeriesModal } from "./SeriesModal";
import type { CodexViewMode } from "../codex";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import { countWords } from "../wordCount";
import { readHistory } from "../history";
import { latestTotal, todayISOInEngland, wordsToday } from "../historyMath";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private topMode: "book" | "series" = "book";
	private codexMode: CodexViewMode = "codex";
	private collapsedCodexFolders = new Set<string>();
	private statsMode: StatsMode = "daily";
	private statsCounts: Record<StatsMode, number> = { daily: 0, chapter: 0, story: 0 };

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
		let story = 0;
		if (this.currentBookFolderName) {
			const history = await readHistory(this.app, this.currentBookFolderName);
			daily = wordsToday(history.totals, todayISOInEngland());
			story = latestTotal(history.totals);
		}

		const next: Record<StatsMode, number> = { daily, chapter, story };
		const prev = this.statsCounts;
		if (next.daily !== prev.daily || next.chapter !== prev.chapter || next.story !== prev.story) {
			this.statsCounts = next;
			this.render();
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
