import { App, Menu, Notice, TFile, TFolder, setIcon } from "obsidian";
import { bookDisplayTitle, getSeriesBooks, numberedBookTitle, writeSeriesTitle, writeUnplacedOrder } from "../series";
import {
	archiveChapter,
	chapterDisplayTitle,
	createBook,
	getBookChapters,
	getChapterEntry,
	readBookFrontmatter,
	renameBookTitle,
	renameChapterTitle,
	reorderSeriesBooks,
	writeBookChapterOrder,
	writeBookPlannedChapterLength,
	writeBookPlannedNovelLength,
		} from "../book";
import { createContinuingChapter, createIdeaChapter } from "../chapterCreation";
import { bookBackstagePath } from "../paths";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { renderCodexFocusNavigator } from "./CodexFocusNavigator";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import type { NumberingStyle } from "../numberingStyle";
import {
	ICON_BOOK_DUOTONE,
	ICON_BOOKMARK_DUOTONE,
	ICON_DASHBOARD_CHART,
	ICON_LIST_BAR_FILLED,
	ICON_PLUS_SQUARE,
	ICON_PLOT_THREADS,
	ICON_HASHTAG_SQUARE_DUOTONE,
	ICON_SETTINGS_ALT,
	ICON_TAG_DUOTONE,
	ICON_UNPLACED,
} from "../icons";
import { recordChapterArchive, readChapterWordCount } from "../history";
import {
	renderDefaultPovRow,
	renderPlannedLengthMetaRow,
	renderPlannedLengthStatRow,
	readOrderedChapterWordCounts,
	type PlannedLengthField,
} from "./plannedLengthFields";
import type StoryForgePlugin from "../main";

export type UnplacedViewMode = "unplaced" | "unplacedHidden";
export type PlacedViewMode = "placed" | "placedHidden";
export type { PlannedLengthField } from "./plannedLengthFields";

export interface TopPanelOptions {
	/** Needed only by the series list's novel rows (renderSeriesList), to open NovelTitleModal on
	 * right-click "set novel details" the same way SeriesOverviewView's own novel-title click does. */
	plugin: StoryForgePlugin;
	/** "navigator" is Codex focus's compact three-chapter navigator (renderCodexFocusNavigator),
	 * not the full chapter tree — the book-line header above it renders the same as it does for
	 * "novel" (see `isNovelPane` below for the one path that suppresses it). */
	mode: "series" | "novel" | "navigator";
	/** True only for the storyLibrary panel's own "Novel" layout tab (SfLayout "novelBrowse") —
	 * `mode` alone can't tell that tab apart from every other path that also resolves to "novel"
	 * (the "Chapter" tab/hybrid layout, the storytelling face's own hideSeriesPane-driven novel
	 * mode, seriesBrowse collapsed by hideSeriesPane): those all keep the original chapter-tree
	 * look (series name + book title/subtitle shown, plain unheaded chapter list). Only the real
	 * Novel tab gets the newer chrome (no series/title lines, "Placed Chapters" header + collapse,
	 * planned novel/chapter length fields) — see renderTopPanel/renderBookList below. */
	isNovelPane: boolean;
	hideSeriesPane: boolean;
	seriesNumberingStyle: NumberingStyle;
	chapterNumberingStyle: NumberingStyle;
	/** Layout-level gate for the whole unplaced section (hand-off brief §2) — distinct from `unplacedMode`,
	 * which is the user's own collapse/expand toggle within a layout that shows the section at all. */
	showUnplacedSection: boolean;
	currentBookFolderName: string | null;
	activeChapterFilename: string | null;
	highlightActiveChapter: boolean;
	unplacedMode: UnplacedViewMode;
	onToggleUnplacedMode: () => void;
	/** "novel" mode's placed-chapters header (renderBookList) — collapses/hides the ordered
	 * chapter list the same way unplacedMode does for the unplaced one. */
	placedMode: PlacedViewMode;
	onTogglePlacedMode: () => void;
	/** Which planned-length row's inline editor is open, if any — null when both are closed.
	 * Setting a value also closes whichever other one was open (only one editor at a time). */
	plannedLengthEditorField: PlannedLengthField | null;
	onSetPlannedLengthEditor: (field: PlannedLengthField | null) => void;
	/** "navigator" mode only: whether the chapter selector's 5-row scrollable list is expanded
	 * below the current-chapter row. */
	chapterSelectorExpanded: boolean;
	onToggleChapterSelectorExpanded: () => void;
	onSelectBook: (bookFolderName: string) => void;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	/** When set, both placed and unplaced chapters' right-click "Rename" (and any inline-rename
	 * trigger) opens this instead of the plain inline title swap — the Novel tab wires this to
	 * ChapterTitleModal, the same modal Story Context's own chapter-title click uses, so renaming a
	 * chapter here gets its title + plot-thread picker rather than a bare text field. Every other
	 * mode (series, storytelling navigator) keeps the plain inline rename. */
	onRenameChapter?: (bookFolderName: string, filename: string) => void;
	/** Codex focus's forward-only `[+]`: create a chapter, append it to the end of chapter-order, open it. */
	onCreateContinuingChapter: (bookFolderName: string) => void;
	onArchiveChapter?: () => void | Promise<void>;
}

