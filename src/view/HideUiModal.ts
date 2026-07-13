import { App, Modal, Notice, Platform, Setting, SettingGroup, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings, StatusBarView } from "../main";

export class HideUiModal extends Modal {
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
		contentEl.addClass("sf-hide-ui-modal");

		const settings = this.plugin.getSettings();

		this.renderFoldableSection(contentEl, "hide-ui-help", "h3", "Help button", (body) => {
			new Setting(body)
				.setName("Hide help button")
				.setDesc("Hides the help (?) button next to the vault picker.")
				.addToggle((toggle) =>
					toggle.setValue(settings.hideHelp).onChange(async (value) => {
						await this.plugin.updateSetting("hideHelp", value);
						this.plugin.applyVisibilityStyles();
					}),
				);
		});

		this.renderFoldableSection(contentEl, "hide-ui-sidebar", "h3", "Sidebar buttons", (body) => {
			const hideSidebarGroup = new SettingGroup(body);
			hideSidebarGroup
				.addSetting((setting) =>
					setting
						.setName("Hide search panel")
						.setDesc("Hides the Search button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideSearch).onChange(async (value) => {
								await this.plugin.updateSetting("hideSearch", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide bookmarks panel")
						.setDesc("Hides the Bookmarks button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideBookmarks).onChange(async (value) => {
								await this.plugin.updateSetting("hideBookmarks", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide files panel")
						.setDesc("Hides the Files button at the top of the left sidebar.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideFiles).onChange(async (value) => {
								await this.plugin.updateSetting("hideFiles", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				);
		});

		this.renderFoldableSection(contentEl, "hide-ui-panels", "h3", "Panel buttons", (body) => {
			const hidePanelsGroup = new SettingGroup(body);
			hidePanelsGroup
				.addSetting((setting) =>
					setting
						.setName("Hide left panel button")
						.setDesc("Hides the left sidebar collapse/expand button.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideLeftPanel).onChange(async (value) => {
								await this.plugin.updateSetting("hideLeftPanel", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide right panel button")
						.setDesc("Hides the right sidebar collapse/expand button.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideRightPanel).onChange(async (value) => {
								await this.plugin.updateSetting("hideRightPanel", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				);
		});

		this.renderFoldableSection(contentEl, "hide-ui-misc", "h3", "Other UI elements", (body) => {
			const hideMiscGroup = new SettingGroup(body);
			hideMiscGroup
				.addSetting((setting) =>
					setting
						.setName("Hide file name bar")
						.setDesc("Hides the large file name displayed at the top of the note content.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideFileNameBar).onChange(async (value) => {
								await this.plugin.updateSetting("hideFileNameBar", value);
								this.plugin.applyVisibilityStyles();
							}),
						),
				)
				.addSetting((setting) =>
					setting
						.setName("Hide navigation row")
						.setDesc("Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle.")
						.addToggle((toggle) =>
							toggle.setValue(settings.hideNavRow).onChange(async (value) => {
								await this.plugin.updateSetting("hideNavRow", value);
								this.plugin.applyVisibilityStyles();
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
								.onChange(async (value) => {
									await this.plugin.updateSetting("statusBarView", value as StatusBarView);
									this.plugin.applyVisibilityStyles();
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