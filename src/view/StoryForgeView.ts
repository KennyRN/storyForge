import { ItemView, Notice, setIcon, setTooltip, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bookFolderNameFromChapterPath, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath } from "../core/paths";
import { getSeriesBooks } from "../series";
import {
	renderTopPanel,
	type PlacedViewMode,
	type PlannedLengthField,
	type UnplacedViewMode,
} from "./TopPanel";
import { renderBottomPanel } from "./BottomPanel";
import { renderStatsPanel, type StatsMode } from "./StatsPanel";
import { createCodexFolder, createCodexNote, readCodexFrontmatter } from "../codex";
import { debounce } from "../core/debounce";
import { ICON_BOOK_DUOTONE, ICON_BOOK_OPEN, ICON_BOOK_OPEN_FILLED, ICON_CODEX, ICON_SERIES } from "../icons";
import { countWords } from "../core/wordCount";
import { getBookWordStats } from "../history";
import { isDragInProgress } from "./dragLock";
import { makeAccessibleActivatable } from "./a11y";
import { layoutConfig, SF_LAYOUTS, SF_LAYOUT_LABELS, type SfLayout } from "../layout";
import { createContinuingChapter } from "../chapterCreation";
import { getBookChapters } from "../book";
import { resolveEntryChapter } from "../spineWindow";

export const STORYFORGE_VIEW_TYPE = "storyforge-view";

/** Leading icon for each layout tab (render()'s .sf-layout-tabs row) — the Codex's own globe icon
 * for the Codex tab, the storyForge view's own "Series" icon for the Series tab (it's the same
 * list this panel's own tab icon represents), Story Context's own Novel-tab icon for this panel's
 * Novel tab (they show the same content — see NovelOverviewView.ts), and Story Context's own
 * Chapter-tab icon for the Chapter tab (the layout with the codex embedded — a novel opened all
 * the way up, and the pane whose selection this panel keeps Story Context's own Chapter tab in
 * sync with — see focusChapterPaneForBook() below). */
const SF_LAYOUT_TAB_ICONS: Record<SfLayout, string> = {
	codex: ICON_CODEX,
	seriesBrowse: ICON_SERIES,
	novelBrowse: ICON_BOOK_DUOTONE,
	hybrid: ICON_BOOK_OPEN_FILLED,
};

