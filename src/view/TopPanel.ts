import { App, Notice, TFile, TFolder, setIcon } from "obsidian";
import { bookDisplayTitle, getSeriesBooks } from "../series";
import {
	archiveChapter,
	chapterDisplayTitle,
	createBook,
	createChapter,
	getBookChapters,
	renameBookTitle,
	renameChapterTitle,
	reorderSeriesBooks,
	writeBookChapterOrder,
} from "../book";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { ICON_ARCHIVE, ICON_BOOK, ICON_BOOK_PLUS, ICON_FILTER, ICON_PLUS_SQUARE, ICON_SERIES, ICON_UNPLACED } from "../icons";

export interface TopPanelOptions {
	mode: "book" | "series";
	currentBookFolderName: string | null;
	activeChapterFilename: string | null;
	highlightActiveChapter: boolean;
	onToggleMode: () => void;
	onSelectBook: (bookFolderName: string) => void;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	onOpenSeriesModal: () => void;
	onOpenBookSynopsisModal: (bookFolderName: string) => void;
	onArchiveChapter?: () => void;
	onOpenArchive?: () => void;
}

export function renderTopPanel(app: App, container: HTMLElement, options: TopPanelOptions): void {
	container.empty();

	const series = getSeriesBooks(app);

	const header = container.createDiv({ cls: "sf-top-header" });

	const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
	setIcon(seriesLine.createSpan({ cls: "sf-icon" }), ICON_SERIES);
	seriesLine.createSpan({ cls: "sf-header-text", text: series.seriesTitle });
	const filterBtn = seriesLine.createSpan({ cls: "sf-icon sf-series-filter-btn", attr: { "aria-label": "Series settings" } });
	setIcon(filterBtn, ICON_FILTER);
	filterBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		options.onOpenSeriesModal();
	});
	makeAccessibleActivatable(filterBtn, () => options.onOpenSeriesModal());
	seriesLine.addEventListener("click", () => options.onToggleMode());

	if (options.mode === "book") {
		const bookLine = header.createDiv({ cls: "sf-header-line sf-book-line" });
		setIcon(bookLine.createSpan({ cls: "sf-icon" }), ICON_BOOK);
		const rawBookTitle = options.currentBookFolderName
			? numberedBookTitle(app, series.ordered, series.unplaced, options.currentBookFolderName)
			: "—";
		const { title, subtitle } = splitTitleSubtitle(rawBookTitle);
		const textWrap = bookLine.createDiv({ cls: "sf-book-text-wrap" });
		textWrap.createSpan({ cls: "sf-header-text", text: title });
		if (subtitle) {
			textWrap.createDiv({ cls: "sf-book-subtitle-text", text: subtitle });
		}
		if (options.currentBookFolderName) {
			const bookSettingsBtn = bookLine.createSpan({
				cls: "sf-icon sf-book-filter-btn",
				attr: { "aria-label": "Book settings" },
			});
			setIcon(bookSettingsBtn, ICON_FILTER);
			const bookFolderName = options.currentBookFolderName;
			bookSettingsBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				options.onOpenBookSynopsisModal(bookFolderName);
			});
			makeAccessibleActivatable(bookSettingsBtn, () => options.onOpenBookSynopsisModal(bookFolderName));
		}
	}

	const bodyEl = container.createDiv({ cls: "sf-top-body" });

	if (options.mode === "series") {
		renderSeriesList(app, bodyEl, series.ordered, series.unplaced, options);
	} else if (options.currentBookFolderName) {
		renderBookList(app, bodyEl, options.currentBookFolderName, options, container);
	} else {
		bodyEl.createDiv({ cls: "sf-empty", text: "Open a chapter to get started." });
	}
}

/** The current book's title, with "#" resolved to its number among the series' "#"-titled books (same counter `renderSeriesList`'s rows use). */
function numberedBookTitle(app: App, ordered: TFolder[], unplaced: TFolder[], bookFolderName: string): string {
	const sequence = [...ordered, ...unplaced];
	const idx = sequence.findIndex((folder) => folder.name === bookFolderName);
	if (idx === -1) return bookDisplayTitle(app, bookFolderName);
	const numbered = applyHashNumbering(sequence.map((folder) => bookDisplayTitle(app, folder.name)));
	return numbered[idx];
}

function createRow(list: HTMLElement, key: string): HTMLElement {
	const row = list.createDiv({ cls: "sf-row" });
	row.dataset.key = key;
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");
	return row;
}

/** Renders a title, splitting off a "// subtitle" onto its own muted line if present. Returns the wrapper to pass to `attachInlineRename`. */
function renderRowTitle(row: HTMLElement, displayTitle: string): HTMLElement {
	const { title, subtitle } = splitTitleSubtitle(displayTitle);
	const wrap = row.createDiv({ cls: "sf-row-title-wrap" });
	wrap.createSpan({ cls: "sf-row-text", text: title });
	if (subtitle) {
		wrap.createDiv({ cls: "sf-row-subtitle", text: subtitle });
	}
	return wrap;
}

