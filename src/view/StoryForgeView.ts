import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, libraryChapterPath } from "../paths";
import { getBookId } from "../series";
import { renderTopPanel } from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { SeriesModal } from "./SeriesModal";
import type { CodexViewMode } from "../codex";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private topMode: "book" | "series" = "book";
	private codexMode: CodexViewMode = "codex";
	private collapsedCodexFolders = new Set<string>();

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
			}
		}
		this.render();
	}

	render(): void {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass("storyforge-view");

		const topEl = container.createDiv({ cls: "sf-top-panel" });
		const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });

		renderTopPanel(this.app, topEl, {
			mode: this.topMode,
			currentBookFolderName: this.currentBookFolderName,
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
		});
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(false).openFile(file);
		}
	}
}
