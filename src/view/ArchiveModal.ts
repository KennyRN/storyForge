import { App, Modal, setIcon, setTooltip, TFile } from "obsidian";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle } from "../book";
import { formatSingleLine } from "../titleNumbering";
import { ICON_ARCHIVE, ICON_UNARCHIVE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { libraryChapterPath } from "../paths";
import { excerpt } from "../wordCount";

/**
 * Modal listing the archived chapters for a single book.
 * Each row shows the chapter title with a "+" button that unarchives it and refreshes the list.
 * Chapter titles have "//" replaced with ":". Hovering a row shows a preview of its opening text.
 */
export class ArchiveModal extends Modal {
	private onChange: () => void;
	private bookFolderName: string;
	private archived: ReturnType<typeof getArchivedChapters> = [];

	constructor(
		app: App,
		bookFolderName: string,
		onChange: () => void,
	) {
		super(app);
		this.bookFolderName = bookFolderName;
		this.onChange = onChange;
	}

	onOpen(): void {
		// This modal never sets a title, but Obsidian still reserves layout space for the
		// (empty) title row above modal-content, making the top padding look larger than the
		// other three sides. The close button lives in a separate sibling element, so removing
		// this doesn't affect closing the modal.
		this.titleEl.remove();
		this.archived = getArchivedChapters(this.app, this.bookFolderName);
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async attachExcerptTooltip(el: HTMLElement, bookFolderName: string, filename: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, filename));
		if (!(file instanceof TFile)) return;
		const preview = excerpt(await this.app.vault.cachedRead(file));
		if (preview) setTooltip(el, preview);
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-archive-modal");

		const headerRow = contentEl.createDiv({ cls: "sf-archive-modal-header" });
		setIcon(headerRow.createSpan({ cls: "sf-icon" }), ICON_ARCHIVE);
		headerRow.createEl("h2", { text: "Archived Chapters" });

		if (this.archived.length === 0) {
			contentEl.createDiv({ cls: "sf-empty", text: "No archived chapters." });
			return;
		}

		const list = contentEl.createDiv({ cls: "sf-archive-list" });
		for (const entry of this.archived) {
			const row = list.createDiv({ cls: "sf-row" });
			const chapterLabel = formatSingleLine(chapterDisplayTitle(this.app, entry.bookFolderName, entry.filename));
			row.createSpan({
				cls: "sf-archive-label",
				text: chapterLabel,
			});
			void this.attachExcerptTooltip(row, entry.bookFolderName, entry.filename);
			const unarchiveBtn = row.createSpan({
				cls: "sf-archive-unarchive-btn",
				attr: { "aria-label": "Unarchive" },
			});
			setIcon(unarchiveBtn, ICON_UNARCHIVE);
			const handleUnarchive = async () => {
				await unarchiveChapter(this.app, entry.bookFolderName, entry.filename);
				this.archived = this.archived.filter(
					(a) => !(a.bookFolderName === entry.bookFolderName && a.filename === entry.filename),
				);
				this.onChange();
				this.render();
			};
			unarchiveBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void handleUnarchive();
			});
			makeAccessibleActivatable(unarchiveBtn, () => void handleUnarchive());
		}
	}
}