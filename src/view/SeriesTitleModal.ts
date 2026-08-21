import { App, Modal, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import { readSeriesFrontmatter, writeSeriesTitle } from "../series";
import { bindTextCommit } from "./SeriesModal";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_DICE_DUAL } from "../icons";

/**
 * Opened by clicking the series title at the top of the Series overview page
 * (SeriesOverviewView.ts's renderTitleField) — mirrors NovelTitleModal.ts's own title-rename
 * modal: a text input (no "#"/"//" hint here, unlike a novel's title — the series title has no
 * numbering/subtitle syntax of its own) plus a shortcut into titleForge's real generator, opened
 * as its own modal window via TitleForgeController.openModal() rather than swapping this whole
 * modal for a main-area tab.
 */
export class SeriesTitleModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
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
		contentEl.addClass("sf-series-title-modal");

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Series Name" },
		});
		input.value = readSeriesFrontmatter(this.app).seriesTitle;
		bindTextCommit(input, async (value) => {
			await writeSeriesTitle(this.app, value);
			this.onChange();
		});

		const diceBtn = contentEl.createSpan({ cls: "sf-titleforge-dice", attr: { "aria-label": "generate a title" } });
		setIcon(diceBtn, ICON_DICE_DUAL);
		setTooltip(diceBtn, "generate a title");
		const openTitleForge = () => {
			this.close();
			this.plugin.titleForge.openModal({
				scope: "series",
				onUse: (title) => {
					void writeSeriesTitle(this.app, title).then(() => this.onChange());
				},
			});
		};
		diceBtn.addEventListener("click", openTitleForge);
		makeAccessibleActivatable(diceBtn, openTitleForge);

		window.setTimeout(() => input.focus(), 0);
	}
}
