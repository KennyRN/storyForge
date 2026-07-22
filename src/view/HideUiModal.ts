import { App, Modal, SettingGroup } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StatusBarView, StoryForgePluginSettings } from "../main";

export class HideUiModal extends Modal {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app);
		this.plugin = plugin;
	}

	private persistVisibility<K extends keyof StoryForgePluginSettings>(key: K, value: StoryForgePluginSettings[K]): void {
		void this.plugin.updateSetting(key, value).then(() => this.plugin.applyVisibilityStyles());
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

		// Same scroll shell as the other style modals — without it, the fixed-height
		// modal clips content (and with enough rows can look completely empty).
		const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
		const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });

		const settings = this.plugin.getSettings();

		const helpGroup = new SettingGroup(body);
		helpGroup.addSetting((setting) => {
			setting
				.setName("Hide help button")
				.setDesc("Hides the help (?) button next to the vault picker.")
				.addToggle((toggle) =>
					toggle.setValue(settings.hideHelp).onChange((value) => this.persistVisibility("hideHelp", value)),
				);
		});

		const hideSidebarGroup = new SettingGroup(body);
		hideSidebarGroup
			.addSetting((setting) => {
				setting
					.setName("Hide search panel")
					.setDesc("Hides the Search button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideSearch).onChange((value) => this.persistVisibility("hideSearch", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide bookmarks panel")
					.setDesc("Hides the Bookmarks button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideBookmarks).onChange((value) => this.persistVisibility("hideBookmarks", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide files panel")
					.setDesc("Hides the Files button at the top of the left sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideFiles).onChange((value) => this.persistVisibility("hideFiles", value)),
					);
			});

		const hideRightNativeGroup = new SettingGroup(body);
		hideRightNativeGroup
			.addSetting((setting) => {
				setting
					.setName("Hide backlinks panel")
					.setDesc("Hides Obsidian's Backlinks tab in the right sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideBacklinks).onChange((value) => this.persistVisibility("hideBacklinks", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide outgoing links panel")
					.setDesc("Hides Obsidian's Outgoing links tab in the right sidebar.")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.hideOutgoingLinks)
							.onChange((value) => this.persistVisibility("hideOutgoingLinks", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide tags panel")
					.setDesc("Hides Obsidian's Tags tab in the right sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideTags).onChange((value) => this.persistVisibility("hideTags", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide outline panel")
					.setDesc("Hides Obsidian's Outline tab in the right sidebar.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideOutline).onChange((value) => this.persistVisibility("hideOutline", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide all properties panel")
					.setDesc("Hides Obsidian's All properties tab in the right sidebar.")
					.addToggle((toggle) =>
						toggle
							.setValue(settings.hideAllProperties)
							.onChange((value) => this.persistVisibility("hideAllProperties", value)),
					);
			});

		const hidePanelsGroup = new SettingGroup(body);
		hidePanelsGroup
			.addSetting((setting) => {
				setting
					.setName("Hide left panel button")
					.setDesc("Hides the left sidebar collapse/expand button.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideLeftPanel).onChange((value) => this.persistVisibility("hideLeftPanel", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide right panel button")
					.setDesc("Hides the right sidebar collapse/expand button. Story Context still opens from the Codex button or command.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideRightPanel).onChange((value) => this.persistVisibility("hideRightPanel", value)),
					);
			});

		const hideMiscGroup = new SettingGroup(body);
		hideMiscGroup
			.addSetting((setting) => {
				setting
					.setName("Hide file name bar")
					.setDesc("Hides the large file name displayed at the top of the note content.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideFileNameBar).onChange((value) => this.persistVisibility("hideFileNameBar", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Hide navigation row")
					.setDesc("Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle.")
					.addToggle((toggle) =>
						toggle.setValue(settings.hideNavRow).onChange((value) => this.persistVisibility("hideNavRow", value)),
					);
			})
			.addSetting((setting) => {
				setting
					.setName("Status bar view")
					.setDesc("Controls what's shown in Obsidian's bottom status bar.")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("hidden", "Hide status bar")
							.addOption("sync-only", "Show only the Obsidian Sync icon")
							.addOption("all", "Show all of the status bar")
							.setValue(settings.statusBarView)
							.onChange((value) => this.persistVisibility("statusBarView", value as StatusBarView)),
					);
			});
	}
}
