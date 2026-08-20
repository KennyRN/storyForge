import { App, Modal, Notice, setIcon, TFolder } from "obsidian";
import { getSeriesBooks, readSeriesFrontmatter, writeSeriesTitle } from "../series";
import { createBook, renameBookTitle, reorderSeriesBooks } from "../book";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_BOOK_PLUS } from "../icons";

/**
 * Builds the series-settings body (title, book list, reorder, add book) into `container`, clearing
 * it first. This is SeriesModal's own popup-dialog content only — the Series overview page
 * (SeriesOverviewView.ts) used to mirror this same function, but now has its own bespoke rendering
 * (fixed header + scrollable, filtered, synopsis-per-row list) that doesn't belong in a compact
 * popup, so the two have deliberately diverged. `bindTextCommit` below is still shared by both.
 */
export function renderSeriesSettingsBody(container: HTMLElement, app: App, onChange: () => void): void {
	container.empty();

	const titleRow = container.createDiv({ cls: "sf-modal-title-row" });
	const titleInput = titleRow.createEl("input", {
		cls: "sf-modal-input sf-modal-title-input",
		type: "text",
		attr: { placeholder: "Series Name" },
	});
	titleInput.value = readSeriesFrontmatter(app).seriesTitle;
	bindTextCommit(titleInput, async (value) => {
		await writeSeriesTitle(app, value);
		onChange();
	});

	const listHeader = container.createDiv({ cls: "sf-modal-list-header" });
	listHeader.createEl("h3", { text: "Books" });

	const hintRow = container.createDiv({ cls: "sf-modal-hint-row" });
	hintRow.createDiv({
		cls: "sf-modal-hint",
		text: "# inserts a counted number\n// breaks title into title and subtitle",
	});
	const addBookBtn = hintRow.createSpan({ cls: "sf-modal-add-book", attr: { "aria-label": "New book" } });
	setIcon(addBookBtn, ICON_BOOK_PLUS);
	const handleCreateBook = async () => {
		try {
			await createBook(app);
			onChange();
			renderSeriesSettingsBody(container, app, onChange);
		} catch (err) {
			new Notice(`storyForge: could not create book — ${(err as Error).message}`);
		}
	};
	addBookBtn.addEventListener("click", () => void handleCreateBook());
	makeAccessibleActivatable(addBookBtn, () => void handleCreateBook());

	const bookList = container.createDiv({ cls: "sf-modal-book-list" });
	const { ordered, unplaced } = getSeriesBooks(app);
	const books: TFolder[] = [...ordered, ...unplaced];
	for (const folder of books) {
		renderBookRow(bookList, app, folder, onChange);
	}
	if (books.length === 0) {
		bookList.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
	}

	const zones: DragZone[] = [{ key: "order", container: bookList }];
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void handleReorder(app, (zoneRowKeys.order ?? []).filter(Boolean), onChange, () =>
			renderSeriesSettingsBody(container, app, onChange),
		);
	});
}

function renderBookRow(bookList: HTMLElement, app: App, folder: TFolder, onChange: () => void): void {
	const row = bookList.createDiv({ cls: "sf-row" });
	row.dataset.key = folder.name;
	const handle = row.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");

	const entry = readSeriesFrontmatter(app).books[folder.name];
	const input = row.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
	input.value = entry?.bookTitle ?? folder.name;
	bindTextCommit(input, async (value) => {
		await renameBookTitle(app, folder.name, value);
		onChange();
	});
}

/** Shared by SeriesModal.ts's own rows and SeriesOverviewView.ts's title/book-title fields — commits
 * the trimmed value on blur or Enter, once only per focus. */
export function bindTextCommit(input: HTMLInputElement, onCommit: (value: string) => Promise<void>): void {
	let settled = false;
	const commit = async () => {
		if (settled) return;
		settled = true;
		const value = input.value.trim();
		if (value) await onCommit(value);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		}
	});
	input.addEventListener("blur", () => void commit());
	input.addEventListener("pointerdown", (event) => event.stopPropagation());
}

async function handleReorder(app: App, newOrder: string[], onChange: () => void, rerender: () => void): Promise<void> {
	try {
		await reorderSeriesBooks(app, newOrder);
		onChange();
	} catch (err) {
		new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
		rerender();
	}
}

/** Editable series-settings modal: series title, per-book titles, reordering, and creating new books. */
export class SeriesModal extends Modal {
	constructor(
		app: App,
		private onChange: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		// No isDragInProgress() guard here — see the matching comment in TagRegistryModal.render()
		// for why: nothing outside this modal ever calls render() on it, so guarding it only risks
		// turning an unrelated leaked lock into a permanently blank dialog on open.
		const { contentEl } = this;
		contentEl.addClass("sf-series-modal");
		renderSeriesSettingsBody(contentEl, this.app, this.onChange);
	}
}
