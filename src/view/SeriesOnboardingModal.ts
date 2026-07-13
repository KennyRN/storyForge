import { App, Modal } from "obsidian";
import { writeSeriesTitle } from "../series";
import type StoryForgePlugin from "../main";

/**
 * Shown exactly once, the very first time storyForge runs in a vault (series.md doesn't exist yet),
 * before ensureSeriesFile() would otherwise silently seed it with "Untitled Series". Lets the user
 * either name their series or declare this a standalone book. Dismissing (Escape/backdrop click)
 * without choosing is a deliberate no-op - today's default behavior (silent "Untitled Series",
 * series pane visible) - nothing is forced on the user.
 */
export class SeriesOnboardingModal extends Modal {
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
		contentEl.createEl("h2", { text: "Welcome to storyForge" });
		contentEl.createDiv({ cls: "sf-modal-hint", text: "Are you writing a series, or a single standalone book?" });

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
				void this.handleNamed(input.value);
			}
		});

		const actionsRow = contentEl.createDiv({ cls: "sf-onboarding-actions" });
		const nameBtn = actionsRow.createEl("button", { cls: "mod-cta", text: "Start my series" });
		nameBtn.addEventListener("click", () => void this.handleNamed(input.value));

		const standaloneBtn = actionsRow.createEl("button", { text: "Just one book (no series)" });
		standaloneBtn.addEventListener("click", () => void this.handleStandalone());

		window.setTimeout(() => input.focus(), 0);
	}

	private async handleNamed(rawTitle: string): Promise<void> {
		const title = rawTitle.trim();
		if (title) await writeSeriesTitle(this.app, title);
		this.close();
	}

	private async handleStandalone(): Promise<void> {
		await this.plugin.updateSetting("hideSeriesPane", true);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onResolved();
	}
}
