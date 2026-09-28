import { App, Menu, Notice, TFile, TFolder, setIcon } from "obsidian";
import { bookDisplayTitle, getSeriesBooks, numberedBookTitle, writeUnplacedOrder } from "../series";
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
	writeChapterTags,
	writeNovelTags,
} from "../book";
import { createContinuingChapter, createIdeaChapter } from "../chapterCreation";
import { readTagRegistry, resolveIconAlias } from "../tagRegistry";
import { bookBackstagePath } from "../paths";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { ChapterIdeaCaptureModal } from "./ChapterIdeaCaptureModal";
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
	setNumberFillIcon,
} from "../icons";
import { recordChapterArchive, readChapterWordCount } from "../history";
import { renderDefaultPovRow, renderMetaClearButton, renderMetaControl } from "./NovelPanel";

export type UnplacedViewMode = "unplaced" | "unplacedHidden";
export type PlacedViewMode = "placed" | "placedHidden";
/** Which of the Novel tab's two planned-length rows (if either) currently has its inline "push
 * down" number editor open — see renderPlannedLengthMetaRow. At most one at a time. */
export type PlannedLengthField = "novel" | "chapter";

export interface TopPanelOptions {
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
	/** Codex focus's forward-only `[+]`: create a chapter, append it to the end of chapter-order, open it. */
	onCreateContinuingChapter: (bookFolderName: string) => void;
	onArchiveChapter?: () => void | Promise<void>;
	/** Codex-focus navigator's continuous read-and-write mode (continuous-mode hand-off brief §2,
	 * corrected): the manuscript lives in a separate main-pane view; this sidebar only ever shows
	 * navigation around it. See CodexFocusNavigatorOptions for what each of these does. */
	continuousActiveFilename: string | null;
	onOpenContinuousRead: (bookFolderName: string) => void;
	onExitContinuousRead: (bookFolderName: string) => void;
	onContinuousScrollTo: (bookFolderName: string, filename: string) => void;
	registerContinuousCleanup: (dispose: () => void) => void;
}

/**
 * Series-mode-only hover icons — pinned to the bottom-left corner of the whole pane, not the
 * top header, so they read as persistent panel-level controls. Rendered directly onto the pane's
 * own root element (StoryForgeView's `container`/`contentEl`, which has `position: relative` in
 * styles.css), not into renderTopPanel()'s own DOM — .sf-top-panel/.sf-bottom-panel both scroll
 * (`overflow-y: auto`), which would clip an absolutely-positioned descendant that's meant to sit
 * outside their own box, so this needs a container the overflow-clipping rows aren't ancestors of.
 * Settings cog is leftmost (the pane's outside edge); stats sits between it and plot-threads;
 * types (Codex / Notebook / Archive), Codex tags (hashtag), and chapter/novel tags follow.
 * Relevant only while actually browsing the series list (topPane === "series") — call-site gated,
 * same condition renderTopPanel() used to gate this on internally.
 */
export function renderSeriesPaneCornerButtons(
	container: HTMLElement,
	onOpenCodexTypes: () => void,
	onOpenCodexTags: () => void,
	onOpenTags: () => void,
	onOpenPlotThreads: () => void,
	onOpenSeriesModal: () => void,
	onOpenStats: () => void,
): void {
	const corner = container.createDiv({ cls: "sf-series-pane-corner" });
	addSeriesCornerButton(corner, ICON_SETTINGS_ALT, "Series settings", onOpenSeriesModal);
	addSeriesCornerButton(corner, ICON_DASHBOARD_CHART, "Stats", onOpenStats);
	addSeriesCornerButton(corner, ICON_PLOT_THREADS, "Plot threads", onOpenPlotThreads);
	addSeriesCornerButton(corner, ICON_TAG_DUOTONE, "Types", onOpenCodexTypes);
	addSeriesCornerButton(corner, ICON_HASHTAG_SQUARE_DUOTONE, "Codex tags", onOpenCodexTags);
	addSeriesCornerButton(corner, ICON_BOOKMARK_DUOTONE, "Chapter and novel tags", onOpenTags);
}

function addSeriesCornerButton(corner: HTMLElement, icon: string, label: string, onClick: () => void): void {
	const btn = corner.createSpan({ cls: "sf-series-settings-btn", attr: { "aria-label": label } });
	setIcon(btn, icon);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick();
	});
	makeAccessibleActivatable(btn, onClick);
}