function renderUnplacedHeader(
	zone: HTMLElement,
	onCreateFile?: () => void,
	createIcon: string = ICON_PLUS_SQUARE,
	onOpenArchive?: () => void,
): void {
	const header = zone.createDiv({ cls: "sf-unplaced-header" });
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_UNPLACED);
	header.createSpan({ cls: "sf-header-unplaced", text: "Unplaced" });
	if (onCreateFile) {
		const newFileBtn = header.createSpan({
			cls: "sf-unplaced-new-file",
			attr: { "aria-label": "New" },
		});
		setIcon(newFileBtn, createIcon);
		newFileBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onCreateFile();
		});
		makeAccessibleActivatable(newFileBtn, () => onCreateFile());
	}
	if (onOpenArchive) {
		const archiveBtn = header.createSpan({
			cls: "sf-unplaced-archive-btn",
			attr: { "aria-label": "Archived chapters" },
		});
		setIcon(archiveBtn, ICON_ARCHIVE);
		archiveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onOpenArchive();
		});
		makeAccessibleActivatable(archiveBtn, () => onOpenArchive());
	}
}

async function handleCreateChapter(app: App, bookFolderName: string): Promise<void> {
	try {
		await createChapter(app, bookFolderName);
	} catch (err) {
		new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
	}
}

async function handleCreateBook(app: App): Promise<void> {
	try {
		await createBook(app);
	} catch (err) {
		new Notice(`storyForge: could not create book — ${(err as Error).message}`);
	}
}

function renderSeriesList(
	app: App,
	bodyEl: HTMLElement,
	ordered: TFolder[],
	unplaced: TFolder[],
	options: TopPanelOptions,
): void {
	const rawTitles = [...ordered, ...unplaced].map((folder) => bookDisplayTitle(app, folder.name));
	const numbered = applyHashNumbering(rawTitles);

	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	ordered.forEach((folder, i) => {
		const row = createRow(mainList, folder.name);
		const label = renderRowTitle(row, numbered[i]);
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
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a book here to sequence it." });
	}

	const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
	renderUnplacedHeader(unplacedZone, () => void handleCreateBook(app), ICON_BOOK_PLUS);
	const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
	unplaced.forEach((folder, i) => {
		const row = createRow(unplacedList, folder.name);
		const label = renderRowTitle(row, numbered[ordered.length + i]);
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

	const zones: DragZone[] = [
		{ key: "ordered", container: mainList },
		{ key: "unplaced", container: unplacedList },
	];
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void reorderSeriesBooks(app, (zoneRowKeys.ordered ?? []).filter(Boolean));
	});
}

function renderBookList(app: App, bodyEl: HTMLElement, bookFolderName: string, options: TopPanelOptions, container: HTMLElement): void {
	const { ordered, unplaced } = getBookChapters(app, bookFolderName);

	const rawTitles = [...ordered, ...unplaced].map((file) => chapterDisplayTitle(app, bookFolderName, file.name));
	const numbered = applyHashNumbering(rawTitles);

	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	(ordered as TFile[]).forEach((file, i) => {
		const row = createRow(mainList, file.name);
		const label = renderRowTitle(row, numbered[i]);
		if (options.highlightActiveChapter && options.activeChapterFilename === file.name) {
			row.addClass("sf-row-selected");
		}
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onOpenChapter(bookFolderName, file.name);
		});
		const archiveItem: ExtraMenuItem = {
			title: "Archive",
			onClick: async () => {
				await archiveChapter(app, bookFolderName, file.name);
				renderTopPanel(app, container, options);
				options.onArchiveChapter?.();
			},
		};
		attachInlineRename({
			row,
			label,
			getCurrentTitle: () => chapterDisplayTitle(app, bookFolderName, file.name),
			onCommit: (newTitle) => renameChapterTitle(app, bookFolderName, file.name, newTitle),
			extraMenuItems: [archiveItem],
		});
	});
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a chapter here to sequence it." });
	}

	const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
	renderUnplacedHeader(unplacedZone, () => void handleCreateChapter(app, bookFolderName), ICON_PLUS_SQUARE, options.onOpenArchive);
	const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
	(unplaced as TFile[]).forEach((file, i) => {
		const row = createRow(unplacedList, file.name);
		const label = renderRowTitle(row, numbered[ordered.length + i]);
		if (options.highlightActiveChapter && options.activeChapterFilename === file.name) {
			row.addClass("sf-row-selected");
		}
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onOpenChapter(bookFolderName, file.name);
		});
		const archiveItem: ExtraMenuItem = {
			title: "Archive",
			onClick: async () => {
				await archiveChapter(app, bookFolderName, file.name);
				renderTopPanel(app, container, options);
				options.onArchiveChapter?.();
			},
		};
		attachInlineRename({
			row,
			label,
			getCurrentTitle: () => chapterDisplayTitle(app, bookFolderName, file.name),
			onCommit: (newTitle) => renameChapterTitle(app, bookFolderName, file.name, newTitle),
			extraMenuItems: [archiveItem],
		});
	});

	const zones: DragZone[] = [
		{ key: "ordered", container: mainList },
		{ key: "unplaced", container: unplacedList },
	];
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void writeBookChapterOrder(app, bookFolderName, (zoneRowKeys.ordered ?? []).filter(Boolean));
	});
}