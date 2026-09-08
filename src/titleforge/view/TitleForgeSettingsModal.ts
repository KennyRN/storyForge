import { App, Modal, Notice } from "obsidian";
import type { TitleForgeController } from "../TitleForgeController.js";

/**
 * titleForge's settings surface, opened from storyForge's own settings tab —
 * mirrors the `TagRegistryModal` pattern: one `{name, desc, action}` group
 * item in `StoryForgeSettingsTab.ts` opens this, and everything else lives
 * here rather than growing storyForge's settings tab.
 *
 * The built-in word lists are compiled into the plugin and read-only — there
 * is no "reset to bundled" any more, because there is no vault copy to reset.
 * The only lexicon control here reveals the one file the user *can* edit,
 * `user enhanced lexicon.md`, where their own words are added.
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
				"The built-in word lists are baked into the plugin and can't be edited or broken — " +
				"but you can add your own words, and titleForge blends them in the next time it " +
				"generates, no reload needed.",
		});

		const pathRow = contentEl.createDiv({ cls: "titleforge-settings-path" });
		pathRow.createSpan({ text: "Add your own words in " });
		pathRow.createEl("code", { text: this.controller.storage.userLexiconPath() });

		const openWordsButton = contentEl.createEl("button", {
			text: "Open my word list",
			cls: "mod-cta",
		});
		openWordsButton.addEventListener("click", () => {
			this.close();
			void this.app.workspace.openLinkText(this.controller.storage.userLexiconPath(), "", true);
		});

		const openButton = contentEl.createEl("button", { text: "Open titleForge" });
		openButton.addEventListener("click", () => {
			this.close();
			this.controller.openModal();
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

		const clearButton = row.createEl("button", { text: "Clear history" });
		clearButton.addEventListener("click", () => {
			void this.handleClearHistory(id, name);
		});
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
