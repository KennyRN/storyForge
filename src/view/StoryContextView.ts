import {
	ItemView,
	MarkdownView,
	Notice,
	TFile,
	WorkspaceLeaf,
	setIcon,
	setTooltip,
} from "obsidian";
import type StoryForgePlugin from "../main";
import { ICON_BOOK_DUOTONE, ICON_CODEX, ICON_FOCUS_OFF, ICON_FOCUS_ON } from "../icons";
import { bookFolderNameFromChapterPath, CODEX_ROOT, isBackstageBookkeepingPath, isLibraryChapterPath, NOTES_ROOT, seriesFilePath } from "../paths";
import { createNotebookPage } from "./notebookPage";
import { makeAccessibleActivatable } from "./a11y";
import { activateRightRailView } from "./activateRightRailView";
import { renderArchiveIndex, archiveFilePathForKey, type ArchiveMode, type ArchivePanelHost } from "./archivePanel";
import { mountContextEditor, type ContextEditorHandle } from "./contextEditor";
import { storytellingCodexClickAction, storytellingCodexOpenTarget } from "./codexOpenTarget";
import { disposeInkSliders, inkSlider } from "./inkSlider";

/** Workspace view-type id. The string is historical (`storyContext-view`) so existing layouts restore. */
export const STORY_CONTEXT_VIEW_TYPE = "storyforge-storyContext-view";

/**
 * The right-hand panel. Two states: Focus Mode (storytelling face) shows the lore slot — a Codex
 * note beside the chapter — and the storyForge face shows the Archive list.
 */