export class StoryForgeView extends ItemView {
	private currentBookFolderName: string | null = null;
	private activeChapterFilename: string | null = null;
	private layout: SfLayout = "novelBrowse";
	private unplacedMode: UnplacedViewMode = "unplaced";
	/** "novel" mode's placed-chapters header — collapse toggle, session-only like unplacedMode. */
	private placedMode: PlacedViewMode = "placed";
	/** Which planned-length row's inline "push down" editor is open, if either — session-only,
	 * like placedMode/unplacedMode. */
	private plannedLengthEditorField: PlannedLengthField | null = null;
	/** "navigator" mode's chapter selector: whether its 5-row scrollable chapter list is expanded
	 * below the current-chapter row. Session-only, like unplacedMode — reset whenever the selected
	 * book changes so a stale expanded list doesn't survive a book switch. */
	private chapterSelectorExpanded = false;
	private collapsedCodexFolders = new Set<string>();
	private activeCodexFolderId: string | null = null;
	/** Vault `#tag` currently filtering the Codex tree — session-only, single-select. */
	private statsMode: StatsMode = "daily";
	private statsCounts: Record<StatsMode, number> = { daily: 0, weekly: 0, chapter: 0, story: 0 };
	/** Tears down the live position indicator's event-listener — must run before the next render
	 * discards its DOM (see render()). */
	/**
	 * Session-only left-rail face: storytelling mode (navigator + Codex + stats) vs storyforge
	 * (layout tabs). Initialized from `autoFocus` on open; header click / commands flip it.
	 */
	private storytellingMode = true;

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
		return this.storytellingMode ? "storytelling mode" : "storyforge";
	}

	getIcon(): string {
		return this.storytellingMode ? ICON_BOOK_OPEN : ICON_SERIES;
	}

	isStorytellingMode(): boolean {
		return this.storytellingMode;
	}

	/**
	 * Switch this leaf's face. Always pairs Focus Mode on Story Context with the new face, even
	 * when already showing it (commands / auto-focus landing). `restoreCenter` is for entering
	 * storytelling mode from a click/command; vault-open landing restores the center itself.
	 */
	setStorytellingMode(on: boolean, options?: { restoreCenter?: boolean }): void {
		const changed = this.storytellingMode !== on;
		this.storytellingMode = on;
		if (changed) this.render();
		this.syncTabHeader();
		this.plugin.setStoryContextFocusMode(on);
		if (on && options?.restoreCenter !== false) void this.plugin.restoreStorytellingCenterEditor(false);
		// Leaving storytelling mode (header toggle / command) must land the main pane on whatever
		// this.layout's own tab shows, same as reopening straight onto that tab does (onOpen) —
		// without this the center pane keeps showing the chapter text storytelling mode left it on
		// instead of switching to e.g. the Novel overview the sidebar now shows.
		if (changed && !on) this.openCenterForLayout();
	}

	/** Opens the main pane page matching `this.layout` (Series/Novel overview, or focuses the
	 * Chapter pane) — shared by onOpen() (reopening straight onto a persisted tab) and
	 * setStorytellingMode() (leaving storytelling mode back onto the last tab). */
	private openCenterForLayout(): void {
		if (!this.containerEl.isShown()) return;
		if (this.layout === "seriesBrowse") {
			void this.openSeriesOverview();
		} else if (this.layout === "novelBrowse") {
			void this.openNovelOverview();
		} else if (this.layout === "hybrid" && this.currentBookFolderName) {
			this.focusChapterPaneForBook(this.currentBookFolderName);
		}
	}

	private toggleStorytellingMode(): void {
		this.setStorytellingMode(!this.storytellingMode);
	}

	private tabHeaderEl(): HTMLElement | null {
		return (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl ?? null;
	}

	private decorateTabHeader(headerEl: HTMLElement): void {
		headerEl.addClass("sf-left-mode-tab");
	}

	/** Icon-only tab header; click toggles faces only when this tab is already the active one
	 * (coming from Tools must not flip the face). pointerdown so we see `is-active` before
	 * Obsidian activates the leaf. See StoryContextView.ts's Focus header toggle. */
	private registerTabHeaderModeToggle(): void {
		const headerEl = this.tabHeaderEl();
		if (!headerEl) return;
		this.decorateTabHeader(headerEl);
		this.registerDomEvent(headerEl, "pointerdown", (evt) => {
			if ((evt.target as HTMLElement).closest(".workspace-tab-header-inner-close-button")) return;
			if (!headerEl.classList.contains("is-active")) return;
			this.toggleStorytellingMode();
		});
	}

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

	private readonly debouncedRender = debounce(() => {
		if (!isDragInProgress()) this.render();
	}, 400);
	private closed = false;

	async onOpen(): Promise<void> {
		const settings = this.plugin.getSettings();
		this.storytellingMode = settings.autoFocus;
		this.currentBookFolderName = settings.selectedNovel;
		this.activeChapterFilename = settings.selectedObject;
		this.layout = SF_LAYOUTS.includes(settings.layout) ? settings.layout : "novelBrowse";
		this.collapsedCodexFolders = new Set(settings.collapsedCodexFolderIds);
		this.registerTabHeaderModeToggle();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(this.app.vault.on("rename", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.vault.on("create", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.vault.on("modify", (file) => { if (!isBackstageBookkeepingPath(file.path)) this.debouncedRender(); }));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.debouncedRender()));
		try {
			this.followActiveFile();
			this.syncTabHeader();
			// Reopening straight onto the Series/Novel/Chapter tab (persisted layout) must land the main
			// editor pane on the matching page immediately, same as clicking that tab live does
			// (selectLayout() above) — without this, the sidebar shows e.g. the Series tab as active but
			// the main pane keeps showing whatever was last open there until the tab is clicked again.
			// Gated on this tab actually being the one on screen, though: main.ts hydrates
			// every storyforge leaf on each reload/hot-reload (to fix stale deferred-view
			// chrome), including ones left sitting inactive in the background — without this check, a
			// backgrounded Novel/Series tab would hijack the main pane out from under whatever tab
			// (e.g. Tools) the user actually left active. Storytelling mode restores the chapter
			// editor from main.ts instead.
			if (this.storytellingMode) return;
			this.openCenterForLayout();
		} catch (err) {
			console.error("storyForge: storyforge panel failed to open", err);
		}
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedRender.cancel();
		
	}

	private followActiveFile(): void {
		// Focusing this sidebar is not a file navigation. In storytelling mode, getActiveFile()
		// often still reports the last markdown file (or a restored non-chapter), and treating that
		// as a change would wipe the persisted chapter before restoreStorytellingCenterEditor() can
		// open it.
		if (this.storytellingMode && this.app.workspace.getActiveViewOfType(StoryForgeView) === this) {
			this.render();
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (file) {
			const bookName = bookFolderNameFromChapterPath(file.path);
			if (bookName) {
				this.currentBookFolderName = bookName;
				this.activeChapterFilename = file.name;
				void this.persistSelection();
			} else if (this.storytellingMode && this.plugin.codexFocusPagePath() === file.path) {
				// Lore is open in Focus Mode's right-rail page; keep the current chapter selected.
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
		// The Series/Novel overview pages (if open) read selectedNovel straight from settings —
		// nudge them to re-render so picking a different book here is reflected there too.
	}

	/** Which top pane the declared layout selects — "none" for the Codex tab, which has no top pane
	 * at all, regardless of hideSeriesPane. Otherwise clamped to "novel" while the series pane is
	 * hidden entirely, without discarding the user's chosen layout - so re-enabling the pane later
	 * in Settings restores it. */
	private effectiveTopPane(): "series" | "novel" | "none" {
		const topPane = layoutConfig(this.layout).topPane;
		if (topPane === "none") return "none";
		if (this.plugin.getSettings().hideSeriesPane) return "novel";
		return topPane;
	}

	render(): void {
		if (this.closed) return;
		if (isDragInProgress()) return;
		// Tear down the previous render's live position indicator (if any) before its DOM goes away
		// — its event listener would otherwise keep firing against a detached element.
		const container = this.contentEl;
		container.empty();
		container.toggleClass("storyforge-storytelling-view", this.storytellingMode);
		container.toggleClass("storyforge-view", !this.storytellingMode);
		if (this.storytellingMode) {
			this.renderStorytellingContent(container);
			return;
		}

		const config = layoutConfig(this.layout);
		// The Codex tab is the codex pane alone — no top pane, no stats — so it needs a different
		// row split from the tabs/library/codex/stats four-row grid the other layouts share (see
		// .sf-layout-codex-only in styles.css).
		container.toggleClass("sf-layout-codex-only", config.topPane === "none");
		// Series / Novel tabs have no Codex or stats row — same unused-track problem as Codex-only
		// (the base grid's 2fr/auto tracks would reserve a gap under the library, with the top
		// pane's border-bottom reading as a stray line part-way down). See .sf-layout-library-only.
		container.toggleClass("sf-layout-library-only", config.topPane !== "none" && !config.showCodex);

		// Replaces the old "choose layout" dropdown icon — one tab per layout, sitting above
		// everything else in the panel (same idea as Story Context's Novel/Chapter/Dossier row).
		// Always created (left empty while the series pane is hidden, same as that dropdown used
		// to be — there's nowhere else in this panel layout selection lives) so the grid's row
		// count stays constant; an empty "auto" row just collapses to nothing.
		const tabsEl = container.createDiv({ cls: "sf-layout-tabs" });
		if (!this.plugin.getSettings().hideSeriesPane) {
			for (const layout of SF_LAYOUTS) {
				const tab = tabsEl.createSpan({
					cls: `sf-layout-tab${layout === this.layout ? " is-active" : ""}`,
					attr: {
						role: "tab",
						tabindex: "0",
						"aria-selected": String(layout === this.layout),
						"aria-label": SF_LAYOUT_LABELS[layout],
						title: SF_LAYOUT_LABELS[layout],
					},
				});
				setIcon(tab.createSpan({ cls: "sf-layout-tab-icon" }), SF_LAYOUT_TAB_ICONS[layout]);
				const selectLayout = () => {
					this.layout = layout;
					void this.plugin.updateSetting("layout", layout);
					if (layout === "seriesBrowse") {
						void this.openSeriesOverview();
					} else if (layout === "novelBrowse") {
						void this.openNovelOverview();
					} else {
						// Switching onto the Chapter tab itself: jump Story Context to whichever chapter
						// is already selected here, or its book's first chapter if none is (see
						// focusChapterPaneForBook()'s own doc comment).
						if (layout === "hybrid" && this.currentBookFolderName) this.focusChapterPaneForBook(this.currentBookFolderName);
					}
					this.render();
				};
				// pointerdown, not click: this sidebar pane isn't always the focused/active one (the
				// editor usually is), and a plain "click" listener's first firing there was getting
				// eaten by Obsidian's own click-to-focus-the-pane handling — the tab needed a second
				// click before it visibly did anything (same issue navigatorControls.ts's transport
				// buttons had). pointerdown fires regardless, so one click is enough.
				tab.addEventListener("pointerdown", selectLayout);
				makeAccessibleActivatable(tab, selectLayout);
			}
		}

		// Synchronous read of the read view's own state (a direct method call, not an event) — always
		// fresh, so a book switch or the read view closing is reflected the moment this re-renders.

		// The Codex tab has no top pane at all — skip creating .sf-top-panel entirely rather than
		// rendering it empty, so the codex-only grid (.sf-layout-codex-only) has just tabs + codex.
		const topPane = this.effectiveTopPane();
		if (topPane !== "none") {
			const topEl = container.createDiv({ cls: "sf-top-panel" });
			if (config.showCodex) topEl.addClass("sf-top-panel--above-codex");

			renderTopPanel(this.app, topEl, {
				plugin: this.plugin,
				mode: topPane,
				// Only the actual "Novel" tab gets the newer chapter-tree chrome — the "Chapter"
				// tab (hybrid) also resolves topPane to "novel" (layoutConfig) but keeps the
				// original look.
				isNovelPane: this.layout === "novelBrowse",
				hideSeriesPane: this.plugin.getSettings().hideSeriesPane,
				seriesNumberingStyle: this.plugin.getSettings().seriesNumberingStyle,
				chapterNumberingStyle: this.plugin.getSettings().chapterNumberingStyle,
				showUnplacedSection: config.showUnplaced,
				currentBookFolderName: this.currentBookFolderName,
				activeChapterFilename: this.activeChapterFilename,
				highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
				unplacedMode: this.unplacedMode,
				onToggleUnplacedMode: () => {
					this.unplacedMode = this.unplacedMode === "unplaced" ? "unplacedHidden" : "unplaced";
					this.render();
				},
				placedMode: this.placedMode,
				onTogglePlacedMode: () => {
					this.placedMode = this.placedMode === "placed" ? "placedHidden" : "placed";
					this.render();
				},
				plannedLengthEditorField: this.plannedLengthEditorField,
				onSetPlannedLengthEditor: (field) => {
					this.plannedLengthEditorField = field;
					this.render();
				},
				chapterSelectorExpanded: this.chapterSelectorExpanded,
				onToggleChapterSelectorExpanded: () => {
					this.chapterSelectorExpanded = !this.chapterSelectorExpanded;
					this.render();
				},
				onSelectBook: (name) => {
					this.currentBookFolderName = name;
					this.activeChapterFilename = null;
					this.chapterSelectorExpanded = false;
					void this.persistSelection();
					this.plugin.focusStoryContextOnNovel(name);
					this.render();
				},
				onOpenChapter: (bookName, filename) => {
					if (this.layout === "novelBrowse") {
						// 1a/1b: on the Novel tab, clicking a chapter selects it (highlights it here,
						// jumps Story Context to its Chapter tab) rather than opening it — the central
						// region stays on the Novel overview page. Chapter/Codex still open for real,
						// below.
						this.selectChapter(bookName, filename);
						this.plugin.focusStoryContextOnChapter(bookName, filename);
					} else {
						// The Chapter tab: opens the chapter for real (unlike the Novel tab above) and
						// still jumps Story Context to its own Chapter tab for it, so the right sidebar
						// always mirrors whichever chapter is selected here.
						void this.openChapter(bookName, filename);
						this.plugin.focusStoryContextOnChapter(bookName, filename);
					}
				},
				onCreateContinuingChapter: (bookFolderName) => void this.handleCreateContinuingChapter(bookFolderName),
				onArchiveChapter: async () => {
					if (this.closed) return;
					await this.refreshStats();
				},
			});
		}

		if (config.showCodex) {
			const activeFile = this.app.workspace.getActiveFile();
			const activeFilePath = activeFile?.path ?? null;

			const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
			renderBottomPanel(this.app, bottomEl, {
				mode: "codex",
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
				onOpenFile: (path) => void this.openCodexFile(path),
			});
		}

		if (config.showStats) {
			const statsEl = container.createDiv({ cls: "sf-stats-panel" });
			renderStatsPanel(statsEl, {
				mode: this.statsMode,
				counts: this.statsCounts,
			});
		}
		void this.refreshStats();
	}

	/** Compact navigator + Codex + stats (the old storyTelling leaf). */
	private renderStorytellingContent(container: HTMLElement): void {
		container.toggleClass("sf-layout-codex-only", false);
		container.toggleClass("sf-layout-library-only", false);

		const mode = this.plugin.getSettings().hideSeriesPane ? "novel" : "navigator";

		const topEl = container.createDiv({ cls: "sf-top-panel sf-top-panel--above-codex" });
		renderTopPanel(this.app, topEl, {
			plugin: this.plugin,
			mode,
			// The storytelling face's compact navigator+Codex layout is never the "Novel" tab.
			isNovelPane: false,
			hideSeriesPane: this.plugin.getSettings().hideSeriesPane,
			seriesNumberingStyle: this.plugin.getSettings().seriesNumberingStyle,
			chapterNumberingStyle: this.plugin.getSettings().chapterNumberingStyle,
			showUnplacedSection: false,
			currentBookFolderName: this.currentBookFolderName,
			activeChapterFilename: this.activeChapterFilename,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			unplacedMode: "unplaced",
			onToggleUnplacedMode: () => {
				/* no unplaced section here */
			},
			placedMode: this.placedMode,
			onTogglePlacedMode: () => {
				this.placedMode = this.placedMode === "placed" ? "placedHidden" : "placed";
				this.render();
			},
			plannedLengthEditorField: this.plannedLengthEditorField,
			onSetPlannedLengthEditor: (field) => {
				this.plannedLengthEditorField = field;
				this.render();
			},
			chapterSelectorExpanded: this.chapterSelectorExpanded,
			onToggleChapterSelectorExpanded: () => {
				this.chapterSelectorExpanded = !this.chapterSelectorExpanded;
				this.render();
			},
			onSelectBook: (name) => {
				this.currentBookFolderName = name;
				this.activeChapterFilename = null;
				this.chapterSelectorExpanded = false;
				void this.persistSelection();
				this.render();
			},
			onOpenChapter: (bookName, filename) => void this.openChapter(bookName, filename),
			onCreateContinuingChapter: (bookFolderName) => void this.handleCreateContinuingChapter(bookFolderName),
			onArchiveChapter: async () => {
				if (this.closed) return;
				await this.refreshStats();
			},
		});

		const activeFile = this.app.workspace.getActiveFile();
		const focusLorePath = this.plugin.codexFocusPagePath();
		const activeFilePath = focusLorePath ?? activeFile?.path ?? null;

		const bottomEl = container.createDiv({ cls: "sf-bottom-panel" });
		renderBottomPanel(this.app, bottomEl, {
			mode: "codex",
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
			onOpenFile: (path) => void this.openCodexFile(path),
		});

		const statsEl = container.createDiv({ cls: "sf-stats-panel" });
		renderStatsPanel(statsEl, {
			mode: this.statsMode,
			counts: this.statsCounts,
		});

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
			await this.openCodexFile(file.path);
		} catch (err) {
			new Notice(`storyForge: could not create file — ${(err as Error).message}`);
		}
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.openInMainContentLeaf(file);
		}
	}

	/** Selects (without opening) a chapter — the Novel tab's own chapter click above, and the
	 * Novel overview page's own chapter-title click (NovelOverviewView.ts, via
	 * plugin.focusStoryLibraryOnChapter), both funnel through here so this panel's own highlight
	 * and persisted selection agree with whichever chapter was clicked either way. Public: called
	 * cross-instance from main.ts. */
	selectChapter(bookFolderName: string, filename: string): void {
		this.currentBookFolderName = bookFolderName;
		this.activeChapterFilename = filename;
		void this.persistSelection();
		this.render();
	}

	/** BottomPanel.ts's onOpenFile — a Codex note click, same "force it active" treatment as
	 * openChapter() needs, and for the same reason (see openInMainContentLeaf's doc comment):
	 * without it, clicking off a chapter and onto a Codex entry left the chapter's row still
	 * highlighted, since followActiveFile() never got the active-leaf-change to run on. */
	private async openCodexFile(path: string): Promise<void> {
		if (this.storytellingMode && this.plugin.openCodexLoreInFocusPage(path)) {
			this.render();
			return;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.openInMainContentLeaf(file);
		}
	}

	/** `leaf.openFile()` alone doesn't reliably flip the workspace's own idea of "the active leaf"
	 * when the click originated in a sidebar view — active-leaf-change then never fires, so
	 * followActiveFile() never runs and the highlighted row goes stale even though the editor
	 * itself did switch chapters. Same fix exitContinuousRead() already needed for the same reason. */
	private async openInMainContentLeaf(file: TFile): Promise<void> {
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.openFile(file, { active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	/** The Series tab's launcher: swaps the special series-overview page into the main editor pane
	 * in place of whatever was open there, same mechanism as openContinuousRead() below. Fires on
	 * every click of the tab (not just switching layout into it), so retriggering it after opening
	 * a chapter elsewhere brings the page straight back. Also nudges Story Context (right sidebar)
	 * onto its own Novel tab for whichever book is currently being worked on — see
	 * ensureBookSelectedForSeriesOverview() for what "currently being worked on" falls back to when
	 * nothing is selected yet. */
	private async openSeriesOverview(): Promise<void> {
		await this.ensureBookSelectedForSeriesOverview();
	}

	/** If no book is currently selected when the Series tab opens, falls back to the first placed
	 * novel or — absent one — the first unplaced novel, and makes it the *real* selection (not just
	 * a transient right-sidebar peek): persisted the same way clicking a book row would be, so the
	 * left sidebar's own highlight and the central Series page's placed/unplaced filtering agree
	 * with the right sidebar too. With no books at all there's nothing to fall back to, and the
	 * right sidebar is simply left on its own "select a novel" empty state. */
	private async ensureBookSelectedForSeriesOverview(): Promise<void> {
		if (!this.currentBookFolderName) {
			const { ordered, unplaced } = getSeriesBooks(this.app);
			const fallback = ordered[0]?.name ?? unplaced[0]?.name ?? null;
			if (fallback) {
				this.currentBookFolderName = fallback;
				this.activeChapterFilename = null;
				await this.persistSelection();
			}
		}
		if (this.currentBookFolderName) {
			this.plugin.focusStoryContextOnNovel(this.currentBookFolderName);
		}
	}

	/** The Novel tab's own launcher: swaps the Novel overview page (NovelOverviewView.ts — the same
	 * cover/synopsis/plot content as Story Context's Novel tab) into the main editor pane, same
	 * mechanism as openSeriesOverview() above. Also nudges Story Context (right sidebar) to its own
	 * Chapter tab on the same book, landing on whichever chapter is already selected here or, absent
	 * one (or it's since been unplaced), the first chapter in the book's ordered spine
	 * (resolveEntryChapter — same fallback openContinuousRead() below uses to pick a landing
	 * chapter). When there wasn't already a selection, that fallback becomes the *real* selection
	 * here too (via selectChapter, same as clicking the row would) — not just a right-sidebar peek —
	 * so it persists and this panel's own highlight agrees with it as well. */
	private async openNovelOverview(): Promise<void> {
		if (!this.currentBookFolderName) return;
		this.focusChapterPaneForBook(this.currentBookFolderName);
	}

	/** Shared by openNovelOverview() above and the Chapter tab (selectLayout()'s own click handler
	 * and onOpen(), for landing straight on it): nudges Story Context (right sidebar) to its own
	 * Chapter tab on the given book, landing on whichever chapter is already selected here or,
	 * absent one (or it's since been unplaced), the first chapter in the book's ordered spine
	 * (resolveEntryChapter — same fallback openContinuousRead() below uses to pick a landing
	 * chapter). When there wasn't already a selection, that fallback becomes the *real* selection
	 * here too (via selectChapter, same as clicking a chapter row would) — not just a right-sidebar
	 * peek — so it persists and this panel's own highlight agrees with it as well. */
	private focusChapterPaneForBook(bookFolderName: string): void {
		const { ordered } = getBookChapters(this.app, bookFolderName);
		const chapterFilename = resolveEntryChapter(ordered.map((file) => file.name), this.activeChapterFilename);
		if (!chapterFilename) return;
		if (chapterFilename !== this.activeChapterFilename) this.selectChapter(bookFolderName, chapterFilename);
		this.plugin.focusStoryContextOnChapter(bookFolderName, chapterFilename);
	}

}