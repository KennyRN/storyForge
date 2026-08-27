import { App, Modal, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { renameBookTitle } from "../book";
import { readSeriesFrontmatter, writeSeriesBookColor } from "../series";
import { bindTextCommit } from "./SeriesModal";
import { bindColorSwatchButton } from "./styleModalHelpers";
import { resolveNovelRowColor } from "./novelColor";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_DICE } from "../icons";

/**
 * Opened by clicking a novel's title in the Series overview page's novel list
 * (SeriesOverviewView.ts's renderNovelRow) — that row now shows the title as plain formatted text
 * (numbered, subtitle in parentheses) rather than an editable box, so renaming moved here: the
 * text input that used to sit inline in the row, the "#"/"//" hint that used to sit on the
 * overview page itself, and a shortcut into titleForge's real generator (the dual-dice icon,
 * opened as its own modal window via TitleForgeController.openModal() — see TitleForgeModal.ts —
 * rather than swapping this whole modal for a main-area tab) for when a name doesn't come to mind
 * unaided.
 *
 * Also where the row's own colour lives (colorRow, below the hint): a plain palette swatch button
 * (bindColorSwatchButton, same widget the formatting tabs use) against the plugin's live colour
 * palette. resolveNovelRowColor (novelColor.ts) supplies its starting value — the novel's stored
 * colour, or else that function's own random-looking per-novel default — so the swatch always
 * opens already showing the novel's actual current row colour, not a placeholder. Picking one here
 * (writeSeriesBookColor) is the only thing that ever persists a colour for this novel.
 *
 * The dice icon sits inline at the end of the title box itself (not below it) — `ICON_DICE`, the
 * same glyph titleForge's own "Generate" button (TitleForgePanel.ts) uses, rather than
 * ICON_DICE_DUAL (SeriesTitleModal.ts's own trigger, unchanged). Pressing Enter in the title box
 * commits the rename (bindTextCommit's own blur-triggered commit, unaffected) and then closes this
 * modal — every other bindTextCommit field (SeriesModal's book rows, SeriesOverviewView's inline
 * fields) just settles in place on Enter, so that close() is this modal's own added listener, not a
 * change to the shared helper.
 */
export class NovelTitleModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private folderName: string,
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
		contentEl.addClass("sf-novel-title-modal");

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row sf-novel-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Novel title" },
		});
		input.value = readSeriesFrontmatter(this.app).books[this.folderName]?.bookTitle ?? this.folderName;
		bindTextCommit(input, async (value) => {
			await renameBookTitle(this.app, this.folderName, value);
			this.onChange();
		});
		// Enter commits (bindTextCommit's own blur-triggered path, above) and also closes the modal —
		// added here rather than in bindTextCommit itself, which other fields share without wanting
		// that (SeriesModal's book rows, SeriesOverviewView's inline title/synopsis fields).
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") this.close();
		});

		const diceBtn = titleRow.createSpan({
			cls: "sf-titleforge-dice sf-titleforge-dice--inline",
			attr: { "aria-label": "generate a title" },
		});
		setIcon(diceBtn, ICON_DICE);
		setTooltip(diceBtn, "generate a title");
		const openTitleForge = () => {
			this.close();
			this.plugin.titleForge.openModal({
				scope: "novels",
				onUse: (title) => {
					void renameBookTitle(this.app, this.folderName, title).then(() => this.onChange());
				},
			});
		};
		diceBtn.addEventListener("click", openTitleForge);
		makeAccessibleActivatable(diceBtn, openTitleForge);

		contentEl.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});

		const rowColor = resolveNovelRowColor(this.app, this.folderName, this.plugin.getSettings());
		if (rowColor) {
			const colorRow = contentEl.createDiv({ cls: "sf-novel-title-color-row" });
			colorRow.createSpan({ cls: "sf-modal-hint", text: "novel colour" });
			const colorBtn = colorRow.createEl("button", { cls: "sf-color-swatch-btn", attr: { "aria-label": "novel colour" } });
			bindColorSwatchButton(this.app, this.plugin, colorBtn, rowColor.background, (hex) => {
				void writeSeriesBookColor(this.app, this.folderName, hex).then(() => this.onChange());
			});
		}

		window.setTimeout(() => input.focus(), 0);
	}
}
