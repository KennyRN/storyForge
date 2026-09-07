import { SettingGroup, setIcon } from "obsidian";
import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { ICON_FORGE } from "../icons";
import {
	bindColorSwatchButton,
	mountPlainScroll,
	persistAndRestyle,
	type ColorSwatchLeadingOption,
	type ColorSwatchMutedOption,
} from "./styleModalHelpers";
import { resolveThemeMutedColor } from "./PalettePickerModal";
import { markAlignedPreview, refreshAlignedPreview } from "./rowAlignedPreview";
import { mountSectionChromePickerOutsideBox, resolveTitleShadow } from "./sectionChrome";

function mutedSwatch(
	plugin: StoryForgePlugin,
	key: keyof StoryForgePluginSettings,
	active: boolean | (() => boolean),
	restyle: () => void,
): ColorSwatchMutedOption {
	return {
		isActive: active,
		onSelect: () => persistAndRestyle(plugin, key, true, restyle),
		onClear: () => persistAndRestyle(plugin, key, false, restyle),
	};
}

function mutedOr(color: string, muted: boolean): string {
	return muted ? "var(--text-muted)" : color;
}

interface ColourRow {
	label: string;
	mainKey: keyof StoryForgePluginSettings;
	mainMutedKey?: keyof StoryForgePluginSettings;
	textKey?: keyof StoryForgePluginSettings;
	textMutedKey?: keyof StoryForgePluginSettings;
	/** Icon-only chrome (Navigation tabs / focus). Preview is the forge-family glyph, not a pill. */
	icon?: boolean;
	restyle: (plugin: StoryForgePlugin) => void;
	effectiveMain: (s: StoryForgePluginSettings, plugin: StoryForgePlugin) => string;
	effectiveText?: (s: StoryForgePluginSettings, plugin: StoryForgePlugin) => string;
	onMainPick?: (plugin: StoryForgePlugin, hex: string, restyle: () => void) => void;
	mainMutedOption?: (plugin: StoryForgePlugin, restyle: () => void) => ColorSwatchMutedOption;
	mainLeading?: (plugin: StoryForgePlugin, restyle: () => void) => ColorSwatchLeadingOption;
	/** Combined `option: selectee` preview, kept on this row. */
	preview?: "option-selectee";
	skipPreview?: boolean;
	/** Story Context section card; follows box / header-pill / title-text chrome. */
	sectionChrome?: boolean;
}

interface ColourSection {
	heading: string;
	rows: ColourRow[];
	/** First swatch column header. Omit to hide that column. */
	mainHeader?: "primary" | "main";
	/** Text swatch column. Default true; set false for main-only tables. */
	textHeader?: boolean;
	splitPreview?: boolean;
	chromePicker?: boolean;
}

function panelRestyle(plugin: StoryForgePlugin): void {
	plugin.applyLibraryHeaderStyles();
	plugin.applyHighlightStyle();
	plugin.applyStorytellingItemsStyle();
	refreshAlignedPreview();
}

function headerRestyle(plugin: StoryForgePlugin): void {
	plugin.applyHeaderStyles();
	plugin.applyHighlightStyle();
	plugin.applyCodexFolderStyle();
	plugin.applyCodexNoteLabelStyle();
	refreshAlignedPreview();
}

function railRestyle(plugin: StoryForgePlugin): void {
	plugin.applyRightRailPanelStyles();
	refreshAlignedPreview();
}

