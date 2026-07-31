import { App, Modal, Notice, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency, StoryForgePluginSettings } from "../main";
import { runFullBackup } from "../backup";
import { BACKUPS_FOLDER } from "../paths";
import { ensureWelcomeNote } from "../welcomeNote";
import { renderTabbedBody, type StyleModalTab } from "./styleModalHelpers";

export class ProtectionsModal extends Modal {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-protections-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-protections-modal");

		const settings = this.plugin.getSettings();

		const tabs: StyleModalTab[] = [
			{
				id: "import-export",
				label: "Import & export",
				render: (body) => {
					this.renderImportExportContent(body);
				},
			},
			{
				id: "backup",
				label: "Backup",
				render: (body) => {
					this.renderBackupContent(body, settings);
				},
			},
		];

		renderTabbedBody(contentEl, tabs);
	}

	private renderImportExportContent(body: HTMLElement): void {
		const exportCard = new SettingGroup(body);
		exportCard.addSetting((setting) => {
			setting
				.setName("Export settings")
				.setDesc("Saves all storyForge settings to a JSON file.")
				.addButton((button) =>
					button.setButtonText("Export").onClick(() => {
						const json = JSON.stringify(this.plugin.getSettings(), null, 2);
						const blob = new Blob([json], { type: "application/json" });
						const url = URL.createObjectURL(blob);
						const a = createEl("a", { attr: { href: url, download: "storyforge-settings.json" } });
						a.click();
						URL.revokeObjectURL(url);
					}),
				);
		});

		const importCard = new SettingGroup(body);
		importCard.addSetting((setting) => {
			setting
				.setName("Import settings")
				.setDesc("Restores storyForge settings from a previously exported JSON file. This overwrites your current settings.")
				.addButton((button) =>
					button.setButtonText("Import").onClick(() => {
						const input = createEl("input", { type: "file", attr: { accept: "application/json" } });
						input.addEventListener("change", () => {
							const file = input.files?.[0];
							if (!file) return;
							this.handleImportFile(file);
						});
						input.click();
					}),
				);
		});
	}

	private handleImportFile(file: File): void {
		file
			.text()
			.then((text) => {
				const parsed: unknown = JSON.parse(text);
				return this.plugin.importSettings(parsed);
			})
			.then(() => this.render())
			.catch((err: unknown) => {
				new Notice(`storyForge: could not import settings — ${err instanceof Error ? err.message : String(err)}`);
			});
	}

	private renderBackupContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		const card = new SettingGroup(body);
		let frequencyRow!: Setting;

		card.addSetting((setting) => {
			setting
				.setName("Automatic backup")
				.setDesc(`Automatically zip your vault's notes and attachments on a schedule. Zips are saved to ${BACKUPS_FOLDER}/.`)
				.addToggle((toggle) =>
					toggle.setValue(settings.automaticBackupEnabled).onChange((value) => this.persistAutoBackupEnabled(value, frequencyRow)),
				);
		});

		card.addSetting((setting) => {
			frequencyRow = setting.setName("Backup frequency").addDropdown((dropdown) =>
				dropdown
					.addOption("every-open", "Every time vault is opened")
					.addOption("daily", "Once daily")
					.addOption("weekly", "Once weekly")
					.setValue(settings.automaticBackupFrequency)
					.onChange((value) => this.persistBackupFrequency(value as AutomaticBackupFrequency)),
			);
			frequencyRow.settingEl.toggleClass("sf-settings-hidden", !settings.automaticBackupEnabled);
		});

		card.addSetting((setting) => {
			setting
				.setName("Back up now")
				.setDesc(`Creates a full backup zip immediately, including your ${this.app.vault.configDir} settings folder — saved to ${BACKUPS_FOLDER}/.`)
				.addButton((button) =>
					button.setButtonText("Back up now").onClick(() => {
						this.runManualBackup();
					}),
				);
		});

		const welcomeNoteCard = new SettingGroup(body);
		welcomeNoteCard.addSetting((setting) => {
			setting
				.setName("Recreate welcome note")
				.setDesc("Restores storyForge Welcome.md in your Codex if you've deleted it. If it still exists, this just opens it.")
				.addButton((button) => button.setButtonText("Recreate welcome note").onClick(() => this.recreateWelcomeNote()));
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
