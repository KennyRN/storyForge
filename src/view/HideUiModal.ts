import { App, Modal, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StatusBarView } from "../main";

export class HideUiModal extends Modal {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-hide-ui-modal");
		this.titleEl.remove();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-hide-ui-modal");

		const settings = this.plugin.getSettings();

		const helpGroup = new SettingGroup(contentEl);
		helpGroup.addSetting((setting) =>
			setting
				.setName("Hide help button")
				.setDesc("Hides the help (?) button next to the vault picker.")
				.addToggle((toggle) =>
					toggle.setValue(settings.hideHelp).onChange((value) => {
						void (async () => {
							await this.plugin.updateSetting("hideHelp", value);
							this.plugin.applyVisibilityStyles();
						})();
					}),
				),
		);

		const hideSidebarGroup = new SettingGroup(contentEl);
		hideSidebarGroup
			.addSetting((setting) =>
				setting
					.setName("Hide search panel")
					.setDesc("Hides the Search button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideSearch).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideSearch", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Hide bookmarks panel")
					.setDesc("Hides the Bookmarks button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideBookmarks).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideBookmarks", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Hide files panel")
					.setDesc("Hides the Files button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideFiles).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideFiles", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			);

		const hidePanelsGroup = new SettingGroup(contentEl);
		hidePanelsGroup
			.addSetting((setting) =>
				setting
					.setName("Hide left panel button")
					.setDesc("Hides the left sidebar collapse/expand button.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideLeftPanel).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideLeftPanel", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Hide right panel button")
					.setDesc("Hides the right sidebar collapse/expand button.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideRightPanel).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideRightPanel", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			);

		const hideMiscGroup = new SettingGroup(contentEl);
		hideMiscGroup
			.addSetting((setting) =>
				setting
					.setName("Hide file name bar")
					.setDesc("Hides the large file name displayed at the top of the note content.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideFileNameBar).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideFileNameBar", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Hide navigation row")
					.setDesc("Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideNavRow).onChange((value) => {
							void (async () => {
								await this.plugin.updateSetting("hideNavRow", value);
								this.plugin.applyVisibilityStyles();
							})();
						}),
					),
			)
			.addSetting((setting) =>
				setting
					.setName("Status bar view")
					.setDesc("Controls what's shown in Obsidian's bottom status bar.")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("hidden", "Hide status bar")
							.addOption("sync-only", "Show only the Obsidian Sync icon")
							.addOption("all", "Show all of the status bar")
							.setValue(settings.statusBarView)
							.onChange((value) => {
								void (async () => {
									await this.plugin.updateSetting("statusBarView", value as StatusBarView);
									this.plugin.applyVisibilityStyles();
								})();
							}),
					),
			);
	}
}