function catalog(): ColourSection[] {
	return [
		{
			heading: "storyforge panel",
			mainHeader: "primary",
			splitPreview: true,
			rows: [
				{
					label: "Series title",
					mainKey: "librarySeriesTitleColor",
					restyle: (plugin) => {
						plugin.applyLibraryHeaderStyles();
						refreshAlignedPreview();
					},
					effectiveMain: (s) => s.librarySeriesTitleColor,
				},
				{
					label: "Library",
					mainKey: "libraryItemsColor",
					mainMutedKey: "libraryItemsMuted",
					textKey: "highlightTextColor",
					restyle: panelRestyle,
					effectiveMain: (s) => mutedOr(s.libraryItemsColor, s.libraryItemsMuted),
					effectiveText: (s) => s.highlightTextColor,
				},
				{
					label: "Unplaced",
					mainKey: "unplacedColor",
					mainMutedKey: "unplacedMuted",
					textKey: "unplacedHighlightTextColor",
					restyle: headerRestyle,
					effectiveMain: (s) => mutedOr(s.unplacedColor, s.unplacedMuted),
					effectiveText: (s) => s.unplacedHighlightTextColor,
				},
				{
					label: "Codex",
					mainKey: "codexColor",
					mainMutedKey: "codexMuted",
					textKey: "codexHighlightTextColor",
					restyle: headerRestyle,
					effectiveMain: (s) => mutedOr(s.codexColor, s.codexMuted),
					effectiveText: (s) => s.codexHighlightTextColor,
				},
			],
		},
		{
			heading: "storytelling",
			mainHeader: "primary",
			splitPreview: true,
			rows: [
				{
					label: "storytelling",
					mainKey: "storytellingItemsColor",
					textKey: "storytellingHighlightTextColor",
					restyle: panelRestyle,
					effectiveMain: (s) =>
						s.storytellingLinkItemsColorToLibrary
							? mutedOr(s.libraryItemsColor, s.libraryItemsMuted)
							: mutedOr(s.storytellingItemsColor, s.storytellingItemsMuted),
					effectiveText: (s) =>
						s.storytellingLinkItemsColorToLibrary ? s.highlightTextColor : s.storytellingHighlightTextColor,
					onMainPick: (plugin, hex, restyle) => {
						void plugin
							.updateSettings({
								storytellingItemsColor: hex,
								storytellingItemsMuted: false,
								storytellingLinkItemsColorToLibrary: false,
							})
							.then(() => restyle());
					},
					mainMutedOption: (plugin, restyle) => ({
						isActive: () => {
							const s = plugin.getSettings();
							return s.storytellingItemsMuted && !s.storytellingLinkItemsColorToLibrary;
						},
						onSelect: () =>
							plugin
								.updateSettings({
									storytellingItemsMuted: true,
									storytellingLinkItemsColorToLibrary: false,
								})
								.then(() => restyle()),
						onClear: () => persistAndRestyle(plugin, "storytellingItemsMuted", false, restyle),
					}),
					mainLeading: (plugin, restyle) => {
						const s = plugin.getSettings();
						return {
							isActive: () => plugin.getSettings().storytellingLinkItemsColorToLibrary,
							label: "Chapter colour",
							swatchHex: s.libraryItemsMuted ? resolveThemeMutedColor() : s.libraryItemsColor,
							onSelect: () =>
								plugin
									.updateSettings({
										storytellingLinkItemsColorToLibrary: true,
										storytellingItemsMuted: false,
									})
									.then(() => restyle()),
							onClear: () => plugin.updateSetting("storytellingLinkItemsColorToLibrary", false).then(() => restyle()),
						};
					},
				},
			],
		},
		{
			heading: "Navigation",
			mainHeader: "main",
			textHeader: false,
			rows: [
				{
					label: "Active tab icons",
					mainKey: "storyContextTabsActiveColor",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => s.storyContextTabsActiveColor,
				},
				{
					label: "Inactive tab icons",
					mainKey: "storyContextTabsColor",
					mainMutedKey: "storyContextTabsMuted",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextTabsColor, s.storyContextTabsMuted),
				},
				{
					label: "Focus mode icon",
					mainKey: "storyContextFocusModeIconColor",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => s.storyContextFocusModeIconColor,
				},
			],
		},
		{
			heading: "Novel",
			rows: [
				{
					label: "Novel title",
					mainKey: "storyContextNovelTitleColor",
					mainMutedKey: "storyContextNovelTitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextNovelTitleColor, s.storyContextNovelTitleMuted),
				},
				{
					label: "Novel subtitle",
					mainKey: "storyContextNovelSubtitleColor",
					mainMutedKey: "storyContextNovelSubtitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextNovelSubtitleColor, s.storyContextNovelSubtitleMuted),
				},
			],
		},
		{
			heading: "Chapter",
			rows: [
				{
					label: "option",
					mainKey: "storyContextMetaLabelColor",
					mainMutedKey: "storyContextMetaLabelMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextMetaLabelColor, s.storyContextMetaLabelMuted),
					preview: "option-selectee",
				},
				{
					label: "selectee",
					mainKey: "storyContextMetaControlColor",
					mainMutedKey: "storyContextMetaControlMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextMetaControlColor, s.storyContextMetaControlMuted),
					skipPreview: true,
				},
				{
					label: "Synopsis",
					mainKey: "storyContextSynopsisColor",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextSynopsisColor, false),
				},
			],
		},
		{
			heading: "Sections",
			mainHeader: "main",
			chromePicker: true,
			rows: [
				{
					label: "Labels",
					mainKey: "storyContextSectionTitleColor",
					mainMutedKey: "storyContextSectionTitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextSectionTitleColor, s.storyContextSectionTitleMuted),
				},
				{
					label: "Text",
					mainKey: "storyContextItemsColor",
					mainMutedKey: "storyContextItemsMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextItemsColor, s.storyContextItemsMuted),
				},
				{
					label: "Named but not in Codex",
					mainKey: "storyContextUnknownColor",
					mainMutedKey: "storyContextUnknownMuted",
					textKey: "storyContextUnknownHeaderColor",
					textMutedKey: "storyContextUnknownHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextUnknownColor, s.storyContextUnknownMuted),
					effectiveText: (s) => mutedOr(s.storyContextUnknownHeaderColor, s.storyContextUnknownHeaderMuted),
					sectionChrome: true,
				},
			],
		},
		{
			heading: "Dossier",
			rows: [
				{
					label: "Dossier search",
					mainKey: "storyContextDossierHeaderColor",
					mainMutedKey: "storyContextDossierHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.storyContextDossierHeaderColor, s.storyContextDossierHeaderMuted),
				},
			],
		},
		{
			heading: "Archive",
			mainHeader: "main",
			rows: [
				{
					label: "Archive",
					mainKey: "archiveHeaderColor",
					mainMutedKey: "archiveHeaderMuted",
					textKey: "archiveHighlightTextColor",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.archiveHeaderColor, s.archiveHeaderMuted),
					effectiveText: (s) => s.archiveHighlightTextColor,
				},
			],
		},
	];
}

