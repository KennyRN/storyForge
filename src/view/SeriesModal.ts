import { App, Modal, Notice, setIcon, TFolder } from "obsidian";
import { getSeriesBooks, readSeriesFrontmatter, writeSeriesTitle } from "../series";
import { createBook, renameBookTitle, reorderSeriesBooks } from "../book";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_BOOK_PLUS } from "../icons";

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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-series-modal");

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row" });
		const titleInput = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Series Name" },
		});
		titleInput.value = readSeriesFrontmatter(this.app).seriesTitle;
		this.bindTextCommit(titleInput, async (value) => {
			await writeSeriesTitle(this.app, value);
			this.onChange();
		});

		const listHeader = contentEl.createDiv({ cls: "sf-modal-list-header" });
		listHeader.createEl("h3", { text: "Books" });

		const hintRow = contentEl.createDiv({ cls: "sf-modal-hint-row" });
		hintRow.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});
		const addBookBtn = hintRow.createSpan({ cls: "sf-modal-add-book", attr: { "aria-label": "New book" } });
		setIcon(addBookBtn, ICON_BOOK_PLUS);
		addBookBtn.addEventListener("click", () => void this.handleCreateBook());
		makeAccessibleActivatable(addBookBtn, () => void this.handleCreateBook());

		const bookList = contentEl.createDiv({ cls: "sf-modal-book-list" });
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const books: TFolder[] = [...ordered, ...unplaced];
		for (const folder of books) {
			this.renderBookRow(bookList, folder);
		}
		if (books.length === 0) {
			bookList.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
		}

		const zones: DragZone[] = [{ key: "order", container: bookList }];
		makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder((zoneRowKeys.order ?? []).filter(Boolean));
		});
	}

	private renderBookRow(bookList: HTMLElement, folder: TFolder): void {
		const row = bookList.createDiv({ cls: "sf-row" });
		row.dataset.key = folder.name;
		const handle = row.createSpan({ cls: "sf-drag-handle" });
		setIcon(handle, "grip-vertical");

		const entry = readSeriesFrontmatter(this.app).books[folder.name];
		const input = row.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
		input.value = entry?.bookTitle ?? folder.name;
		this.bindTextCommit(input, async (value) => {
			await renameBookTitle(this.app, folder.name, value);
			this.onChange();
		});
	}

	private bindTextCommit(input: HTMLInputElement, onCommit: (value: string) => Promise<void>): void {
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

	private async handleCreateBook(): Promise<void> {
		try {
			await createBook(this.app);
			this.onChange();
			this.render();
		} catch (err) {
			new Notice(`storyForge: could not create book — ${(err as Error).message}`);
		}
	}

	private async handleReorder(newOrder: string[]): Promise<void> {
		try {
			await reorderSeriesBooks(this.app, newOrder);
			this.onChange();
		} catch (err) {
			new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
			this.render();
		}
	}
}
