import { ItemView, Notice, setIcon, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type StoryForgePlugin from "../main";
import { createContinuingChapter } from "../chapterCreation";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_ADD_CIRCLE } from "../icons";

export const STORYFORGE_NEW_CHAPTER_VIEW_TYPE = "storyforge-new-chapter-view";

interface NewChapterViewState {
	bookFolderName: string;
}

/**
 * A blank landing page for the main editor area, opened in place of the Series overview page when
 * there's no previously-selected chapter to fall back to (plugin.leaveSeriesOverviewIfShowing(),
 * triggered from StoryForgeView.ts's Novel/Chapter tabs and this plugin's own storyTelling-panel
 * active-leaf-change listener).
 *
 * Its one control mirrors the storyTelling panel's own forward-only "continue the story" tile
 * (CodexFocusNavigator.ts's [+] slot at the end of the three-chapter window) exactly — same icon,
 * same underlying call (createContinuingChapter: create a chapter, append it to chapter-order,
 * open it) — just presented full-page rather than as a small tile.
 */
export class NewChapterView extends ItemView {
	private bookFolderName: string | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYFORGE_NEW_CHAPTER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "New chapter";
	}

	getIcon(): string {
		return ICON_ADD_CIRCLE;
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const bookFolderName = (state as Partial<NewChapterViewState> | null)?.bookFolderName;
		this.bookFolderName = typeof bookFolderName === "string" ? bookFolderName : null;
		await super.setState(state, result);
		this.render();
	}

	getState(): Record<string, unknown> {
		return this.bookFolderName ? { bookFolderName: this.bookFolderName } : {};
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-new-chapter-view");

		const center = contentEl.createDiv({ cls: "sf-new-chapter-center" });
		setIcon(center.createDiv({ cls: "sf-new-chapter-icon" }), ICON_ADD_CIRCLE);
		center.createDiv({ cls: "sf-new-chapter-label", text: "create new chapter" });

		const create = () => void this.handleCreate();
		center.addEventListener("click", create);
		makeAccessibleActivatable(center, create);
	}

	private async handleCreate(): Promise<void> {
		if (!this.bookFolderName) return;
		try {
			await createContinuingChapter(this.app, this.bookFolderName, null);
		} catch (err) {
			new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
		}
	}
}