function bindSwatch(
	plugin: StoryForgePlugin,
	cell: HTMLElement,
	label: string,
	role: "main" | "text",
	colorKey: keyof StoryForgePluginSettings,
	mutedKey: keyof StoryForgePluginSettings | undefined,
	restyle: () => void,
	leading?: ColorSwatchLeadingOption,
	mutedOption?: ColorSwatchMutedOption,
	onPickHex?: (hex: string) => void,
): void {
	const settings = plugin.getSettings();
	const button = cell.createEl("button", { attr: { type: "button" } });
	bindColorSwatchButton(
		plugin.app,
		plugin,
		button,
		settings[colorKey] as string,
		(hex) => {
			if (onPickHex) onPickHex(hex);
			else void plugin.updateSetting(colorKey as never, hex as never).then(() => restyle());
		},
		undefined,
		mutedOption ?? (mutedKey ? mutedSwatch(plugin, mutedKey, () => plugin.getSettings()[mutedKey] as boolean, restyle) : undefined),
		leading,
	);
	button.setAttr("aria-label", `${label} ${role} colour`);
}

function bindRowMainSwatch(plugin: StoryForgePlugin, cell: HTMLElement, row: ColourRow, restyle: () => void): void {
	bindSwatch(
		plugin,
		cell,
		row.label,
		"main",
		row.mainKey,
		row.mainMutedKey,
		restyle,
		row.mainLeading?.(plugin, restyle),
		row.mainMutedOption?.(plugin, restyle),
		row.onMainPick ? (hex) => row.onMainPick!(plugin, hex, restyle) : undefined,
	);
}

function previewTypeStyles(prefix: string | undefined): Record<string, string> {
	if (!prefix) return {};
	return {
		fontFamily: `var(${prefix}-family, inherit)`,
		fontVariationSettings: `var(${prefix}-variation, normal)`,
		fontWeight: `var(${prefix}-weight, inherit)`,
		fontVariant: `var(${prefix}-variant, normal)`,
		fontSize: `var(${prefix}-size, inherit)`,
	};
}

/** Same `--sf-*-family/weight` vars the Text tab writes for the matching chrome. */
function cssPrefixForColour(row: ColourRow): string | undefined {
	if (row.icon) return undefined;
	switch (row.mainKey) {
		case "librarySeriesTitleColor":
			return "--sf-lib-series";
		case "libraryItemsColor":
			return "--sf-lib-items";
		case "unplacedColor":
			return "--sf-unplaced-items";
		case "codexColor":
			return "--sf-codex-note";
		case "storytellingItemsColor":
			return "--sf-storytelling-items";
		case "storyContextNovelTitleColor":
			return "--sf-story-context-novel-title";
		case "storyContextNovelSubtitleColor":
			return "--sf-story-context-novel-subtitle";
		case "storyContextMetaLabelColor":
			return "--sf-story-context-meta-label";
		case "storyContextMetaControlColor":
			return "--sf-story-context-meta-control";
		case "storyContextSynopsisColor":
			return "--sf-story-context-synopsis";
		case "storyContextSectionTitleColor":
		case "storyContextUnknownColor":
			return "--sf-story-context-section";
		case "storyContextItemsColor":
			return "--sf-story-context-items";
		case "storyContextDossierHeaderColor":
			return "--sf-story-context-dossier";
		case "archiveHeaderColor":
			return "--sf-archive-items";
		default:
			return undefined;
	}
}

function paintPlainSample(slot: HTMLElement, text: string, color: string, type: Record<string, string>): void {
	const sample = slot.createDiv({ cls: "sf-row-preview-sample", text });
	sample.setCssStyles({ color, ...type });
}

