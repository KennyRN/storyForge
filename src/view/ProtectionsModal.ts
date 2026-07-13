import { App, Modal, Notice, Platform, Setting, SettingGroup, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency, StoryForgePluginSettings } from "../main";
import { runFullBackup } from "../backup";
import { ensureWelcomeNote } from "../welcomeNote";

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

		this.renderWelcomeNoteSection(contentEl, settings);
		this.renderImportExportSection(contentEl);
		this.renderAutomaticBackupSection(contentEl, settings);
	}

	private renderWelcomeNoteSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "welcome-note", "h3", "Welcome note", (body) => {
			new Setting(body)
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
				);
		});
	}

	private renderImportExportSection(containerEl: HTMLElement): void {
		this.renderFoldableSection(containerEl, "import-export", "h3", "Import & export storyForge settings", (body) => {
			new Setting(body)
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
				);

			new Setting(body)
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
				);
		});
	}

	private renderAutomaticBackupSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		this.renderFoldableSection(containerEl, "automatic-backup", "h3", "Automatic backup", (body) => {
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
		});
	}

	private renderFoldableSection(
		parentEl: HTMLElement,
		key: string,
		level: "h3" | "h4",
		headingText: string,
		renderBody: (bodyEl: HTMLElement) => void,
	): void {
		const sectionEl = parentEl.createDiv({ cls: `sf-settings-section sf-settings-section-${level}` });
		const headerEl = sectionEl.createDiv({ cls: "sf-settings-section-header" });
		const chevronEl = headerEl.createSpan({ cls: "sf-settings-chevron" });
		headerEl.createEl(level, { text: headingText });
		const bodyEl = sectionEl.createDiv({ cls: "sf-settings-section-body" });

		let collapsed = true;
		const applyState = () => {
			sectionEl.toggleClass("sf-settings-collapsed", collapsed);
			setIcon(chevronEl, collapsed ? "chevron-right" : "chevron-down");
		};
		applyState();

		headerEl.addEventListener("click", () => {
			collapsed = !collapsed;
			applyState();
		});

		renderBody(bodyEl);
	}
}