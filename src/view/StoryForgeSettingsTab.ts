import { App, PluginSettingTab, SettingGroup, setIcon, type SettingDefinitionItem } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES, PaletteMode, PaletteName } from "../colorPalettes";
import { TextStyleModal } from "./TextStyleModal";
import { UiFormattingModal } from "./UiFormattingModal";
import { HideUiModal } from "./HideUiModal";
import { ProtectionsModal } from "./ProtectionsModal";
import { ICON_TEXT_STYLE, ICON_UI_FORMATTING, ICON_HIDE_UI, ICON_PROTECTIONS } from "../icons";

export class StoryForgeSettingsTab extends PluginSettingTab {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private renderTopActions(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		const panelGroup = new SettingGroup(containerEl);
		panelGroup.addSetting((setting) => {
			setting
				.setName("storyForge panel")
				.setDesc("If you've closed the storyForge panel, click this button to bring it back.")
				.addButton((button) =>
					button
						.setButtonText("Reopen panel")
						.setCta()
						.onClick(() => this.openStoryForgePanel()),
				);
		});
		panelGroup.addSetting((setting) => {
			setting
				.setName("Tools panel")
				.setDesc("ribbon is hidden and the ribbon icons can be found within the tools panel")
				.addToggle((toggle) =>
					toggle.setValue(settings.useToolsPanel).onChange((value) => this.persistUseToolsPanel(value)),
				)
				.addButton((button) =>
					button
						.setButtonText("Reopen Tools Panel")
						.setCta()
						.onClick(() => this.openToolsPanel()),
				);
		});
	}

	private openStoryForgePanel(): void {
		void this.plugin.activateView();
	}

	private openToolsPanel(): void {
		void this.plugin.activateToolsView();
	}

	private persistUseToolsPanel(value: boolean): void {
		void this.plugin.updateSetting("useToolsPanel", value).then(() => {
			this.plugin.applyVisibilityStyles();
			if (value) {
				void this.plugin.activateToolsView();
			} else {
				this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
			}
		});
	}

	private renderPaletteSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		const paletteGroup = new SettingGroup(containerEl);
		paletteGroup.addSetting((setting) => {
			setting
				.setName("Colour palette")
				.setDesc("Palette used when picking colours for storyForge's UI elements below.")
				.addDropdown((dropdown) => {
					for (const name of PALETTE_NAMES) dropdown.addOption(name, name);
					dropdown.setValue(settings.colorPaletteName).onChange((value) => this.persistColorPaletteName(value as PaletteName));
				});
		});
		if (settings.colorPaletteName !== "Custom") {
			paletteGroup.addSetting((setting) => {
				setting
					.setName("Palette mode")
					.setDesc("Light or dark variant of the selected palette.")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("light", "Light")
							.addOption("dark", "Dark")
							.setValue(settings.colorPaletteMode)
							.onChange((value) => this.persistColorPaletteMode(value as PaletteMode)),
					);
			});
		}

		if (settings.colorPaletteName === "Custom") {
			const customGroup = new SettingGroup(containerEl);
			settings.customPaletteColors.forEach((entry, i) => {
				customGroup.addSetting((setting) => {
					setting
						.setName(`Custom colour ${i + 1}`)
						.addText((text) =>
							text.setValue(entry.name).setPlaceholder("Name").onChange((value) => this.persistCustomPaletteColor(settings, i, "name", value)),
						)
						.addText((text) => {
							text.setValue(entry.hex);
							text.inputEl.type = "color";
							text.onChange((value) => this.persistCustomPaletteColor(settings, i, "hex", value));
						});
				});
			});
		}
	}

	private persistColorPaletteMode(value: PaletteMode): void {
		void this.plugin.updateSetting("colorPaletteMode", value);
	}

	private persistColorPaletteName(value: PaletteName): void {
		void this.plugin.updateSetting("colorPaletteName", value).then(() => this.update());
	}

	private persistCustomPaletteColor(settings: StoryForgePluginSettings, index: number, field: "name" | "hex", value: string): void {
		const colors = settings.customPaletteColors.slice();
		colors[index] = { ...colors[index], [field]: value };
		void this.plugin.updateSetting("customPaletteColors", colors);
	}

	private renderTextStyleButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_TEXT_STYLE);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Text styling" });
		buttonEl.addEventListener("click", () => {
			new TextStyleModal(this.app, this.plugin).open();
		});
	}

	private renderUiFormattingButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_UI_FORMATTING);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "storyForge interface" });
		buttonEl.addEventListener("click", () => {
			new UiFormattingModal(this.app, this.plugin).open();
		});
	}

	private renderHideUiButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_HIDE_UI);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Hide Obsidian interface elements" });
		buttonEl.addEventListener("click", () => {
			new HideUiModal(this.app, this.plugin).open();
		});
	}

	private renderProtectionsButton(containerEl: HTMLElement): void {
		const buttonEl = containerEl.createDiv({ cls: "sf-settings-button" });
		const iconEl = buttonEl.createSpan({ cls: "sf-settings-button-icon" });
		setIcon(iconEl, ICON_PROTECTIONS);
		buttonEl.createSpan({ cls: "sf-settings-button-label", text: "Protections" });
		buttonEl.addEventListener("click", () => {
			new ProtectionsModal(this.app, this.plugin).open();
		});
	}

	private renderButtonRow(containerEl: HTMLElement): void {
		const row = containerEl.createDiv({ cls: "sf-settings-button-row" });
		this.renderTextStyleButton(row);
		this.renderUiFormattingButton(row);
		this.renderHideUiButton(row);
		this.renderProtectionsButton(row);
	}

	/**
	 * Declarative path (Obsidian >= 1.13.0). Each row is rendered via the `render` escape hatch,
	 * delegating straight into the same containerEl-based helpers shared by every definition's
	 * render callback, so there is exactly one implementation of each row's behaviour.
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.getSettings();
		return [
			{
				type: "group",
				items: [
					{
						name: "storyForge panel",
						render: (setting, group) => {
							setting.settingEl.remove();
							this.renderTopActions(group.listEl, settings);
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Colour palette",
						desc: "Palette used when picking colours for storyForge's UI elements below.",
						render: (setting, group) => {
							setting.settingEl.remove();
							this.renderPaletteSection(group.listEl, settings);
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "storyForge modals",
						desc: "Text styling, interface formatting, hiding Obsidian UI elements, and protections.",
						render: (setting, group) => {
							setting.settingEl.remove();
							this.renderButtonRow(group.listEl);
						},
					},
				],
			},
		];
	}
}
