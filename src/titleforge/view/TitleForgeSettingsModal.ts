import { App, Modal, Notice } from "obsidian";
import { ALL_TITLEFORGE_LEXICONS } from "../lexicons/index.js";
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
			this.close();
			this.controller.openModal();
		});

		contentEl.createEl("h3", { text: "Traditions" });
		const list = contentEl.createDiv({ cls: "titleforge-settings-list" });
		for (const spec of this.controller.generators) {
			this.renderGeneratorRow(list, spec.id, spec.name);
		}

		const resetAllButton = contentEl.createEl("button", {
			text: "Reset all lexicons to bundled",
			cls: "titleforge-settings-reset-all",
		});
		resetAllButton.addEventListener("click", () => {
			void this.handleResetAll();
		});
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
		try {
			// Pass the bare id, not a spec off `this.controller.generators` — that list is itself
			// vault-preferred, so a spec sourced from it can *be* the stale copy this button exists
			// to replace. `resetLexiconToBundled` re-resolves the true bundled spec internally.
			await this.controller.storage.resetLexiconToBundled(id);
			await this.controller.reloadGenerators();
			new Notice(`titleForge: reset "${name}" to its bundled default.`);
			this.render();
		} catch (err) {
			new Notice(`titleForge: could not reset "${name}" — ${(err as Error).message}`);
		}
	}

	/** The one-click escape hatch for every generator at once — e.g. after an install whose vault
	 * copies pre-date the seed manifest (see `ensureLexiconsSeeded`'s advisory `Notice`), where
	 * resetting one lexicon at a time would otherwise take nine clicks. */
	private async handleResetAll(): Promise<void> {
		if (!window.confirm("Reset every titleForge lexicon to its bundled default? Any hand-edits will be lost.")) {
			return;
		}
		const failures: string[] = [];
		for (const spec of ALL_TITLEFORGE_LEXICONS) {
			try {
				await this.controller.storage.resetLexiconToBundled(spec.id);
			} catch (err) {
				failures.push(`${spec.name} (${(err as Error).message})`);
			}
		}
		await this.controller.reloadGenerators();
		if (failures.length === 0) {
			new Notice("titleForge: reset all lexicons to their bundled defaults.");
		} else {
			new Notice(`titleForge: reset most lexicons, but failed for: ${failures.join(", ")}`);
		}
		this.render();
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
