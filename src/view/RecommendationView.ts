import {
	ConfirmationModal,
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
	readChapterPlot,
	writeChapterLocation,
	writeChapterPlot,
	writeChapterPov,
} from "../book";
import { CODEX_TYPES, codexTypeIcon, getCodexEntriesByType } from "../codex";
import { debounce } from "../debounce";
import { splitTitleSubtitle } from "../titleNumbering";
import { ICON_ADD_SQUARE, ICON_ARCHIVE_FILLED, ICON_BOOK_DUOTONE, ICON_BOOK_OPEN_FILLED, ICON_CHECK_SQUARE, ICON_CLIPBOARD_LIST_DUOTONE, ICON_FOCUS_OFF, ICON_FOCUS_ON, ICON_FORGE, ICON_LOCATION_TARGET_SQUARE, ICON_MAP_PIN, ICON_MAP_PIN_PLUS, ICON_MINUS_SQUARE, ICON_MULTIPLY_SQUARE, ICON_NOTEBOOK_DUOTONE, ICON_PERSON_FILL, ICON_PERSON_FILL_ADD, ICON_PLUS_SQUARE, ICON_REFRESH_SQUARE } from "../icons";
import { bookFolderNameFromChapterPath, CODEX_ROOT, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath, seriesFilePath } from "../paths";
import { OBSIDIAN_SELECTORS } from "../obsidianInternals";
import { getBookId } from "../series";
import { groupHitsByChapter, lensLabel } from "../recommend/hitGrouping";
import { writeRecommendCache } from "../recommend/cache";
import {
	addIgnoredName,
	applyIgnoredNames,
	markResolved,
	readAttributionStore,
	upsertAttributionDecision,
} from "../recommend/decisions";
import { ensureNlp } from "../recommend/nlp";
import { resolveChapterNarrator } from "../recommend/narrator";
import { loadOrRecomputeChapterRecommend, recomputeChapterRecommend } from "../recommend/recompute";
import { scanEntityAcrossChapters } from "../recommend/engine";
import { loadHydratedCodexInventory } from "../recommend/inventory";
import { createCodexLore } from "../recommend/lore";
import type { CastMember, ChapterRecommendReport, DetailHit, UnknownNameHint } from "../recommend/types";
import { makeAccessibleActivatable } from "./a11y";
import { activateRightRailView } from "./activateRightRailView";
import { renderArchiveList, renderArchiveTabs, type ArchiveMode } from "./archivePanel";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { CodexLoreTypeModal } from "./CodexLoreTypeModal";
import { DossierEntitySuggest } from "./DossierEntitySuggest";
import { ChapterTitleModal } from "./ChapterTitleModal";
import { iconAction, renderMetaControl, renderNovelPanel } from "./NovelPanel";
import { resolveMainThreadRowColor } from "./novelColor";
import { isRecommendTabActive, type RecommendTab } from "./recommendTabActive";

export const RECOMMEND_VIEW_TYPE = "storyforge-recommend-view";

type RecommendMode = "novel" | "chapter" | "details" | "dossier";

export class RecommendationView extends ItemView {
	private bookFolderName: string | null = null;
	private chapterFilename: string | null = null;
	private mode: RecommendMode = "chapter";
	/** When true, archive list is shown under Chapter/Dossier tabs. */
	private showingArchive = false;
	private archiveMode: ArchiveMode = "codex";
	private report: ChapterRecommendReport | null = null;
	private synopsisDraft = "";
	private closed = false;
	private nlpReady = false;
	private loading = false;
	/** Focus Mode: blanks this panel down to just its own tab-header icon (toggled by clicking
	 * that icon, see registerTabHeaderFocusToggle()). Session-only, like mode/showingArchive above
	 * - the plugin has no settings field for this, so nothing is persisted across restarts. Single
	 * instance only: main.ts's ensureRightRailPanelsUnlocked()/dedupeLeavesOfType() already keep
	 * RecommendationView to one leaf, so per-instance state here is effectively global. */
	private focusMode = false;
	/** Forge family: whether the member-icon row is showing, which member (if any) has its panel
	 * embedded, and that panel's disposer. One shared piece of state rendered in two places - the
	 * "Forge family" tab in .sf-recommend-tabs (normal view) and the trigger in the blank Focus
	 * Mode panel (renderFocusModeContent()) - so an open companion window survives toggling Focus
	 * Mode, just relocated into whichever chrome is showing. */
	private forgeFamilyExpanded = false;
	private forgeFamilyActiveId: string | null = null;
	private forgeFamilyPanelDisposer: (() => void) | null = null;

