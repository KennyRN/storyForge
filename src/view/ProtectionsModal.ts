import { App, Modal, Notice, Platform, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency, StoryForgePluginSettings } from "../main";
import { runFullBackup } from "../backup";
import { ensureWelcomeNote } from "../welcomeNote";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dialog } = require("@electron/remote");

export class ProtectionsModal extends Modal {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
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

		const tabBar = contentEl.createDiv({ cls: "sf-text-style-tab-bar" });
		const tabBodyWrapper = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });

		const tabs: { id: string; label: string; render: (body: HTMLElement) => void }[] = [
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

		const tabBodies: HTMLElement[] = [];
		let activeTabId = tabs[0].id;

		tabs.forEach((tab) => {
			const tabBtn = tabBar.createEl("button", { cls: "sf-text-style-tab-btn", text: tab.label });
			if (tab.id === activeTabId) {
				tabBtn.addClass("is-active");
			}
			tabBtn.addEventListener("click", () => {
				activeTabId = tab.id;
				tabBar.querySelectorAll(".sf-text-style-tab-btn").forEach((btn) => btn.removeClass("is-active"));
				tabBtn.addClass("is-active");
				tabBodies.forEach((body, i) => {
					body.toggleClass("sf-settings-hidden", tabs[i].id !== activeTabId);
				});
			});

			const bodyEl = tabBodyWrapper.createDiv({ cls: "sf-text-style-tab-body" });
			if (tab.id !== activeTabId) {
				bodyEl.addClass("sf-settings-hidden");
			}
			tab.render(bodyEl);
			tabBodies.push(bodyEl);
		});
	}

	private renderImportExportContent(body: HTMLElement): void {
		const exportCard = new SettingGroup(body);
		exportCard.addSetting((setting) =>
			setting
				.setName("Export settings")
				.setDesc("Saves all storyForge settings to a JSON file.")
				.addButton((button) =>
					button.setButtonText("Export").onClick(() => {
						const json = JSON.stringify(this.plugin.getSettings(), null, 2);
						const blob = new Blob([json], { type: "application/json" });
						const url = URL.createObjectURL(blob);
						const a = document.createElement("a");
						a.href = url;
						a.download = "storyforge-settings.json";
						a.click();
						URL.revokeObjectURL(url);
					}),
				),
		);

		const importCard = new SettingGroup(body);
		importCard.addSetting((setting) =>
			setting
				.setName("Import settings")
				.setDesc("Restores storyForge settings from a previously exported JSON file. This overwrites your current settings.")
				.addButton((button) =>
					button.setButtonText("Import").onClick(() => {
						const input = document.createElement("input");
						input.type = "file";
						input.accept = "application/json";
						input.addEventListener("change", () => {
							const file = input.files?.[0];
							if (!file) return;
							void (async () => {
								try {
									const text = await file.text();
									const parsed = JSON.parse(text);
									await this.plugin.importSettings(parsed);
									this.render();
								} catch (err) {
									new Notice(`storyForge: could not import settings — ${(err as Error).message}`);
								}
							})();
						});
						input.click();
					}),
				),
		);
	}

	private renderBackupContent(body: HTMLElement, settings: StoryForgePluginSettings): void {
		if (!Platform.isDesktopApp) {
			new Setting(body).setName("Automatic backup").setDesc("Automatic backup is only available on desktop.");
			return;
		}

		const card = new SettingGroup(body);
		let folderValue = settings.automaticBackupFolder;
		let frequencyRow!: Setting;

		card.addSetting((setting) =>
			setting
				.setName("Automatic backup")
				.setDesc("Automatically zip your vault's notes and attachments on a schedule.")
				.addToggle((toggle) =>
					toggle.setValue(settings.automaticBackupEnabled).onChange(async (value) => {
						await this.plugin.updateSetting("automaticBackupEnabled", value);
						frequencyRow.settingEl.toggleClass("sf-settings-hidden", !value);
					}),
				),
		);

		card.addSetting((setting) =>
			setting
				.setName("Backup folder")
				.setDesc("Absolute folder path on this computer where backup zip files are saved. Required for both automatic and manual backups.")
				.addText((text) =>
					text
						.setPlaceholder("/Users/you/Backups/storyForge")
						.setValue(settings.automaticBackupFolder)
						.onChange(async (value) => {
							folderValue = value;
							await this.plugin.updateSetting("automaticBackupFolder", value);
						}),
				)
				.addButton((button) =>
					button
						.setButtonText("Browse")
						.onClick(async () => {
							try {
								const result = await dialog.showOpenDialog({
									properties: ["openDirectory"],
								});
								if (!result.canceled && result.filePaths.length > 0) {
									const selectedPath = result.filePaths[0];
									folderValue = selectedPath;
									await this.plugin.updateSetting("automaticBackupFolder", selectedPath);
									this.render();
								}
							} catch (err) {
								new Notice(`storyForge: could not open folder picker — ${(err as Error).message}`);
							}
						}),
				),
		);

		card.addSetting((setting) => {
			frequencyRow = setting.setName("Backup frequency").addDropdown((dropdown) =>
				dropdown
					.addOption("every-open", "Every time vault is opened")
					.addOption("daily", "Once daily")
					.addOption("weekly", "Once weekly")
					.setValue(settings.automaticBackupFrequency)
					.onChange(async (value) => {
						await this.plugin.updateSetting("automaticBackupFrequency", value as AutomaticBackupFrequency);
					}),
			);
			frequencyRow.settingEl.toggleClass("sf-settings-hidden", !settings.automaticBackupEnabled);
		});

		card.addSetting((setting) =>
			setting
				.setName("Back up now")
				.setDesc("Creates a full backup zip immediately, including your .obsidian settings folder — saved to the backup folder above.")
				.addButton((button) =>
					button.setButtonText("Back up now").onClick(() => {
						if (!folderValue) {
							new Notice("storyForge: set a backup folder before backing up.");
							return;
						}
						void (async () => {
							try {
								const path = await runFullBackup(this.app, folderValue);
								new Notice(`storyForge: backup saved to ${path}`);
							} catch (err) {
								new Notice(`storyForge: backup failed — ${(err as Error).message}`);
							}
						})();
					}),
				),
		);

		const welcomeNoteCard = new SettingGroup(body);
		welcomeNoteCard.addSetting((setting) =>
			setting
				.setName("Recreate welcome note")
				.setDesc("Restores storyForge Welcome.md in your Codex if you've deleted it. If it still exists, this just opens it.")
				.addButton((button) =>
					button.setButtonText("Recreate welcome note").onClick(async () => {
						try {
							const file = await ensureWelcomeNote(this.app);
							await this.app.workspace.getLeaf(false).openFile(file);
						} catch (err) {
							new Notice(`storyForge: could not recreate welcome note — ${(err as Error).message}`);
						}
					}),
				),
		);
	}
}