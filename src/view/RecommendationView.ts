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
import {
	getBookChapters,
	getChapterEntry,
	numberedChapterTitle,
	readBookFrontmatter,
	readBookSynopsis,
	readChapterPlot,
	writeBookCoverImage,
	writeBookSynopsis,
	writeChapterLocation,
	writeChapterPlot,
	writeChapterPov,
	writeDefaultPov,
} from "../book";
import { CODEX_TYPES, codexTypeIcon, getCodexEntriesByType } from "../codex";
import { debounce } from "../debounce";
import { ICON_ARCHIVE, ICON_CHECK_SQUARE, ICON_EYE, ICON_FILE_PLUS, ICON_MAP_PIN, ICON_MAP_PIN_PLUS, ICON_MINUS_SQUARE, ICON_MULTIPLY_SQUARE, ICON_PERSON_FILL, ICON_PERSON_FILL_ADD, ICON_PLUS_SQUARE, ICON_TIMELINE } from "../icons";
import { bookBackstagePath, bookFolderNameFromChapterPath, CODEX_ROOT, isBackstageBookkeepingPath, isLibraryChapterPath, libraryChapterPath } from "../paths";
import { getBookId, numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
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

export const RECOMMEND_VIEW_TYPE = "storyforge-recommend-view";

type RecommendMode = "novel" | "chapter" | "dossier";

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
		return "Story Context";
	}

	getIcon(): string {
		return ICON_TIMELINE;
	}

	private readonly debouncedReload = debounce(() => void this.reload(), 500);

	async onOpen(): Promise<void> {
		this.contentEl.addClass("sf-recommend-view");
		this.contentEl.addClass("sf-context-view");
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
					file.path.endsWith("novel.md")
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
	}

	/** Called when opened from Codex — seed from storyForge selection. */
	syncFromPluginSelection(): void {
		const settings = this.plugin.getSettings();
		if (settings.selectedNovel) this.bookFolderName = settings.selectedNovel;
		if (settings.selectedObject) this.chapterFilename = settings.selectedObject;
	}

	/** Open Archive under Story Context (Codex or Novel tab). */
	openArchive(tab: ArchiveMode = "codex"): void {
		this.showingArchive = true;
		this.archiveMode = tab;
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

	private render(): void {
		if (this.closed) return;
		const el = this.contentEl;
		el.empty();
		el.addClass("sf-recommend-view");
		el.addClass("sf-context-view");

		const header = el.createDiv({ cls: "sf-recommend-header" });
		const headerMain = header.createDiv({ cls: "sf-recommend-header-main" });
		setIcon(headerMain.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
		headerMain.createSpan({ cls: "sf-recommend-title", text: "Story Context" });

		const actions = header.createDiv({ cls: "sf-recommend-header-actions" });
		const archiveBtn = actions.createSpan({
			cls: `sf-recommend-archive-btn${this.showingArchive ? " is-active" : ""}`,
			attr: {
				"aria-label": this.showingArchive ? "Close archive" : "Open archive",
				tabindex: "0",
				role: "button",
				"aria-pressed": String(this.showingArchive),
			},
		});
		setIcon(archiveBtn, ICON_ARCHIVE);
		archiveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.showingArchive = !this.showingArchive;
			this.render();
		});
		makeAccessibleActivatable(archiveBtn, () => {
			this.showingArchive = !this.showingArchive;
			this.render();
		});

		const tabs = el.createDiv({ cls: "sf-recommend-tabs" });
		const novelTab = tabs.createSpan({
			cls: `sf-recommend-tab${!this.showingArchive && this.mode === "novel" ? " is-active" : ""}`,
			text: "Novel",
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-selected": String(!this.showingArchive && this.mode === "novel"),
			},
		});
		const chapterTab = tabs.createSpan({
			cls: `sf-recommend-tab${!this.showingArchive && this.mode === "chapter" ? " is-active" : ""}`,
			text: "Chapter",
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-selected": String(!this.showingArchive && this.mode === "chapter"),
			},
		});
		const dossierTab = tabs.createSpan({
			cls: `sf-recommend-tab${!this.showingArchive && this.mode === "dossier" ? " is-active" : ""}`,
			text: "Dossier",
			attr: {
				role: "tab",
				tabindex: "0",
				"aria-selected": String(!this.showingArchive && this.mode === "dossier"),
			},
		});
		const selectMode = (mode: RecommendMode) => {
			this.showingArchive = false;
			this.mode = mode;
			void this.reload();
		};
		novelTab.addEventListener("click", () => selectMode("novel"));
		chapterTab.addEventListener("click", () => selectMode("chapter"));
		dossierTab.addEventListener("click", () => selectMode("dossier"));
		makeAccessibleActivatable(novelTab, () => selectMode("novel"));
		makeAccessibleActivatable(chapterTab, () => selectMode("chapter"));
		makeAccessibleActivatable(dossierTab, () => selectMode("dossier"));

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
			setIcon(archiveHeader.createSpan({ cls: "sf-icon" }), ICON_ARCHIVE);
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
		this.renderChapter(el);
	}

	private renderNovel(el: HTMLElement): void {
		const body = el.createDiv({ cls: "sf-recommend-body" });

		if (!this.bookFolderName) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Select a novel to see its synopsis and plot." });
			return;
		}

		const bookFolderName = this.bookFolderName;
		const fixed = body.createDiv({ cls: "sf-recommend-fixed sf-recommend-novel-fixed" });

		const cover = fixed.createDiv({ cls: "sf-synopsis-cover sf-recommend-novel-cover" });
		this.renderNovelCover(cover, bookFolderName);
		cover.addEventListener("click", () => this.pickNovelCover(cover, bookFolderName));

		const numberedTitle = numberedBookTitle(this.app, bookFolderName);
		const { title, subtitle } = splitTitleSubtitle(numberedTitle);
		fixed.createDiv({ cls: "sf-recommend-novel-title", text: title });
		if (subtitle) {
			fixed.createDiv({ cls: "sf-recommend-novel-subtitle", text: subtitle });
		}

		const synopsis = fixed.createEl("textarea", {
			cls: "sf-recommend-synopsis sf-recommend-novel-synopsis",
			attr: { "aria-label": "Novel synopsis" },
		});
		synopsis.addEventListener("pointerdown", (e) => e.stopPropagation());
		synopsis.addEventListener("blur", () => {
			void writeBookSynopsis(this.app, bookFolderName, synopsis.value);
		});
		void readBookSynopsis(this.app, bookFolderName).then((value) => {
			if (this.closed || this.mode !== "novel") return;
			synopsis.value = value;
		});

		const defaultPovSection = fixed.createDiv({ cls: "sf-recommend-section" });
		this.renderDefaultPovRow(defaultPovSection, bookFolderName);

		const plotLine = fixed.createDiv({ cls: "sf-book-line sf-synopsis-plot-title" });
		setIcon(plotLine.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
		const plotTitleRow = plotLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const plotTextWrap = plotTitleRow.createDiv({ cls: "sf-book-text-wrap" });
		plotTextWrap.createSpan({ cls: "sf-header-text", text: "Plot" });

		const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
		void this.renderNovelPlot(scroll, bookFolderName);
	}

	private renderNovelCover(cover: HTMLElement, bookFolderName: string): void {
		cover.empty();
		const coverImage = readBookFrontmatter(this.app, bookFolderName)?.coverImage ?? null;
		const file = coverImage
			? this.app.vault.getAbstractFileByPath(`${bookBackstagePath(bookFolderName)}/${coverImage}`)
			: null;
		if (file instanceof TFile) {
			cover.addClass("has-image");
			cover.createEl("img", { attr: { src: this.app.vault.getResourcePath(file) } });
		} else {
			cover.removeClass("has-image");
		}
	}

	private pickNovelCover(cover: HTMLElement, bookFolderName: string): void {
		const input = createEl("input", { type: "file", attr: { accept: "image/*" } });
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) return;
			if (!file.type.startsWith("image/")) {
				new Notice("storyForge: please choose an image file for the cover.");
				return;
			}
			void (async () => {
				try {
					const data = await file.arrayBuffer();
					const dotIndex = file.name.lastIndexOf(".");
					const extension =
						dotIndex !== -1 ? file.name.slice(dotIndex + 1).toLowerCase() : file.type.split("/")[1] || "png";
					await writeBookCoverImage(this.app, bookFolderName, data, extension);
					this.renderNovelCover(cover, bookFolderName);
				} catch (err) {
					new Notice(`storyForge: could not set cover image — ${err instanceof Error ? err.message : String(err)}`);
				}
			})();
		});
		input.click();
	}

	private renderDefaultPovRow(parent: HTMLElement, bookFolderName: string): void {
		const fm = readBookFrontmatter(this.app, bookFolderName);
		const path = fm?.defaultPovPath ?? null;
		const name = fm?.defaultPovName ?? null;
		const meta = parent.createDiv({ cls: "sf-recommend-meta" });
		const row = meta.createDiv({ cls: "sf-recommend-meta-row" });
		row.createSpan({ cls: "sf-recommend-meta-label", text: "Default PoV:" });
		this.renderMetaControl(row, {
			iconId: path ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
			value: path ? (name ?? path) : null,
			tooltip: path ? "change pov character" : "set pov character",
			onOpen: () => void this.openDefaultPovPicker(bookFolderName, !!path),
		});
	}

	private async openDefaultPovPicker(bookFolderName: string, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeDefaultPov(this.app, bookFolderName, entry.path, entry.name);
				this.render();
			},
			async () => {
				await writeDefaultPov(this.app, bookFolderName, null, null);
				this.render();
			},
		).open();
	}

	private async renderNovelPlot(scroll: HTMLElement, bookFolderName: string): Promise<void> {
		scroll.empty();
		const { ordered } = getBookChapters(this.app, bookFolderName);
		if (ordered.length === 0) {
			scroll.createDiv({ cls: "sf-empty", text: "No placed chapters yet." });
			return;
		}
		for (const file of ordered) {
			const block = scroll.createDiv({ cls: "sf-recommend-plot-block" });
			block.createDiv({
				cls: "sf-recommend-plot-chapter-name",
				text: numberedChapterTitle(this.app, bookFolderName, file.name),
			});

			const entry = getChapterEntry(this.app, bookFolderName, file.name);
			const narrator = resolveChapterNarrator(
				this.app,
				bookFolderName,
				file.name,
				this.castCache.length > 0 ? this.castCache : undefined,
			);
			const meta = block.createDiv({ cls: "sf-recommend-meta" });
			this.renderPlotMetaRow(
				meta,
				"PoV:",
				narrator ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
				narrator?.name ?? null,
				!!narrator,
				() => void this.openNovelChapterPovPicker(bookFolderName, file.name, !!narrator),
				narrator ? "change pov character" : "set pov character",
			);
			this.renderPlotMetaRow(
				meta,
				"Location:",
				entry?.locationPath ? ICON_MAP_PIN : ICON_MAP_PIN_PLUS,
				entry?.locationName ?? entry?.locationPath ?? null,
				!!entry?.locationPath,
				() => void this.openNovelChapterLocationPicker(bookFolderName, file.name, !!entry?.locationPath),
				entry?.locationPath ? "change location" : "set location",
			);

			const textarea = block.createEl("textarea", {
				cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
				attr: { "aria-label": `Plot notes for ${file.name}` },
			});
			textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
			textarea.addEventListener("blur", () => {
				void writeChapterPlot(this.app, bookFolderName, file.name, textarea.value);
			});
			const plot = await readChapterPlot(this.app, bookFolderName, file.name);
			if (this.closed || this.mode !== "novel") return;
			textarea.value = plot;
		}
	}

	private renderPlotMetaRow(
		parent: HTMLElement,
		label: string,
		iconId: string,
		value: string | null,
		hasValue: boolean,
		onOpen: () => void,
		tooltip: string,
	): void {
		const row = parent.createDiv({ cls: "sf-recommend-meta-row" });
		row.createSpan({ cls: "sf-recommend-meta-label", text: label });
		this.renderMetaControl(row, {
			iconId,
			value: hasValue ? value : null,
			tooltip,
			onOpen,
		});
	}

	private async openNovelChapterPovPicker(
		bookFolderName: string,
		filename: string,
		hasValue: boolean,
	): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterPov(this.app, bookFolderName, filename, entry.path, entry.name);
				this.render();
			},
			async () => {
				await writeChapterPov(this.app, bookFolderName, filename, null, null);
				this.render();
			},
		).open();
	}

	private async openNovelChapterLocationPicker(
		bookFolderName: string,
		filename: string,
		hasValue: boolean,
	): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "place", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set location",
			"No place entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterLocation(this.app, bookFolderName, filename, entry.path, entry.name);
				this.render();
			},
			async () => {
				await writeChapterLocation(this.app, bookFolderName, filename, null, null);
				this.render();
			},
		).open();
	}

	private renderChapter(el: HTMLElement): void {
		const body = el.createDiv({ cls: "sf-recommend-body" });

		if (!this.bookFolderName || !this.chapterFilename) {
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Open a chapter to see story context." });
			return;
		}

		const fixed = body.createDiv({ cls: "sf-recommend-fixed" });
		const title = numberedChapterTitle(this.app, this.bookFolderName, this.chapterFilename);
		const titleRow = fixed.createDiv({ cls: "sf-recommend-chapter-title-row" });
		titleRow.createDiv({ cls: "sf-recommend-chapter-title", text: title });
		const refreshBtn = titleRow.createSpan({
			cls: "sf-recommend-refresh",
			attr: { "aria-label": "Refresh story context", tabindex: "0", role: "button" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.forceRefresh();
		});
		makeAccessibleActivatable(refreshBtn, () => void this.forceRefresh());

		if (!this.report) {
			this.renderNarratingLabel(fixed);
			body.addClass("sf-recommend-body--scroll");
			body.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
			return;
		}

		const synSection = fixed.createDiv({ cls: "sf-recommend-section" });
		synSection.createDiv({ cls: "sf-recommend-section-title", text: "Chapter summary" });
		const textarea = synSection.createEl("textarea", { cls: "sf-recommend-synopsis" });
		textarea.value = this.synopsisDraft;
		textarea.addEventListener("input", () => {
			this.synopsisDraft = textarea.value;
		});
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

		const synActions = synSection.createDiv({ cls: "sf-recommend-synopsis-actions" });
		this.iconAction(synActions, ICON_EYE, "view chapter", () => {
			if (!this.bookFolderName || !this.chapterFilename) return;
			void this.openChapter(this.bookFolderName, this.chapterFilename);
		});
		this.iconAction(synActions, ICON_FILE_PLUS, "add to chapter", () => void this.sendSynopsis());

		const report = this.report;
		const persons = report.matched.filter((m) => m.type === "person");
		const others = report.matched.filter((m) => m.type !== "person");

		this.renderNarratingLabel(synSection);

		const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
		this.renderMatchList(scroll, "Characters in chapter", persons);
		this.renderMatchList(scroll, "Other Codex references", others);
		this.renderUnknownList(scroll, report);
		this.renderDetailHits(scroll, report);
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
		const section = el.createDiv({ cls: "sf-recommend-section" });
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
			this.iconAction(actions, ICON_PLUS_SQUARE, "create in codex", () =>
				void this.createStub(hint.name, hint.nerType),
			);
			this.iconAction(actions, ICON_MINUS_SQUARE, "ignore", () =>
				void this.ignoreUnknownName(hint.name),
			);
		}
	}

	private renderDetailHits(el: HTMLElement, report: ChapterRecommendReport): void {
		const open = report.hits.filter((h) => !h.resolved && h.tier !== "ambiguous");
		const holding = report.hits.filter((h) => !h.resolved && h.tier === "ambiguous");
		const done = report.hits.filter((h) => h.resolved);

		this.renderHitSection(el, "Details to capture", open, { showResolve: true });
		this.renderHitSection(el, "Holding area", holding, { showResolve: true, holding: true });
		if (done.length > 0) {
			this.renderHitSection(el, "Resolved", done, { showResolve: false });
		}
	}

	private renderHitSection(
		el: HTMLElement,
		title: string,
		hits: DetailHit[],
		opts: { showResolve: boolean; holding?: boolean },
	): void {
		const section = el.createDiv({ cls: "sf-recommend-section" });
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
			this.iconAction(actions, ICON_CHECK_SQUARE, "done", () => void this.resolveHit(hit));
			this.iconAction(actions, ICON_MINUS_SQUARE, "ignore", () => void this.resolveHit(hit));
		} else if (hit.tier === "grey") {
			this.iconAction(actions, ICON_CHECK_SQUARE, "confirm", () => void this.confirmAndResolve(hit));
			this.iconAction(actions, ICON_MINUS_SQUARE, "ignore", () => void this.rejectHit(hit));
		} else if (hit.tier === "ambiguous") {
			for (const name of hit.competingNames) {
				const btn = actions.createEl("button", { text: name });
				btn.addEventListener("click", () => void this.assignAmbiguous(hit, name));
			}
		}
	}

	/** Icon-only action control; aria-label drives Obsidian’s tooltip (no native `title`). */
	private iconAction(
		parent: HTMLElement,
		iconId: string,
		label: string,
		onActivate: () => void,
	): HTMLElement {
		const btn = parent.createSpan({
			cls: "sf-recommend-icon-btn",
			attr: { "aria-label": label, tabindex: "0", role: "button" },
		});
		setIcon(btn, iconId);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			onActivate();
		});
		makeAccessibleActivatable(btn, onActivate);
		return btn;
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
			label: numberedChapterTitle(this.app, this.bookFolderName!, f.name),
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
		this.renderMetaControl(povRow, {
			iconId: narrator ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
			value: narrator?.name ?? null,
			tooltip: narrator ? "change pov character" : "set pov character",
			onOpen: () => void this.openNarratorPicker(!!narrator),
		});

		const locRow = meta.createDiv({ cls: "sf-recommend-meta-row" });
		locRow.createSpan({ cls: "sf-recommend-meta-label", text: "Location:" });
		this.renderMetaControl(locRow, {
			iconId: locationPath ? ICON_MAP_PIN : ICON_MAP_PIN_PLUS,
			value: locationPath ? (locationName ?? locationPath) : null,
			tooltip: locationPath ? "change location" : "set location",
			onOpen: () => void this.openLocationPicker(!!locationPath),
		});
	}

	/** Icon (+ optional name) as a single interactive control. */
	private renderMetaControl(
		row: HTMLElement,
		opts: { iconId: string; value: string | null; tooltip: string; onOpen: () => void },
	): void {
		const control = row.createSpan({
			cls: "sf-recommend-meta-control",
			attr: { role: "button", tabindex: "0", "aria-label": opts.tooltip },
		});
		setTooltip(control, opts.tooltip);
		setIcon(control.createSpan({ cls: "sf-recommend-meta-icon" }), opts.iconId);
		if (opts.value) {
			control.createSpan({ cls: "sf-recommend-meta-value", text: opts.value });
		}
		control.addEventListener("click", (e) => {
			e.stopPropagation();
			opts.onOpen();
		});
		makeAccessibleActivatable(control, opts.onOpen);
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
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
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
		const heading = this.plugin.getSettings().codexFactSectionByType[type] ?? "Facts";
		const bookId = this.bookFolderName ? getBookId(this.app, this.bookFolderName) : null;
		try {
			await createCodexLore(this.app, {
				name,
				type,
				factsHeading: heading,
				bookId,
			});
			new Notice(`storyForge: created Codex ${CODEX_TYPES.find((t) => t.type === type)?.label ?? type}`);
			await this.forceRefresh();
		} catch (err) {
			new Notice(`storyForge: could not create Codex note — ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async openPath(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async openChapter(bookFolderName: string, filename: string): Promise<void> {
		const path = libraryChapterPath(bookFolderName, filename);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.chapterFilename = filename;
			this.bookFolderName = bookFolderName;
			await this.app.workspace.getLeaf(false).openFile(file);
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