export function renderTopPanel(app: App, container: HTMLElement, options: TopPanelOptions): void {
	container.empty();

	const series = getSeriesBooks(app);

	const header = container.createDiv({ cls: "sf-top-header" });
	// Both drop this header's own divider (styles.css) — the real Novel tab because the header
	// ends up with nothing in it at all (see below), the Series tab because its header would
	// otherwise hold only the series name, removed just below (follow-up brief: series name is the
	// central Series overview page's job now, not this sidebar's — the Chapter tab and the
	// storytelling face's own navigator, which can also render with hideSeriesPane on, keep it).
	if (options.mode === "series") header.addClass("sf-top-header--series");
	if (options.isNovelPane) header.addClass("sf-top-header--novel-pane");

	// The real "Novel" tab only (isNovelPane) drops the series-name line and the book
	// title/subtitle entirely — the placed-chapters header plus the chapter tree below it already
	// identify what's showing there, so this top identity block is redundant on that one tab.
	// Every other path that can still resolve mode to "novel" (the "Chapter" tab/hybrid layout,
	// the storytelling face's own hideSeriesPane-driven novel mode, etc.) keeps this block. The
	// Series tab also drops it now — the central Series overview page is the series name's one
	// home, per the same follow-up brief.
	if (!options.hideSeriesPane && !options.isNovelPane && options.mode !== "series") {
		const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
		const seriesLabel = seriesLine.createSpan({ cls: "sf-header-text", text: series.seriesTitle });
		// Right-click to rename: the Series settings modal that used to hold the series title is gone.
		attachInlineRename({
			row: seriesLine,
			label: seriesLabel,
			getCurrentTitle: () => getSeriesBooks(app).seriesTitle,
			onCommit: (newTitle) => writeSeriesTitle(app, newTitle),
		});
	}

	if (options.mode !== "series" && !options.isNovelPane) {
		const bookLine = header.createDiv({ cls: "sf-book-line" });
		const coverImage = options.currentBookFolderName
			? readBookFrontmatter(app, options.currentBookFolderName)?.coverImage ?? null
			: null;
		const coverFile =
			coverImage && options.currentBookFolderName
				? app.vault.getAbstractFileByPath(`${bookBackstagePath(options.currentBookFolderName)}/${coverImage}`)
				: null;
		if (coverFile instanceof TFile) {
			bookLine.createEl("img", {
				cls: "sf-book-cover-thumb",
				attr: { src: app.vault.getResourcePath(coverFile) },
			});
		}
		const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const rawBookTitle = options.currentBookFolderName
			? numberedBookTitle(
					app,
					options.currentBookFolderName,
					{ ordered: series.ordered, unplaced: series.unplaced },
					options.seriesNumberingStyle,
				)
			: "—";
		const { title, subtitle } = splitTitleSubtitle(rawBookTitle);
		const textWrap = titleRow.createDiv({ cls: "sf-book-text-wrap" });
		textWrap.createSpan({ cls: "sf-header-text", text: title });
		if (subtitle) {
			bookLine.createDiv({ cls: "sf-book-subtitle-text", text: subtitle });
		}
	}

	const bodyEl = container.createDiv({ cls: "sf-top-body" });

	if (options.mode === "series") {
		renderSeriesList(app, bodyEl, series.ordered, series.unplaced, options, container);
	} else if (options.mode === "navigator" && options.currentBookFolderName) {
		renderCodexFocusNavigator(app, bodyEl, {
			currentBookFolderName: options.currentBookFolderName,
			activeChapterFilename: options.activeChapterFilename,
			highlightActiveChapter: options.highlightActiveChapter,
			chapterNumberingStyle: options.chapterNumberingStyle,
			onOpenChapter: options.onOpenChapter,
			onCreateContinuing: options.onCreateContinuingChapter,
			chapterSelectorExpanded: options.chapterSelectorExpanded,
			onToggleChapterSelectorExpanded: options.onToggleChapterSelectorExpanded,
		});
	} else if (options.currentBookFolderName) {
		renderBookList(app, bodyEl, options.currentBookFolderName, options, container);
	} else {
		bodyEl.createDiv({ cls: "sf-empty", text: "Open a chapter to get started." });
	}
}

