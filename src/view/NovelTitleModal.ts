import { App, Modal, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { renameBookTitle } from "../book";
import { readSeriesFrontmatter } from "../series";
import { bindTextCommit } from "./SeriesModal";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_DICE_DUAL } from "../icons";

/**
 * Opened by clicking a novel's title in the Series overview page's novel list
 * (SeriesOverviewView.ts's renderNovelRow) — that row now shows the title as plain formatted text
 * (numbered, subtitle in parentheses) rather than an editable box, so renaming moved here: the
 * text input that used to sit inline in the row, the "#"/"//" hint that used to sit under the
 * page's own "Novels" header, and a shortcut into titleForge's real generator (the dual-dice icon,
 * opened as its own modal window via TitleForgeController.openModal() — see TitleForgeModal.ts —
 * rather than swapping this whole modal for a main-area tab) for when a name doesn't come to mind
 * unaided.
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

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row" });
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

		contentEl.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});

		const diceBtn = contentEl.createSpan({ cls: "sf-titleforge-dice", attr: { "aria-label": "generate a title" } });
		setIcon(diceBtn, ICON_DICE_DUAL);
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

		window.setTimeout(() => input.focus(), 0);
	}
}
