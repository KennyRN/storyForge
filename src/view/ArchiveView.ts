import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import { ICON_ARCHIVE } from "../icons";
import { BACKSTAGE_ROOT, bookFolderNameFromChapterPath, isLibraryRootFilePath } from "../paths";
import { activateRightRailView } from "./activateRightRailView";
import { renderArchivePanel, type ArchiveMode } from "./archivePanel";
import { RecommendationView, RECOMMEND_VIEW_TYPE } from "./RecommendationView";

/**
 * Legacy ItemView kept registered so old workspaces that still restore an Archive leaf
 * do not crash. New UX embeds Archive inside Story Context — prefer `activateArchiveView`.
 */
export const ARCHIVE_VIEW_TYPE = "storyforge-archive-view";

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
					isLibraryRootFilePath(file.path) ||
					file.path.endsWith("codex.md") ||
					file.path.startsWith("Codex/") ||
					file.path.startsWith(`${BACKSTAGE_ROOT}/`)
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

	syncFromPluginSelection(): void {
		const settings = this.plugin.getSettings();
		if (settings.selectedNovel) this.bookFolderName = settings.selectedNovel;
	}

	openOnNovelTab(): void {
		this.mode = "novel";
		this.syncFromPluginSelection();
		this.followActiveFile();
		this.render();
	}

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

		renderArchivePanel(el, {
			app: this.app,
			plugin: this.plugin,
			bookFolderName: this.bookFolderName,
			mode: this.mode,
			setMode: (mode) => {
				this.mode = mode;
			},
			refresh: () => this.render(),
		});
	}
}

/** Opens Archive inside Story Context (right-rail Story Context tab). */
export async function activateArchiveView(
	plugin: StoryForgePlugin,
	tab: ArchiveMode = "codex",
): Promise<void> {
	await activateRightRailView(plugin, RECOMMEND_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof RecommendationView) {
			view.openArchive(tab);
		}
	});
}
