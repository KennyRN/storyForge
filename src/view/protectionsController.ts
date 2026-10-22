import { App, Notice, Setting, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { AutomaticBackupFrequency } from "../main";
import { runFullBackup } from "../backup";
import { BACKUPS_FOLDER } from "../core/paths";

/** The backup controls (automatic schedule + manual backup), shown in ProtectionsModal. */
export class ProtectionsController {
	constructor(
		private app: App,
		private plugin: StoryForgePlugin,
	) {}

	renderBackupSection(body: HTMLElement): void {
		const settings = this.plugin.getSettings();
		const card = new SettingGroup(body);
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
}
