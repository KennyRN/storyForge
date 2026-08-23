import { App, Modal } from "obsidian";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, renameChapterTitle, writeChapterColor } from "../book";
import { bindTextCommit } from "./SeriesModal";
import { bindColorSwatchButton } from "./styleModalHelpers";
import { resolveChapterRowColor } from "./novelColor";

/**
 * Opened by clicking a chapter's title on the storyLibrary panel's Novel-overview page
 * (NovelPanel.ts's renderNovelPlot, `wide` layout) — same shape as NovelTitleModal (the title
 * input, the "#"/"//" hint, a colour swatch), minus the dice button: chapters have no titleForge
 * generator of their own to jump to, so this is just rename + colour.
 *
 * The colour swatch's starting value comes from resolveChapterRowColor (novelColor.ts) — the
 * chapter's own stored colour if it has one, else the book's shared colour every one of its
 * chapters defaults to. Picking one here (writeChapterColor) is the only thing that ever persists
 * a colour override for this one chapter; the book's other chapters are unaffected.
 */
export class ChapterTitleModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private bookFolderName: string,
		private filename: string,
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
		contentEl.addClass("sf-chapter-title-modal");

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row sf-chapter-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Chapter title" },
		});
		input.value = chapterDisplayTitle(this.app, this.bookFolderName, this.filename);
		bindTextCommit(input, async (value) => {
			await renameChapterTitle(this.app, this.bookFolderName, this.filename, value);
			this.onChange();
		});
		// Enter commits (bindTextCommit's own blur-triggered path, above) and also closes the modal —
		// same added behaviour as NovelTitleModal's own title input.
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") this.close();
		});

		contentEl.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});

		const rowColor = resolveChapterRowColor(this.app, this.bookFolderName, this.filename, this.plugin.getSettings());
		if (rowColor) {
			const colorRow = contentEl.createDiv({ cls: "sf-novel-title-color-row" });
			colorRow.createSpan({ cls: "sf-modal-hint", text: "chapter colour" });
			const colorBtn = colorRow.createEl("button", { cls: "sf-color-swatch-btn", attr: { "aria-label": "chapter colour" } });
			bindColorSwatchButton(this.app, this.plugin, colorBtn, rowColor.background, (hex) => {
				void writeChapterColor(this.app, this.bookFolderName, this.filename, hex).then(() => this.onChange());
			});
		}

		window.setTimeout(() => input.focus(), 0);
	}
}