export class StoryContextView extends ItemView {
	private bookFolderName: string | null = null;
	private chapterFilename: string | null = null;
	private archiveMode: ArchiveMode = "codex";
	private selectedArchiveKey: string | null = null;
	private notebookPageEl: HTMLElement | null = null;
	private ideaEditorHandle: ContextEditorHandle | null = null;
	private ideaEditorPath: string | null = null;
	/** Focus Mode: a Codex lore note is mounted in `.sf-codex-page` (storyTelling click). */
	private showingCodexPage = false;
	private selectedCodexPath: string | null = null;
	private codexPageEl: HTMLElement | null = null;
	private codexEditorHandle: ContextEditorHandle | null = null;
	private codexEditorPath: string | null = null;
	private closed = false;
	/** Focus Mode: blanks this panel down to just its own tab-header icon (toggled by clicking
	 * that icon, see registerTabHeaderFocusToggle()). Session-only - the plugin has no settings
	 * field for this, so nothing is persisted across restarts. Single instance only: main.ts's
	 * ensureRightRailPanelsUnlocked()/dedupeLeavesOfType() already keep StoryContextView to one
	 * leaf, so per-instance state here is effectively global. */
	private focusMode = false;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORY_CONTEXT_VIEW_TYPE;
	}

	getDisplayText(): string {
		// Doubles as this tab's accessible label/tooltip (Obsidian's own tab-header mechanism).
		return this.focusMode ? "storytelling mode" : "story context";
	}

	getIcon(): string {
		// The tab-header icon IS the Focus toggle (see registerTabHeaderFocusToggle()).
		return this.focusMode ? ICON_FOCUS_ON : ICON_FOCUS_OFF;
	}

	async onOpen(): Promise<void> {
		this.contentEl.addClass("sf-story-context-view");
		this.contentEl.addClass("sf-context-view");
		this.registerTabHeaderFocusToggle();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				// Ignore sidecars - writing the cache must not retrigger a render.
				if (isBackstageBookkeepingPath(file.path)) return;
				const codexPrefix = `${CODEX_ROOT}/`;
				if (
					isLibraryChapterPath(file.path) ||
					file.path.startsWith(codexPrefix) ||
					file.path.startsWith(`${NOTES_ROOT}/`) ||
					file.path.endsWith("codex.md") ||
					file.path.endsWith("notes.md") ||
					file.path.endsWith("novel.md") ||
					file.path === seriesFilePath()
				) {
					if (!this.focusMode) this.render();
				}
			}),
		);
		this.syncFromPluginSelection();
		this.followActiveFile();
		this.render();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.disposeIdeaEditor();
		this.disposeCodexEditor();
		disposeInkSliders(["archive-source", "archive-codex-tags"]);
	}

	/** Obsidian has no public event for "the tab-header icon was clicked" - only
	 * `active-leaf-change`, which fires for the whole tab (including switching to it from
	 * elsewhere) and carries no click-target information. `leaf.tabHeaderEl` isn't public API
	 * either, but it's the one DOM node Obsidian gives every leaf for its own header row, and
	 * changing it has been stable across recent Obsidian releases; if a future release removes it
	 * the toggle just becomes unreachable from the header (checked defensively below) rather than
	 * throwing. Registered via registerDomEvent so it's torn down automatically on view unload.
	 * Skips the header's own close ("×") button so closing the tab doesn't also flip Focus on the
	 * way out, and doesn't call preventDefault/stopPropagation so Obsidian's own tab-activation
	 * click handling still runs underneath it. */
	private registerTabHeaderFocusToggle(): void {
		const headerEl = this.tabHeaderEl();
		if (!headerEl) return;
		this.decorateTabHeader(headerEl);
		this.registerDomEvent(headerEl, "click", (evt) => {
			if ((evt.target as HTMLElement).closest(".workspace-tab-header-inner-close-button")) return;
			this.toggleFocusMode();
		});
	}

	private tabHeaderEl(): HTMLElement | null {
		return (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl ?? null;
	}

	/** Marks the live tab node so styles.css can pack it to the sidebar's outer edge without
	 * depending on Obsidian putting `data-type` on `.workspace-tab-header` (that attribute lives
	 * on the leaf content; themes also center the header inner, which ate margin-left: auto). */
	private decorateTabHeader(headerEl: HTMLElement): void {
		headerEl.addClass("sf-context-focus-tab");
		headerEl.closest(".workspace-tab-header-container")?.addClass("sf-context-focus-header");
	}
	private focusModeHasOpenPane(): boolean {
		return this.showingCodexPage;
	}

	/** Closes the Focus Mode lore page and leaves the blank Focus chrome. */
	private dismissFocusModePanes(): void {
		this.clearCodexPage();
	}

	private toggleFocusMode(): void {
		if (this.focusMode && this.focusModeHasOpenPane()) {
			this.dismissFocusModePanes();
			this.render(true);
			this.syncTabHeader();
			this.plugin.refreshStorytellingView();
			return;
		}
		this.setFocusMode(!this.focusMode);
	}

	/**
	 * Driven by the left-rail face (storytelling mode → on, storyforge → off). No-op when already
	 * in that state. Does not switch the left panel (right header stays independent).
	 */
	setFocusMode(on: boolean): void {
		if (this.focusMode === on) return;
		this.focusMode = on;
		// The Codex lore page is Focus Mode only — leaving it would leave a grafted editor with
		// no host, and storytelling mode's highlight would keep pointing at a page that isn't showing.
		if (!this.focusMode) this.clearCodexPage();
		this.render(true);
		this.syncTabHeader();
		this.plugin.refreshStorytellingView();
	}

	/** Repaints this leaf's own tab icon + tooltip from the current getIcon()/getDisplayText() in
	 * place, without recreating the leaf/view - no public API does that for an already-open
	 * ItemView. Reaches into the same undocumented header node registerTabHeaderFocusToggle()
	 * uses, isolated here for the same reason. */
	private syncTabHeader(): void {
		const headerEl = this.tabHeaderEl();
		if (!headerEl) return;
		this.decorateTabHeader(headerEl);
		const iconEl = headerEl.querySelector<HTMLElement>(".workspace-tab-header-inner-icon");
		if (iconEl) {
			iconEl.empty();
			setIcon(iconEl, this.getIcon());
		}
		setTooltip(headerEl, this.getDisplayText());
	}

	/**
	 * storytelling mode's Codex lore click (StoryForgeView.ts): show the note in Focus Mode's
	 * `.sf-codex-page` instead of replacing the chapter in the center pane. Returns false when
	 * this panel isn't in Focus Mode, so the caller can fall through to a normal open. Re-clicking
	 * the lore already shown there (its highlighted row) closes the page instead.
	 */
	openCodexLore(path: string): boolean {
		if (storytellingCodexOpenTarget(this.focusMode) !== "codex-page") return false;
		if (storytellingCodexClickAction(this.codexPagePath(), path) === "close") {
			this.clearCodexPage();
			this.render(true);
			this.syncTabHeader();
			return true;
		}
		this.showingCodexPage = true;
		this.selectedCodexPath = path;
		this.disposeIdeaEditor();
		this.render(true);
		return true;
	}

	/** Path currently shown in `.sf-codex-page`, or null if that page isn't mounted. Used by
	 * storyTelling to highlight the matching lore row without making the note the active file. */
	codexPagePath(): string | null {
		return this.focusMode && this.showingCodexPage ? this.selectedCodexPath : null;
	}

	/** Called when opened from Codex — seed from storyForge selection. */
	syncFromPluginSelection(): void {
		const settings = this.plugin.getSettings();
		if (settings.selectedNovel) this.bookFolderName = settings.selectedNovel;
		if (settings.selectedObject) this.chapterFilename = settings.selectedObject;
	}

	/** Series panel (left sidebar) selected a novel. Takes the book folder name directly (rather
	 * than re-reading settings) to avoid a race with StoryForgeView's own async persistSelection(). */
	focusNovel(bookFolderName: string): void {
		this.clearCodexPage();
		this.bookFolderName = bookFolderName;
		this.render();
	}

	/** storyLibrary panel's Novel-layout entry (StoryForgeView.ts's openNovelOverview) — takes
	 * both book and chapter directly for the same race-avoidance reason focusNovel() does. */
	focusChapter(bookFolderName: string, filename: string): void {
		this.clearCodexPage();
		this.bookFolderName = bookFolderName;
		this.chapterFilename = filename;
		this.render();
	}

	/** Open the Archive list. */
	openArchive(tab: ArchiveMode = "codex"): void {
		this.archiveMode = tab;
		this.disposeIdeaEditor();
		this.clearCodexPage();
		this.syncFromPluginSelection();
		this.followActiveFileQuiet();
		this.render();
	}

	private followActiveFileQuiet(): void {
		const file = this.app.workspace.getActiveFile();
		if (!file) return;
		const book = bookFolderNameFromChapterPath(file.path);
		if (book) {
			this.bookFolderName = book;
			this.chapterFilename = file.name;
		}
	}

	private followActiveFile(): void {
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const book = bookFolderNameFromChapterPath(file.path);
			if (book) {
				this.bookFolderName = book;
				this.chapterFilename = file.name;
				if (!this.focusMode) this.render();
			}
		}
	}

	/**
	 * `force` is for the toggles that change what's embedded (toggleFocusMode, openCodexLore) only -
	 * every other caller (file/vault watchers, …) should leave it false. While a grafted editor is
	 * live an unforced call is a no-op: without this, an unrelated background event (a file saved
	 * elsewhere, a metadata-cache update, …) would tear down and re-mount that editor, discarding
	 * its internal state (cursor, scroll position, …) for no reason of its own.
	 */
	private render(force = false): void {
		if (this.closed) return;
		if (!force && (this.ideaEditorHandle || this.codexEditorHandle)) return;
		this.disposeIdeaEditor();
		this.disposeCodexEditor();
		const headerEl = this.tabHeaderEl();
		if (headerEl) this.decorateTabHeader(headerEl);
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-story-context-view");
		el.addClass("sf-context-view");
		// Focus Mode: only the lore slot (or nothing) - left sidebar and every other right-rail tab
		// are untouched, this only ever touches this view's own contentEl.
		if (this.focusMode) {
			if (this.showingCodexPage) this.renderCodexPage(el);
			return;
		}
		this.renderArchiveSplit(el);
	}

	private archiveHost(): ArchivePanelHost {
		return {
			app: this.app,
			plugin: this.plugin,
			bookFolderName: this.bookFolderName,
			mode: this.archiveMode,
			setMode: (mode) => {
				this.archiveMode = mode;
				this.selectedArchiveKey = null;
			},
			refresh: () => this.render(true),
			selectedKey: this.selectedArchiveKey,
			onSelect: (key) => {
				this.selectedArchiveKey = key;
				this.render(true);
			},
		};
	}

	private renderArchiveSplit(el: HTMLElement): void {
		const split = el.createDiv({ cls: "sf-idea-shelf sf-archive-shelf" });
		const rail = this.renderArchiveSourceRail(split);
		const page = createNotebookPage(split, "sf-archive-page");
		this.notebookPageEl = page;
		const index = split.createDiv({ cls: "sf-notebook-index" });
		renderArchiveIndex(index, this.archiveHost());
		inkSlider("archive-source").mount({
			container: rail,
			buttons: ".sf-notebook-source-btn",
			span: page,
			variant: "source",
			observe: [split, page],
		});
		void this.mountIdeaEditor();
	}

	private renderArchiveSourceRail(parent: HTMLElement): HTMLElement {
		const rail = parent.createDiv({ cls: "sf-codex-side-actions sf-notebook-source-rail" });
		this.addArchiveSourceIcon(rail, "codex", ICON_CODEX, "codex");
		this.addArchiveSourceIcon(rail, "novel", ICON_BOOK_DUOTONE, "novel");
		return rail;
	}

	private addArchiveSourceIcon(rail: HTMLElement, mode: ArchiveMode, icon: string, label: string): void {
		const btn = rail.createSpan({
			cls: `sf-notebook-source-btn${this.archiveMode === mode ? " is-active" : ""}`,
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(btn, icon);
		setTooltip(btn, label);
		const select = () => {
			if (this.archiveMode === mode) return;
			inkSlider("archive-source").capture();
			this.archiveMode = mode;
			this.selectedArchiveKey = null;
			this.render(true);
		};
		btn.addEventListener("click", select);
		makeAccessibleActivatable(btn, select);
	}

	private notebookPageFilePath(): string | null {
		return archiveFilePathForKey(this.archiveHost(), this.selectedArchiveKey);
	}

	private async mountIdeaEditor(): Promise<void> {
		const path = this.notebookPageFilePath();
		const host = this.notebookPageEl;
		this.disposeIdeaEditor();
		this.notebookPageEl = host;
		if (!path || !host) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const handle = await mountContextEditor(this.app, host, file);
		if (this.closed || this.notebookPageFilePath() !== path || this.notebookPageEl !== host) {
			handle?.destroy();
			return;
		}
		if (!handle) {
			new Notice("storyForge: could not open the note in the notebook — the chapter was left in the center pane.");
			return;
		}
		this.ideaEditorHandle = handle;
		this.ideaEditorPath = path;
		handle.view.editor.focus();
	}

	private disposeIdeaEditor(): void {
		const grafted = this.ideaEditorHandle;
		const restoreCenter = Boolean(grafted && this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf === grafted.leaf);
		grafted?.destroy();
		this.ideaEditorHandle = null;
		this.ideaEditorPath = null;
		this.notebookPageEl = null;
		if (restoreCenter) {
			const center = this.plugin.peekMainContentLeaf();
			if (center) this.app.workspace.setActiveLeaf(center, { focus: true });
		}
	}
	private clearCodexPage(): void {
		this.showingCodexPage = false;
		this.selectedCodexPath = null;
		this.disposeCodexEditor();
	}

	private renderCodexPage(el: HTMLElement): void {
		const host = el.createDiv({ cls: "sf-codex-page-host" });
		const page = host.createDiv({ cls: "sf-codex-page" });
		this.codexPageEl = page;
		void this.mountCodexEditor();
	}

	private async mountCodexEditor(): Promise<void> {
		const path = this.selectedCodexPath;
		const host = this.codexPageEl;
		this.disposeCodexEditor();
		this.codexPageEl = host;
		if (!path || !host) return;
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const handle = await mountContextEditor(this.app, host, file);
		if (this.closed || this.selectedCodexPath !== path || this.codexPageEl !== host) {
			handle?.destroy();
			return;
		}
		if (!handle) {
			new Notice("storyForge: could not open the lore entry in the codex page — the chapter was left in the center pane.");
			return;
		}
		this.codexEditorHandle = handle;
		this.codexEditorPath = path;
		handle.view.editor.focus();
	}

	private disposeCodexEditor(): void {
		const grafted = this.codexEditorHandle;
		const restoreCenter = Boolean(grafted && this.app.workspace.getActiveViewOfType(MarkdownView)?.leaf === grafted.leaf);
		grafted?.destroy();
		this.codexEditorHandle = null;
		this.codexEditorPath = null;
		this.codexPageEl = null;
		if (restoreCenter) {
			const center = this.plugin.peekMainContentLeaf();
			if (center) this.app.workspace.setActiveLeaf(center, { focus: true });
		}
	}

}

export async function activateStoryContextView(plugin: StoryForgePlugin): Promise<void> {
	await activateRightRailView(plugin, STORY_CONTEXT_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof StoryContextView) view.syncFromPluginSelection();
	});
}

/** Opens the Archive list inside the right-hand panel. */
export async function activateArchiveView(plugin: StoryForgePlugin, tab: ArchiveMode = "codex"): Promise<void> {
	await activateRightRailView(plugin, STORY_CONTEXT_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof StoryContextView) view.openArchive(tab);
	});
}
