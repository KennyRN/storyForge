import { App, Modal, Notice, setIcon, TFile } from "obsidian";
import {
	getBookChapters,
	getChapterEntry,
	numberedChapterTitle,
	readBookSynopsis,
	readBookFrontmatter,
	readChapterPlot,
	renameBookTitle,
	writeBookCoverImage,
	writeBookSynopsis,
	writeChapterLocation,
	writeChapterPlot,
	writeChapterPov,
} from "../book";
import { getCodexEntriesByType } from "../codex";
import { bookBackstagePath } from "../paths";
import { bookDisplayTitle, getBookId, numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { ICON_MAP_PIN, ICON_MAP_PIN_PLUS, ICON_PERSON_FILL_ADD, ICON_TIMELINE } from "../icons";
import { attachInlineRename } from "./inlineRename";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";

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
		this.renderTitleBlock(bookLine);

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

		const plotPane = contentEl.createDiv({ cls: "sf-synopsis-plot-pane" });
		await this.renderPlotPane(plotPane);
	}

	private renderTitleBlock(bookLine: HTMLElement): void {
		bookLine.empty();
		const titleRow = bookLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
		const numberedTitle = numberedBookTitle(this.app, this.bookFolderName);
		const { title, subtitle } = splitTitleSubtitle(numberedTitle);
		const textWrap = titleRow.createDiv({ cls: "sf-book-text-wrap" });
		const titleLabel = textWrap.createSpan({ cls: "sf-header-text", text: title });
		if (subtitle) {
			bookLine.createDiv({ cls: "sf-book-subtitle-text", text: subtitle });
		}

		const renameBtn = titleRow.createSpan({
			cls: "sf-book-filter-btn sf-synopsis-rename-btn",
			attr: { "aria-label": "Rename novel" },
		});
		setIcon(renameBtn, "pencil");

		attachInlineRename({
			row: titleRow,
			label: titleLabel,
			getCurrentTitle: () => bookDisplayTitle(this.app, this.bookFolderName),
			onCommit: async (newTitle) => {
				await renameBookTitle(this.app, this.bookFolderName, newTitle);
				this.onChange();
				this.renderTitleBlock(bookLine);
			},
			trigger: renameBtn,
		});
	}

	private async renderPlotPane(pane: HTMLElement): Promise<void> {
		pane.empty();
		const { ordered } = getBookChapters(this.app, this.bookFolderName);
		if (ordered.length === 0) {
			pane.createDiv({ cls: "sf-empty sf-empty-inline", text: "No placed chapters yet." });
			return;
		}
		for (const file of ordered) {
			const block = pane.createDiv({ cls: "sf-plot-chapter-block" });
			const titleRow = block.createDiv({ cls: "sf-plot-chapter-title" });
			titleRow.createSpan({ text: numberedChapterTitle(this.app, this.bookFolderName, file.name) });
			const povWrap = titleRow.createSpan({ cls: "sf-plot-chapter-pov" });
			this.paintPovBadge(povWrap, file.name);
			const locWrap = titleRow.createSpan({ cls: "sf-plot-chapter-location" });
			this.paintLocationBadge(locWrap, file.name);

			const textarea = block.createEl("textarea", { cls: "sf-modal-textarea sf-plot-chapter-textarea" });
			textarea.value = await readChapterPlot(this.app, this.bookFolderName, file.name);
			textarea.addEventListener("blur", () => void writeChapterPlot(this.app, this.bookFolderName, file.name, textarea.value));
			textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
		}
	}

	private paintPovBadge(povWrap: HTMLElement, filename: string): void {
		const entry = getChapterEntry(this.app, this.bookFolderName, filename);
		this.renderPovBadgeContent(povWrap, filename, entry?.povPath ?? null, entry?.povName ?? null);
	}

	private renderPovBadgeContent(
		povWrap: HTMLElement,
		filename: string,
		povPath: string | null,
		povName: string | null,
	): void {
		povWrap.empty();
		povWrap.createSpan({ text: "(PoV: " });
		if (povPath) {
			const nameBtn = povWrap.createSpan({ cls: "sf-plot-chapter-badge-value", text: povName ?? povPath });
			nameBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openPovPicker(filename, povWrap, true);
			});
		} else {
			const addBtn = povWrap.createSpan({
				cls: "sf-book-filter-btn sf-plot-chapter-pov-btn",
				attr: { "aria-label": "Set PoV" },
			});
			setIcon(addBtn, ICON_PERSON_FILL_ADD);
			addBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openPovPicker(filename, povWrap, false);
			});
		}
		povWrap.createSpan({ text: ")" });
	}

	private async openPovPicker(filename: string, povWrap: HTMLElement, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, this.bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterPov(this.app, this.bookFolderName, filename, entry.path, entry.name);
				this.renderPovBadgeContent(povWrap, filename, entry.path, entry.name);
			},
			async () => {
				await writeChapterPov(this.app, this.bookFolderName, filename, null, null);
				this.renderPovBadgeContent(povWrap, filename, null, null);
			},
		).open();
	}

	private paintLocationBadge(locWrap: HTMLElement, filename: string): void {
		const entry = getChapterEntry(this.app, this.bookFolderName, filename);
		this.renderLocationBadgeContent(locWrap, filename, entry?.locationPath ?? null, entry?.locationName ?? null);
	}

	private renderLocationBadgeContent(
		locWrap: HTMLElement,
		filename: string,
		locationPath: string | null,
		locationName: string | null,
	): void {
		locWrap.empty();
		if (locationPath) {
			const badge = locWrap.createSpan({ cls: "sf-plot-chapter-badge-value" });
			setIcon(badge.createSpan({ cls: "sf-icon" }), ICON_MAP_PIN);
			badge.createSpan({ text: locationName ?? locationPath });
			badge.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openLocationPicker(filename, locWrap, true);
			});
		} else {
			const addBtn = locWrap.createSpan({
				cls: "sf-book-filter-btn sf-plot-chapter-pov-btn",
				attr: { "aria-label": "Set location" },
			});
			setIcon(addBtn, ICON_MAP_PIN_PLUS);
			addBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.openLocationPicker(filename, locWrap, false);
			});
		}
	}

	private async openLocationPicker(filename: string, locWrap: HTMLElement, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, this.bookFolderName);
		const entries = getCodexEntriesByType(this.app, "place", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set location",
			"No place entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterLocation(this.app, this.bookFolderName, filename, entry.path, entry.name);
				this.renderLocationBadgeContent(locWrap, filename, entry.path, entry.name);
			},
			async () => {
				await writeChapterLocation(this.app, this.bookFolderName, filename, null, null);
				this.renderLocationBadgeContent(locWrap, filename, null, null);
			},
		).open();
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