	/** Dossier tab state */
	private dossierQuery = "";
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
		return RECOMMEND_VIEW_TYPE;
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
					file.path.endsWith("codex.md") ||
					file.path.endsWith("novel.md") ||
					// series.md's order/unplaced-order/title changes affect this panel's own numbered
					// title (numberedBookTitle) on the Novel tab — without this, dragging a book's
					// position elsewhere (or renaming the series) left this panel silently stale.
					file.path === seriesFilePath()
				) {
					if (this.showingArchive) this.render();
					else this.debouncedReload();
				}
			}),
		);
		this.syncFromPluginSelection();
		this.followActiveFile();
		await this.reload();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedReload.cancel();
		this.disposeForgeFamilyPanel();
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
		const headerEl = (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
		if (!headerEl) return;
		this.registerDomEvent(headerEl, "click", (evt) => {
			if ((evt.target as HTMLElement).closest(".workspace-tab-header-inner-close-button")) return;
			this.toggleFocusMode();
		});
	}

	private toggleFocusMode(): void {
		this.focusMode = !this.focusMode;
		// A live Forge-family companion window (forgeFamilyActiveId/forgeFamilyPanelDisposer)
		// isn't reset here - it's the same window shown in both layouts (renderFocusModeContent()
		// below re-mounts it into the blank panel's own chrome), just relocated, not dismissed.
		this.render(true);
		this.syncTabHeader();
	}

	/** Repaints this leaf's own tab icon + tooltip from the current getIcon()/getDisplayText() in
	 * place, without recreating the leaf/view - no public API does that for an already-open
	 * ItemView. Reaches into the same undocumented header node registerTabHeaderFocusToggle()
	 * uses, isolated here for the same reason. */
	private syncTabHeader(): void {
		const headerEl = (this.leaf as unknown as { tabHeaderEl?: HTMLElement }).tabHeaderEl;
		if (!headerEl) return;
		const iconEl = headerEl.querySelector<HTMLElement>(OBSIDIAN_SELECTORS.tabHeaderInnerIcon);
		if (iconEl) {
			iconEl.empty();
			setIcon(iconEl, this.getIcon());
		}
		setTooltip(headerEl, this.getDisplayText());
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
		this.mode = "novel";
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
		this.bookFolderName = bookFolderName;
		void this.reload();
	}

	/** storyLibrary panel's Novel-layout entry (StoryForgeView.ts's openNovelOverview) — jump this
	 * panel to its Chapter tab and show the given chapter, mirroring focusNovel()'s own tab-switch
	 * reset. Takes both book and chapter directly (rather than re-reading settings) for the same
	 * race-avoidance reason focusNovel() does. */
	focusChapter(bookFolderName: string, filename: string): void {
		this.showingArchive = false;
		this.mode = "chapter";
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
		this.bookFolderName = bookFolderName;
		this.chapterFilename = filename;
		void this.reload();
	}

	/** Open Archive under Story Context (Codex or Novel tab). */
	openArchive(tab: ArchiveMode = "codex"): void {
		this.showingArchive = true;
		this.archiveMode = tab;
		this.forgeFamilyExpanded = false;
		this.forgeFamilyActiveId = null;
		this.disposeForgeFamilyPanel();
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
		if (!file) return;
		const book = bookFolderNameFromChapterPath(file.path);
		if (book) {
			this.bookFolderName = book;
			this.chapterFilename = file.name;
			void this.reload();
		}
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
			if (this.mode === "novel") {
				this.render();
				return;
			}
			await this.ensureEngine();
			if (this.closed) return;

			if (this.mode === "dossier") {
				await this.refreshCast();
				this.render();
				return;
			}
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
			if (this.mode === "dossier" && this.dossierEntity) {
				await this.runDossierSearch(this.dossierEntity);
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
	 * own. The panel is still rebuilt correctly on every state change that actually concerns it,
	 * since those all go through render(true).
	 */
	private render(force = false): void {
		if (this.closed) return;
		if (!force && this.forgeFamilyPanelDisposer) return;
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-recommend-view");
		el.addClass("sf-context-view");
		// Focus Mode (toggled from this view's own tab-header icon, see registerTabHeaderFocusToggle
		// above): blank the panel entirely rather than simplify it - left sidebar and every other
		// right-rail tab are untouched, this only ever touches this view's own contentEl.
		if (this.focusMode) {
			this.renderFocusModeContent(el);
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
		const detailsTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.tabIsActive("details") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Details",
				"aria-selected": String(this.tabIsActive("details")),
			},
		});
		setIcon(detailsTab, ICON_CLIPBOARD_LIST_DUOTONE);
		setTooltip(detailsTab, "Details");
		// The old Story Context tab-header icon (see getIcon()'s comment), freed up once that icon
		// became the Focus Mode toggle.
		const dossierTab = tabs.createSpan({
			cls: `sf-recommend-tab${this.tabIsActive("dossier") ? " is-active" : ""}`,
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-label": "Dossier",
				"aria-selected": String(this.tabIsActive("dossier")),
			},
		});
		setIcon(dossierTab, ICON_NOTEBOOK_DUOTONE);
		setTooltip(dossierTab, "Dossier");
		const selectMode = (mode: RecommendMode) => {
			this.showingArchive = false;
			this.mode = mode;
			// Novel/Chapter/Details/Dossier aren't part of the Forge-family window's pane - "when
			// click on other tabs all forge family icons should go".
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
			void this.reload();
		};
		novelTab.addEventListener("click", () => selectMode("novel"));
		chapterTab.addEventListener("click", () => selectMode("chapter"));
		detailsTab.addEventListener("click", () => selectMode("details"));
		dossierTab.addEventListener("click", () => selectMode("dossier"));
		makeAccessibleActivatable(novelTab, () => selectMode("novel"));
		makeAccessibleActivatable(chapterTab, () => selectMode("chapter"));
		makeAccessibleActivatable(detailsTab, () => selectMode("details"));
		makeAccessibleActivatable(dossierTab, () => selectMode("dossier"));

		// Forge family sits between Dossier and Archive - only when at least one companion panel
		// is registered (plugin.getCompanionPanels()); this tab doesn't exist at all otherwise.
		// A tab, not a toggle: clicking it always shows the member-icon row (selectForgeFamily()
		// below), same as clicking Novel/Chapter/Details/Dossier always shows that mode - it never
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
			// Same reasoning as selectMode() above - Archive isn't the Forge-family window's pane.
			this.forgeFamilyExpanded = false;
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
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
		// and leave the body empty rather than falling through to Novel/Chapter/Details/Dossier.
		if (this.forgeFamilyExpanded) return;

		if (this.showingArchive) {
			const body = el.createDiv({ cls: "sf-recommend-body" });
			const archiveBody = body.createDiv({ cls: "sf-archive-embedded" });
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
			const fixed = archiveBody.createDiv({ cls: "sf-recommend-fixed" });
			const archiveHeader = fixed.createDiv({ cls: "sf-archive-embedded-header" });
			archiveHeader.createSpan({ cls: "sf-archive-view-title", text: "Archive" });
			renderArchiveTabs(fixed, host);
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

		if (this.mode === "dossier") {
			this.renderDossier(el);
			return;
		}
		if (this.mode === "details") {
			this.renderDetails(el);
			return;
		}
		this.renderChapter(el);
	}

	/**
	 * Focus Mode's entire panel body: nothing but the Forge-family control, since everything else
	 * this panel would normally show is hidden (the Focus toggle's own design keeps the
	 * tab-header row itself to just the one icon too - this all lives in the panel content, which
	 * is ours to use). Same shared forgeFamily* state as the normal tabs-region rendering above,
	 * so a window already open there stays open when Focus Mode turns on, just relocated into this
	 * chrome; renders nothing at all when no companion panel is registered.
	 */
	private renderFocusModeContent(el: HTMLElement): void {
		const family = this.plugin.getCompanionPanels();
		if (family.length === 0) return;
		if (this.forgeFamilyActiveId && !family.some((p) => p.id === this.forgeFamilyActiveId)) {
			this.forgeFamilyActiveId = null;
		}

		this.mountActiveForgeFamilyPanel(el, family);

		// Bottom-right row (--focus modifier: margin-top: auto pushes it to the bottom of this flex
		// column whether or not the panel above is present - a lone flex child isn't otherwise
		// pushed down by an empty container). Member icons (if expanded) then the trigger
		// last/rightmost - "shown … from right to left" - matching justify-content: flex-end.
		const row = el.createDiv({ cls: "sf-recommend-view__forge-row sf-recommend-view__forge-row--focus" });
		if (this.forgeFamilyExpanded) {
			this.renderForgeFamilyIcons(row, family);
		}
		const trigger = row.createSpan({
			cls: "sf-recommend-view__forge-family",
			attr: { role: "button", tabindex: "0", "aria-label": "Forge family" },
		});
		setIcon(trigger, ICON_FORGE);
		setTooltip(trigger, "Forge family");
		const toggle = () => this.toggleForgeFamilyExpanded();
		trigger.addEventListener("click", toggle);
		makeAccessibleActivatable(trigger, toggle);
	}

	private tabIsActive(tab: RecommendTab): boolean {
		return isRecommendTabActive(tab, {
			forgeFamilyExpanded: this.forgeFamilyExpanded,
			showingArchive: this.showingArchive,
			mode: this.mode,
		});
	}

	/** The tabs-region Forge-family tab: always shows the member-icon row (never toggles itself
	 * off - "when click on other tabs all forge family icons should go" is what hides it, handled
	 * by selectMode()/toggleArchive() above). Also drops out of Archive, the same way selecting
	 * Novel/Chapter/Details/Dossier does. */
	private selectForgeFamily(): void {
		this.showingArchive = false;
		this.forgeFamilyExpanded = true;
		this.render(true);
	}

	/** Focus Mode's own trigger: a true toggle, since - unlike the tabs-region version above -
	 * there's no other tab to click to dismiss it here. Collapsing also hides whatever member
	 * panel was showing - "clicking on the forge family icon hides all the forge family plugin
	 * icons and any displayed plugin panels." */
	private toggleForgeFamilyExpanded(): void {
		this.forgeFamilyExpanded = !this.forgeFamilyExpanded;
		if (!this.forgeFamilyExpanded) {
			this.forgeFamilyActiveId = null;
			this.disposeForgeFamilyPanel();
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

	/** Cover/synopsis/Default PoV/per-chapter plot — delegates to NovelPanel.ts's shared render
	 * function, also used by the storyLibrary panel's Novel-layout main-pane page
	 * (NovelOverviewView.ts) so the two stay identical rather than drifting apart. */
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
		headerRow.setCssStyles({ backgroundColor: rowColor.background, color: rowColor.text });
		card.setCssStyles({ boxShadow: `inset 0 0 0 2px ${rowColor.background}` });
		// On the body (not only the card) so the action-icon hover below the card can
		// use the same chapter colour as in-card highlights.
		body.setCssProps({
			"--sf-plot-card-header-bg": rowColor.background,
			"--sf-plot-card-header-fg": rowColor.text,
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
		iconAction(actions, ICON_REFRESH_SQUARE, "refresh story context", () => void this.forceRefresh());
		if (this.report) {
			iconAction(actions, ICON_ADD_SQUARE, "add chapter summary to chapter details", () => void this.sendSynopsis());
		}

		if (!this.report) {
			body.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
			return;
		}

		this.renderUnknownList(body, this.report);
	}

	/** Details tab: single-chapter "Details to capture" / "Holding area" / "Resolved" review. */
	private renderDetails(el: HTMLElement): void {
		const body = el.createDiv({ cls: "sf-recommend-body" });

		if (!this.bookFolderName || !this.chapterFilename) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Open a chapter to see details to capture." });
			return;
		}

		if (!this.report) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
			return;
		}

		const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
		this.renderDetailHits(scroll, this.report);
	}

	private renderMatchList(
		el: HTMLElement,
		title: string,
		items: ChapterRecommendReport["matched"],
	): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: title });
		if (items.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None found." });
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
			section.createDiv({ cls: "sf-empty", text: "None found." });
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

	private renderDetailHits(el: HTMLElement, report: ChapterRecommendReport): void {
		const open = report.hits.filter((h) => !h.resolved && h.tier !== "ambiguous");
		const holding = report.hits.filter((h) => !h.resolved && h.tier === "ambiguous");
		const done = report.hits.filter((h) => h.resolved);

		this.renderHitSection(el, "Details to capture", open, { showResolve: true, pill: "capture" });
		this.renderHitSection(el, "Holding area", holding, { showResolve: true, holding: true, pill: "holding" });
		if (done.length > 0) {
			this.renderHitSection(el, "Resolved", done, { showResolve: false, pill: "resolved" });
		}
	}

	private renderHitSection(
		el: HTMLElement,
		title: string,
		hits: DetailHit[],
		opts: { showResolve: boolean; holding?: boolean; pill: "capture" | "holding" | "resolved" },
	): void {
		const card = el.createDiv({
			cls: `sf-recommend-plot-block sf-recommend-plot-block--plain sf-recommend-pill-card sf-recommend-pill-card--${opts.pill}`,
		});
		const section = card.createDiv({ cls: "sf-recommend-section" });
		section.createDiv({ cls: "sf-recommend-section-title", text: title });
		if (hits.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "None." });
			return;
		}

		// Group by entity
		const byEntity = new Map<string, DetailHit[]>();
		for (const hit of hits) {
			const key = hit.entityPath ?? hit.entityName;
			let list = byEntity.get(key);
			if (!list) {
				list = [];
				byEntity.set(key, list);
			}
			list.push(hit);
		}

		for (const [, entityHits] of byEntity) {
			const first = entityHits[0];
			const entityHeader = section.createDiv({ cls: "sf-recommend-entity-header" });
			entityHeader.createSpan({
				cls: "sf-recommend-entity-name",
				text: first.entityName,
			});
			if (first.entityPath) {
				entityHeader.addEventListener("click", () => void this.openPath(first.entityPath!));
				makeAccessibleActivatable(entityHeader, () => void this.openPath(first.entityPath!));
			}

			for (const hit of entityHits) {
				this.renderHitCard(section, hit, opts);
			}
		}
	}

	private renderHitCard(
		parent: HTMLElement,
		hit: DetailHit,
		opts: { showResolve: boolean; holding?: boolean },
	): void {
		const card = parent.createDiv({
			cls: `sf-recommend-hit sf-recommend-hit-${hit.tier}${hit.resolved ? " is-resolved" : ""}${hit.negated ? " is-negated" : ""}`,
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

		if (opts.holding && hit.competingNames.length > 0) {
			card.createDiv({
				cls: "sf-recommend-competing",
				text: `Could be: ${hit.competingNames.join(", ")}`,
			});
		}

		if (!opts.showResolve || hit.resolved) return;

		const actions = card.createDiv({ cls: "sf-recommend-hit-actions" });

		if (hit.tier === "solid") {
			iconAction(actions, ICON_CHECK_SQUARE, "detail added/accepted", () => void this.resolveHit(hit));
			iconAction(actions, ICON_MINUS_SQUARE, "ignore this detail", () => void this.resolveHit(hit));
		} else if (hit.tier === "grey") {
			iconAction(actions, ICON_CHECK_SQUARE, "detail added/accepted", () => void this.confirmAndResolve(hit));
			iconAction(actions, ICON_MINUS_SQUARE, "ignore this detail", () => void this.rejectHit(hit));
		} else if (hit.tier === "ambiguous") {
			for (const name of hit.competingNames) {
				const btn = actions.createEl("button", { text: name });
				btn.addEventListener("click", () => void this.assignAmbiguous(hit, name));
			}
		}
	}

	private renderDossier(el: HTMLElement): void {
		const body = el.createDiv({ cls: "sf-recommend-body" });

		if (!this.bookFolderName) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}

		const fixed = body.createDiv({ cls: "sf-recommend-fixed" });
		const combo = fixed.createDiv({ cls: "sf-recommend-dossier-combo" });
		const input = combo.createEl("input", {
			cls: "sf-recommend-dossier-search",
			attr: {
				type: "search",
				placeholder: "Search Codex entity",
				"aria-label": "Search Codex entity",
			},
		});
		input.value = this.dossierQuery;
		input.addEventListener("input", () => {
			this.dossierQuery = input.value;
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());

		const suggest = new DossierEntitySuggest(
			this.app,
			input,
			() => this.castCache,
			(entity) => {
				this.dossierQuery = entity.name;
				void this.selectDossierEntity(entity);
			},
		);

		const dropBtn = combo.createSpan({
			cls: "sf-recommend-icon-btn sf-recommend-dossier-drop",
			attr: {
				"aria-label": this.dossierEntity ? "Clear Codex entity" : "Show Codex entities",
				tabindex: "0",
				role: "button",
			},
		});
		if (this.dossierEntity) {
			setIcon(dropBtn, ICON_MULTIPLY_SQUARE);
			const clearEntity = () => {
				this.dossierEntity = null;
				this.dossierQuery = "";
				this.dossierHits = [];
				this.render();
			};
			dropBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				clearEntity();
			});
			makeAccessibleActivatable(dropBtn, clearEntity);
		} else {
			setIcon(dropBtn, "chevron-down");
			const openDropdown = () => {
				input.focus();
				suggest.open();
			};
			dropBtn.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				openDropdown();
			});
			makeAccessibleActivatable(dropBtn, openDropdown);
		}

		const scroll = body.createDiv({ cls: "sf-recommend-scroll" });

		if (this.dossierBuilding) {
			scroll.createDiv({ cls: "sf-empty", text: "Scanning book…" });
			return;
		}

		if (!this.dossierEntity) {
			scroll.createDiv({
				cls: "sf-empty",
				text: "Pick a Codex entity to read everything the book says about them, in chapter order.",
			});
			return;
		}

		if (this.dossierHits.length === 0) {
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
				this.renderHitCard(chSection, { ...hit, resolved: false }, { showResolve: false });
			}
		}
	}

	private async selectDossierEntity(entity: CastMember): Promise<void> {
		this.dossierEntity = entity;
		this.dossierQuery = entity.name;
		await this.runDossierSearch(entity);
		this.render();
	}

	private async runDossierSearch(entity: CastMember): Promise<void> {
		if (!this.bookFolderName) return;
		this.dossierBuilding = true;
		this.render();
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
	 * Chapter PoV + Location rows — plain `Label: [icon] Name`.
	 * Icon and name are one control (shared hover / click / tooltip).
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
		const locationPath = chapter?.locationPath ?? null;
		const locationName = chapter?.locationName ?? null;

		const meta = parent.createDiv({ cls: "sf-recommend-meta" });

		const povRow = meta.createDiv({ cls: "sf-recommend-meta-row" });
		povRow.createSpan({ cls: "sf-recommend-meta-label", text: "PoV:" });
		renderMetaControl(povRow, {
			iconId: narrator ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
			value: narrator?.name ?? null,
			tooltip: narrator ? "change pov character" : "set pov character",
			onOpen: () => void this.openNarratorPicker(!!narrator),
		});

		const locRow = meta.createDiv({ cls: "sf-recommend-meta-row" });
		locRow.createSpan({ cls: "sf-recommend-meta-label", text: "Location:" });
		renderMetaControl(locRow, {
			iconId: locationPath ? ICON_MAP_PIN : ICON_MAP_PIN_PLUS,
			value: locationPath ? (locationName ?? locationPath) : null,
			tooltip: locationPath ? "change location" : "set location",
			onOpen: () => void this.openLocationPicker(!!locationPath),
		});
	}

	private async openNarratorPicker(hasValue: boolean): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterPov(this.app, bookFolderName, chapterFilename, entry.path, entry.name);
				await this.forceRefresh();
			},
			async () => {
				await writeChapterPov(this.app, bookFolderName, chapterFilename, null, null);
				await this.forceRefresh();
			},
		).open();
	}

	private async openLocationPicker(hasValue: boolean): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "place", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set location",
			"No place entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterLocation(this.app, bookFolderName, chapterFilename, entry.path, entry.name);
				await this.forceRefresh();
			},
			async () => {
				await writeChapterLocation(this.app, bookFolderName, chapterFilename, null, null);
				await this.forceRefresh();
			},
		).open();
	}

	private async resolveHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		hit.resolved = true;
		this.render();
	}

	private async confirmAndResolve(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename || !hit.entityPath) return;
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: hit.entityPath,
			sentence: hit.sentence,
			action: "confirmed",
		});
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		hit.attribution = "confirmed";
		hit.tier = "solid";
		hit.resolved = true;
		this.render();
	}

	private async rejectHit(hit: DetailHit): Promise<void> {
		if (!this.bookFolderName || !hit.entityPath) return;
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: hit.entityPath,
			sentence: hit.sentence,
			action: "rejected",
		});
		await this.forceRefresh();
	}

	private async assignAmbiguous(hit: DetailHit, chosenName: string): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const chosen = (this.report?.matched.find((m) => m.name === chosenName) ?? null);
		const cast = await loadHydratedCodexInventory(
			this.app,
			getBookId(this.app, this.bookFolderName),
			this.recommendSettings().codexFactSectionByType,
		);
		const entry = cast.find((c) => c.name === chosenName) ?? null;
		const path = chosen?.path ?? entry?.path;
		if (!path) return;

		// Confirm for chosen; reject prior guess if different
		if (hit.entityPath && hit.entityPath !== path) {
			await upsertAttributionDecision(this.app, this.bookFolderName, {
				entityPath: hit.entityPath,
				sentence: hit.sentence,
				action: "rejected",
				reroutePath: path,
			});
		}
		await upsertAttributionDecision(this.app, this.bookFolderName, {
			entityPath: path,
			sentence: hit.sentence,
			action: "confirmed",
		});
		await markResolved(this.app, this.bookFolderName, this.chapterFilename, hit.id);
		await this.forceRefresh();
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

	private async sendSynopsis(): Promise<void> {
		if (!this.bookFolderName || !this.chapterFilename) return;
		const bookFolderName = this.bookFolderName;
		const chapterFilename = this.chapterFilename;
		const draft = this.synopsisDraft;
		const existing = await readChapterPlot(this.app, bookFolderName, chapterFilename);
		if (existing.trim() && existing.trim() !== draft.trim()) {
			const modal = new ConfirmationModal(this.app);
			modal.setTitle("Replace chapter plot?");
			modal.contentEl.createEl("p", {
				text: "Replace the existing chapter plot notes with this synopsis?",
			});
			modal.addButton((btn) =>
				btn
					.setButtonText("Replace")
					.setCta()
					.onClick(async () => {
						await writeChapterPlot(this.app, bookFolderName, chapterFilename, draft);
						new Notice("storyForge: synopsis sent to chapter plot");
					}),
			);
			modal.addCancelButton();
			modal.open();
			return;
		}
		await writeChapterPlot(this.app, bookFolderName, chapterFilename, draft);
		new Notice("storyForge: synopsis sent to chapter plot");
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

export async function activateRecommendView(plugin: StoryForgePlugin): Promise<void> {
	await activateRightRailView(plugin, RECOMMEND_VIEW_TYPE, (leaf) => {
		const view = leaf.view;
		if (view instanceof RecommendationView) view.syncFromPluginSelection();
	});
}
