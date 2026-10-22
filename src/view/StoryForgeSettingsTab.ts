import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type StoryForgePlugin from "../main";
import { ProtectionsModal } from "./ProtectionsModal";
import { NUMBERING_STYLE_OPTIONS } from "../core/numberingStyle";

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

		if (key === "seriesNumberingStyle" || key === "chapterNumberingStyle") {
			await super.setControlValue(key, value);
			this.plugin.refreshStoryForgeViews();
			return;
		}
		if (key === "hideSeriesPane" || key === "highlightActiveChapter") {
			await super.setControlValue(key, Boolean(value));
			this.plugin.refreshStoryForgeViews();
			return;
		}
		if (key === "autoFocus") {
			await super.setControlValue(key, Boolean(value));
			this.plugin.applyLeftPanelLanding({ restoreCenter: true });
			return;
		}

		await super.setControlValue(key, value);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: "group",
				items: [
					{
						name: "Series numbering",
						desc: "How `#` in a novel title is numbered.",
						control: { type: "dropdown", key: "seriesNumberingStyle", options: { ...NUMBERING_STYLE_OPTIONS } },
					},
					{
						name: "Chapter numbering",
						desc: "How `#` in a chapter title is numbered.",
						control: { type: "dropdown", key: "chapterNumberingStyle", options: { ...NUMBERING_STYLE_OPTIONS } },
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "Hide series pane",
						desc: "Hides the series header, locking storyforge to standalone book view. Series data isn't deleted.",
						control: { type: "toggle", key: "hideSeriesPane" },
					},
					{
						name: "Auto-focus",
						desc: "Enables storytelling mode when the vault opens, otherwise opens in story library mode.",
						control: { type: "toggle", key: "autoFocus" },
					},
					{
						name: "Highlight active chapter/item",
						desc: "Highlights the currently selected chapter, or item, in the storyLibrary panel.",
						control: { type: "toggle", key: "highlightActiveChapter" },
					},
				],
			},
			{
				type: "group",
				items: [
					{
						name: "storyforge",
						desc: "If you've closed the storyforge panel, click this to bring it back.",
						action: () => {
							void this.plugin.activateView();
						},
					},
					{
						name: "storytelling mode",
						desc: "If you've closed storytelling mode, click this to bring it back.",
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
						name: "Protections",
						desc: "Backup and protection options.",
						action: () => {
							new ProtectionsModal(this.app, this.plugin).open();
						},
					},
				],
			},
		];
	}
}
