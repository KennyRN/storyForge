import { ItemView, Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle } from "../book";
import { getArchivedCodexItems, unarchiveCodexItem, type ArchivedCodexItem } from "../codex";
import { recordChapterUnarchive } from "../history";
import { ICON_ARCHIVE, ICON_UNARCHIVE } from "../icons";
import { bookFolderNameFromChapterPath, libraryChapterPath } from "../paths";
import { formatSingleLine } from "../titleNumbering";
import { excerpt } from "../wordCount";
import { makeAccessibleActivatable } from "./a11y";

export const ARCHIVE_VIEW_TYPE = "storyforge-archive-view";

type ArchiveMode = "codex" | "novel";

export class ArchiveView extends ItemView {
	private mode: ArchiveMode = "codex";
	private bookFolderName: string | null = null;
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return ARCHIVE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Archive";
	}

	getIcon(): string {
		return ICON_ARCHIVE;
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("sf-archive-view");
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					file.path.endsWith("novel.md") ||
					file.path.endsWith("codex.md") ||
					file.path.startsWith("Codex/") ||
					file.path.includes("/_sf-backstage/")
				) {
					this.render();
				}
			}),
		);
		this.syncFromPluginSelection();
		this.followActiveFile();
		this.render();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.contentEl.empty();
	}

	/** Seed book from storyForge selection. */
	syncFromPluginSelection(): void {
		const settings = this.plugin.getSettings();
		if (settings.selectedNovel) this.bookFolderName = settings.selectedNovel;
	}

	/** Prefer opening on the Novel tab when launched from the chapter archive button. */
	openOnNovelTab(): void {
		this.mode = "novel";
		this.syncFromPluginSelection();
		this.followActiveFile();
		this.render();
	}

	/** Prefer opening on the Codex tab when launched from the Codex archive button. */
	openOnCodexTab(): void {
		this.mode = "codex";
		this.render();
	}

	private followActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const book = bookFolderNameFromChapterPath(file.path);
		if (book) {
			this.bookFolderName = book;
			if (this.mode === "novel") this.render();
		}
	}

	private render(): void {
		if (this.closed) return;
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-archive-view");

		const header = el.createDiv({ cls: "sf-archive-view-header" });
		setIcon(header.createSpan({ cls: "sf-icon" }), ICON_ARCHIVE);
		header.createSpan({ cls: "sf-archive-view-title", text: "Archive" });

		const tabs = header.createDiv({ cls: "sf-archive-view-tabs" });
		const codexTab = tabs.createSpan({
			cls: `sf-archive-view-tab${this.mode === "codex" ? " is-active" : ""}`,
			text: "Codex",
		});
		const novelTab = tabs.createSpan({
			cls: `sf-archive-view-tab${this.mode === "novel" ? " is-active" : ""}`,
			text: "Novel",
		});
		codexTab.addEventListener("click", () => {
			this.mode = "codex";
			this.render();
		});
		novelTab.addEventListener("click", () => {
			this.mode = "novel";
			this.render();
		});

		if (this.mode === "codex") this.renderCodex(el);
		else this.renderNovel(el);
	}

	private renderCodex(el: HTMLElement): void {
		const archived = getArchivedCodexItems(this.app);
		if (archived.length === 0) {
			el.createDiv({ cls: "sf-empty", text: "No archived codex items." });
			return;
		}
		const list = el.createDiv({ cls: "sf-archive-list" });
		for (const entry of archived) {
			this.renderCodexRow(list, entry);
		}
	}

	private renderCodexRow(list: HTMLElement, entry: ArchivedCodexItem): void {
		const row = list.createDiv({ cls: "sf-row" });
		const label =
			entry.type === "folder" ? `${entry.name} (folder with ${entry.childCount ?? 0} children)` : entry.name;
		row.createSpan({ cls: "sf-archive-label", text: label });
		if (entry.type === "file") void this.attachCodexExcerpt(row, entry.key);

		const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
		setIcon(unarchiveBtn, ICON_UNARCHIVE);
		const handle = async () => {
			try {
				await unarchiveCodexItem(this.app, entry.key);
				this.plugin.refreshStoryForgeViews();
				this.render();
			} catch (err) {
				new Notice(`storyForge: could not unarchive — ${err instanceof Error ? err.message : String(err)}`);
			}
		};
		unarchiveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void handle();
		});
		makeAccessibleActivatable(unarchiveBtn, () => void handle());
	}

	private renderNovel(el: HTMLElement): void {
		if (!this.bookFolderName) {
			el.createDiv({ cls: "sf-empty", text: "Open a chapter to see this novel's archive." });
			return;
		}
		const archived = getArchivedChapters(this.app, this.bookFolderName);
		if (archived.length === 0) {
			el.createDiv({ cls: "sf-empty", text: "No archived chapters." });
			return;
		}
		const list = el.createDiv({ cls: "sf-archive-list" });
		for (const entry of archived) {
			this.renderNovelRow(list, entry.bookFolderName, entry.filename);
		}
	}

	private renderNovelRow(list: HTMLElement, bookFolderName: string, filename: string): void {
		const row = list.createDiv({ cls: "sf-row" });
		const chapterLabel = formatSingleLine(chapterDisplayTitle(this.app, bookFolderName, filename));
		row.createSpan({ cls: "sf-archive-label", text: chapterLabel });
		void this.attachChapterExcerpt(row, bookFolderName, filename);

		const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
		setIcon(unarchiveBtn, ICON_UNARCHIVE);
		const handle = async () => {
			try {
				await unarchiveChapter(this.app, bookFolderName, filename);
				await recordChapterUnarchive(this.app, bookFolderName, filename);
				this.plugin.refreshStoryForgeViews();
				this.render();
			} catch (err) {
				new Notice(`storyForge: could not unarchive — ${err instanceof Error ? err.message : String(err)}`);
			}
		};
		unarchiveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void handle();
		});
		makeAccessibleActivatable(unarchiveBtn, () => void handle());
	}

	private async attachCodexExcerpt(el: HTMLElement, path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const preview = excerpt(await this.app.vault.cachedRead(file));
		if (preview) setTooltip(el, preview);
	}

	private async attachChapterExcerpt(el: HTMLElement, bookFolderName: string, filename: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, filename));
		if (!(file instanceof TFile)) return;
		const preview = excerpt(await this.app.vault.cachedRead(file));
		if (preview) setTooltip(el, preview);
	}
}

export async function activateArchiveView(
	plugin: StoryForgePlugin,
	tab: ArchiveMode = "codex",
): Promise<void> {
	const { workspace } = plugin.app;
	let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(ARCHIVE_VIEW_TYPE)[0] ?? null;
	if (!leaf) {
		leaf = workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: ARCHIVE_VIEW_TYPE, active: true });
	}
	if (leaf) {
		const split = workspace.rightSplit;
		if (typeof split.expand === "function") split.expand();
		const view = leaf.view;
		if (view instanceof ArchiveView) {
			if (tab === "novel") view.openOnNovelTab();
			else view.openOnCodexTab();
		}
		await workspace.revealLeaf(leaf);
	}
}