function createRow(list: HTMLElement, key: string): HTMLElement {
	const row = list.createDiv({ cls: "sf-row" });
	row.dataset.key = key;
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");
	return row;
}

/** Opens a chapter from a sidebar row on the first press. A `click` listener's first firing in an
 * unfocused sidebar is swallowed by Obsidian focusing the pane (see navigatorControls.ts). */
function bindChapterOpen(row: HTMLElement, open: () => void): void {
	row.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
		open();
	});
}

/**
 * Renders a title, splitting off a "// subtitle" onto its own line if present. Returns the
 * wrapper to pass to `attachInlineRename`. `showOpenIcon` marks the currently-selected novel in the
 * Series tab's book list (renderSeriesList) — shown only while "highlight active chapter" is off,
 * since that setting's own row background already carries the same meaning when it's on. The icon
 * sits inline right after the title text, offset from it by the same gap Codex row type icons sit
 * at from their names (see .sf-row-title-line .sf-row-text in styles.css), and reuses Story
 * Context's own Novel-tab icon (ICON_BOOK_DUOTONE) so the same glyph marks "this is the selected
 * novel" in both the left and right sidebars. Having no colour of its own, it simply inherits
 * whatever colour the row's text is already using.
 * `subtitleInBrackets` is for Unplaced Novels: same type as the title, wrapped in
 * parentheses, at 90% of the title size (see .sf-row-subtitle--title).
 */
function renderRowTitle(
	row: HTMLElement,
	displayTitle: string,
	showOpenIcon = false,
	subtitleInBrackets = false,
): HTMLElement {
	const { title, subtitle } = splitTitleSubtitle(displayTitle);
	const wrap = row.createDiv({ cls: "sf-row-title-wrap" });
	const titleLine = wrap.createDiv({ cls: "sf-row-title-line" });
	titleLine.createSpan({ cls: "sf-row-text", text: title });
	if (showOpenIcon) {
		setIcon(titleLine.createSpan({ cls: "sf-row-open-icon", attr: { "aria-label": "Open" } }), ICON_BOOK_DUOTONE);
	}
	if (subtitle) {
		wrap.createDiv({
			cls: subtitleInBrackets ? "sf-row-subtitle sf-row-subtitle--title" : "sf-row-subtitle",
			text: subtitleInBrackets ? `(${subtitle})` : subtitle,
		});
	}
	return wrap;
}

function renderUnplacedHeader(
	zone: HTMLElement,
	label: string,
	isHidden: boolean,
	onToggleMode: () => void,
	onCreateFile?: (anchorEl: HTMLElement, e: MouseEvent | null) => void,
	createIcon: string = ICON_PLUS_SQUARE,
): void {
	const header = zone.createDiv({ cls: "sf-unplaced-header" });
	if (isHidden) header.addClass("sf-unplaced-hidden");
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_UNPLACED);
	header.createSpan({
		cls: "sf-header-unplaced",
		text: isHidden ? `${label.toLowerCase()} hidden` : label,
	});
	header.addEventListener("click", () => onToggleMode());
	if (isHidden) return;
	if (onCreateFile) {
		const newFileBtn = header.createSpan({
			cls: "sf-unplaced-new-file",
			attr: { "aria-label": "New" },
		});
		setIcon(newFileBtn, createIcon);
		newFileBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onCreateFile(newFileBtn, e);
		});
		makeAccessibleActivatable(newFileBtn, () => onCreateFile(newFileBtn, null));
	}
}

/** The placed-chapters header (renderBookList) — same collapse toggle as renderUnplacedHeader's,
 * deliberately its own dedicated classes rather than reusing `.sf-unplaced-*` ones: this header
 * is coloured to match the chapter rows themselves (--sf-lib-items-color), not the independently
 * themeable "unplaced" colour, and it never has an add-file button. */