function paintColourPreview(slot: HTMLElement, plugin: StoryForgePlugin, row: ColourRow): void {
	const s = plugin.getSettings();
	slot.empty();
	const color = row.effectiveMain(s, plugin);
	const type = previewTypeStyles(cssPrefixForColour(row));
	if (row.icon) {
		const icon = slot.createSpan({ cls: "sf-row-preview-icon sf-icon" });
		setIcon(icon, ICON_FORGE);
		icon.setCssStyles({ color });
		return;
	}
	if (!row.textKey || !row.effectiveText) {
		paintPlainSample(slot, row.label, color, type);
		return;
	}
	const textColor = row.effectiveText(s, plugin);
	if (row.sectionChrome && s.storyContextSectionChrome === "text") {
		const sample = slot.createDiv({ cls: "sf-row-preview-sample", text: row.label });
		sample.setCssStyles({
			color: textColor,
			textShadow: resolveTitleShadow(slot.ownerDocument, textColor, color),
			...type,
		});
		return;
	}
	const pill = slot.createDiv({ cls: "sf-row-preview-pill", text: row.label });
	pill.toggleClass("is-header-pill", !!row.sectionChrome && s.storyContextSectionChrome === "pill");
	pill.setCssStyles({
		backgroundColor: color,
		color: textColor,
		...type,
	});
}

function paintSplitPreview(slot: HTMLElement, plugin: StoryForgePlugin, row: ColourRow): void {
	const s = plugin.getSettings();
	slot.empty();
	slot.addClass("sf-row-preview-split");
	const type = previewTypeStyles(cssPrefixForColour(row));
	paintPlainSample(slot.createDiv({ cls: "sf-row-preview-split-primary" }), row.label, row.effectiveMain(s, plugin), type);
	paintColourPreview(slot.createDiv({ cls: "sf-row-preview-split-box" }), plugin, row);
}

function paintOptionSelecteePreview(slot: HTMLElement, plugin: StoryForgePlugin): void {
	const s = plugin.getSettings();
	slot.empty();
	const line = slot.createDiv({ cls: "sf-row-preview-sample" });
	const optionColor = mutedOr(s.storyContextMetaLabelColor, s.storyContextMetaLabelMuted);
	const selecteeColor = mutedOr(s.storyContextMetaControlColor, s.storyContextMetaControlMuted);
	const optionType = previewTypeStyles("--sf-story-context-meta-label");
	const selecteeType = previewTypeStyles("--sf-story-context-meta-control");
	const option = line.createSpan({ text: "option" });
	option.setCssStyles({ color: optionColor, ...optionType });
	const colon = line.createSpan({ text: ": " });
	colon.setCssStyles({ color: optionColor, ...optionType });
	const selectee = line.createSpan({ text: "selectee" });
	selectee.setCssStyles({ color: selecteeColor, ...selecteeType });
}

function swatchInMainColumn(row: ColourRow): boolean {
	return !!(row.icon || row.textKey);
}

function swatchInTextColumn(row: ColourRow): boolean {
	return !row.icon;
}

function renderColourTable(parent: HTMLElement, plugin: StoryForgePlugin, section: ColourSection): void {
	const table = parent.createEl("table", { cls: "sf-box-colour-table" });
	const headRow = table.createEl("thead").createEl("tr");
	headRow.createEl("th");
	headRow.createEl("th", { text: section.mainHeader ?? "" });
	if (section.textHeader === false) headRow.createEl("th");
	else headRow.createEl("th", { text: "text" });
	const tbody = table.createEl("tbody");
	for (const row of section.rows) {
		const restyle = () => row.restyle(plugin);
		const tr = tbody.createEl("tr");
		tr.createEl("th", { text: row.label, attr: { scope: "row" } });
		const mainCell = tr.createEl("td");
		if (swatchInMainColumn(row)) bindRowMainSwatch(plugin, mainCell, row, restyle);
		const textCell = tr.createEl("td");
		if (row.textKey) {
			bindSwatch(plugin, textCell, row.label, "text", row.textKey, row.textMutedKey, restyle);
		} else if (swatchInTextColumn(row)) {
			bindRowMainSwatch(plugin, textCell, row, restyle);
		}
		if (!row.skipPreview) {
			markAlignedPreview(tr, (slot) => {
				if (row.preview === "option-selectee") paintOptionSelecteePreview(slot, plugin);
				else if (section.splitPreview && row.textKey) paintSplitPreview(slot, plugin, row);
				else paintColourPreview(slot, plugin, row);
			});
		}
	}
}

/** Colour catalogue for the interface modal's Colours tab. */
export function renderInterfaceColoursTab(body: HTMLElement, plugin: StoryForgePlugin): void {
	const scroll = mountPlainScroll(body);
	for (const section of catalog()) {
		const group = new SettingGroup(scroll);
		group.setHeading(section.heading);
		if (section.chromePicker) {
			mountSectionChromePickerOutsideBox(group, plugin, {
				compact: true,
				restyle: () => plugin.applyRightRailPanelStyles(),
			});
		}
		renderColourTable(group.listEl, plugin, section);
	}
}
