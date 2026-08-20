import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type StoryForgePlugin from "../main";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { COLOR_PALETTES, defaultVariantName, PALETTE_NAMES, type PresetPaletteName } from "../colorPalettes";
import { TextStyleModal } from "./TextStyleModal";
import { UiFormattingModal } from "./UiFormattingModal";
import { HideUiModal } from "./HideUiModal";
import { ProtectionsModal } from "./ProtectionsModal";
import { TagRegistryModal } from "./TagRegistryModal";
import { TitleForgeSettingsModal } from "../titleforge/view/TitleForgeSettingsModal";

function isPresetPaletteName(name: string): name is PresetPaletteName {
	return name in COLOR_PALETTES;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
	let cursor: unknown = obj;
	for (const part of path.split(".")) {
		if (cursor === null || typeof cursor !== "object") return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split(".");
	const last = parts.pop();
	if (!last) return;
	let cursor: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		let next = cursor[part];
		if (next === null || typeof next !== "object") {
			const childKey = parts[i + 1] ?? last;
			next = /^\d+$/.test(childKey) ? [] : {};
			cursor[part] = next;
		}
		cursor = next as Record<string, unknown>;
	}
	cursor[last] = value;
}

/**
 * Declarative settings for Obsidian 1.13+ (`minAppVersion`).
 * Uses only `control` / `action` / `group` — no `render` and no `display()`.
 */
export class StoryForgeSettingsTab extends PluginSettingTab {
	private plugin: StoryForgePlugin;

	constructor(app: App, plugin: StoryForgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		if (key.includes(".")) {
			return getPath(this.plugin.getSettings() as unknown as Record<string, unknown>, key);
		}
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key.includes(".")) {
			const settings = this.plugin.getSettings() as unknown as Record<string, unknown>;
			setPath(settings, key, value);
			await this.plugin.saveSettings();
			return;
		}

		if (key === "useToolsPanel") {
			await this.plugin.updateSetting("useToolsPanel", Boolean(value));
			this.plugin.applyVisibilityStyles();
			if (value) {
				void this.plugin.activateToolsView();
			} else {
				this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
			}
			return;
		}

		await super.setControlValue(key, value);
		if (key === "colorPaletteName") {
			const name = String(value);
			if (isPresetPaletteName(name)) {
				const appearance = document.body.classList.contains("theme-dark") ? "dark" : "light";
				await this.plugin.updateSetting(
					"colorPaletteVariant",
					defaultVariantName(COLOR_PALETTES[name], appearance),
				);
			}
			this.refreshDomState();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const paletteOptions = Object.fromEntries(PALETTE_NAMES.map((name) => [name, name]));
		const settings = this.plugin.getSettings();
		const colorCount = settings.customPaletteColors.length;
		const selectedName = settings.colorPaletteName;
		const variantOptions =
			isPresetPaletteName(selectedName)
				? Object.fromEntries(COLOR_PALETTES[selectedName].map((v) => [v.name, v.name]))
				: {};
		const companionActive = () => this.plugin.isFormatCompanionActive();
		const companionInactive = () => !this.plugin.isFormatCompanionActive();

		return [
			{
				type: "group",
				items: [
					{
						name: "storyLibrary panel",
						desc: "If you've closed the storyLibrary panel, click this to bring it back.",
						action: () => {
							void this.plugin.activateView();
						},
					},
					{
						name: "storyTelling panel",
						desc: "If you've closed the storyTelling (Codex) panel, click this to bring it back.",
						action: () => {
							void this.plugin.activateStorytellingView();
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Tools panel",
						desc: "Hide the ribbon; ribbon icons are available in the tools panel.",
						control: {
							type: "toggle",
							key: "useToolsPanel",
						},
					},
					{
						name: "Reopen tools panel",
						desc: "Open the tools panel if it was closed.",
						action: () => {
							void this.plugin.activateToolsView();
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Unknown name suggestions",
						desc: "List proper names found in the chapter that are not in the Codex.",
						control: {
							type: "toggle",
							key: "recommendIncludeUnknownNames",
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Colour palette",
						desc: "Palette used when picking colours for storyForge UI elements.",
						visible: companionInactive,
						control: {
							type: "dropdown",
							key: "colorPaletteName",
							options: paletteOptions,
						},
					},
					{
						name: "Palette variant",
						desc: "Named variant of the selected palette.",
						visible: () => {
							if (this.plugin.isFormatCompanionActive()) return false;
							const name = this.plugin.getSettings().colorPaletteName;
							return isPresetPaletteName(name) && COLOR_PALETTES[name].length > 1;
						},
						control: {
							type: "dropdown",
							key: "colorPaletteVariant",
							options: variantOptions,
						},
					},
					...Array.from({ length: colorCount }, (_, i) => [
						{
							name: `Custom colour ${i + 1} name`,
							visible: () => companionInactive() && this.plugin.getSettings().colorPaletteName === "Custom",
							control: {
								type: "text" as const,
								key: `customPaletteColors.${i}.name`,
								placeholder: "Name",
							},
						},
						{
							name: `Custom colour ${i + 1}`,
							visible: () => companionInactive() && this.plugin.getSettings().colorPaletteName === "Custom",
							control: {
								type: "color" as const,
								key: `customPaletteColors.${i}.hex`,
							},
						},
					]).flat(),
					{
						name: "Formatting (formatForge)",
						desc: "Text styling, colours, fonts, interface chrome, and the colour palette are managed by formatForge while it is enabled.",
						visible: companionActive,
						action: () => this.plugin.openFormatForgeSettings(),
					},
					{
						name: "Text styling",
						desc: "Open the text styling modal (editor size overrides).",
						visible: companionInactive,
						action: () => {
							new TextStyleModal(this.app, this.plugin).open();
						},
					},
					{
						name: "storyForge interface",
						desc: "Open interface formatting options.",
						visible: companionInactive,
						action: () => {
							new UiFormattingModal(this.app, this.plugin).open();
						},
					},
					{
						name: "Hide Obsidian interface elements",
						desc: "Choose which Obsidian UI chrome to hide.",
						action: () => {
							new HideUiModal(this.app, this.plugin).open();
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Tags & Codex types",
						desc: "Manage Codex entry types, chapter tags, novel tags, and the icons they draw from.",
						action: () => {
							new TagRegistryModal(this.app, () => this.refreshDomState()).open();
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Protections",
						desc: "Backup and protection options.",
						action: () => {
							new ProtectionsModal(this.app, this.plugin).open();
						},
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "titleForge",
						desc: "Title & series generator settings — nine traditions, hand-editable word lists.",
						action: () => {
							new TitleForgeSettingsModal(this.app, this.plugin.titleForge).open();
						},
					},
				],
			},
		];
	}
}
