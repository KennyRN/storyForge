import { App, Modal, Notice, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency } from "../main";
import {
	listSettingsExportsInBackups,
	readSettingsExportFromBackups,
	runFullBackup,
	writeStoryForgeSettingsExportToBackups,
} from "../backup";
import { type FormatCompanionState } from "../formatCompanionActive";
import { BACKUPS_FOLDER } from "../paths";
import {
	deleteSettingsPreset,
	listSettingsPresets,
	readSettingsPreset,
	renameSettingsPreset,
	saveSettingsPreset,
} from "../settingsPresets";
import {
	buildStoryForgeSettingsDocument,
	parseStoryForgeSettingsDocument,
	stringifyStoryForgeSettingsDocument,
	type StoryForgeSettingsDocument,
	type StoryForgeTransferSelection,
} from "../settingsTransfer";
import { ensureWelcomeNote } from "../welcomeNote";

export type ImportSource = {
	kind: "theme" | "backup" | "paste";
	path: string;
	name: string;
};

export class ConfirmationModal extends Modal {
	private settled = false;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly confirmLabel: string,
		private readonly resolve: (value: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.heading);
		this.contentEl.createEl("p", { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(false)))
			.addButton((button) =>
				button
					.setButtonText(this.confirmLabel)
					.setDestructive()
					.setCta()
					.onClick(() => this.finish(true)),
			);
	}

	onClose(): void {
		if (!this.settled) this.resolve(false);
	}

	private finish(value: boolean): void {
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

class NamePromptModal extends Modal {
	private settled = false;
	private value: string;

	constructor(
		app: App,
		heading: string,
		initialValue: string,
		private readonly resolve: (value: string | null) => void,
	) {
		super(app);
		this.value = initialValue;
		this.titleEl.setText(heading);
	}

	onOpen(): void {
		new Setting(this.contentEl).setName("Name").addText((text) =>
			text.setValue(this.value).onChange((value) => {
				this.value = value;
			}),
		);
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.finish(null)))
			.addButton((button) =>
				button.setButtonText("Rename").setCta().onClick(() => this.finish(this.value)),
			);
	}

	onClose(): void {
		if (!this.settled) this.resolve(null);
	}

	private finish(value: string | null): void {
		this.settled = true;
		this.resolve(value);
		this.close();
	}
}

export function confirmAction(
	app: App,
	heading: string,
	message: string,
	confirmLabel: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmationModal(app, heading, message, confirmLabel, resolve).open();
	});
}

export function promptForName(app: App, heading: string, initialValue: string): Promise<string | null> {
	return new Promise((resolve) => {
		new NamePromptModal(app, heading, initialValue, resolve).open();
	});
}

/**
 * Backup/protection state + rendering, extracted out of ProtectionsModal so its two sections
 * (Themes/import-export, Backup) can be hosted either by ProtectionsModal's own tabbed modal or
 * rendered inline elsewhere (SeriesModal's general tab). `requestRerender` stands in for what used
 * to be the modal's own `this.render()` — the host supplies its own "rebuild my content" callback,
 * called after any state change that needs a visual refresh.
 */
export class ProtectionsController {
	private themeName = "";
	private description = "";
	private exportIncluded: StoryForgeTransferSelection = {
		storySettings: true,
		formatting: true,
		palette: true,
	};
	private archiveDatedCopy = false;
	private showExportJson = false;
	private showPasteJson = false;
	private selectedSource: ImportSource | null = null;
	private importText = "";
	private importDocument: StoryForgeSettingsDocument | null = null;
	private importIncluded: StoryForgeTransferSelection = {
		storySettings: true,
		formatting: true,
		palette: true,
	};

	constructor(
		private app: App,
		private plugin: StoryForgePlugin,
		private requestRerender: () => void,
	) {}

	renderCompanionPendingNotice(body: HTMLElement): void {
		new Setting(body)
			.setName("formatForge has not connected yet")
			.setDesc(
				"formatForge is enabled but has not registered with storyForge. It may still be loading — reopen this window to check. These storyForge controls stay available meanwhile.",
			)
			.addButton((button) =>
				button.setButtonText("Open formatForge").onClick(() => {
					this.plugin.openFormatForgeSettings();
				}),
			);
	}

