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
	/** Render this row and `pair` on one line (label + swatch, then label + swatch). */
	pair?: ColourRow;
}

interface ColourSection {
	heading: string;
	rows: ColourRow[];
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
			heading: "Series",
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
			],
		},
		{
			heading: "Library",
			rows: [
				{
					label: "Library",
					mainKey: "libraryItemsColor",
					mainMutedKey: "libraryItemsMuted",
					textKey: "highlightTextColor",
					restyle: panelRestyle,
					effectiveMain: (s) => mutedOr(s.libraryItemsColor, s.libraryItemsMuted),
					effectiveText: (s) => s.highlightTextColor,
				},
			],
		},
		{
			heading: "Unplaced",
			rows: [
				{
					label: "Unplaced",
					mainKey: "unplacedColor",
					mainMutedKey: "unplacedMuted",
					textKey: "unplacedHighlightTextColor",
					restyle: headerRestyle,
					effectiveMain: (s) => mutedOr(s.unplacedColor, s.unplacedMuted),
					effectiveText: (s) => s.unplacedHighlightTextColor,
				},
			],
		},
		{
			heading: "Codex",
			rows: [
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
			rows: [
				{
					label: "storyTelling items",
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
			rows: [
				{
					label: "Active tab icons",
					mainKey: "recommendTabsActiveColor",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => s.recommendTabsActiveColor,
				},
				{
					label: "Inactive tab icons",
					mainKey: "recommendTabsColor",
					mainMutedKey: "recommendTabsMuted",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendTabsColor, s.recommendTabsMuted),
				},
				{
					label: "Focus mode icon",
					mainKey: "recommendFocusModeIconColor",
					icon: true,
					restyle: railRestyle,
					effectiveMain: (s) => s.recommendFocusModeIconColor,
				},
			],
		},
		{
			heading: "Novel",
			rows: [
				{
					label: "Novel title",
					mainKey: "recommendNovelTitleColor",
					mainMutedKey: "recommendNovelTitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendNovelTitleColor, s.recommendNovelTitleMuted),
				},
				{
					label: "Novel subtitle",
					mainKey: "recommendNovelSubtitleColor",
					mainMutedKey: "recommendNovelSubtitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendNovelSubtitleColor, s.recommendNovelSubtitleMuted),
				},
			],
		},
		{
			heading: "Chapter",
			rows: [
				{
					label: "Option",
					mainKey: "recommendMetaLabelColor",
					mainMutedKey: "recommendMetaLabelMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendMetaLabelColor, s.recommendMetaLabelMuted),
					pair: {
						label: "Selectee",
						mainKey: "recommendMetaControlColor",
						mainMutedKey: "recommendMetaControlMuted",
						restyle: railRestyle,
						effectiveMain: (s) => mutedOr(s.recommendMetaControlColor, s.recommendMetaControlMuted),
					},
				},
				{
					label: "Synopsis",
					mainKey: "recommendSynopsisColor",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendSynopsisColor, false),
				},
			],
		},
		{
			heading: "Sections",
			rows: [
				{
					label: "Labels",
					mainKey: "recommendSectionTitleColor",
					mainMutedKey: "recommendSectionTitleMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendSectionTitleColor, s.recommendSectionTitleMuted),
				},
				{
					label: "Text",
					mainKey: "recommendItemsColor",
					mainMutedKey: "recommendItemsMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendItemsColor, s.recommendItemsMuted),
				},
				{
					label: "Named but not in Codex",
					mainKey: "recommendUnknownColor",
					mainMutedKey: "recommendUnknownMuted",
					textKey: "recommendUnknownHeaderColor",
					textMutedKey: "recommendUnknownHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendUnknownColor, s.recommendUnknownMuted),
					effectiveText: (s) => mutedOr(s.recommendUnknownHeaderColor, s.recommendUnknownHeaderMuted),
				},
				{
					label: "Details to capture",
					mainKey: "recommendCaptureColor",
					mainMutedKey: "recommendCaptureMuted",
					textKey: "recommendCaptureHeaderColor",
					textMutedKey: "recommendCaptureHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendCaptureColor, s.recommendCaptureMuted),
					effectiveText: (s) => mutedOr(s.recommendCaptureHeaderColor, s.recommendCaptureHeaderMuted),
				},
				{
					label: "Holding area",
					mainKey: "recommendHoldingColor",
					mainMutedKey: "recommendHoldingMuted",
					textKey: "recommendHoldingHeaderColor",
					textMutedKey: "recommendHoldingHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendHoldingColor, s.recommendHoldingMuted),
					effectiveText: (s) => mutedOr(s.recommendHoldingHeaderColor, s.recommendHoldingHeaderMuted),
				},
				{
					label: "Resolved",
					mainKey: "recommendResolvedColor",
					mainMutedKey: "recommendResolvedMuted",
					textKey: "recommendResolvedHeaderColor",
					textMutedKey: "recommendResolvedHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendResolvedColor, s.recommendResolvedMuted),
					effectiveText: (s) => mutedOr(s.recommendResolvedHeaderColor, s.recommendResolvedHeaderMuted),
				},
			],
		},
		{
			heading: "Dossier",
			rows: [
				{
					label: "Dossier search",
					mainKey: "recommendDossierHeaderColor",
					mainMutedKey: "recommendDossierHeaderMuted",
					restyle: railRestyle,
					effectiveMain: (s) => mutedOr(s.recommendDossierHeaderColor, s.recommendDossierHeaderMuted),
				},
			],
		},
		{
			heading: "Archive",
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

function bindRowTextSwatch(plugin: StoryForgePlugin, cell: HTMLElement, row: ColourRow): void {
	const restyle = () => row.restyle(plugin);
	bindSwatch(
		plugin,
		cell,
		row.label,
		"text",
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
		case "recommendNovelTitleColor":
			return "--sf-recommend-novel-title";
		case "recommendNovelSubtitleColor":
			return "--sf-recommend-novel-subtitle";
		case "recommendMetaLabelColor":
			return "--sf-recommend-meta-label";
		case "recommendMetaControlColor":
			return "--sf-recommend-meta-control";
		case "recommendSynopsisColor":
			return "--sf-recommend-synopsis";
		case "recommendSectionTitleColor":
		case "recommendUnknownColor":
		case "recommendCaptureColor":
		case "recommendHoldingColor":
		case "recommendResolvedColor":
			return "--sf-recommend-section";
		case "recommendItemsColor":
			return "--sf-recommend-items";
		case "recommendDossierHeaderColor":
			return "--sf-recommend-dossier";
		case "archiveHeaderColor":
			return "--sf-archive-items";
		default:
			return undefined;
	}
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
		const sample = slot.createDiv({ cls: "sf-row-preview-sample", text: row.label });
		sample.setCssStyles({ color, ...type });
		return;
	}
	const pill = slot.createDiv({ cls: "sf-row-preview-pill", text: row.label });
	pill.setCssStyles({
		backgroundColor: color,
		color: row.effectiveText(s, plugin),
		...type,
	});
}

function paintPairedColourPreview(slot: HTMLElement, plugin: StoryForgePlugin, left: ColourRow, right: ColourRow): void {
	slot.empty();
	slot.addClass("sf-row-preview-pair");
	paintColourPreview(slot.createDiv({ cls: "sf-row-preview-pair-half" }), plugin, left);
	paintColourPreview(slot.createDiv({ cls: "sf-row-preview-pair-half" }), plugin, right);
}

function renderColourPairRow(parent: HTMLElement, plugin: StoryForgePlugin, left: ColourRow, right: ColourRow): void {
	const pairEl = parent.createDiv({ cls: "sf-meta-pair-row sf-meta-pair-row--colours" });
	for (const row of [left, right]) {
		const half = pairEl.createDiv({ cls: "sf-meta-pair-half" });
		half.createSpan({ cls: "sf-meta-pair-label", text: row.label });
		bindRowTextSwatch(plugin, half, row);
	}
	markAlignedPreview(pairEl, (slot) => paintPairedColourPreview(slot, plugin, left, right));
}

function renderPlainColourRow(parent: HTMLElement, plugin: StoryForgePlugin, row: ColourRow): void {
	const el = parent.createDiv({ cls: "sf-colour-plain-row" });
	el.createSpan({ cls: "sf-meta-pair-label", text: row.label });
	bindRowTextSwatch(plugin, el, row);
	markAlignedPreview(el, (slot) => paintColourPreview(slot, plugin, row));
}

function renderColourTable(parent: HTMLElement, plugin: StoryForgePlugin, rows: ColourRow[]): void {
	const table = parent.createEl("table", { cls: "sf-box-colour-table" });
	const headRow = table.createEl("thead").createEl("tr");
	headRow.createEl("th");
	headRow.createEl("th", { text: "main" });
	headRow.createEl("th", { text: "text" });
	const tbody = table.createEl("tbody");
	for (const row of rows) {
		const restyle = () => row.restyle(plugin);
		const tr = tbody.createEl("tr");
		tr.createEl("th", { text: row.label, attr: { scope: "row" } });
		const mainCell = tr.createEl("td");
		const textCell = tr.createEl("td");
		if (row.icon || row.textKey) {
			bindSwatch(
				plugin,
				mainCell,
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
		if (row.textKey) {
			bindSwatch(plugin, textCell, row.label, "text", row.textKey, row.textMutedKey, restyle);
		} else if (!row.icon) {
			bindSwatch(
				plugin,
				textCell,
				row.label,
				"text",
				row.mainKey,
				row.mainMutedKey,
				restyle,
				row.mainLeading?.(plugin, restyle),
				row.mainMutedOption?.(plugin, restyle),
				row.onMainPick ? (hex) => row.onMainPick!(plugin, hex, restyle) : undefined,
			);
		}
		markAlignedPreview(tr, (slot) => paintColourPreview(slot, plugin, row));
	}
}

/** Colour catalogue for the interface modal's Colours tab. */
export function renderInterfaceColoursTab(body: HTMLElement, plugin: StoryForgePlugin): void {
	const scroll = mountPlainScroll(body);
	for (const section of catalog()) {
		const group = new SettingGroup(scroll);
		group.setHeading(section.heading);
		if (section.rows.some((row) => row.pair)) {
			for (const row of section.rows) {
				if (row.pair) renderColourPairRow(group.listEl, plugin, row, row.pair);
				else renderPlainColourRow(group.listEl, plugin, row);
			}
			continue;
		}
		renderColourTable(group.listEl, plugin, section.rows);
	}
}
