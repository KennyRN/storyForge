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
		panelGroup.addSetting((setting) =>
			setting
				.setName("storyForge panel")
				.setDesc("If you've closed the storyForge panel, click this button to bring it back.")
				.addButton((button) =>
					button
						.setButtonText("Reopen panel")
						.setCta()
						.onClick(() => void this.plugin.activateView()),
				),
		);
		panelGroup.addSetting((setting) =>
			setting
				.setName("Tools panel")
				.setDesc("ribbon is hidden and the ribbon icons can be found within the tools panel")
				.addToggle((toggle) =>
					toggle.setValue(settings.useToolsPanel).onChange((value) => void this.persistUseToolsPanel(value)),
				)
				.addButton((button) =>
					button
						.setButtonText("Reopen Tools Panel")
						.setCta()
						.onClick(() => void this.plugin.activateToolsView()),
				),
		);
	}

	private async persistUseToolsPanel(value: boolean): Promise<void> {
		await this.plugin.updateSetting("useToolsPanel", value);
		this.plugin.applyVisibilityStyles();
		if (value) {
			await this.plugin.activateToolsView();
		} else {
			this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
		}
	}

	private renderPaletteSection(containerEl: HTMLElement, settings: StoryForgePluginSettings): void {
		const paletteGroup = new SettingGroup(containerEl);
		paletteGroup.addSetting((setting) =>
			setting
				.setName("Colour palette")
				.setDesc("Palette used when picking colours for storyForge's UI elements below.")
				.addDropdown((dropdown) => {
					for (const name of PALETTE_NAMES) dropdown.addOption(name, name);
					dropdown.setValue(settings.colorPaletteName).onChange((value) => void this.persistColorPaletteName(value as PaletteName));
				}),
		);
		if (settings.colorPaletteName !== "Custom") {
			paletteGroup.addSetting((setting) =>
				setting
					.setName("Palette mode")
					.setDesc("Light or dark variant of the selected palette.")
					.addDropdown((dropdown) =>
						dropdown
							.addOption("light", "Light")
							.addOption("dark", "Dark")
							.setValue(settings.colorPaletteMode)
							.onChange((value) => void this.plugin.updateSetting("colorPaletteMode", value as PaletteMode)),
					),
			);
		}

		if (settings.colorPaletteName === "Custom") {
			const customGroup = new SettingGroup(containerEl);
			settings.customPaletteColors.forEach((entry, i) => {
				customGroup.addSetting((setting) =>
					setting
						.setName(`Custom colour ${i + 1}`)
						.addText((text) =>
							text.setValue(entry.name).setPlaceholder("Name").onChange((value) => void this.persistCustomPaletteColor(settings, i, "name", value)),
						)
						.addText((text) => {
							text.setValue(entry.hex);
							text.inputEl.type = "color";
							text.onChange((value) => void this.persistCustomPaletteColor(settings, i, "hex", value));
						}),
				);
			});
		}
	}

	private async persistColorPaletteName(value: PaletteName): Promise<void> {
		await this.plugin.updateSetting("colorPaletteName", value);
		if (typeof this.update === "function") {
			this.update();
		} else {
			this.display();
		}
	}

	private async persistCustomPaletteColor(settings: StoryForgePluginSettings, index: number, field: "name" | "hex", value: string): Promise<void> {
		const colors = settings.customPaletteColors.slice();
		colors[index] = { ...colors[index], [field]: value };
		await this.plugin.updateSetting("customPaletteColors", colors);
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
	 * delegating straight into the same containerEl-based helpers `display()` uses below, so there
	 * is exactly one implementation of each row's behaviour regardless of which path runs it.
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

	/** Imperative fallback for Obsidian < 1.13.0 (this plugin's minAppVersion). Not called on newer hosts, since getSettingDefinitions() returns a non-empty array there. */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("sf-settings-tab");

		const settings = this.plugin.getSettings();

		this.renderTopActions(containerEl, settings);
		this.renderPaletteSection(containerEl, settings);
		this.renderButtonRow(containerEl);
	}
}