export function renderTopPanel(app: App, container: HTMLElement, options: TopPanelOptions): void {
	container.empty();

	const series = getSeriesBooks(app);

	const header = container.createDiv({ cls: "sf-top-header" });

	// The real "Novel" tab only (isNovelPane) drops the series-name line and the book
	// title/subtitle entirely — the placed-chapters header plus the chapter tree below it already
	// identify what's showing there, so this top identity block is redundant on that one tab.
	// Every other path that can still resolve mode to "novel" (the "Chapter" tab/hybrid layout,
	// the storytelling face's own hideSeriesPane-driven novel mode, etc.) keeps this block.
	if (!options.hideSeriesPane && !options.isNovelPane) {
		const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
		seriesLine.createSpan({ cls: "sf-header-text", text: series.seriesTitle });
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
			continuousActiveFilename: options.continuousActiveFilename,
			onOpenContinuousRead: options.onOpenContinuousRead,
			onExitContinuousRead: options.onExitContinuousRead,
			onContinuousScrollTo: options.onContinuousScrollTo,
			registerContinuousCleanup: options.registerContinuousCleanup,
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

/** One small icon per tag id on the chapter, resolved against the shared chapter-tags registry. Unknown/orphaned ids are skipped rather than shown broken. */
function renderChapterTagBadges(row: HTMLElement, app: App, bookFolderName: string, filename: string): void {
	const entry = getChapterEntry(app, bookFolderName, filename);
	if (!entry || entry.tags.length === 0) return;
	const { chapterTags } = readTagRegistry(app);
	const badgeRow = row.createDiv({ cls: "sf-row-tag-badges" });
	for (const tagId of entry.tags) {
		const def = chapterTags.find((t) => t.id === tagId);
		if (!def) continue;
		const badge = badgeRow.createSpan({ cls: "sf-tag-badge", attr: { "aria-label": def.label, title: def.label } });
		setIcon(badge, resolveIconAlias("chapterTags", def.iconAlias));
	}
}

/** Right-click "Tags..." menu item: opens the multi-select TagPickerModal for `list`, writing the full replacement id array via `write` and re-rendering the panel on success. */
function tagsMenuItem(
	app: App,
	list: "chapterTags" | "novelTags",
	currentIds: string[],
	write: (nextIds: string[]) => Promise<void>,
	rerender: () => void,
): ExtraMenuItem {
	return {
		title: "Tags...",
		onClick: () => {
			void import("./TagPickerModal").then(({ TagPickerModal }) => {
				new TagPickerModal(app, list, currentIds, (nextIds) => write(nextIds).then(rerender)).open();
			});
		},
	};
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

/** Digits before the caret, ignoring any comma separators already in the value — used to
 * re-place the caret after reformatting adds/removes commas around it. */
function countDigitsBeforeCaret(input: HTMLInputElement): number {
	const pos = input.selectionStart ?? input.value.length;
	return (input.value.slice(0, pos).match(/\d/g) ?? []).length;
}

/** Inverse of countDigitsBeforeCaret: places the caret right after the Nth digit in the
 * (already reformatted) value, so typing/deleting in the middle of a grouped number doesn't
 * bounce the caret to the end every keystroke. */
function setCaretAfterDigitCount(input: HTMLInputElement, digitCount: number): void {
	if (digitCount <= 0) {
		input.setSelectionRange(0, 0);
		return;
	}
	let seen = 0;
	for (let i = 0; i < input.value.length; i++) {
		if (/\d/.test(input.value[i])) {
			seen++;
			if (seen === digitCount) {
				input.setSelectionRange(i + 1, i + 1);
				return;
			}
		}
	}
	input.setSelectionRange(input.value.length, input.value.length);
}

/** The inline "push down" number editor a planned-length row opens beneath itself — same idea as
 * the storytelling panel's chapter selector expanding its 5-row list below the current-chapter row
 * (CodexFocusNavigator.ts) rather than a modal. A `--ghost` label (identical text, hidden but still
 * taking up space) reserves the same width the real label above occupies, so the input's left edge
 * lands exactly where that row's own value/icon sits — visually aligned with the label's colon.
 * Comma-grouped as you type; Enter blurs (committing), Escape reverts to the original value, the
 * "x" (renderMetaClearButton) clears outright — all three close the editor via `onDone`, called at
 * most once per open (the "x" beside the box is the only place this row shows one; the collapsed
 * meta-control above never does). */
function renderPlannedLengthEditorRow(meta: HTMLElement, label: string, value: number | null, onDone: (value: number | null) => void): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-editor-row" });
	row.createSpan({
		cls: "sf-story-context-meta-label sf-story-context-meta-label--ghost",
		text: `${label}:`,
		attr: { "aria-hidden": "true" },
	});
	const input = row.createEl("input", {
		cls: "sf-planned-length-editor-input",
		attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": label },
	});
	input.value = value !== null ? value.toLocaleString("en-US") : "";
	input.addEventListener("pointerdown", (e) => e.stopPropagation());
	input.addEventListener("input", () => {
		const caretDigits = countDigitsBeforeCaret(input);
		const digits = input.value.replace(/\D/g, "");
		input.value = digits ? Number(digits).toLocaleString("en-US") : "";
		setCaretAfterDigitCount(input, caretDigits);
	});
	let settled = false;
	const finish = (next: number | null) => {
		if (settled) return;
		settled = true;
		onDone(next);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			finish(value);
		}
	});
	input.addEventListener("blur", () => {
		const digits = input.value.replace(/\D/g, "");
		finish(digits ? Number(digits) : null);
	});
	renderMetaClearButton(row, `clear ${label.toLowerCase()}`, () => finish(null));
	window.setTimeout(() => {
		input.focus();
		input.select();
	}, 0);
}