function renderPlacedHeader(zone: HTMLElement, label: string, isHidden: boolean, onToggleMode: () => void): void {
	const header = zone.createDiv({ cls: "sf-placed-header" });
	if (isHidden) header.addClass("sf-placed-hidden");
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_LIST_BAR_FILLED);
	header.createSpan({
		cls: "sf-header-placed",
		text: isHidden ? `${label.toLowerCase()} hidden` : label,
	});
	header.addEventListener("click", () => onToggleMode());
}

/** Builds the hybrid "New" button's intent menu (hand-off brief §5.4). A continuing chapter is
 * created and appended to the spine immediately. */
function showChapterCreationMenu(
	app: App,
	bookFolderName: string,
	anchorEl: HTMLElement,
	event: MouseEvent | null,
	rerender: () => void,
): void {
	const menu = new Menu();
	menu.addItem((item) =>
		item.setTitle("Add continuing chapter").onClick(() => {
			void (async () => {
				try {
					await createContinuingChapter(app, bookFolderName, null);
					rerender();
				} catch (err) {
					new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
				}
			})();
		}),
	);
	if (event) {
		menu.showAtMouseEvent(event);
	} else {
		const rect = anchorEl.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom });
	}
}

function renderSeriesList(
	app: App,
	bodyEl: HTMLElement,
	ordered: TFolder[],
	unplaced: TFolder[],
	options: TopPanelOptions,
	container: HTMLElement,
): void {
	const rawTitles = [...ordered, ...unplaced].map((folder) => bookDisplayTitle(app, folder.name));
	const numbered = applyHashNumbering(rawTitles, options.seriesNumberingStyle);

	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	ordered.forEach((folder, i) => {
		const row = createRow(mainList, folder.name);
		const isSelectedBook = options.currentBookFolderName === folder.name;
		const isHighlighted = options.highlightActiveChapter && isSelectedBook;
		if (isHighlighted) row.addClass("sf-row-selected");
		const label = renderRowTitle(row, numbered[i], isSelectedBook && !options.highlightActiveChapter);
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onSelectBook(folder.name);
		});
		attachInlineRename({
			row,
			label,
			getCurrentTitle: () => bookDisplayTitle(app, folder.name),
			onCommit: (newTitle) => renameBookTitle(app, folder.name, newTitle),
		});
	});
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "drag a novel to add it to the series" });
	}

	const zones: DragZone[] = [{ key: "ordered", container: mainList }];
	if (options.showUnplacedSection) {
		const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
		const unplacedHidden = options.unplacedMode === "unplacedHidden";
		renderUnplacedHeader(
			unplacedZone,
			"Unplaced Novels",
			unplacedHidden,
			options.onToggleUnplacedMode,
			(_anchorEl, _e) => {
				void (async () => {
					try {
						await createBook(app);
						renderTopPanel(app, container, options);
					} catch (err) {
						new Notice(`storyForge: could not create book — ${(err as Error).message}`);
					}
				})();
			},
			ICON_PLUS_SQUARE,
		);

		if (!unplacedHidden) {
			const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
			unplaced.forEach((folder, i) => {
				const row = createRow(unplacedList, folder.name);
				const isSelectedBook = options.currentBookFolderName === folder.name;
				const isHighlighted = options.highlightActiveChapter && isSelectedBook;
				if (isHighlighted) row.addClass("sf-row-selected");
				const label = renderRowTitle(
					row,
					numbered[ordered.length + i],
					isSelectedBook && !options.highlightActiveChapter,
					true,
				);
				row.addEventListener("click", (e) => {
					if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
					options.onSelectBook(folder.name);
				});
				attachInlineRename({
					row,
					label,
					getCurrentTitle: () => bookDisplayTitle(app, folder.name),
					onCommit: (newTitle) => renameBookTitle(app, folder.name, newTitle),
				});
			});
			zones.push({ key: "unplaced", container: unplacedList });
		}
	}

	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void (async () => {
			try {
				await reorderSeriesBooks(app, (zoneRowKeys.ordered ?? []).filter(Boolean));
				// The unplaced zone is its own drag target (dragging within it, not just into the
				// ordered zone, is a normal outcome) — without persisting its own resulting sequence
				// too via its separate field, that reorder silently vanished on the next render (see
				// SeriesFrontmatter's unplacedOrder doc comment for why it's a field of its own).
				if (zoneRowKeys.unplaced) {
					await writeUnplacedOrder(app, zoneRowKeys.unplaced.filter(Boolean));
				}
			} catch (err) {
				new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
				renderTopPanel(app, container, options);
			}
		})();
	});
}

