import { App, Notice, TFile, TFolder, setIcon } from "obsidian";
import { bookDisplayTitle, getSeriesBooks } from "../series";
import { getBookChapters, reorderSeriesBooks, writeBookOrder } from "../book";
import { libraryBookPath } from "../paths";
import { makeReorderable, type DragZone } from "./dragReorder";
import { ICON_BOOK, ICON_FILTER, ICON_NEW_FILE, ICON_SERIES, ICON_UNPLACED } from "../icons";

export interface TopPanelOptions {
	mode: "book" | "series";
	currentBookFolderName: string | null;
	onToggleMode: () => void;
	onSelectBook: (bookFolderName: string) => void;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	onOpenSeriesModal: () => void;
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
	seriesLine.addEventListener("click", () => options.onToggleMode());

	const bookLine = header.createDiv({ cls: "sf-header-line sf-book-line" });
	setIcon(bookLine.createSpan({ cls: "sf-icon" }), ICON_BOOK);
	const bookTitle = options.currentBookFolderName ? bookDisplayTitle(app, options.currentBookFolderName) : "—";
	bookLine.createSpan({ cls: "sf-header-text", text: bookTitle });

	const bodyEl = container.createDiv({ cls: "sf-top-body" });

	if (options.mode === "series") {
		renderSeriesList(app, bodyEl, series.ordered, series.unplaced, series.orphans, options);
	} else if (options.currentBookFolderName) {
		renderBookList(app, bodyEl, options.currentBookFolderName, options);
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

function renderUnplacedHeader(zone: HTMLElement, onCreateFile?: () => void): void {
	const header = zone.createDiv({ cls: "sf-unplaced-header" });
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_UNPLACED);
	header.createSpan({ cls: "sf-unplaced-label", text: "Unplaced" });
	if (onCreateFile) {
		const newFileBtn = header.createSpan({
			cls: "sf-unplaced-new-file",
			attr: { "aria-label": "New file" },
		});
		setIcon(newFileBtn, ICON_NEW_FILE);
		newFileBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			onCreateFile();
		});
	}
}

async function createUnplacedChapter(app: App, bookFolderName: string): Promise<void> {
	const folderPath = libraryBookPath(bookFolderName);
	let filename = "Untitled.md";
	let n = 1;
	while (app.vault.getAbstractFileByPath(`${folderPath}/${filename}`)) {
		n += 1;
		filename = `Untitled ${n}.md`;
	}
	try {
		const file = await app.vault.create(`${folderPath}/${filename}`, "");
		await app.workspace.getLeaf(false).openFile(file);
	} catch (err) {
		new Notice(`storyForge: could not create file — ${(err as Error).message}`);
	}
}

function renderSeriesList(
	app: App,
	bodyEl: HTMLElement,
	ordered: TFolder[],
	unplaced: TFolder[],
	orphans: string[],
	options: TopPanelOptions,
): void {
	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	for (const folder of ordered) {
		const row = createRow(mainList, folder.name);
		row.createSpan({ cls: "sf-row-text", text: bookDisplayTitle(app, folder.name) });
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onSelectBook(folder.name);
		});
	}
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a book here to sequence it." });
	}

	const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
	renderUnplacedHeader(unplacedZone);
	const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
	for (const folder of unplaced) {
		const row = createRow(unplacedList, folder.name);
		row.createSpan({ cls: "sf-row-text", text: bookDisplayTitle(app, folder.name) });
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onSelectBook(folder.name);
		});
	}

	if (orphans.length > 0) {
		const orphanSection = bodyEl.createDiv({ cls: "sf-orphans" });
		for (const orphan of orphans) {
			orphanSection.createDiv({ cls: "sf-row sf-orphan", text: `${orphan} — book no longer exists` });
		}
	}

	const zones: DragZone[] = [
		{ key: "ordered", container: mainList },
		{ key: "unplaced", container: unplacedList },
	];
	makeReorderable(zones, ".sf-row:not(.sf-orphan)", ".sf-drag-handle", (zoneRowKeys) => {
		void reorderSeriesBooks(app, (zoneRowKeys.ordered ?? []).filter(Boolean));
	});
}

function renderBookList(app: App, bodyEl: HTMLElement, bookFolderName: string, options: TopPanelOptions): void {
	const { ordered, unplaced, orphans } = getBookChapters(app, bookFolderName);

	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	for (const file of ordered as TFile[]) {
		const row = createRow(mainList, file.name);
		row.createSpan({ cls: "sf-row-text", text: file.basename });
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onOpenChapter(bookFolderName, file.name);
		});
	}
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a chapter here to sequence it." });
	}

	const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
	renderUnplacedHeader(unplacedZone, () => void createUnplacedChapter(app, bookFolderName));
	const unplacedList = unplacedZone.createDiv({ cls: "sf-top-list sf-unplaced-list" });
	for (const file of unplaced as TFile[]) {
		const row = createRow(unplacedList, file.name);
		row.createSpan({ cls: "sf-row-text", text: file.basename });
		row.addEventListener("click", (e) => {
			if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
			options.onOpenChapter(bookFolderName, file.name);
		});
	}

	if (orphans.length > 0) {
		const orphanSection = bodyEl.createDiv({ cls: "sf-orphans" });
		for (const orphan of orphans) {
			orphanSection.createDiv({ cls: "sf-row sf-orphan", text: `${orphan} — ordered chapter no longer exists` });
		}
	}

	const zones: DragZone[] = [
		{ key: "ordered", container: mainList },
		{ key: "unplaced", container: unplacedList },
	];
	makeReorderable(zones, ".sf-row:not(.sf-orphan)", ".sf-drag-handle", (zoneRowKeys) => {
		void writeBookOrder(app, bookFolderName, (zoneRowKeys.ordered ?? []).filter(Boolean));
	});
}