/** A planned novel/chapter length row, styled identically to Default PoV's own meta row (same
 * label + icon-control pieces, renderMetaControl/NovelPanel.ts) rather than a persistent text box:
 * clicking the control (setNumberFillIcon when unset — a stroke-drawn glyph, so it can't go
 * through Obsidian's fill-only `setIcon` — or just the number itself once set, `hideIconWhenValue`
 * dropping the icon then) opens the inline editor below (renderPlannedLengthEditorRow) instead of a
 * modal. Clearing (the "x") lives only in that editor, not on this collapsed row. */
function renderPlannedLengthMetaRow(
	meta: HTMLElement,
	field: PlannedLengthField,
	label: string,
	value: number | null,
	isEditorOpen: boolean,
	onSetEditor: (field: PlannedLengthField | null) => void,
	onCommit: (value: number | null) => void,
): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: `${label}:` });
	renderMetaControl(row, {
		paintIcon: setNumberFillIcon,
		value: value !== null ? value.toLocaleString("en-US") : null,
		hideIconWhenValue: true,
		tooltip: isEditorOpen ? `close ${label.toLowerCase()}` : value !== null ? `change ${label.toLowerCase()}` : `set ${label.toLowerCase()}`,
		onOpen: () => onSetEditor(isEditorOpen ? null : field),
	});
	if (isEditorOpen) {
		renderPlannedLengthEditorRow(meta, label, value, onCommit);
	}
}

/** Builds the hybrid "New" button's intent menu (hand-off brief §5.4). A continuing chapter is
 * created and appended to the spine immediately; an idea chapter is captured lightly (H2) and
 * left unplaced, never opened, so editor focus isn't disturbed. */
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
	menu.addItem((item) =>
		item.setTitle("Add chapter idea").onClick(() => {
			new ChapterIdeaCaptureModal(app, (title) => {
				void (async () => {
					try {
						await createIdeaChapter(app, bookFolderName, title);
						rerender();
					} catch (err) {
						new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
					}
				})();
			}).open();
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
			extraMenuItems: [
				tagsMenuItem(
					app,
					"novelTags",
					readBookFrontmatter(app, folder.name)?.novelTags ?? [],
					(nextIds) => writeNovelTags(app, folder.name, nextIds),
					() => renderTopPanel(app, container, options),
				),
			],
		});
	});
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a book here to sequence it." });
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
					extraMenuItems: [
						tagsMenuItem(
							app,
							"novelTags",
							readBookFrontmatter(app, folder.name)?.novelTags ?? [],
							(nextIds) => writeNovelTags(app, folder.name, nextIds),
							() => renderTopPanel(app, container, options),
						),
					],
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
		renderPlannedLengthMetaRow(
			meta,
			"novel",
			"Novel Length",
			bookFm?.plannedNovelLength ?? null,
			options.plannedLengthEditorField === "novel",
			options.onSetPlannedLengthEditor,
			commitPlannedNovelLength,
		);
		renderPlannedLengthMetaRow(
			meta,
			"chapter",
			"Chapter Length",
			bookFm?.plannedChapterLength ?? null,
			options.plannedLengthEditorField === "chapter",
			options.onSetPlannedLengthEditor,
			commitPlannedChapterLength,
		);

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
			renderChapterTagBadges(row, app, bookFolderName, file.name);
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
				extraMenuItems: [
					tagsMenuItem(
						app,
						"chapterTags",
						getChapterEntry(app, bookFolderName, file.name)?.tags ?? [],
						(nextIds) => writeChapterTags(app, bookFolderName, file.name, nextIds),
						() => renderTopPanel(app, container, options),
					),
					archiveItem,
				],
			});
		});
		if (ordered.length === 0) {
			mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a chapter here to sequence it." });
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
				renderChapterTagBadges(row, app, bookFolderName, file.name);
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
					extraMenuItems: [
						tagsMenuItem(
							app,
							"chapterTags",
							getChapterEntry(app, bookFolderName, file.name)?.tags ?? [],
							(nextIds) => writeChapterTags(app, bookFolderName, file.name, nextIds),
							() => renderTopPanel(app, container, options),
						),
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