function renderBookList(app: App, bodyEl: HTMLElement, bookFolderName: string, options: TopPanelOptions, container: HTMLElement): void {
	const { ordered, unplaced } = getBookChapters(app, bookFolderName);

	const rawTitles = [...ordered, ...unplaced].map((file) => chapterDisplayTitle(app, bookFolderName, file.name));
	const numbered = applyHashNumbering(rawTitles, options.chapterNumberingStyle);

	// Only the real "Novel" tab (isNovelPane) gets the planned-length fields and the collapsible
	// "Placed Chapters" header — every other path that reaches renderBookList (the "Chapter" tab/
	// hybrid layout chief among them) keeps the original plain, always-visible chapter list.
	let placedHidden = false;
	let listHost: HTMLElement;
	if (options.isNovelPane) {
		const bookFm = readBookFrontmatter(app, bookFolderName);
		// Default PoV + both planned-length rows share one .sf-story-context-meta wrapper so the
		// gap between all three is the same (the wrapper's own `gap`, not a margin between
		// separately-wrapped rows) — see renderDefaultPovRow's own doc comment.
		const meta = bodyEl.createDiv({ cls: "sf-story-context-meta" });
		renderDefaultPovRow(app, meta, bookFolderName, () => renderTopPanel(app, container, options));
		// Closing the editor and refreshing the displayed value both go through the same
		// options.onSetPlannedLengthEditor(null) call (state field to null + StoryForgeView's own
		// re-render), fired only once the write resolves — one re-render showing the new value
		// with the editor already closed, rather than an immediate stale one followed by a second.
		const commitPlannedNovelLength = (value: number | null) => {
			void (async () => {
				await writeBookPlannedNovelLength(app, bookFolderName, value);
				options.onSetPlannedLengthEditor(null);
			})();
		};
		const commitPlannedChapterLength = (value: number | null) => {
			void (async () => {
				await writeBookPlannedChapterLength(app, bookFolderName, value);
				options.onSetPlannedLengthEditor(null);
			})();
		};
		const plannedNovelLength = bookFm?.plannedNovelLength ?? null;
		const novelLengthValueEl = renderPlannedLengthMetaRow(
			meta,
			"novel",
			"Novel Length",
			plannedNovelLength,
			options.plannedLengthEditorField === "novel",
			options.onSetPlannedLengthEditor,
			commitPlannedNovelLength,
		);
		// Prefixed in once the live total resolves (not rendered up front — it needs a per-chapter
		// read of every placed chapter's current content, same live source renderNovelPlot's data
		// bars use) rather than blocking the whole panel's render on it: "12,000 of 50,000", so a
		// chapter that's overshot its own target still just reads "56,120 of 50,000" rather than
		// clamping or hiding the overshoot.
		if (novelLengthValueEl && plannedNovelLength !== null) {
			void (async () => {
				const counts = await readOrderedChapterWordCounts(app, bookFolderName, ordered);
				const total = counts.reduce((sum, n) => sum + n, 0);
				if (!novelLengthValueEl.isConnected) return;
				novelLengthValueEl.setText(`${total.toLocaleString("en-US")} of ${plannedNovelLength.toLocaleString("en-US")}`);
			})();
		}
		renderPlannedLengthMetaRow(
			meta,
			"chapter",
			"Chapter Length",
			bookFm?.plannedChapterLength ?? null,
			options.plannedLengthEditorField === "chapter",
			options.onSetPlannedLengthEditor,
			commitPlannedChapterLength,
		);
		// average/median chapter length — only while that editor's actually open, beneath its box.
		if (options.plannedLengthEditorField === "chapter" && ordered.length > 0) {
			const averageValueEl = renderPlannedLengthStatRow(meta, "Chapter Length", "average");
			const medianValueEl = renderPlannedLengthStatRow(meta, "Chapter Length", "median");
			void (async () => {
				const counts = await readOrderedChapterWordCounts(app, bookFolderName, ordered);
				if (counts.length === 0) return;
				const average = Math.round(counts.reduce((sum, n) => sum + n, 0) / counts.length);
				const sorted = [...counts].sort((a, b) => a - b);
				const mid = Math.floor(sorted.length / 2);
				const median = sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
				if (averageValueEl.isConnected) averageValueEl.setText(average.toLocaleString("en-US"));
				if (medianValueEl.isConnected) medianValueEl.setText(median.toLocaleString("en-US"));
			})();
		}

		const placedZone = bodyEl.createDiv({ cls: "sf-placed-zone" });
		placedHidden = options.placedMode === "placedHidden";
		renderPlacedHeader(placedZone, "Placed Chapters", placedHidden, options.onTogglePlacedMode);
		listHost = placedZone;
	} else {
		listHost = bodyEl;
	}

	const zones: DragZone[] = [];
	if (!placedHidden) {
		const mainList = listHost.createDiv({ cls: "sf-top-list" });
		ordered.forEach((file, i) => {
			const row = createRow(mainList, file.name);
			const label = renderRowTitle(row, numbered[i]);
			if (options.highlightActiveChapter && options.activeChapterFilename === file.name) {
				row.addClass("sf-row-selected");
			}
			bindChapterOpen(row, () => options.onOpenChapter(bookFolderName, file.name));
			const archiveItem: ExtraMenuItem = {
				title: "Archive",
				onClick: async () => {
					const words = await readChapterWordCount(app, bookFolderName, file.name);
					await archiveChapter(app, bookFolderName, file.name);
					await recordChapterArchive(app, bookFolderName, file.name, words);
					renderTopPanel(app, container, options);
					void options.onArchiveChapter?.();
				},
			};
			attachInlineRename({
				row,
				label,
				getCurrentTitle: () => chapterDisplayTitle(app, bookFolderName, file.name),
				onCommit: (newTitle) => renameChapterTitle(app, bookFolderName, file.name, newTitle),
				onRenameClick: options.onRenameChapter ? () => options.onRenameChapter!(bookFolderName, file.name) : undefined,
				extraMenuItems: [
					archiveItem,
				],
			});
		});
		if (ordered.length === 0) {
			mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "drag a chapter to add it to the novel" });
		}
		zones.push({ key: "ordered", container: mainList });
	}
	if (options.showUnplacedSection) {
		const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
		const unplacedHidden = options.unplacedMode === "unplacedHidden";
		renderUnplacedHeader(
			unplacedZone,
			"Unplaced Chapters",
			unplacedHidden,
			options.onToggleUnplacedMode,
			(anchorEl, e) => showChapterCreationMenu(app, bookFolderName, anchorEl, e, () => renderTopPanel(app, container, options)),
			ICON_PLUS_SQUARE,
		);

		if (!unplacedHidden) {
			const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
			unplaced.forEach((file, i) => {
				const row = createRow(unplacedList, file.name);
				const label = renderRowTitle(row, numbered[ordered.length + i]);
				if (options.highlightActiveChapter && options.activeChapterFilename === file.name) {
					row.addClass("sf-row-selected");
				}
				bindChapterOpen(row, () => options.onOpenChapter(bookFolderName, file.name));
				const archiveItem: ExtraMenuItem = {
					title: "Archive",
					onClick: async () => {
						const words = await readChapterWordCount(app, bookFolderName, file.name);
						await archiveChapter(app, bookFolderName, file.name);
						await recordChapterArchive(app, bookFolderName, file.name, words);
						renderTopPanel(app, container, options);
						void options.onArchiveChapter?.();
					},
				};
				attachInlineRename({
					row,
					label,
					getCurrentTitle: () => chapterDisplayTitle(app, bookFolderName, file.name),
					onCommit: (newTitle) => renameChapterTitle(app, bookFolderName, file.name, newTitle),
					onRenameClick: options.onRenameChapter ? () => options.onRenameChapter!(bookFolderName, file.name) : undefined,
					extraMenuItems: [
						archiveItem,
					],
				});
			});
			zones.push({ key: "unplaced", container: unplacedList });
		}
	}

	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		// Placed chapters hidden means the "ordered" zone was never registered above, so it's
		// simply absent from zoneRowKeys here — not empty. Skip the write rather than defaulting
		// to [] and overwriting the real chapter-order with nothing.
		if (!zoneRowKeys.ordered) return;
		void (async () => {
			try {
				await writeBookChapterOrder(app, bookFolderName, zoneRowKeys.ordered.filter(Boolean));
			} catch (err) {
				new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
				renderTopPanel(app, container, options);
			}
		})();
	});
}