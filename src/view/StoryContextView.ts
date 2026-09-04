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
import type { StoryForgeCompanionPanel } from "../hostApi";
import {
	getBookChapters,
	getChapterEntry,
	numberedChapterTitle,
	readBookFrontmatter,
	writeChapterLocation,
	writeChapterPov,
} from "../book";
import { CODEX_TYPES, codexTypeIcon, createCodexFolder, createCodexNote, getCodexEntriesByType, readCodexFrontmatter } from "../codex";
import { debounce } from "../debounce";
import { splitTitleSubtitle } from "../titleNumbering";
import { ICON_ADD_SQUARE, ICON_ARCHIVE_FILLED, ICON_BOOK_DUOTONE, ICON_BOOK_OPEN_FILLED, ICON_CLIPBOARD_LIST_DUOTONE, ICON_CODEX, ICON_DASHBOARD_CHART, ICON_FOCUS_OFF, ICON_FOCUS_ON, ICON_FORGE, ICON_LOCATION_TARGET_SQUARE, ICON_MAP_PIN_PLUS, ICON_MINUS_SQUARE, ICON_NOTEBOOK_ADD, ICON_NOTEBOOK_EYE, ICON_NOTEBOOK_FILLED, ICON_PERSON_FILL_ADD, ICON_PLUS_SQUARE } from "../icons";
import { bookFolderNameFromChapterPath, CODEX_ROOT, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath, NOTES_ROOT, seriesFilePath } from "../paths";
import { OBSIDIAN_SELECTORS } from "../obsidianInternals";
import { getBookId } from "../series";
import { groupHitsByChapter, lensLabel } from "../recommend/hitGrouping";
import {
	addIgnoredName,
	applyIgnoredNames,
	readAttributionStore,
} from "../recommend/decisions";
import { ensureNlp } from "../recommend/nlp";
import { resolveChapterNarrator } from "../recommend/narrator";
import { loadOrRecomputeChapterRecommend, recomputeChapterRecommend } from "../recommend/recompute";
import { scanEntityAcrossChapters } from "../recommend/engine";
import { loadHydratedCodexInventory } from "../recommend/inventory";
import { createCodexLore } from "../recommend/lore";
import type { CastMember, ChapterRecommendReport, DetailHit, UnknownNameHint } from "../recommend/types";
import { buildDetailsNoteBody } from "../recommend/detailsNote";
import { writeRecommendCache } from "../recommend/cache";
import { makeAccessibleActivatable } from "./a11y";
import { renderStampedEmptyCross } from "./stampedCross";
import { activateRightRailView } from "./activateRightRailView";
import { renderArchiveList, renderArchiveModeIcons, type ArchiveMode } from "./archivePanel";
import { mountContextEditor, type ContextEditorHandle } from "./contextEditor";
import { renderBottomPanel } from "./BottomPanel";
import { renderIdeaShelfPanel } from "./IdeaShelfPanel";
import { VaultTagModal } from "./VaultTagModal";
import { createIdeaNote, createNotesNote, createNotesFolder, nextIdeaNoteBasename, resolveCenterPaneTitle, resolveSelectedNotesPath } from "../notes";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { CodexLoreTypeModal } from "./CodexLoreTypeModal";
import { ChapterTitleModal } from "./ChapterTitleModal";
import { iconAction, renderMetaRefList, renderNovelPanel } from "./NovelPanel";
import { resolveMainThreadRowColor } from "./novelColor";
import { resolveTitleShadow } from "../titleShadow";
import { isRecommendTabActive, type RecommendTab } from "./recommendTabActive";
import { storytellingCodexOpenTarget } from "./codexOpenTarget";
import { displayedVaultTags } from "../vaultTags";
import { countWords, formatWordCount } from "../wordCount";

/** Workspace view-type id. The string is historical (`recommend-view`) so existing layouts restore. */
export const STORY_CONTEXT_VIEW_TYPE = "storyforge-recommend-view";

type RecommendMode = "novel" | "chapter";
type NotebookIndexKind = "notes" | "codex" | "dossier";

export class StoryContextView extends ItemView {
	private bookFolderName: string | null = null;
	private chapterFilename: string | null = null;
	private mode: RecommendMode = "chapter";
	/** When true, archive list is shown under Chapter/Notebook tabs. */
	private showingArchive = false;
	private archiveMode: ArchiveMode = "codex";
	/** When true, the Notebook split pane is the Story Context body (non-focus). */
	private showingIdeas = false;
	/** Focus Mode: Notebook member-icon row (add / browse) is expanded. */
	private ideaShelfExpanded = false;
	/** Focus Mode: the index+page split is mounted (browse). */
	private ideaShelfPanelOpen = false;
	/** Focus Mode: new-note poker-card composer is mounted (no index, no rename). */
	private ideaCardOpen = false;
	private selectedIdeaPath: string | null = null;
	private notebookPageEl: HTMLElement | null = null;
	private ideaEditorHandle: ContextEditorHandle | null = null;
	private ideaEditorPath: string | null = null;
	/** Focus Mode: a Codex lore note is mounted in `.sf-codex-page` (storyTelling click). */
	private showingCodexPage = false;
	private selectedCodexPath: string | null = null;
	private codexPageEl: HTMLElement | null = null;
	private codexEditorHandle: ContextEditorHandle | null = null;
	private codexEditorPath: string | null = null;
	private collapsedIdeaFolders = new Set<string>();
	private ideaTypeFilter = new Set<string>();
	private ideaTagFilter: string | null = null;
	/** Story Context Notebook split only (not Focus Mode): notes, Codex editor, or Dossier. */
	private notebookIndexKind: NotebookIndexKind = "notes";
	private collapsedCodexFolders = new Set<string>();
	private activeCodexFolderId: string | null = null;
	private notebookCodexTypeFilter = new Set<string>();
	private notebookCodexTagFilter: string | null = null;
	private report: ChapterRecommendReport | null = null;
	private synopsisDraft = "";
	private closed = false;
	private nlpReady = false;
	private loading = false;
	/** Focus Mode: blanks this panel down to just its own tab-header icon (toggled by clicking
	 * that icon, see registerTabHeaderFocusToggle()). Session-only, like mode/showingArchive above
	 * - the plugin has no settings field for this, so nothing is persisted across restarts. Single
	 * instance only: main.ts's ensureRightRailPanelsUnlocked()/dedupeLeavesOfType() already keep
	 * StoryContextView to one leaf, so per-instance state here is effectively global. */
	private focusMode = false;
	/** Forge family: whether the member-icon row is showing, which member (if any) has its panel
	 * embedded, and that panel's disposer. One shared piece of state rendered in two places - the
	 * "Forge family" tab in .sf-recommend-tabs (normal view) and the trigger in the blank Focus
	 * Mode panel (renderFocusModeContent()) - so an open companion window survives toggling Focus
	 * Mode, just relocated into whichever chrome is showing. */
	private forgeFamilyExpanded = false;
	private forgeFamilyActiveId: string | null = null;
	private forgeFamilyPanelDisposer: (() => void) | null = null;
	/** Word count of the chapter this panel is bound to — Chapter tab actions row. */
	private chapterWordCount = 0;

