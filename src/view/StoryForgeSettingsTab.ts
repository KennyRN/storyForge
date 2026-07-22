import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type StoryForgePlugin from "../main";
import { CODEX_TYPES } from "../codex";
import { TOOLS_VIEW_TYPE } from "./ToolsPanel";
import { PALETTE_NAMES } from "../colorPalettes";
import { TextStyleModal } from "./TextStyleModal";
import { UiFormattingModal } from "./UiFormattingModal";
import { HideUiModal } from "./HideUiModal";
import { ProtectionsModal } from "./ProtectionsModal";

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
 * Declarative settings for Obsidian 1.13+.
 * Uses only `control` / `action` / `group` — no `render` and no `display()`.
 * Custom `render` hooks have left this tab blank on current Obsidian builds.
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
		if (key.startsWith("codexFactSectionByType.")) {
			const type = key.slice("codexFactSectionByType.".length);
			const heading = typeof value === "string" && value.trim() ? value.trim() : "Facts";
			await this.plugin.updateSetting("codexFactSectionByType", {
				...this.plugin.getSettings().codexFactSectionByType,
				[type]: heading,
			});
			return;
		}

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
			this.refreshDomState();
		}
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const paletteOptions = Object.fromEntries(PALETTE_NAMES.map((name) => [name, name]));
		const colorCount = this.plugin.getSettings().customPaletteColors.length;

		return [
			{
				name: "storyForge panel",
				desc: "If you've closed the storyForge panel, click this to bring it back.",
				action: () => {
					void this.plugin.activateView();
				},
			},
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
			{
				name: "Colour palette",
				desc: "Palette used when picking colours for storyForge UI elements.",
				control: {
					type: "dropdown",
					key: "colorPaletteName",
					options: paletteOptions,
				},
			},
			{
				name: "Palette mode",
				desc: "Light or dark variant of the selected palette.",
				visible: () => this.plugin.getSettings().colorPaletteName !== "Custom",
				control: {
					type: "dropdown",
					key: "colorPaletteMode",
					options: { light: "Light", dark: "Dark" },
				},
			},
			...Array.from({ length: colorCount }, (_, i) => [
				{
					name: `Custom colour ${i + 1} name`,
					visible: () => this.plugin.getSettings().colorPaletteName === "Custom",
					control: {
						type: "text" as const,
						key: `customPaletteColors.${i}.name`,
						placeholder: "Name",
					},
				},
				{
					name: `Custom colour ${i + 1}`,
					visible: () => this.plugin.getSettings().colorPaletteName === "Custom",
					control: {
						type: "color" as const,
						key: `customPaletteColors.${i}.hex`,
					},
				},
			]).flat(),
			{
				type: "group",
				heading: "Story Context",
				items: [
					{
						name: "Unknown name suggestions",
						desc: "List proper names found in the chapter that are not in the Codex.",
						control: {
							type: "toggle",
							key: "recommendIncludeUnknownNames",
						},
					},
					...CODEX_TYPES.map((opt) => ({
						name: `${opt.label} facts heading`,
						desc: `H2 section title in ${opt.label.toLowerCase()} Codex notes (e.g. Facts).`,
						control: {
							type: "text" as const,
							key: `codexFactSectionByType.${opt.type}`,
							placeholder: "Facts",
						},
					})),
				],
			},
			{
				name: "Text styling",
				desc: "Open the text styling modal.",
				action: () => {
					new TextStyleModal(this.app, this.plugin).open();
				},
			},
			{
				name: "storyForge interface",
				desc: "Open interface formatting options.",
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
			{
				name: "Protections",
				desc: "Backup and protection options.",
				action: () => {
					new ProtectionsModal(this.app, this.plugin).open();
				},
			},
		];
	}
}
