import { ItemView, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { CODEX_ROOT, isBackstageBookkeepingPath, isLibraryChapterPath, seriesFilePath } from "../paths";
import { debounce } from "../debounce";
import { isDragInProgress } from "./dragLock";
import { ICON_BOOK_DUOTONE } from "../icons";
import { renderNovelPanel } from "./NovelPanel";

export const STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE = "storyforge-novel-overview-view";

/**
 * The storyLibrary panel's Novel-layout own full-page view, opened in the main editor area in
 * place of a normal editor — StoryForgeView.ts's layout-tab click handler swaps it into the
 * active leaf, the same way the Series tab's own overview page does (SeriesOverviewView.ts).
 *
 * Content is the same cover/synopsis/Default PoV/chapter-by-chapter plot Story Context's own
 * Novel tab shows in the right sidebar — NovelPanel.ts's renderNovelPanel() is the one render
 * function both hosts share, so this page always mirrors that tab rather than risking a second
 * copy drifting out of sync (see SeriesOverviewView.ts's doc comment for the duplication this
 * project already learned not to repeat).
 *
 * The selected novel always follows the `selectedNovel` setting, same as SeriesOverviewView —
 * switching books elsewhere just needs `plugin.refreshNovelOverviewView()` to keep this page in
 * sync.
 */
export class NovelOverviewView extends ItemView {
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Novel overview";
	}

	getIcon(): string {
		return ICON_BOOK_DUOTONE;
	}

	// Same reload triggers as Story Context's own Novel tab (RecommendationView.ts's onOpen) —
	// this page shows the same data, so it needs to notice the same writes.
	private readonly debouncedRender = debounce(() => {
		if (!this.closed && !isDragInProgress()) this.render();
	}, 400);

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isBackstageBookkeepingPath(file.path)) return;
				const codexPrefix = `${CODEX_ROOT}/`;
				if (
					isLibraryChapterPath(file.path) ||
					file.path.startsWith(codexPrefix) ||
					file.path.endsWith("codex.md") ||
					file.path.endsWith("novel.md") ||
					file.path === seriesFilePath()
				) {
					this.debouncedRender();
				}
			}),
		);
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRender()));
		this.render();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedRender.cancel();
		this.contentEl.empty();
	}

	render(): void {
		if (isDragInProgress()) return;
		const { contentEl } = this;
		contentEl.addClass("sf-novel-overview-view");
		const bookFolderName = this.plugin.getSettings().selectedNovel;
		renderNovelPanel(this.app, contentEl, {
			bookFolderName,
			plugin: this.plugin,
			emptyText: "Select a novel to see its synopsis and plot.",
			onChanged: () => this.render(),
			isStale: () => this.closed,
			layout: "wide",
		});
	}
}
