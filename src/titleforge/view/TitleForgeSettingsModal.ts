import { App, Modal, Notice } from "obsidian";
import type { TitleForgeController } from "../TitleForgeController.js";

/**
 * titleForge's settings surface, opened from storyForge's own settings tab —
 * mirrors the `TagRegistryModal` pattern: one `{name, desc, action}` group
 * item in `StoryForgeSettingsTab.ts` opens this, and everything else lives
 * here rather than growing storyForge's settings tab.
 */
export class TitleForgeSettingsModal extends Modal {
	constructor(
		app: App,
		private controller: TitleForgeController,
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
		this.modalEl.addClass("titleforge-settings-modal");
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "titleForge" });
		contentEl.createEl("p", {
			text:
				"Nine title & series generators, each modelled on a different tradition's shapes. " +
				"The word lists are hand-editable JSON files in your vault — edit a word and it takes " +
				"effect the next time you generate, no rebuild needed.",
		});

		const pathRow = contentEl.createDiv({ cls: "titleforge-settings-path" });
		pathRow.createSpan({ text: "Lexicons live in " });
		pathRow.createEl("code", { text: `${this.controller.storage.lexiconsFolderPath()}/` });

		const openButton = contentEl.createEl("button", { text: "Open titleForge", cls: "mod-cta" });
		openButton.addEventListener("click", () => {
			void this.controller.activateView();
			this.close();
		});

		contentEl.createEl("h3", { text: "Traditions" });
		const list = contentEl.createDiv({ cls: "titleforge-settings-list" });
		for (const spec of this.controller.generators) {
			this.renderGeneratorRow(list, spec.id, spec.name);
		}
	}

	private renderGeneratorRow(container: HTMLElement, id: string, name: string): void {
		const row = container.createDiv({ cls: "titleforge-settings-row" });
		row.createSpan({ cls: "titleforge-settings-row-name", text: name });

		const resetButton = row.createEl("button", { text: "Reset lexicon to bundled default" });
		resetButton.addEventListener("click", () => {
			void this.handleReset(id, name);
		});

		const clearButton = row.createEl("button", { text: "Clear history" });
		clearButton.addEventListener("click", () => {
			void this.handleClearHistory(id, name);
		});
	}

	private async handleReset(id: string, name: string): Promise<void> {
		const bundled = this.controller.generators.find((g) => g.id === id);
		if (!bundled) return;
		try {
			await this.controller.storage.resetLexiconToBundled(bundled);
			await this.controller.reloadGenerators();
			new Notice(`titleForge: reset "${name}" to its bundled default.`);
			this.render();
		} catch (err) {
			new Notice(`titleForge: could not reset "${name}" — ${(err as Error).message}`);
		}
	}

	private async handleClearHistory(id: string, name: string): Promise<void> {
		try {
			await this.controller.storage.saveHistory(id, []);
			new Notice(`titleForge: cleared history for "${name}".`);
		} catch (err) {
			new Notice(`titleForge: could not clear history for "${name}" — ${(err as Error).message}`);
		}
	}
}
