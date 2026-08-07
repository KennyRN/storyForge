import { App, Menu, Notice, TFile, TFolder, setIcon } from "obsidian";
import { bookDisplayTitle, getSeriesBooks, numberedBookTitle } from "../series";
import {
	archiveChapter,
	chapterDisplayTitle,
	createBook,
	getBookChapters,
	readBookFrontmatter,
	renameBookTitle,
	renameChapterTitle,
	reorderSeriesBooks,
	writeBookChapterOrder,
} from "../book";
import { createContinuingChapter, createIdeaChapter } from "../chapterCreation";
import { bookBackstagePath } from "../paths";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { ChapterIdeaCaptureModal } from "./ChapterIdeaCaptureModal";
import { renderCodexFocusNavigator } from "./CodexFocusNavigator";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { ICON_BOOK, ICON_BOOK_PLUS, ICON_FILTER, ICON_LAYOUT_SELECTOR, ICON_PLUS_SQUARE, ICON_SERIES, ICON_UNPLACED } from "../icons";
import { recordChapterArchive, readChapterWordCount } from "../history";
import { SF_LAYOUTS, SF_LAYOUT_LABELS, type SfLayout } from "../layout";

export type UnplacedViewMode = "unplaced" | "unplacedHidden";

export interface TopPanelOptions {
	/** "navigator" is Codex focus's compact three-chapter navigator (renderCodexFocusNavigator),
	 * not the full chapter tree — everything else about the header (book-line, layout selector)
	 * behaves exactly as it does for "novel". */
	mode: "series" | "novel" | "navigator";
	hideSeriesPane: boolean;
	/** Layout-level gate for the whole unplaced section (hand-off brief §2) — distinct from `unplacedMode`,
	 * which is the user's own collapse/expand toggle within a layout that shows the section at all. */
	showUnplacedSection: boolean;
	/** The active layout, so the selector menu can tick it and the series-mode settings icon can gate itself. */
	layout: SfLayout;
	currentBookFolderName: string | null;
	activeChapterFilename: string | null;
	highlightActiveChapter: boolean;
	unplacedMode: UnplacedViewMode;
	onSelectLayout: (layout: SfLayout) => void;
	onToggleUnplacedMode: () => void;
	onSelectBook: (bookFolderName: string) => void;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	onOpenSeriesModal: () => void;
	/** Codex focus's forward-only `[+]`: create a chapter, append it to the end of chapter-order, open it. */
	onCreateContinuingChapter: (bookFolderName: string) => void;
	onArchiveChapter?: () => void | Promise<void>;
	/** Codex-focus navigator's continuous read-and-write mode (continuous-mode hand-off brief §2) —
	 * meaningless outside "navigator" mode but always threaded through so StoryForgeView owns the state. */
	continuousMode: boolean;
	continuousCurrentFilename: string | null;
	onToggleContinuousMode: () => void;
	onExitContinuousMode: (bookFolderName: string, filename: string) => void;
	onContinuousPositionChange: (filename: string) => void;
	registerContinuousCleanup: (dispose: () => void) => void;
}

/** Builds the four-layout selector menu, ticking whichever is currently active. */
function buildLayoutMenu(current: SfLayout, onSelect: (layout: SfLayout) => void): Menu {
	const menu = new Menu();
	for (const layout of SF_LAYOUTS) {
		menu.addItem((item) =>
			item
				.setTitle(SF_LAYOUT_LABELS[layout])
				.setChecked(layout === current)
				.onClick(() => onSelect(layout)),
		);
	}
	return menu;
}

export function renderTopPanel(app: App, container: HTMLElement, options: TopPanelOptions): void {
	container.empty();

	const series = getSeriesBooks(app);

	const header = container.createDiv({ cls: "sf-top-header" });

	if (!options.hideSeriesPane) {
		const seriesLine = header.createDiv({ cls: "sf-header-line sf-series-line" });
		setIcon(seriesLine.createSpan({ cls: "sf-icon" }), ICON_SERIES);
		seriesLine.createSpan({ cls: "sf-header-text", text: series.seriesTitle });

		const layoutBtn = seriesLine.createSpan({ cls: "sf-series-filter-btn", attr: { "aria-label": "Choose layout" } });
		setIcon(layoutBtn, ICON_LAYOUT_SELECTOR);
		layoutBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			buildLayoutMenu(options.layout, options.onSelectLayout).showAtMouseEvent(e);
		});
		makeAccessibleActivatable(layoutBtn, () => {
			const rect = layoutBtn.getBoundingClientRect();
			buildLayoutMenu(options.layout, options.onSelectLayout).showAtPosition({ x: rect.left, y: rect.bottom });
		});

		// Series settings live here and nowhere else — relevant only while browsing the series list itself.
		if (options.layout === "seriesBrowse") {
			const settingsBtn = seriesLine.createSpan({ cls: "sf-series-settings-btn", attr: { "aria-label": "Series settings" } });
			setIcon(settingsBtn, ICON_FILTER);
			settingsBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				options.onOpenSeriesModal();
			});
			makeAccessibleActivatable(settingsBtn, () => options.onOpenSeriesModal());
		}
	}

	if (options.mode !== "series") {
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
		} else {
			setIcon(bookLine.createSpan({ cls: "sf-icon" }), ICON_BOOK);
		}
		const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const rawBookTitle = options.currentBookFolderName
			? numberedBookTitle(app, options.currentBookFolderName, { ordered: series.ordered, unplaced: series.unplaced })
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
			onOpenChapter: options.onOpenChapter,
			onCreateContinuing: options.onCreateContinuingChapter,
			continuousMode: options.continuousMode,
			continuousCurrentFilename: options.continuousCurrentFilename,
			onToggleContinuousMode: options.onToggleContinuousMode,
			onExitContinuousMode: options.onExitContinuousMode,
			onContinuousPositionChange: options.onContinuousPositionChange,
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
	container: HTMLElement,
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

	const zones: DragZone[] = [{ key: "ordered", container: mainList }];
	if (options.showUnplacedSection) {
		const unplacedZone = bodyEl.createDiv({ cls: "sf-unplaced-zone" });
		const unplacedHidden = options.unplacedMode === "unplacedHidden";
		renderUnplacedHeader(
			unplacedZone,
			"Unplaced Novels",
			unplacedHidden,
			options.onToggleUnplacedMode,
			() => void handleCreateBook(app),
			ICON_BOOK_PLUS,
		);

		if (!unplacedHidden) {
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
			zones.push({ key: "unplaced", container: unplacedList });
		}
	}

	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void (async () => {
			try {
				await reorderSeriesBooks(app, (zoneRowKeys.ordered ?? []).filter(Boolean));
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
	const numbered = applyHashNumbering(rawTitles);

	const mainList = bodyEl.createDiv({ cls: "sf-top-list" });
	ordered.forEach((file, i) => {
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
			extraMenuItems: [archiveItem],
		});
	});
	if (ordered.length === 0) {
		mainList.createDiv({ cls: "sf-empty sf-empty-inline", text: "Drag a chapter here to sequence it." });
	}

	const zones: DragZone[] = [{ key: "ordered", container: mainList }];
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
				row.addEventListener("click", (e) => {
					if (row.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
					options.onOpenChapter(bookFolderName, file.name);
				});
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
					extraMenuItems: [archiveItem],
				});
			});
			zones.push({ key: "unplaced", container: unplacedList });
		}
	}

	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void (async () => {
			try {
				await writeBookChapterOrder(app, bookFolderName, (zoneRowKeys.ordered ?? []).filter(Boolean));
			} catch (err) {
				new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
				renderTopPanel(app, container, options);
			}
		})();
	});
}