import { App, Modal } from "obsidian";
import { writeSeriesTitle } from "../series";
import type StoryForgePlugin from "../main";

/**
 * Upgrades a standalone vault into a series vault. Unlike SeriesOnboardingModal (which lets a
 * dismiss/empty-name pass through silently), this modal's whole purpose is collecting a real series
 * name - a standalone vault's series.md never got one - so an empty submit is a no-op that keeps the
 * modal open rather than closing with nothing done.
 */
export class ConvertToSeriesModal extends Modal {
	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private onResolved: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-onboarding-modal");
		contentEl.createEl("h2", { text: "Convert to a series" });
		contentEl.createDiv({ cls: "sf-modal-hint", text: "Name your series — you can rename it later." });

		const titleRow = contentEl.createDiv({ cls: "sf-modal-title-row" });
		const input = titleRow.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input",
			type: "text",
			attr: { placeholder: "Series name" },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void this.handleSubmit(input.value);
			}
		});

		const actionsRow = contentEl.createDiv({ cls: "sf-onboarding-actions" });
		const submitBtn = actionsRow.createEl("button", { cls: "mod-cta", text: "Convert to series" });
		submitBtn.addEventListener("click", () => void this.handleSubmit(input.value));

		window.setTimeout(() => input.focus(), 0);
	}

	private async handleSubmit(rawTitle: string): Promise<void> {
		const title = rawTitle.trim();
		if (!title) return;
		await writeSeriesTitle(this.app, title);
		await this.plugin.updateSetting("hideSeriesPane", false);
		this.plugin.refreshStoryForgeViews();
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onResolved();
	}
}