	/** Dossier page in the Notebook split (Codex-index selection). */
	private dossierEntity: CastMember | null = null;
	private dossierHits: DetailHit[] = [];
	private dossierBuilding = false;
	private castCache: CastMember[] = [];

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
		// Doubles as this tab's accessible label/tooltip (Obsidian's own tab-header mechanism) -
		// carries the Focus state so assistive tech gets it without any redundant DOM of our own.
		return this.focusMode ? "Context panel — Focus Mode: On" : "Context panel — Focus Mode: Off";
	}

	getIcon(): string {
		// The tab-header icon IS the Focus toggle (see registerTabHeaderFocusToggle()) - it no
		// longer identifies this as "the notebook/Story Context view" the way it used to, since
		// this is the only plugin-view tab in the right rail meant to carry that control.
		return this.focusMode ? ICON_FOCUS_ON : ICON_FOCUS_OFF;
	}

	private readonly debouncedReload = debounce(() => void this.reload(), 500);

	async onOpen(): Promise<void> {
		this.contentEl.addClass("sf-recommend-view");
		this.contentEl.addClass("sf-context-view");
		this.registerTabHeaderFocusToggle();
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.followActiveFile()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.followActiveFile()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				// Ignore recommend/wordcount sidecars — writing the cache must not retrigger reload.
				if (isBackstageBookkeepingPath(file.path)) return;
				const codexPrefix = `${CODEX_ROOT}/`;
				if (
					isLibraryChapterPath(file.path) ||
					file.path.startsWith(codexPrefix) ||
					file.path.startsWith(`${NOTES_ROOT}/`) ||
					file.path.endsWith("codex.md") ||
					file.path.endsWith("notes.md") ||
					file.path.endsWith("novel.md") ||
					// series.md's order/unplaced-order/title changes affect this panel's own numbered
					// title (numberedBookTitle) on the Novel tab — without this, dragging a book's
					// position elsewhere (or renaming the series) left this panel silently stale.
					file.path === seriesFilePath()
				) {
					if (this.showingArchive) this.render();
					else this.debouncedReload();
				}
				void this.refreshDisplayedWordCounts();
			}),
		);
		this.syncFromPluginSelection();
		this.followActiveFile();
		await this.reload();
		void this.refreshDisplayedWordCounts();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedReload.cancel();
		this.disposeForgeFamilyPanel();
		this.disposeIdeaEditor();
		this.disposeCodexEditor();
	}

	/** main.ts's registerCompanionPanel() nudge: a companion panel just registered/unregistered
	 * elsewhere, so the Forge-family tab's availability (and its row's contents) may be stale. */
	refreshForgeFamily(): void {
		this.render();
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
		return (
			this.ideaCardOpen ||
			this.ideaShelfPanelOpen ||
			this.showingCodexPage ||
			this.forgeFamilyActiveId != null
		);
	}

	/** Closes every Focus Mode body (notebook-page, new-note card, codex-page, Forge plugin)
	 * and leaves the blank Focus chrome. Notebook child icons stay visible. */
	private dismissFocusModePanes(): void {
		this.ideaCardOpen = false;
		this.ideaShelfPanelOpen = false;
		this.ideaShelfExpanded = false;
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
		this.disposeIdeaEditor();
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
		this.focusMode = !this.focusMode;
		// A live Forge-family companion window (forgeFamilyActiveId/forgeFamilyPanelDisposer)
		// isn't reset here - it's the same window shown in both layouts (renderFocusModeContent()
		// below re-mounts it into the blank panel's own chrome), just relocated, not dismissed.
		// The Codex lore page is Focus Mode only — leaving it would leave a grafted editor with
		// no host, and storyTelling's highlight would keep pointing at a page that isn't showing.
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
		const iconEl = headerEl.querySelector<HTMLElement>(OBSIDIAN_SELECTORS.tabHeaderInnerIcon);
		if (iconEl) {
			iconEl.empty();
			setIcon(iconEl, this.getIcon());
		}
		setTooltip(headerEl, this.getDisplayText());
	}

	/**
	 * storyTelling's Codex lore click (StorytellingView.ts): show the note in Focus Mode's
	 * `.sf-codex-page` instead of replacing the chapter in the center pane. Returns false when
	 * this panel isn't in Focus Mode, so the caller can fall through to a normal open.
	 */
	openCodexLore(path: string): boolean {
		if (storytellingCodexOpenTarget(this.focusMode) !== "codex-page") return false;
		if (this.showingCodexPage && this.selectedCodexPath === path && this.codexEditorHandle) return true;
		this.showingCodexPage = true;
		this.selectedCodexPath = path;
		this.ideaShelfExpanded = false;
		this.ideaShelfPanelOpen = false;
		this.ideaCardOpen = false;
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
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

	/** Series panel (left sidebar) selected a novel — jump this panel to its Novel tab and show it,
	 * mirroring selectMode("novel")'s own tab-switch reset. Takes the book folder name directly
	 * (rather than re-reading settings, as syncFromPluginSelection does) to avoid a race with
	 * StoryForgeView's own async persistSelection() write. */
	focusNovel(bookFolderName: string): void {
		this.showingArchive = false;
		this.showingIdeas = false;
		this.mode = "novel";
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
		this.disposeIdeaEditor();
		this.clearCodexPage();
		this.bookFolderName = bookFolderName;
		void this.reload();
	}

	/** storyLibrary panel's Novel-layout entry (StoryForgeView.ts's openNovelOverview) — jump this
	 * panel to its Chapter tab and show the given chapter, mirroring focusNovel()'s own tab-switch
	 * reset. Takes both book and chapter directly (rather than re-reading settings) for the same
	 * race-avoidance reason focusNovel() does. */
	focusChapter(bookFolderName: string, filename: string): void {
		this.showingArchive = false;
		this.showingIdeas = false;
		this.mode = "chapter";
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
		this.disposeIdeaEditor();
		this.clearCodexPage();
		this.bookFolderName = bookFolderName;
		this.chapterFilename = filename;
		void this.reload();
	}

	/** Open Archive under Story Context (Codex or Novel tab). */
	openArchive(tab: ArchiveMode = "codex"): void {
		this.showingArchive = true;
		this.showingIdeas = false;
		this.archiveMode = tab;
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
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
				void this.reload();
			}
		}
		void this.refreshDisplayedWordCounts();
	}

	private recommendSettings() {
		const s = this.plugin.getSettings();
		return {
			codexFactSectionByType: s.codexFactSectionByType,
			recommendIncludeUnknownNames: s.recommendIncludeUnknownNames,
		};
	}

	/** First panel open loads winkNLP; subsequent opens are free. */
	private async ensureEngine(): Promise<void> {
		if (this.nlpReady) return;
		this.loading = true;
		this.render();
		await ensureNlp();
		this.nlpReady = true;
		this.loading = false;
	}

	private async reload(): Promise<void> {
		if (this.closed) return;
		try {
			if (this.showingIdeas && this.notebookIndexKind === "dossier") {
				await this.loadDossierForSelectedCodex();
				return;
			}
			if (this.mode === "novel") {
				this.render();
				return;
			}
			await this.ensureEngine();
			if (this.closed) return;

			if (!this.bookFolderName || !this.chapterFilename) {
				this.report = null;
				this.render();
				return;
			}
			const bookId = getBookId(this.app, this.bookFolderName);
			this.report = await loadOrRecomputeChapterRecommend(
				this.app,
				this.bookFolderName,
				this.chapterFilename,
				bookId,
				this.recommendSettings(),
			);
			if (this.report) this.synopsisDraft = this.report.synopsisHeuristic;
			this.render();
		} catch (err) {
			console.error("storyForge: Story Context reload failed", err);
			this.render();
		}
	}

	private async forceRefresh(): Promise<void> {
		try {
			await this.ensureEngine();
			if (!this.bookFolderName || !this.chapterFilename) return;
			const bookId = getBookId(this.app, this.bookFolderName);
			this.report = await recomputeChapterRecommend(
				this.app,
				this.bookFolderName,
				this.chapterFilename,
				bookId,
				this.recommendSettings(),
			);
			if (this.report) this.synopsisDraft = this.report.synopsisHeuristic;
			if (this.showingIdeas && this.notebookIndexKind === "dossier") {
				await this.loadDossierForSelectedCodex();
				return;
			}
			this.render();
		} catch (err) {
			console.error("storyForge: Story Context refresh failed", err);
			this.render();
		}
	}

	private async refreshCast(): Promise<void> {
		if (!this.bookFolderName) {
			this.castCache = [];
			return;
		}
		const bookId = getBookId(this.app, this.bookFolderName);
		this.castCache = await loadHydratedCodexInventory(
			this.app,
			bookId,
			this.recommendSettings().codexFactSectionByType,
		);
	}

	/**
	 * `force` is for the toggles that change what's embedded below .sf-recommend-tabs
	 * (toggleFocusMode/toggleForgeFamilyExpanded/toggleForgeFamilyPanel) only - every other caller
	 * (reload(), file/vault watchers, …) should leave it false. While a Forge-family companion
	 * panel is embedded (forgeFamilyPanelDisposer set) an unforced call is a no-op: without this,
	 * an unrelated background event (a file saved elsewhere, a metadata-cache update, …) calling
	 * render() would tear down and re-mount that sibling's live panel - discarding whatever
	 * internal state (scroll position, an open input, …) it was holding - for no reason of its
	 * own. The same skip applies while a Notebook or Codex page grafted editor is live. The panel
	 * is still rebuilt correctly on every state change that actually concerns it, since those all
	 * go through render(true).
	 */
	private render(force = false): void {
		if (this.closed) return;
		if (!force && (this.forgeFamilyPanelDisposer || this.ideaEditorHandle || this.codexEditorHandle)) return;
		this.disposeIdeaEditor();
		this.disposeCodexEditor();
		const headerEl = this.tabHeaderEl();
		if (headerEl) this.decorateTabHeader(headerEl);
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-recommend-view");
		el.addClass("sf-context-view");
		// Focus Mode (toggled from this view's own tab-header icon, see registerTabHeaderFocusToggle
		// above): blank the panel entirely rather than simplify it - left sidebar and every other
		// right-rail tab are untouched, this only ever touches this view's own contentEl.
		if (this.focusMode) {
			this.renderFocusModeContent(el);
			void this.refreshDisplayedWordCounts();
			return;
		}

		// Icon-only, matching the left sidebar's storyLibrary panel (StoryForgeView.ts's own
		// .sf-layout-tab layout-select row) both in icon size (styles.css) and in treatment - a
		// plain colour highlight for hover/active, no background chip.
		const tabs = el.createDiv({ cls: "sf-recommend-tabs" });
		const novelTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.tabIsActive("novel") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Novel",
				"aria-selected": String(this.tabIsActive("novel")),
			},
		});
		setIcon(novelTab, ICON_BOOK_DUOTONE);
		setTooltip(novelTab, "Novel");
		const chapterTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.tabIsActive("chapter") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Chapter",
				"aria-selected": String(this.tabIsActive("chapter")),
			},
		});
		setIcon(chapterTab, ICON_BOOK_OPEN_FILLED);
		setTooltip(chapterTab, "Chapter");
		const selectMode = (mode: RecommendMode) => {
			this.showingArchive = false;
			this.showingIdeas = false;
			this.ideaShelfPanelOpen = false;
			this.ideaCardOpen = false;
			this.mode = mode;
			// Novel/Chapter aren't part of the Forge-family window's pane - "when
			// click on other tabs all forge family icons should go".
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.disposeIdeaEditor();
			void this.reload();
		};
		novelTab.addEventListener("click", () => selectMode("novel"));
		chapterTab.addEventListener("click", () => selectMode("chapter"));
		makeAccessibleActivatable(novelTab, () => selectMode("novel"));
		makeAccessibleActivatable(chapterTab, () => selectMode("chapter"));

		const ideasTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.tabIsActive("ideas") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Notebook",
				"aria-selected": String(this.tabIsActive("ideas")),
			},
		});
		setIcon(ideasTab, ICON_NOTEBOOK_FILLED);
		setTooltip(ideasTab, "Notebook");
		const selectIdeas = () => {
			this.showingArchive = false;
			this.showingIdeas = true;
			this.notebookIndexKind = "notes";
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.render(true);
		};
		ideasTab.addEventListener("click", selectIdeas);
		makeAccessibleActivatable(ideasTab, selectIdeas);

		// Forge family sits between Notebook and Archive - only when at least one companion panel
		// is registered (plugin.getCompanionPanels()); this tab doesn't exist at all otherwise.
		// A tab, not a toggle: clicking it always shows the member-icon row (selectForgeFamily()
		// below), same as clicking Novel/Chapter always shows that mode - it never
		// self-collapses, only picking a different tab (selectMode()/toggleArchive() above/below)
		// hides it again.
		const forgeFamily = this.plugin.getCompanionPanels();
		if (this.forgeFamilyActiveId && !forgeFamily.some((p) => p.id === this.forgeFamilyActiveId)) {
			this.forgeFamilyActiveId = null;
		}
		if (forgeFamily.length > 0) {
			const forgeTab = tabs.createSpan({
				cls: `sf-recommend-tab sf-recommend-tab--forge-family${this.tabIsActive("forge") ? " is-active" : ""}`,
				attr: {
					role: "tab",
					tabindex: "0",
					"aria-label": "Forge family",
					"aria-selected": String(this.tabIsActive("forge")),
				},
			});
			setIcon(forgeTab, ICON_FORGE);
			setTooltip(forgeTab, "Forge family");
			const selectForgeFamily = () => this.selectForgeFamily();
			forgeTab.addEventListener("click", (e) => {
				e.stopPropagation();
				selectForgeFamily();
			});
			makeAccessibleActivatable(forgeTab, selectForgeFamily);
		}

		const archiveTab = tabs.createSpan({
			cls: `sf-recommend-tab sf-recommend-tab--archive${this.tabIsActive("archive") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Archive",
				"aria-selected": String(this.tabIsActive("archive")),
			},
		});
		setIcon(archiveTab, ICON_ARCHIVE_FILLED);
		const toggleArchive = () => {
			this.showingArchive = !this.showingArchive;
			this.showingIdeas = false;
			this.ideaShelfPanelOpen = false;
			this.ideaCardOpen = false;
			// Same reasoning as selectMode() above - Archive isn't the Forge-family window's pane.
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.disposeIdeaEditor();
			this.render();
		};
		archiveTab.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleArchive();
		});
		makeAccessibleActivatable(archiveTab, toggleArchive);

		// Forge-family member-icon row, directly under the tabs, right-aligned under the tab
		// above - then, if a member is open, its embedded panel takes over the rest of the panel
		// (tabs + row stay visible so it can be switched or closed), same precedence Archive has.
		if (forgeFamily.length > 0 && this.forgeFamilyExpanded) {
			const row = el.createDiv({ cls: "sf-recommend-view__forge-row" });
			this.renderForgeFamilyIcons(row, forgeFamily);
		}
		if (this.mountActiveForgeFamilyPanel(el, forgeFamily)) return;
		// Forge-family tab owns the pane even before a member is chosen: show the icon row
		// and leave the body empty rather than falling through to Novel/Chapter.
		if (this.forgeFamilyExpanded) return;

		if (this.showingIdeas) {
			this.renderIdeaShelfSplit(el, true);
			return;
		}

		if (this.showingArchive) {
			const host = {
				app: this.app,
				plugin: this.plugin,
				bookFolderName: this.bookFolderName,
				mode: this.archiveMode,
				setMode: (mode: ArchiveMode) => {
					this.archiveMode = mode;
				},
				refresh: () => this.render(),
			};
			renderArchiveModeIcons(el, host);
			const body = el.createDiv({ cls: "sf-recommend-body" });
			const archiveBody = body.createDiv({ cls: "sf-archive-embedded" });
			renderArchiveList(archiveBody.createDiv({ cls: "sf-recommend-scroll" }), host);
			return;
		}

		if (this.mode === "novel") {
			this.renderNovel(el);
			return;
		}

		if (this.loading) {
			const body = el.createDiv({ cls: "sf-recommend-body sf-recommend-body--scroll" });
			body.createDiv({ cls: "sf-empty", text: "Loading language model…" });
			return;
		}

		this.renderChapter(el);
	}

	/**
	 * Focus Mode's entire panel body: word count + stats (display-only) and the Forge-family
	 * control. Everything else this panel would normally show is hidden (the Focus toggle's own
	 * design keeps the tab-header row itself to just the one icon too - this all lives in the
	 * panel content, which is ours to use). Same shared forgeFamily* state as the normal
	 * tabs-region rendering above, so a window already open there stays open when Focus Mode
	 * turns on, just relocated into this chrome.
	 */
	private renderFocusModeContent(el: HTMLElement): void {
		const family = this.plugin.getCompanionPanels();
		if (this.forgeFamilyActiveId && !family.some((p) => p.id === this.forgeFamilyActiveId)) {
			this.forgeFamilyActiveId = null;
		}

		if (this.ideaCardOpen) {
			this.renderNotebookCard(el);
		} else if (this.ideaShelfPanelOpen) {
			this.renderIdeaShelfSplit(el, false);
		} else if (this.showingCodexPage) {
			this.renderCodexPage(el);
		} else {
			this.mountActiveForgeFamilyPanel(el, family);
		}

		const row = el.createDiv({ cls: "sf-recommend-view__forge-row sf-recommend-view__forge-row--focus" });

		const ideaFamily = row.createDiv({
			cls: "sf-recommend-view__forge-family-cluster sf-recommend-view__forge-family-cluster--notebook",
		});
		const ideaMembers = ideaFamily.createDiv({
			cls: `sf-recommend-view__forge-members${this.ideaShelfExpanded ? " is-expanded" : ""}`,
		});
		this.renderIdeaShelfBrowseIcon(ideaMembers);
		this.renderNotebookAddIcon(ideaFamily);
		const ideaTrigger = ideaFamily.createSpan({
			cls: "sf-recommend-view__forge-family",
			attr: { role: "button", tabindex: "0", "aria-label": "Notebook" },
		});
		setIcon(ideaTrigger, ICON_NOTEBOOK_FILLED);
		setTooltip(ideaTrigger, "Notebook");
		const toggleIdeas = () => this.toggleIdeaShelfExpanded();
		ideaTrigger.addEventListener("click", toggleIdeas);
		makeAccessibleActivatable(ideaTrigger, toggleIdeas);

		if (family.length > 0) {
			const forgeFamily = row.createDiv({ cls: "sf-recommend-view__forge-family-cluster" });
			const members = forgeFamily.createDiv({
				cls: `sf-recommend-view__forge-members${this.forgeFamilyExpanded ? " is-expanded" : ""}`,
			});
			this.renderForgeFamilyIcons(members, family);
			const trigger = forgeFamily.createSpan({
				cls: "sf-recommend-view__forge-family",
				attr: { role: "button", tabindex: "0", "aria-label": "Forge family" },
			});
			setIcon(trigger, ICON_FORGE);
			setTooltip(trigger, "Forge family");
			const toggle = () => this.toggleForgeFamilyExpanded();
			trigger.addEventListener("click", toggle);
			makeAccessibleActivatable(trigger, toggle);
		}
	}

	private renderChapterWordCount(parent: HTMLElement): void {
		const cluster = parent.createDiv({
			cls: "sf-recommend-chapter-wordcount",
			attr: { "aria-label": `Chapter word count ${formatWordCount(this.chapterWordCount)}` },
		});
		setIcon(cluster.createSpan({ cls: "sf-icon sf-recommend-chapter-wordcount-icon" }), ICON_DASHBOARD_CHART);
		cluster.createSpan({
			cls: "sf-recommend-chapter-wordcount-value",
			text: formatWordCount(this.chapterWordCount),
		});
	}

	private async refreshDisplayedWordCounts(): Promise<void> {
		let chapter = 0;
		if (this.bookFolderName && this.chapterFilename) {
			const path = libraryChapterPath(this.bookFolderName, this.chapterFilename);
			const chapterFile = this.app.vault.getAbstractFileByPath(path);
			if (chapterFile instanceof TFile) {
				chapter = countWords(await this.app.vault.cachedRead(chapterFile));
			}
		}
		if (this.closed) return;
		if (chapter !== this.chapterWordCount) {
			this.chapterWordCount = chapter;
			const el = this.contentEl.querySelector(".sf-recommend-chapter-wordcount-value");
			if (el instanceof HTMLElement) {
				el.setText(formatWordCount(chapter));
				el.parentElement?.setAttr("aria-label", `Chapter word count ${formatWordCount(chapter)}`);
			}
		}
	}

	private tabIsActive(tab: RecommendTab): boolean {
		return isRecommendTabActive(tab, {
			forgeFamilyExpanded: this.forgeFamilyExpanded,
			showingArchive: this.showingArchive,
			showingIdeas: this.showingIdeas,
			mode: this.mode,
		});
	}

	/** The tabs-region Forge-family tab: always shows the member-icon row (never toggles itself
	 * off - "when click on other tabs all forge family icons should go" is what hides it, handled
	 * by selectMode()/toggleArchive() above). Also drops out of Archive, the same way selecting
	 * Novel/Chapter does. */
	private selectForgeFamily(): void {
		this.showingArchive = false;
		this.showingIdeas = false;
		this.ideaShelfPanelOpen = false;
		this.ideaCardOpen = false;
		this.disposeIdeaEditor();
		this.clearCodexPage();
		this.forgeFamilyExpanded = true;
		this.render(true);
	}

	/** Focus Mode's own trigger: a true toggle, since - unlike the tabs-region version above -
	 * there's no other tab to click to dismiss it here. Collapsing also hides whatever member
	 * panel was showing - "clicking on the forge family icon hides all the forge family plugin
	 * icons and any displayed plugin panels." In Focus Mode the member row is already in the DOM
	 * (collapsed) so toggling only flips its class — that slides the word count and stats icon
	 * toward the centre without rebuilding the row. */
	private toggleForgeFamilyExpanded(): void {
		this.forgeFamilyExpanded = !this.forgeFamilyExpanded;
		if (this.forgeFamilyExpanded) {
			this.ideaShelfExpanded = false;
			this.ideaShelfPanelOpen = false;
			this.ideaCardOpen = false;
			this.disposeIdeaEditor();
			this.clearCodexPage();
		}
		if (!this.forgeFamilyExpanded) {
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
		}
		if (this.focusMode) {
			this.syncFocusPopoutChrome();
			if (this.forgeFamilyExpanded) {
				this.contentEl.querySelector(".sf-idea-shelf")?.remove();
				this.contentEl.querySelector(".sf-notebook-card-host")?.remove();
				this.contentEl.querySelector(".sf-codex-page-host")?.remove();
				if (this.forgeFamilyActiveId) this.render(true);
			} else {
				this.contentEl.querySelector(".sf-recommend-view__forge-panel")?.remove();
			}
			return;
		}
		this.render(true);
	}

	/** A family member's own icon (in either row): opens its panel, or - "clicking on the
	 * plugin's icon hides the plugin view" - closes it again if it's the one already showing. The
	 * row itself stays expanded either way. */
	private toggleForgeFamilyPanel(pluginId: string): void {
		this.forgeFamilyActiveId = this.forgeFamilyActiveId === pluginId ? null : pluginId;
		this.render(true);
	}

	/** Shared by both forgeFamily rows (tabs-region and Focus Mode). */
	private renderForgeFamilyIcons(row: HTMLElement, family: StoryForgeCompanionPanel[]): void {
		for (const plugin of family) {
			const btn = row.createSpan({
				cls: `sf-recommend-view__forge-icon${plugin.id === this.forgeFamilyActiveId ? " is-active" : ""}`,
				attr: { role: "button", tabindex: "0", "aria-label": plugin.label },
			});
			setIcon(btn, plugin.icon);
			setTooltip(btn, plugin.label);
			const toggle = () => this.toggleForgeFamilyPanel(plugin.id);
			btn.addEventListener("click", toggle);
			makeAccessibleActivatable(btn, toggle);
		}
	}

	/** Mounts the active Forge-family companion's panel (if any) into `container`, disposing
	 * whatever was mounted before - same disposer contract a Forge hub tab would use, since
	 * removing the DOM alone doesn't clean up whatever listeners/timers the sibling set up.
	 * Shared by both rendering paths (tabs-region and Focus Mode). Returns whether something is
	 * now mounted, so the tabs-region caller knows to skip its own normal body/Archive below. */
	private mountActiveForgeFamilyPanel(container: HTMLElement, family: StoryForgeCompanionPanel[]): boolean {
		this.disposeForgeFamilyPanel();
		const active = family.find((p) => p.id === this.forgeFamilyActiveId) ?? null;
		if (!active) return false;
		const panelEl = container.createDiv({ cls: "sf-recommend-view__forge-panel" });
		this.forgeFamilyPanelDisposer = active.renderPanel(panelEl);
		return true;
	}

	private disposeForgeFamilyPanel(): void {
		if (!this.forgeFamilyPanelDisposer) return;
		try {
			this.forgeFamilyPanelDisposer();
		} catch {
			/* sibling disposer must not break the host */
		}
		this.forgeFamilyPanelDisposer = null;
	}

	private syncFocusPopoutChrome(): void {
		const members = this.contentEl.querySelectorAll(".sf-recommend-view__forge-members");
		const ideaMembers = members[0];
		const forgeMembers = members.length > 1 ? members[1] : null;
		ideaMembers?.toggleClass("is-expanded", this.ideaShelfExpanded);
		forgeMembers?.toggleClass("is-expanded", this.forgeFamilyExpanded);
	}

	private toggleIdeaShelfExpanded(): void {
		this.ideaShelfExpanded = !this.ideaShelfExpanded;
		if (this.ideaShelfExpanded) {
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.clearCodexPage();
		} else {
			this.ideaShelfPanelOpen = false;
			this.ideaCardOpen = false;
			this.disposeIdeaEditor();
		}
		if (this.focusMode) {
			this.syncFocusPopoutChrome();
			if (!this.ideaShelfExpanded) {
				this.contentEl.querySelector(".sf-idea-shelf")?.remove();
				this.contentEl.querySelector(".sf-notebook-card-host")?.remove();
				this.contentEl.querySelector(".sf-recommend-view__forge-panel")?.remove();
			} else {
				this.contentEl.querySelector(".sf-codex-page-host")?.remove();
				this.contentEl.querySelector(".sf-recommend-view__forge-panel")?.remove();
			}
			return;
		}
		this.render(true);
	}

	private renderNotebookAddIcon(parent: HTMLElement): void {
		const plus = parent.createSpan({
			cls: `sf-recommend-view__forge-icon sf-recommend-view__forge-icon--notebook-add${this.ideaCardOpen ? " is-active" : ""}`,
			attr: { role: "button", tabindex: "0", "aria-label": "New note" },
		});
		setIcon(plus, ICON_NOTEBOOK_ADD);
		setTooltip(plus, "New note");
		const add = () => void this.createIdeaFromShelf({ asCard: true });
		plus.addEventListener("click", add);
		makeAccessibleActivatable(plus, add);
	}

	private renderIdeaShelfBrowseIcon(row: HTMLElement): void {
		const eye = row.createSpan({
			cls: `sf-recommend-view__forge-icon sf-recommend-view__forge-icon--notebook-popout${this.ideaShelfPanelOpen ? " is-active" : ""}`,
			attr: { role: "button", tabindex: "0", "aria-label": "Browse notebook" },
		});
		setIcon(eye, ICON_NOTEBOOK_EYE);
		setTooltip(eye, "Browse notebook");
		const browse = () => {
			this.ideaCardOpen = false;
			this.ideaShelfPanelOpen = true;
			this.ideaShelfExpanded = true;
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.clearCodexPage();
			this.render(true);
		};
		eye.addEventListener("click", browse);
		makeAccessibleActivatable(eye, browse);
	}

	private renderIdeaShelfSplit(el: HTMLElement, showTypesCorner: boolean): void {
		this.selectedIdeaPath = resolveSelectedNotesPath(
			this.app,
			this.selectedIdeaPath,
			this.ideaTypeFilter,
			this.ideaTagFilter,
		);
		const showSourceRail = showTypesCorner && !this.focusMode;
		const indexKind = showSourceRail ? this.notebookIndexKind : "notes";
		const usesCodexIndex = indexKind === "codex" || indexKind === "dossier";
		if (
			usesCodexIndex &&
			this.notebookCodexTagFilter &&
			!displayedVaultTags(this.app).some((tag) => tag.id === this.notebookCodexTagFilter)
		) {
			this.notebookCodexTagFilter = null;
		}
		const split = el.createDiv({ cls: "sf-idea-shelf" });
		if (showSourceRail) this.renderNotebookSourceRail(split);
		const page = split.createDiv({
			cls:
				indexKind === "codex"
					? "sf-notebook-page sf-notebook-page--codex"
					: indexKind === "dossier"
						? "sf-notebook-page sf-dossier-page"
						: "sf-notebook-page",
		});
		this.notebookPageEl = page;
		const index = split.createDiv({ cls: "sf-notebook-index" });
		if (usesCodexIndex) this.renderNotebookCodexIndex(index, showTypesCorner);
		else this.renderNotebookNotesIndex(index, showTypesCorner);
		if (indexKind === "dossier") this.renderNotebookDossierPage(page);
		else void this.mountIdeaEditor();
	}

	private renderNotebookSourceRail(parent: HTMLElement): void {
		const rail = parent.createDiv({ cls: "sf-codex-side-actions sf-notebook-source-rail" });
		this.addNotebookSourceIcon(rail, "notes", ICON_NOTEBOOK_FILLED, "Notebook");
		this.addNotebookSourceIcon(rail, "codex", ICON_CODEX, "Codex");
		this.addNotebookSourceIcon(rail, "dossier", ICON_CLIPBOARD_LIST_DUOTONE, "Dossier");
	}

	private addNotebookSourceIcon(
		rail: HTMLElement,
		kind: NotebookIndexKind,
		icon: string,
		label: string,
	): void {
		const btn = rail.createSpan({
			cls: `sf-notebook-source-btn${this.notebookIndexKind === kind ? " is-active" : ""}`,
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(btn, icon);
		setTooltip(btn, label);
		const select = () => {
			if (this.notebookIndexKind === kind) return;
			this.notebookIndexKind = kind;
			if (kind === "dossier") {
				this.disposeIdeaEditor();
				void this.loadDossierForSelectedCodex();
				return;
			}
			this.render(true);
		};
		btn.addEventListener("click", select);
		makeAccessibleActivatable(btn, select);
	}

	private renderNotebookNotesIndex(index: HTMLElement, showTypesCorner: boolean): void {
		renderIdeaShelfPanel(this.app, index, {
			collapsedPaths: this.collapsedIdeaFolders,
			onToggleFolder: (folderId) => {
				if (this.collapsedIdeaFolders.has(folderId)) this.collapsedIdeaFolders.delete(folderId);
				else this.collapsedIdeaFolders.add(folderId);
				this.render(true);
			},
			selectedPath: this.selectedIdeaPath,
			onCreateFolder: () => {
				void createNotesFolder(this.app, null).then(() => this.render(true));
			},
			onCreateFile: () => void this.createIdeaFromShelf(),
			typeFilter: this.ideaTypeFilter,
			onChangeTypeFilter: (next) => {
				this.ideaTypeFilter = new Set(next);
				this.render(true);
			},
			tagFilter: this.ideaTagFilter,
			onChangeTagFilter: (next) => {
				this.ideaTagFilter = next;
				this.render(true);
			},
			onOpenFile: (path) => {
				this.selectedIdeaPath = path;
				this.render(true);
			},
			onOpenIdeaTypes: showTypesCorner ? () => this.plugin.openTagRegistry("ideaTypes") : undefined,
			onOpenTags: showTypesCorner
				? () => {
						try {
							new VaultTagModal(this.app, () => this.plugin.refreshStoryForgeViews(), "notes").open();
						} catch (err) {
							new Notice(`storyForge: could not open notebook tags — ${err instanceof Error ? err.message : String(err)}`);
						}
					}
				: undefined,
			onChanged: () => this.render(true),
		});
	}

	private renderNotebookCodexIndex(index: HTMLElement, showTypesCorner: boolean): void {
		index.addClass("sf-bottom-panel");
		const currentBookId = this.bookFolderName ? getBookId(this.app, this.bookFolderName) : null;
		renderBottomPanel(this.app, index, {
			currentBookId,
			mode: "codex",
			collapsedPaths: this.collapsedCodexFolders,
			onToggleFolder: (folderId) => {
				if (this.collapsedCodexFolders.has(folderId)) this.collapsedCodexFolders.delete(folderId);
				else this.collapsedCodexFolders.add(folderId);
				this.activeCodexFolderId = folderId;
				this.render(true);
			},
			activeFilePath: this.selectedCodexPath,
			highlightActiveChapter: this.plugin.getSettings().highlightActiveChapter,
			onCreateFolder: () => void this.createNotebookCodexFolder(),
			onCreateFile: () => void this.createNotebookCodexFile(),
			typeFilter: this.notebookCodexTypeFilter,
			onChangeTypeFilter: (next) => {
				this.notebookCodexTypeFilter = new Set(next);
				this.render(true);
			},
			tagFilter: this.notebookCodexTagFilter,
			onChangeTagFilter: (next) => {
				this.notebookCodexTagFilter = next;
				this.render(true);
			},
			onOpenFile: (path) => {
				this.selectedCodexPath = path;
				if (this.notebookIndexKind === "dossier") void this.loadDossierForSelectedCodex();
				else this.render(true);
			},
			onOpenCodexTypes: showTypesCorner ? () => this.plugin.openTagRegistry("codexTypes") : undefined,
			onOpenTags: showTypesCorner
				? () => {
						try {
							new VaultTagModal(this.app, () => this.plugin.refreshStoryForgeViews()).open();
						} catch (err) {
							new Notice(`storyForge: could not open vault tags — ${err instanceof Error ? err.message : String(err)}`);
						}
					}
				: undefined,
		});
	}

	private notebookCodexTargetFolderId(): string | null {
		const id = this.activeCodexFolderId;
		return id && readCodexFrontmatter(this.app).folders[id] ? id : null;
	}

	private async createNotebookCodexFolder(): Promise<void> {
		try {
			await createCodexFolder(this.app, this.notebookCodexTargetFolderId());
			this.render(true);
		} catch (err) {
			new Notice(`storyForge: could not create folder — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async createNotebookCodexFile(): Promise<void> {
		try {
			const file = await createCodexNote(this.app, this.notebookCodexTargetFolderId());
			this.selectedCodexPath = file.path;
			if (this.notebookIndexKind === "dossier") void this.loadDossierForSelectedCodex();
			else this.render(true);
		} catch (err) {
			new Notice(`storyForge: could not create file — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private renderNotebookCard(el: HTMLElement): void {
		const host = el.createDiv({ cls: "sf-notebook-card-host" });
		const page = host.createDiv({ cls: "sf-notebook-page sf-notebook-card" });
		this.notebookPageEl = page;
		void this.mountIdeaEditor();
	}

	private async createIdeaFromShelf(options?: { asCard?: boolean }): Promise<void> {
		const title = resolveCenterPaneTitle(
			this.plugin.peekMainContentLeaf(),
			this.app,
			this.plugin.getSettings().chapterNumberingStyle,
		);
		try {
			const file = await createIdeaNote(this.app, null, title);
			this.selectedIdeaPath = file.path;
			this.showingIdeas = !this.focusMode;
			this.notebookIndexKind = "notes";
			this.ideaCardOpen = Boolean(options?.asCard);
			this.ideaShelfPanelOpen = !this.ideaCardOpen;
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.clearCodexPage();
			this.render(true);
		} catch (err) {
			new Notice(`storyForge: could not create note — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private notebookPageFilePath(): string | null {
		if (!this.focusMode && this.notebookIndexKind === "codex") return this.selectedCodexPath;
		return this.selectedIdeaPath;
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
		const restoreCenter = Boolean(grafted && this.app.workspace.activeLeaf === grafted.leaf);
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
		const restoreCenter = Boolean(grafted && this.app.workspace.activeLeaf === grafted.leaf);
		grafted?.destroy();
		this.codexEditorHandle = null;
		this.codexEditorPath = null;
		this.codexPageEl = null;
		if (restoreCenter) {
			const center = this.plugin.peekMainContentLeaf();
			if (center) this.app.workspace.setActiveLeaf(center, { focus: true });
		}
	}

	/** Cover/synopsis/per-chapter plot — delegates to NovelPanel.ts's shared render
	 * function, also used by the storyLibrary panel's Novel-layout main-pane page
	 * (NovelOverviewView.ts). The sidebar omits Default PoV and the "Plot" heading;
	 * the wide overview also omits the heading. */
	private renderNovel(el: HTMLElement): void {
		// renderNovelPanel() unconditionally empties whatever container it's given (correct for
		// NovelOverviewView.ts, which owns its whole page) — `el` here already has the tabs row
		// built into it above, so it can't be passed directly or that row would be wiped out the
		// instant this runs. A dedicated nested-flex host isolates renderNovelPanel's own
		// `.empty()` to just its own children while still giving its content the remaining column
		// height (its fixed/scroll split needs that to size correctly).
		const host = el.createDiv({ cls: "sf-recommend-novel-host" });
		renderNovelPanel(this.app, host, {
			bookFolderName: this.bookFolderName,
			plugin: this.plugin,
			emptyText: "Select a novel to see its synopsis and plot.",
			castCache: this.castCache,
			onChanged: () => this.render(),
			isStale: () => this.closed || this.mode !== "novel",
		});
	}

	private renderChapter(el: HTMLElement): void {
		const body = el.createDiv({ cls: "sf-recommend-body" });

		if (!this.bookFolderName || !this.chapterFilename) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}

		// The card now holds the description plus Characters / Other Codex lists, so it can
		// grow taller than the pane — scroll the whole body rather than pin the card and clip
		// the icons that sit directly under it.
		body.addClass("sf-recommend-body--scroll");
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;

		const card = body.createDiv({
			cls: "sf-recommend-plot-block sf-recommend-plot-block--plain sf-recommend-plot-block--chapter",
		});
		const headerRow = card.createDiv({ cls: "sf-recommend-plot-header-row" });
		const { title, subtitle } = splitTitleSubtitle(
			numberedChapterTitle(this.app, bookFolderName, chapterFilename, this.plugin.getSettings().chapterNumberingStyle),
		);
		const nameEl = headerRow.createDiv({
			cls: "sf-recommend-plot-chapter-name sf-recommend-plot-chapter-name--clickable",
			text: subtitle ? `${title} (${subtitle})` : title,
		});
		const rowColor = resolveMainThreadRowColor(this.app, this.plugin.getSettings());
		headerRow.setCssStyles({ color: rowColor.text });
		const titleShadow = resolveTitleShadow(body.ownerDocument, rowColor.text, rowColor.background);
		// On the body (not only the card) so the action-icon hover below the card can
		// use the same chapter colour as in-card highlights.
		body.setCssProps({
			"--sf-plot-card-header-bg": rowColor.background,
			"--sf-plot-card-header-fg": rowColor.text,
			"--sf-plot-card-outline": rowColor.background,
			"--sf-plot-card-title-shadow": titleShadow,
		});
		card.setCssProps({
			"--sf-plot-card-header-bg": rowColor.background,
			"--sf-plot-card-header-fg": rowColor.text,
			"--sf-plot-card-outline": rowColor.background,
			"--sf-plot-card-title-shadow": titleShadow,
		});
		nameEl.setCssStyles({ color: rowColor.text });
		const openTitleModal = () =>
			new ChapterTitleModal(this.app, this.plugin, bookFolderName, chapterFilename, () => void this.reload()).open();
		nameEl.addEventListener("click", openTitleModal);
		makeAccessibleActivatable(nameEl, openTitleModal);

		this.renderNarratingLabel(card);

		if (this.report) {
			const textarea = card.createEl("textarea", {
				cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
				attr: { "aria-label": "chapter summary", rows: "1" },
			});
			textarea.value = this.synopsisDraft;
			const resizeToContent = () => {
				textarea.setCssStyles({ height: "auto" });
				textarea.setCssStyles({ height: `${textarea.scrollHeight}px` });
			};
			textarea.addEventListener("input", () => {
				this.synopsisDraft = textarea.value;
				resizeToContent();
			});
			textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
			resizeToContent();

			const persons = this.report.matched.filter((m) => m.type === "person");
			const others = this.report.matched.filter((m) => m.type !== "person");
			this.renderMatchList(card, "Characters in chapter", persons);
			this.renderMatchList(card, "Other Codex references", others);
		}

		const actions = body.createDiv({ cls: "sf-recommend-chapter-card-actions" });
		iconAction(actions, ICON_LOCATION_TARGET_SQUARE, "go to chapter", () => {
			if (!this.bookFolderName || !this.chapterFilename) return;
			void this.openChapter(this.bookFolderName, this.chapterFilename);
		});
		iconAction(actions, ICON_ADD_SQUARE, "create details note", () => void this.createDetailsNote());
		this.renderChapterWordCount(actions);
		void this.refreshDisplayedWordCounts();

		if (!this.report) {
			body.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
			return;
		}

		this.renderUnknownList(body, this.report);
	}

	private renderMatchList(
		el: HTMLElement,
		title: string,
		items: ChapterRecommendReport["matched"],
	): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: title });
		if (items.length === 0) {
			renderStampedEmptyCross(section, "None found.");
			return;
		}
		for (const item of items) {
			const row = section.createDiv({ cls: "sf-recommend-row" });
			const iconId = codexTypeIcon(item.type);
			if (iconId) setIcon(row.createSpan({ cls: "sf-icon" }), iconId);
			const label = row.createSpan({
				cls: "sf-recommend-row-label",
				text: item.ambiguousWith.length > 0 ? `${item.name} ?` : item.name,
			});
			if (item.ambiguousWith.length > 0) {
				row.createSpan({
					cls: "sf-recommend-ambiguous",
					text: `also ${item.ambiguousWith.join(", ")}`,
				});
			}
			label.addEventListener("click", () => void this.openPath(item.path));
			makeAccessibleActivatable(label, () => void this.openPath(item.path));
		}
	}

	private renderUnknownList(el: HTMLElement, report: ChapterRecommendReport): void {
		const card = el.createDiv({
			cls: "sf-recommend-plot-block sf-recommend-plot-block--plain sf-recommend-unknown-card",
		});
		const section = card.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: "Named but not in Codex" });
		const hints: UnknownNameHint[] =
			report.unknownNameHints.length > 0
				? report.unknownNameHints
				: report.unknownNames.map((name) => ({ name }));
		if (hints.length === 0) {
			renderStampedEmptyCross(section, "None found.");
			return;
		}
		for (const hint of hints) {
			const row = section.createDiv({ cls: "sf-recommend-row" });
			const label = hint.nerType ? `${hint.name} (${hint.nerType})` : hint.name;
			row.createSpan({ cls: "sf-recommend-row-label", text: label });
			const actions = row.createDiv({ cls: "sf-recommend-row-actions" });
			iconAction(actions, ICON_PLUS_SQUARE, "add to codex", () =>
				void this.createStub(hint.name, hint.nerType),
			);
			iconAction(actions, ICON_MINUS_SQUARE, "ignore", () =>
				void this.ignoreUnknownName(hint.name),
			);
		}
	}

	private renderHitCard(parent: HTMLElement, hit: DetailHit): void {
		const card = parent.createDiv({
			cls: `sf-recommend-hit sf-recommend-hit-${hit.tier}${hit.negated ? " is-negated" : ""}`,
		});

		const meta = card.createDiv({ cls: "sf-recommend-hit-meta" });
		meta.createSpan({
			cls: `sf-recommend-tier sf-recommend-tier-${hit.tier}`,
			text: hit.tier,
		});
		meta.createSpan({ cls: "sf-recommend-lens", text: lensLabel(hit.lens) });
		if (hit.trait) {
			meta.createSpan({ cls: "sf-recommend-trait", text: hit.trait });
		}
		if (hit.negated) {
			meta.createSpan({ cls: "sf-recommend-negated", text: "negated" });
		}

		const spanEl = card.createDiv({ cls: "sf-recommend-hit-span", text: hit.sentence });
		spanEl.addEventListener("click", () => void this.jumpToHit(hit));
		makeAccessibleActivatable(spanEl, () => void this.jumpToHit(hit));

		if (hit.currentCodexFact) {
			card.createDiv({
				cls: "sf-recommend-codex-fact",
				text: `Codex · ${hit.currentCodexFact.key}: ${hit.currentCodexFact.value}`,
			});
		}
	}

	private renderNotebookDossierPage(page: HTMLElement): void {
		const scroll = page.createDiv({ cls: "sf-recommend-scroll" });

		if (!this.bookFolderName) {
			scroll.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}

		if (this.loading || this.dossierBuilding) {
			scroll.createDiv({ cls: "sf-empty", text: "Scanning book…" });
			return;
		}

		if (!this.selectedCodexPath) {
			scroll.createDiv({
				cls: "sf-empty",
				text: "Select a Codex note to read everything the book says about them, in chapter order.",
			});
			return;
		}

		if (!this.dossierEntity || this.dossierHits.length === 0) {
			scroll.createDiv({ cls: "sf-empty", text: "No located details for this entity yet." });
			return;
		}

		const chapters = getBookChapters(this.app, this.bookFolderName);
		const ordered = chapters.ordered.map((f) => ({
			filename: f.name,
			label: numberedChapterTitle(this.app, this.bookFolderName!, f.name, this.plugin.getSettings().chapterNumberingStyle),
		}));
		const groups = groupHitsByChapter(ordered, this.dossierHits);

		for (const group of groups) {
			const chSection = scroll.createDiv({ cls: "sf-recommend-section" });
			const chTitle = chSection.createDiv({
				cls: "sf-recommend-section-title",
				text: group.chapter.label,
			});
			chTitle.addEventListener("click", () => {
				if (!this.bookFolderName) return;
				void this.openChapter(this.bookFolderName, group.chapter.filename);
			});
			makeAccessibleActivatable(chTitle, () => {
				if (!this.bookFolderName) return;
				void this.openChapter(this.bookFolderName, group.chapter.filename);
			});

			for (const hit of group.hits) {
				this.renderHitCard(chSection, hit);
			}
		}
	}

	private async loadDossierForSelectedCodex(): Promise<void> {
		if (this.notebookIndexKind !== "dossier") return;
		if (!this.bookFolderName || !this.selectedCodexPath) {
			this.dossierEntity = null;
			this.dossierHits = [];
			this.dossierBuilding = false;
			this.render(true);
			return;
		}
		try {
			this.dossierBuilding = true;
			this.render(true);
			await this.ensureEngine();
			if (this.closed || this.notebookIndexKind !== "dossier") {
				this.dossierBuilding = false;
				return;
			}
			await this.refreshCast();
			const entity = this.castCache.find((c) => c.path === this.selectedCodexPath) ?? null;
			this.dossierEntity = entity;
			if (!entity) {
				this.dossierHits = [];
				this.dossierBuilding = false;
				this.render(true);
				return;
			}
			await this.runDossierSearch(entity);
			if (this.closed || this.notebookIndexKind !== "dossier") return;
			this.render(true);
		} catch (err) {
			console.error("storyForge: dossier scan failed", err);
			this.dossierBuilding = false;
			this.render(true);
		}
	}

	private async runDossierSearch(entity: CastMember): Promise<void> {
		if (!this.bookFolderName) return;
		this.dossierBuilding = true;
		await this.refreshCast();
		const attribution = await readAttributionStore(this.app, this.bookFolderName);
		const chapters = getBookChapters(this.app, this.bookFolderName);
		const files: Array<{ filename: string; raw: string }> = [];
		for (const f of chapters.ordered) {
			const path = libraryChapterPath(this.bookFolderName, f.name);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				files.push({ filename: f.name, raw: await this.app.vault.cachedRead(file) });
			}
		}
		this.dossierHits = await scanEntityAcrossChapters(
			files,
			entity,
			this.castCache,
			attribution.decisions,
			{
				narratorByChapter: Object.fromEntries(
					files.map((f) => [
						f.filename,
						resolveChapterNarrator(this.app, this.bookFolderName!, f.filename, this.castCache),
					]),
				),
				dialogueQuotes: readBookFrontmatter(this.app, this.bookFolderName)?.dialogueQuotes ?? "double",
			},
		);
		this.dossierBuilding = false;
	}

	/**
	 * Chapter PoV + Location rows — wrapping comma-separated names, or the add icon when unset.
	 */
	private renderNarratingLabel(parent: HTMLElement): void {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const narrator = resolveChapterNarrator(
			this.app,
			bookFolderName,
			chapterFilename,
			this.castCache.length > 0 ? this.castCache : undefined,
		);
		const chapter = getChapterEntry(this.app, bookFolderName, chapterFilename);
		const chapterPov = chapter?.pov ?? [];
		const displayPov =
			chapterPov.length > 0
				? chapterPov
				: narrator
					? [{ path: narrator.path, name: narrator.name }]
					: [];
		const location = chapter?.location ?? [];

		const meta = parent.createDiv({ cls: "sf-recommend-meta" });
		renderMetaRefList(
			meta,
			"PoV:",
			displayPov,
			ICON_PERSON_FILL_ADD,
			() => void this.openNarratorPicker(chapterPov),
			chapterPov.length > 0 || narrator ? "change pov character" : "set pov character",
		);
		renderMetaRefList(
			meta,
			"Location:",
			location,
			ICON_MAP_PIN_PLUS,
			() => void this.openLocationPicker(location),
			location.length > 0 ? "change location" : "set location",
		);
	}

	private async openNarratorPicker(current: { path: string; name: string }[]): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(this.app, {
			mode: "multi",
			label: "PoV:",
			emptyMessage: "No person entries in the Codex yet.",
			entries,
			initiallySelected: current,
			onAccept: async (selected) => {
				await writeChapterPov(this.app, bookFolderName, chapterFilename, selected);
				await this.forceRefresh();
			},
		}).open();
	}

	private async openLocationPicker(current: { path: string; name: string }[]): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "place", bookId);
		new CodexEntryPickerModal(this.app, {
			mode: "multi",
			label: "Location:",
			emptyMessage: "No place entries in the Codex yet.",
			entries,
			initiallySelected: current,
			onAccept: async (selected) => {
				await writeChapterLocation(this.app, bookFolderName, chapterFilename, selected);
				await this.forceRefresh();
			},
		}).open();
	}


	/**
	 * Transient reveal: scroll to and flash-select the source line(s).
	 * Not an editor decoration — respects "nothing shown in the editor window."
	 */
	private async jumpToHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName) return;
		const path = libraryChapterPath(this.bookFolderName, hit.chapterFilename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.openFile(file);
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		const view = leaf.view;
		if (!(view instanceof MarkdownView)) return;
		const editor = view.editor;
		const line = Math.max(0, hit.line - 1);
		const lineText = editor.getLine(line) ?? "";
		editor.setSelection({ line, ch: 0 }, { line, ch: lineText.length });
		editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: lineText.length } }, true);
		window.setTimeout(() => {
			const cursor = editor.getCursor();
			editor.setSelection(cursor, cursor);
		}, 1200);
	}

	private async createDetailsNote(): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		try {
			await this.ensureEngine();
			const bookId = getBookId(this.app, this.bookFolderName);
			const freshReport = await recomputeChapterRecommend(
				this.app,
				this.bookFolderName,
				this.chapterFilename,
				bookId,
				this.recommendSettings(),
			);
			this.report = freshReport;
			if (this.report) this.synopsisDraft = this.report.synopsisHeuristic;

			const chapterTitle = numberedChapterTitle(
				this.app,
				this.bookFolderName,
				this.chapterFilename,
				this.plugin.getSettings().chapterNumberingStyle,
			);
			const stem = `${chapterTitle} - details`;
			const basename = nextIdeaNoteBasename(this.app, stem);
			const body = buildDetailsNoteBody(freshReport?.hits ?? []);
			const file = await createNotesNote(this.app, null, { filename: basename, content: body });

			this.selectedIdeaPath = file.path;
			this.showingIdeas = !this.focusMode;
			this.notebookIndexKind = "notes";
			this.ideaCardOpen = false;
			this.ideaShelfPanelOpen = true;
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			this.clearCodexPage();
			this.render(true);
		} catch (err) {
			new Notice(`storyForge: could not create details note — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async createStub(name: string, nerType?: string): Promise<void> {
		new CodexLoreTypeModal(this.app, (type) => {
			if (!type) return;
			void this.finishLore(name, type);
		}, nerTypeHintToCodexType(nerType)).open();
	}

	private async ignoreUnknownName(name: string): Promise<void> {
		if (!this.bookFolderName || !this.report) return;
		const ignored = await addIgnoredName(this.app, this.bookFolderName, name);
		applyIgnoredNames(this.report, ignored.names);
		await writeRecommendCache(this.app, this.bookFolderName, this.report);
		this.render();
	}

	private async finishLore(name: string, type: string): Promise<void> {
		const bookId = this.bookFolderName ? getBookId(this.app, this.bookFolderName) : null;
		try {
			await createCodexLore(this.app, {
				name,
				type,
				bookId,
			});
			new Notice(`storyForge: created Codex ${CODEX_TYPES.find((t) => t.type === type)?.label ?? type}`);
			await this.forceRefresh();
		} catch (err) {
			new Notice(`storyForge: could not create Codex note — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async openInMainContentLeaf(file: TFile): Promise<void> {
		const leaf = this.plugin.getMainContentLeaf();
		await leaf.openFile(file, { active: true });
		await this.app.workspace.revealLeaf(leaf);
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private async openPath(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.openInMainContentLeaf(file);
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.chapterFilename = filename;
			this.bookFolderName = bookFolderName;
			await this.openInMainContentLeaf(file);
		}
	}
}

/** Opportunistic NER → Codex type pre-fill; never required. */
function nerTypeHintToCodexType(nerType?: string): string | undefined {
	if (!nerType) return undefined;
	const t = nerType.toUpperCase();
	if (t.includes("PERSON") || t === "PER") return "person";
	if (t.includes("LOC") || t.includes("GPE") || t.includes("PLACE")) return "place";
	return undefined;
}

export async function activateStoryContextView(plugin: StoryForgePlugin): Promise<void> {
	await activateRightRailView(plugin, STORY_CONTEXT_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof StoryContextView) view.syncFromPluginSelection();
	});
}