	private currentTransferDocument(): StoryForgeSettingsDocument {
		return buildStoryForgeSettingsDocument(
			this.plugin.getSettings(),
			this.plugin.api?.formatting?.getLinkedSettings() ?? {},
			new Date(),
			{ description: this.description, included: this.exportIncluded },
		);
	}

	renderThemesSection(body: HTMLElement, companionState: FormatCompanionState): void {
		if (companionState === "enabled-not-connected") {
			this.renderCompanionPendingNotice(body);
		}

		const exportText = stringifyStoryForgeSettingsDocument(this.currentTransferDocument());
		body.createEl("h3", { text: "Save or share" });
		body.createEl("p", {
			text: "Named settings are the primary reusable format. JSON remains available as a fallback.",
		});
		new Setting(body)
			.setName("Include in saved settings")
			.addToggle((toggle) =>
				toggle
					.setTooltip("Story settings")
					.setValue(this.exportIncluded.storySettings)
					.onChange((value) => {
						this.exportIncluded.storySettings = value;
						this.requestRerender();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip("Formatting")
					.setValue(this.exportIncluded.formatting)
					.onChange((value) => {
						this.exportIncluded.formatting = value;
						this.requestRerender();
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip("Palette")
					.setValue(this.exportIncluded.palette)
					.onChange((value) => {
						this.exportIncluded.palette = value;
						this.requestRerender();
					}),
			);
		body.createDiv({
			cls: "sf-settings-transfer-labels",
			text: `Story settings: ${this.exportIncluded.storySettings ? "yes" : "no"} · Formatting: ${
				this.exportIncluded.formatting ? "yes" : "no"
			} · Palette: ${this.exportIncluded.palette ? "yes" : "no"}`,
		});
		new Setting(body)
			.setName("Settings name")
			.setDesc("Saving an existing name asks before replacing it.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Book Series 1")
					.setValue(this.themeName)
					.onChange((value) => {
						this.themeName = value;
					}),
			);
		new Setting(body)
			.setName("Description")
			.setDesc("Optional note shown before these settings are applied.")
			.addText((text) =>
				text
					.setPlaceholder("e.g. Settings for my Roman series")
					.setValue(this.description)
					.onChange((value) => {
						this.description = value;
					}),
			);
		new Setting(body)
			.setName("Archive dated copy")
			.setDesc("Also saves a timestamped snapshot under _sf-backup/.")
			.addToggle((toggle) =>
				toggle.setValue(this.archiveDatedCopy).onChange((value) => {
					this.archiveDatedCopy = value;
				}),
			)
			.addButton((button) =>
				button.setButtonText("Save settings").setCta().onClick(() => {
					void this.saveTheme(false);
				}),
			);
		new Setting(body)
			.setName("Share as JSON")
			.setDesc("Copy the selected sections for another vault.")
			.addButton((button) =>
				button.setButtonText("Copy JSON").onClick(() =>
					void this.copyText(stringifyStoryForgeSettingsDocument(this.currentTransferDocument())),
				),
			)
			.addButton((button) =>
				button.setButtonText(this.showExportJson ? "Hide JSON" : "Show JSON").onClick(() => {
					this.showExportJson = !this.showExportJson;
					this.requestRerender();
				}),
			);
		if (this.showExportJson) {
			const textarea = body.createEl("textarea", {
				cls: "sf-settings-transfer-text",
				attr: { readonly: "true", spellcheck: "false" },
			});
			textarea.value = exportText;
		}

		body.createEl("h3", { text: "Load settings" });
		this.renderSourcePicker(body);
		this.renderImportPreview(body);
		new Setting(body)
			.setName("JSON fallback")
			.setDesc("Use this only when someone has sent settings as text.")
			.addButton((button) =>
				button.setButtonText(this.showPasteJson ? "Hide paste box" : "Paste JSON…").onClick(() => {
					this.showPasteJson = !this.showPasteJson;
					this.requestRerender();
				}),
			);
		if (this.showPasteJson) {
			const textarea = body.createEl("textarea", {
				cls: "sf-settings-transfer-text",
				attr: {
					placeholder: "Paste storyForge settings JSON here…",
					spellcheck: "false",
				},
			});
			textarea.value = this.selectedSource?.kind === "paste" ? this.importText : "";
			textarea.addEventListener("input", () => {
				this.importText = textarea.value;
			});
			new Setting(body).addButton((button) =>
				button.setButtonText("Preview pasted JSON").onClick(() => {
					this.loadImportText(this.importText, {
						kind: "paste",
						path: "",
						name: "Pasted JSON",
					});
				}),
			);
		}
	}

	private renderSourcePicker(body: HTMLElement): void {
		const setting = new Setting(body)
			.setName("Settings library")
			.setDesc("Named settings and dated backups are grouped in one list.");
		setting.addDropdown((dropdown) => {
			dropdown.addOption("", "Choose settings or backup…");
			void Promise.all([
				listSettingsPresets(this.app, "storyForge"),
				listSettingsExportsInBackups(this.app),
			])
				.then(([themes, backups]) => {
					for (const theme of themes) {
						dropdown.addOption(`theme:${theme.path}`, `Settings — ${theme.name}`);
					}
					for (const backup of backups.filter((file) =>
						file.name.endsWith("storyForge settings.json"),
					)) {
						dropdown.addOption(`backup:${backup.path}`, `Backup — ${backup.name}`);
					}
					const selected = this.selectedSource;
					if (selected && selected.kind !== "paste") {
						dropdown.setValue(`${selected.kind}:${selected.path}`);
					}
					if (themes.length === 0 && backups.length === 0) dropdown.setDisabled(true);
				})
				.catch(() => dropdown.setDisabled(true));
			dropdown.onChange((value) => {
				if (!value) return;
				const separator = value.indexOf(":");
				const kind = value.slice(0, separator) as "theme" | "backup";
				const path = value.slice(separator + 1);
				const reader =
					kind === "theme"
						? readSettingsPreset(this.app, "storyForge", path)
						: readSettingsExportFromBackups(this.app, path);
				void reader
					.then((text) =>
						this.loadImportText(text, {
							kind,
							path,
							name: path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/i, ""),
						}),
					)
					.catch((error: unknown) => {
						new Notice(
							`storyForge: could not read settings — ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					});
			});
		});
	}

	private renderImportPreview(body: HTMLElement): void {
		const document = this.importDocument;
		if (!document) {
			body.createDiv({
				cls: "sf-settings-import-preview is-empty",
				text: "Choose named settings or a backup to preview it before applying.",
			});
			return;
		}
		const preview = body.createDiv({ cls: "sf-settings-import-preview" });
		preview.createEl("strong", { text: this.selectedSource?.name ?? "storyForge settings" });
		if (document.description) preview.createDiv({ text: document.description });
		preview.createDiv({
			cls: "sf-settings-import-meta",
			text: `Saved ${new Date(document.exportedAt).toLocaleString()} · ${
				document.storySettings ? Object.keys(document.storySettings).length : 0
			} story settings · ${
				document.formatting ? Object.keys(document.formatting).length : 0
			} formatting settings · ${document.palette ? "palette included" : "no palette"}`,
		});
		new Setting(preview)
			.setName("Apply sections")
			.addToggle((toggle) =>
				toggle
					.setTooltip("Story settings")
					.setValue(this.importIncluded.storySettings)
					.setDisabled(document.storySettings === null)
					.onChange((value) => {
						this.importIncluded.storySettings = value;
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip("Formatting")
					.setValue(this.importIncluded.formatting)
					.setDisabled(document.formatting === null)
					.onChange((value) => {
						this.importIncluded.formatting = value;
					}),
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip("Palette")
					.setValue(this.importIncluded.palette)
					.setDisabled(document.palette === null)
					.onChange((value) => {
						this.importIncluded.palette = value;
					}),
			)
			.addButton((button) =>
				button.setButtonText("Apply settings").setCta().onClick(() => void this.applyImport()),
			);
		if (this.selectedSource?.kind === "theme") {
			new Setting(preview)
				.setName("Manage named settings")
				.addButton((button) =>
					button.setButtonText("Rename").onClick(() => void this.renameTheme()),
				)
				.addButton((button) =>
					button.setButtonText("Delete").setDestructive().onClick(() => void this.deleteTheme()),
				);
		}
	}

	private loadImportText(text: string, source: ImportSource): void {
		try {
			const document = parseStoryForgeSettingsDocument(text);
			this.importText = text;
			this.importDocument = document;
			this.selectedSource = source;
			this.importIncluded = {
				storySettings: document.storySettings !== null,
				formatting: document.formatting !== null,
				palette: document.palette !== null,
			};
			this.requestRerender();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not preview settings — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async saveTheme(overwrite: boolean): Promise<void> {
		const exportText = stringifyStoryForgeSettingsDocument(this.currentTransferDocument());
		try {
			const file = await saveSettingsPreset(
				this.app,
				"storyForge",
				this.themeName,
				exportText,
				overwrite,
			);
			if (this.archiveDatedCopy) {
				try {
					await writeStoryForgeSettingsExportToBackups(this.app, exportText);
					new Notice(`storyForge: settings "${file.name}" saved and archived`);
				} catch (archiveError: unknown) {
					new Notice(
						`storyForge: settings "${file.name}" saved, but archive failed — ${
							archiveError instanceof Error ? archiveError.message : String(archiveError)
						}`,
					);
				}
			} else {
				new Notice(`storyForge: settings "${file.name}" saved`);
			}
			this.themeName = file.name;
			this.requestRerender();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (!overwrite && message.includes("already exists")) {
				const confirmed = await confirmAction(
					this.app,
					"Replace saved settings?",
					`${message}. Replace them with the current settings?`,
					"Replace",
				);
				if (confirmed) await this.saveTheme(true);
				return;
			}
			new Notice(`storyForge: could not save settings — ${message}`);
		}
	}

	private async renameTheme(): Promise<void> {
		const source = this.selectedSource;
		if (source?.kind !== "theme") return;
		const name = await promptForName(
			this.app,
			"Rename saved settings",
			source.name.replace(/\.json$/i, ""),
		);
		if (name === null) return;
		try {
			const renamed = await renameSettingsPreset(this.app, "storyForge", source.path, name, false);
			this.selectedSource = { kind: "theme", path: renamed.path, name: renamed.name };
			new Notice(`storyForge: settings renamed to "${renamed.name}"`);
			this.requestRerender();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("already exists")) {
				const confirmed = await confirmAction(
					this.app,
					"Replace saved settings?",
					`${message}. Replace them during rename?`,
					"Replace",
				);
				if (confirmed) {
					const renamed = await renameSettingsPreset(this.app, "storyForge", source.path, name, true);
					this.selectedSource = {
						kind: "theme",
						path: renamed.path,
						name: renamed.name,
					};
					this.requestRerender();
				}
				return;
			}
			new Notice(`storyForge: could not rename settings — ${message}`);
		}
	}

	private async deleteTheme(): Promise<void> {
		const source = this.selectedSource;
		if (source?.kind !== "theme") return;
		const confirmed = await confirmAction(
			this.app,
			"Delete saved settings?",
			`Move "${source.name}" to the Obsidian trash?`,
			"Delete",
		);
		if (!confirmed) return;
		try {
			await deleteSettingsPreset(this.app, "storyForge", source.path);
			this.selectedSource = null;
			this.importDocument = null;
			this.importText = "";
			new Notice(`storyForge: settings "${source.name}" deleted`);
			this.requestRerender();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not delete settings — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async applyImport(): Promise<void> {
		const document = this.importDocument;
		if (!document) return;
		const incoming: Record<string, unknown> = {};
		if (this.importIncluded.storySettings && document.storySettings) {
			Object.assign(incoming, document.storySettings);
		}
		if (this.importIncluded.formatting && document.formatting) {
			Object.assign(incoming, document.formatting);
		}
		if (this.importIncluded.palette && document.palette) {
			Object.assign(incoming, document.palette);
		}
		if (Object.keys(incoming).length === 0) {
			new Notice("storyForge: nothing selected to apply");
			return;
		}
		try {
			await this.plugin.importSettings(incoming);
			new Notice("storyForge: selected settings sections applied");
			this.requestRerender();
		} catch (error: unknown) {
			new Notice(
				`storyForge: could not apply settings — ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	private async copyText(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("storyForge: settings JSON copied");
		} catch {
			this.showExportJson = true;
			this.requestRerender();
			new Notice("storyForge: JSON shown — use your normal copy command");
		}
	}

	renderBackupSection(body: HTMLElement, companionState: FormatCompanionState): void {
		const settings = this.plugin.getSettings();
		const card = new SettingGroup(body);
		card.setHeading("backup");
		let frequencyRow!: Setting;

		card.addSetting((setting) => {
			setting
				.setName("automatic backup")
				.setDesc(`automatically zip your vault on a schedule, backups are save in ${BACKUPS_FOLDER}`)
				.addToggle((toggle) =>
					toggle.setValue(settings.automaticBackupEnabled).onChange((value) => this.persistAutoBackupEnabled(value, frequencyRow)),
				);
		});

		card.addSetting((setting) => {
			frequencyRow = setting.setName("backup frequency").addDropdown((dropdown) =>
				dropdown
					.addOption("every-open", "every time vault is opened")
					.addOption("daily", "once daily")
					.addOption("weekly", "once weekly")
					.setValue(settings.automaticBackupFrequency)
					.onChange((value) => this.persistBackupFrequency(value as AutomaticBackupFrequency)),
			);
			frequencyRow.settingEl.toggleClass("sf-settings-hidden", !settings.automaticBackupEnabled);
		});

		card.addSetting((setting) => {
			setting
				.setName("create full back up now")
				.setDesc(`creates a full zip back up now, includes your .obsidian settings folder, saved in ${BACKUPS_FOLDER}`)
				.addButton((button) =>
					button.setButtonText("create full back up now").onClick(() => {
						this.runManualBackup();
					}),
				);
		});
	}

	/** Its own boundary box — moved out of the Backup section onto SeriesModal's obsidian elements
	 * tab (bottom), since it's about restoring storyForge's own content, not a backup concern. Not
	 * called from renderBackupSection() any more, so ProtectionsModal's own Backup tab no longer
	 * shows it either — this lives only where it was moved to. */
	renderWelcomeNoteSection(body: HTMLElement): void {
		const welcomeNoteCard = new SettingGroup(body);
		welcomeNoteCard.addSetting((setting) => {
			setting
				.setName("recreate storyforge welcome note")
				.setDesc("restores storyforge's welcome note to your codex if you deleted it, if not, then this opens it for you")
				.addButton((button) => button.setButtonText("recreate welcome note").onClick(() => this.recreateWelcomeNote()));
		});
	}

	private persistBackupFrequency(value: AutomaticBackupFrequency): void {
		this.plugin.updateSetting("automaticBackupFrequency", value).catch((err: unknown) => {
			new Notice(`storyForge: could not save backup frequency — ${err instanceof Error ? err.message : String(err)}`);
		});
	}

	private persistAutoBackupEnabled(value: boolean, frequencyRow: Setting): void {
		void this.plugin.updateSetting("automaticBackupEnabled", value).then(() => {
			frequencyRow.settingEl.toggleClass("sf-settings-hidden", !value);
		});
	}

	private runManualBackup(): void {
		runFullBackup(this.app)
			.then((path) => {
				new Notice(`storyForge: backup saved to ${path}`);
			})
			.catch((err: unknown) => {
				new Notice(`storyForge: backup failed — ${err instanceof Error ? err.message : String(err)}`);
			});
	}

	private recreateWelcomeNote(): void {
		ensureWelcomeNote(this.app)
			.then((file) => this.app.workspace.getLeaf(false).openFile(file))
			.catch((err: unknown) => {
				new Notice(`storyForge: could not recreate welcome note — ${err instanceof Error ? err.message : String(err)}`);
			});
	}
}
