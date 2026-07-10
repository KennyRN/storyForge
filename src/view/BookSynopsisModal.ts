import { App, Modal } from "obsidian";
import { readBookSynopsis, writeBookSynopsis } from "../book";

/** Editable synopsis modal for a book, opened from the novel library pane's book-line settings button. */
export class BookSynopsisModal extends Modal {
	constructor(
		app: App,
		private bookFolderName: string,
		private onChange: () => void,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass("sf-book-synopsis-modal");
		contentEl.createEl("h3", { text: "Synopsis" });

		const textarea = contentEl.createEl("textarea", { cls: "sf-modal-textarea" });
		textarea.value = await readBookSynopsis(this.app, this.bookFolderName);
		textarea.addEventListener("blur", () => void this.commit(textarea.value));
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
	}

	private async commit(value: string): Promise<void> {
		await writeBookSynopsis(this.app, this.bookFolderName, value);
		this.onChange();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
