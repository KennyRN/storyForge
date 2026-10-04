import { App, Modal, Notice, Setting } from "obsidian";
import { NAMEFORGE_PACKS_FOLDER } from "../storage.js";
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
				"Eight title & series generators, each modelled on a different tradition's shapes. " +
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

		this.renderNamePacks(contentEl);

		contentEl.createEl("h3", { text: "Traditions" });
		const list = contentEl.createDiv({ cls: "titleforge-settings-list" });
		for (const spec of this.controller.generators) {
			this.renderGeneratorRow(list, spec.id, spec.name);
		}
	}

	/**
	 * "Character names": every name register (engine/names.ts) gets a dropdown — built-in, or one
	 * of the writer's nameForge packs — so invented names follow their own world's style. Packs are
	 * listed from nameForge's default folder; mix packs are left out because their names live in
	 * the packs they mix.
	 */
	private renderNamePacks(container: HTMLElement): void {
		const specs = this.controller.generators.filter((s) => s.nameGenerators);
		if (specs.length === 0) return;
		container.createEl("h3", { text: "Character names" });
		container.createEl("p", {
			cls: "setting-item-description",
			text:
				"Names in titles are invented, in the style of each register below. Pick one of your " +
				"nameForge packs to have them invented in your own world's style instead.",
		});

		const packs = this.controller.storage.listNamePacks();
		if (packs.length === 0) {
			container.createEl("p", {
				cls: "setting-item-description",
				text: `No nameForge packs found in "${NAMEFORGE_PACKS_FOLDER}/" — built-in names are used.`,
			});
		}

		for (const spec of specs) {
			for (const [registerId, gen] of Object.entries(spec.nameGenerators ?? {})) {
				const key = `${spec.id}/${registerId}`;
				const current = this.controller.settings.namePacks[key];
				new Setting(container)
					.setName(`${gen.label} names`)
					.setDesc(spec.name)
					.addDropdown((dropdown) => {
						dropdown.addOption("", "Built-in");
						for (const pack of packs) dropdown.addOption(pack.path, pack.basename);
						// A previously chosen pack that's since moved or been deleted still shows, so
						// the setting never silently changes under the writer.
						if (current && !packs.some((p) => p.path === current)) dropdown.addOption(current, `${current} (missing)`);
						dropdown.setValue(current ?? "");
						dropdown.onChange((value) => {
							void this.controller.setNamePack(key, value || undefined);
						});
					});
			}
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
