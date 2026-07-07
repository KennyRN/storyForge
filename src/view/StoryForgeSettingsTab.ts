import { App, PluginSettingTab, Setting } from "obsidian";
import type StoryForgePlugin from "../main";

export class StoryForgeSettingsTab extends PluginSettingTab {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "storyForge" });

		new Setting(containerEl)
			.setName("Reopen storyForge panel")
			.setDesc("If you've closed the storyForge panel, click this button to bring it back.")
			.addButton((button) =>
				button
					.setButtonText("Reopen panel")
					.setCta()
					.onClick(() => void this.plugin.activateView()),
			);

		containerEl.createEl("h3", { text: "User Interface Formatting" });

		const settings = this.plugin.getSettings();

		new Setting(containerEl)
			.setName("Highlight Active Chapter/Item")
			.setDesc(
				"Shows the currently selected chapter in the storyForge panel with a yellow highlight.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.highlightActiveChapter).onChange(async (value) => {
					await this.plugin.updateSetting("highlightActiveChapter", value);
				}),
			);

		containerEl.createEl("h4", { text: "Unplaced Header and Items" });

		new Setting(containerEl)
			.setName("Muted")
			.addToggle((toggle) =>
				toggle.setValue(settings.unplacedMuted).onChange(async (value) => {
					await this.plugin.updateSetting("unplacedMuted", value);
					this.plugin.applyHeaderStyles();
				}),
			);

		const unplacedSmallCaps = new Setting(containerEl)
			.setName("Small Caps")
			.addToggle((toggle) =>
				toggle.setValue(settings.unplacedSmallCaps).onChange(async (value) => {
					await this.plugin.updateSetting("unplacedSmallCaps", value);
					this.plugin.applyHeaderStyles();
				}),
			);
		unplacedSmallCaps.nameEl.style.fontVariant = "small-caps";

		new Setting(containerEl)
			.setName("Header Colour")
			.addText((text) =>
				text.setValue(settings.unplacedColor).onChange(async (value) => {
					const v = value.trim();
					if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
						await this.plugin.updateSetting("unplacedColor", v);
						this.plugin.applyHeaderStyles();
					}
				}),
			);

		new Setting(containerEl)
			.setName("Header Size")
			.setDesc("Text size from 0.5em to 1.5em.")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 1.5, 0.25)
					.setValue(settings.unplacedFontSize)
					.onChange(async (value) => {
						await this.plugin.updateSetting("unplacedFontSize", value);
						this.plugin.applyHeaderStyles();
					}),
			);

		new Setting(containerEl)
			.setName("Unplaced Items")
			.setDesc("Text size of the items in the Unplaced pane, from 0.5em to 1.5em.")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 1.5, 0.25)
					.setValue(settings.unplacedItemsFontSize)
					.onChange(async (value) => {
						await this.plugin.updateSetting("unplacedItemsFontSize", value);
						this.plugin.applyHeaderStyles();
					}),
			);

		containerEl.createEl("h4", { text: "Codex Header" });

		new Setting(containerEl)
			.setName("Muted")
			.addToggle((toggle) =>
				toggle.setValue(settings.codexMuted).onChange(async (value) => {
					await this.plugin.updateSetting("codexMuted", value);
					this.plugin.applyHeaderStyles();
				}),
			);

		const codexSmallCaps = new Setting(containerEl)
			.setName("Small Caps")
			.addToggle((toggle) =>
				toggle.setValue(settings.codexSmallCaps).onChange(async (value) => {
					await this.plugin.updateSetting("codexSmallCaps", value);
					this.plugin.applyHeaderStyles();
				}),
			);
		codexSmallCaps.nameEl.style.fontVariant = "small-caps";

		new Setting(containerEl)
			.setName("Header Colour")
			.addText((text) =>
				text.setValue(settings.codexColor).onChange(async (value) => {
					const v = value.trim();
					if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
						await this.plugin.updateSetting("codexColor", v);
						this.plugin.applyHeaderStyles();
					}
				}),
			);

		new Setting(containerEl)
			.setName("Font Size")
			.setDesc("Text size from 0.5em to 1.5em.")
			.addSlider((slider) =>
				slider
					.setLimits(0.5, 1.5, 0.25)
					.setValue(settings.codexFontSize)
					.onChange(async (value) => {
						await this.plugin.updateSetting("codexFontSize", value);
						this.plugin.applyHeaderStyles();
					}),
			);

		containerEl.createEl("h3", { text: "Hide User Interface Elements" });

		new Setting(containerEl)
			.setName("Hide Help Button")
			.setDesc(
				"Hides the help (?) button next to the vault picker.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideHelp).onChange(async (value) => {
					await this.plugin.updateSetting("hideHelp", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide Search Button")
			.setDesc(
				"Hides the Search button at the top of the left sidebar.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideSearch).onChange(async (value) => {
					await this.plugin.updateSetting("hideSearch", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide Bookmarks Button")
			.setDesc(
				"Hides the Bookmarks button at the top of the left sidebar.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideBookmarks).onChange(async (value) => {
					await this.plugin.updateSetting("hideBookmarks", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide Left Panel Button")
			.setDesc(
				"Hides the left sidebar collapse/expand button.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideLeftPanel).onChange(async (value) => {
					await this.plugin.updateSetting("hideLeftPanel", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide Right Panel Button")
			.setDesc(
				"Hides the right sidebar collapse/expand button.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideRightPanel).onChange(async (value) => {
					await this.plugin.updateSetting("hideRightPanel", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide File Name Bar")
			.setDesc(
				"Hides the large file name displayed at the top of the note content.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideFileNameBar).onChange(async (value) => {
					await this.plugin.updateSetting("hideFileNameBar", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

		new Setting(containerEl)
			.setName("Hide Navigation Row")
			.setDesc(
				"Hides the bar beneath the tab that shows the navigation buttons, three-dot menu, and reader/edit view toggle.",
			)
			.addToggle((toggle) =>
				toggle.setValue(settings.hideNavRow).onChange(async (value) => {
					await this.plugin.updateSetting("hideNavRow", value);
					this.plugin.applyVisibilityStyles();
				}),
			);

	}
}
