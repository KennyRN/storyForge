import { App, Modal, setIcon, TFolder } from "obsidian";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle } from "../book";
import { getSeriesBooks, bookDisplayTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";

/**
 * Modal listing every archived chapter across all books.
 * Each row shows "<<book name>> — <<chapter title>>" with a "+" button
 * that unarchives the chapter and refreshes the list.
 * Book titles have "#" resolved to their series number and "//" replaced with ":".
 * Chapter titles also have "//" replaced with ":".
 */
export class ArchiveModal extends Modal {
	private onChange: () => void;

	constructor(
		app: App,
		onChange: () => void,
	) {
		super(app);
		this.onChange = onChange;
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/** Returns a display-ready book title with "#" numbering resolved and "//" → ":". */
	private displayBookTitle(bookFolderName: string): string {
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const sequence = [...ordered, ...unplaced];
		const actualTitles = sequence.map((folder: TFolder) => bookDisplayTitle(this.app, folder.name));
		const numbered = applyHashNumbering(actualTitles);
		const idx = sequence.findIndex((folder: TFolder) => folder.name === bookFolderName);
		const raw = idx !== -1 ? numbered[idx] : bookDisplayTitle(this.app, bookFolderName);
		const { title, subtitle } = splitTitleSubtitle(raw);
		return subtitle ? `${title}: ${subtitle}` : title;
	}

	/** Returns a display-ready chapter title with "//" → ":". */
	private displayChapterTitle(bookFolderName: string, filename: string): string {
		const raw = chapterDisplayTitle(this.app, bookFolderName, filename);
		const { title, subtitle } = splitTitleSubtitle(raw);
		return subtitle ? `${title}: ${subtitle}` : title;
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-archive-modal");

		contentEl.createEl("h2", { text: "Archived Chapters" });

		const archived = getArchivedChapters(this.app);

		if (archived.length === 0) {
			contentEl.createDiv({ cls: "sf-empty", text: "No archived chapters." });
			return;
		}

		const list = contentEl.createDiv({ cls: "sf-archive-list" });
		for (const entry of archived) {
			const row = list.createDiv({ cls: "sf-row" });
			const bookLabel = this.displayBookTitle(entry.bookFolderName);
			const chapterLabel = this.displayChapterTitle(entry.bookFolderName, entry.filename);
			const label = row.createSpan({
				cls: "sf-archive-label",
				text: `${bookLabel} — ${chapterLabel}`,
			});
			// "+" button to unarchive
			const unarchiveBtn = row.createSpan({
				cls: "sf-archive-unarchive-btn",
				attr: { "aria-label": "Unarchive" },
			});
			setIcon(unarchiveBtn, "plus");
			unarchiveBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await unarchiveChapter(this.app, entry.bookFolderName, entry.filename);
				this.onChange();
				this.render();
			});
		}
	}
}