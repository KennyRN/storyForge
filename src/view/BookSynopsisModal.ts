import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import { readBookFrontmatter, readBookSynopsis, writeBookCoverImage, writeBookSynopsis } from "../book";
import { bookBackstagePath } from "../paths";
import { bookDisplayTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { ICON_TIMELINE } from "../icons";

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
		contentEl.addClass("sf-text-style-modal");

		const bookLine = contentEl.createDiv({ cls: "sf-book-line sf-synopsis-book-title" });
		const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const rawTitle = bookDisplayTitle(this.app, this.bookFolderName);
		const { title, subtitle } = splitTitleSubtitle(rawTitle);
		const textWrap = titleRow.createDiv({ cls: "sf-book-text-wrap" });
		textWrap.createSpan({ cls: "sf-header-text", text: title });
		if (subtitle) {
			bookLine.createDiv({ cls: "sf-book-subtitle-text", text: subtitle });
		}

		const body = contentEl.createDiv({ cls: "sf-synopsis-body" });
		const cover = body.createDiv({ cls: "sf-synopsis-cover" });
		this.renderCover(cover);
		cover.addEventListener("click", () => this.pickCoverImage(cover));

		const textarea = body.createEl("textarea", { cls: "sf-modal-textarea" });
		textarea.value = await readBookSynopsis(this.app, this.bookFolderName);
		textarea.addEventListener("blur", () => void this.commit(textarea.value));
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());

		const plotLine = contentEl.createDiv({ cls: "sf-book-line sf-synopsis-plot-title" });
		setIcon(plotLine.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
		const plotTitleRow = plotLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const plotTextWrap = plotTitleRow.createDiv({ cls: "sf-book-text-wrap" });
		plotTextWrap.createSpan({ cls: "sf-header-text", text: "Plot" });
	}

	private renderCover(cover: HTMLElement): void {
		cover.empty();
		const coverImage = readBookFrontmatter(this.app, this.bookFolderName)?.coverImage ?? null;
		const file = coverImage
			? this.app.vault.getAbstractFileByPath(`${bookBackstagePath(this.bookFolderName)}/${coverImage}`)
			: null;
		if (file instanceof TFile) {
			cover.addClass("has-image");
			cover.createEl("img", { attr: { src: this.app.vault.getResourcePath(file) } });
		} else {
			cover.removeClass("has-image");
		}
	}

	private pickCoverImage(cover: HTMLElement): void {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (!file) return;
			if (!file.type.startsWith("image/")) {
				new Notice("storyForge: please choose an image file for the cover.");
				return;
			}
			void (async () => {
				try {
					const data = await file.arrayBuffer();
					const dotIndex = file.name.lastIndexOf(".");
					const extension =
						dotIndex !== -1 ? file.name.slice(dotIndex + 1).toLowerCase() : file.type.split("/")[1] || "png";
					await writeBookCoverImage(this.app, this.bookFolderName, data, extension);
					this.renderCover(cover);
				} catch (err) {
					new Notice(`storyForge: could not set cover image — ${(err as Error).message}`);
				}
			})();
		});
		input.click();
	}

	private async commit(value: string): Promise<void> {
		await writeBookSynopsis(this.app, this.bookFolderName, value);
		this.onChange();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
