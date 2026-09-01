import type StoryForgePlugin from "../main";
import type { StoryForgePluginSettings } from "../main";
import { resolveMainThreadRowColor } from "./novelColor";
import { refreshAlignedPreview } from "./rowAlignedPreview";

export const LOREM_PHRASES = [
	"Lorem ipsum dolor sit",
	"Amet consectetur adipiscing elit",
	"Sed do eiusmod tempor",
	"Incididunt ut labore dolore",
	"Magna aliqua ut enim",
	"Ad minim veniam quis",
	"Nostrud exercitation ullamco laboris",
	"Nisi ut aliquip commodo",
	"Consequat duis aute irure",
	"Dolor in reprehenderit voluptate",
	"Velit esse cillum dolore",
	"Eu fugiat nulla pariatur",
	"Excepteur sint occaecat cupidatat",
	"Non proident sunt in",
	"Culpa qui officia deserunt",
	"Mollit anim id est",
	"Laborum perspiciatis unde omnis",
	"Iste natus error sit",
	"Voluptatem accusantium doloremque",
];

function mutedOr(color: string, muted: boolean): string {
	return muted ? "var(--text-muted)" : color;
}

export interface ChromeRow {
	name: string;
	overrideFontKey: keyof StoryForgePluginSettings;
	fontFamilyKey: keyof StoryForgePluginSettings;
	fontWeightKey: keyof StoryForgePluginSettings;
	sizeKey: keyof StoryForgePluginSettings;
	cssPrefix: string;
	preview: (s: StoryForgePluginSettings, plugin: StoryForgePlugin) => string;
	/** Fill behind the specimen when this text sits on a coloured bar in the live UI. */
	previewBackground?: (s: StoryForgePluginSettings, plugin: StoryForgePlugin) => string;
	/** Combined `excepteur: non proident` preview, kept on this row. */
	previewKind?: "option-selectee";
	skipPreview?: boolean;
	/** Existing small-caps setting for this font, shown in the list → text table. */
	smallCapsKey?: keyof StoryForgePluginSettings;
	/** Render this row and `pair` as equal halves of one setting row. */
	pair?: ChromeRow;
}

export interface ChromeSection {
	heading: string;
	rows: ChromeRow[];
}

export function chromeCatalog(plugin: StoryForgePlugin): ChromeSection[] {
	const thread = resolveMainThreadRowColor(plugin.app, plugin.getSettings());
	const libraryItems = (s: StoryForgePluginSettings) => mutedOr(s.libraryItemsColor, s.libraryItemsMuted);
	const unplaced = (s: StoryForgePluginSettings) => mutedOr(s.unplacedColor, s.unplacedMuted);
	const codex = (s: StoryForgePluginSettings) => mutedOr(s.codexColor, s.codexMuted);
	const archive = (s: StoryForgePluginSettings) => mutedOr(s.archiveHeaderColor, s.archiveHeaderMuted);
	return [
		{
			heading: "Series",
			rows: [
				{
					name: "Series title",
					overrideFontKey: "librarySeriesTitleOverrideFont",
					fontFamilyKey: "librarySeriesTitleFontFamily",
					fontWeightKey: "librarySeriesTitleFontWeight",
					sizeKey: "librarySeriesTitleFontSize",
					cssPrefix: "--sf-lib-series",
					smallCapsKey: "librarySeriesTitleSmallCaps",
					preview: (s) => s.librarySeriesTitleColor,
				},
			],
		},
		{
			heading: "Library",
			rows: [
				{
					name: "Novels",
					overrideFontKey: "libraryBookTitleOverrideFont",
					fontFamilyKey: "libraryBookTitleFontFamily",
					fontWeightKey: "libraryBookTitleFontWeight",
					sizeKey: "libraryBookTitleFontSize",
					cssPrefix: "--sf-lib-book",
					smallCapsKey: "libraryBookTitleSmallCaps",
					preview: (s) => libraryItems(s),
				},
				{
					name: "Subtitle",
					overrideFontKey: "libraryBookSubtitleOverrideFont",
					fontFamilyKey: "libraryBookSubtitleFontFamily",
					fontWeightKey: "libraryBookSubtitleFontWeight",
					sizeKey: "libraryBookSubtitleFontSize",
					cssPrefix: "--sf-lib-subtitle",
					smallCapsKey: "libraryBookSubtitleSmallCaps",
					preview: (s) => libraryItems(s),
				},
				{
					name: "Library items",
					overrideFontKey: "libraryItemsOverrideFont",
					fontFamilyKey: "libraryItemsFontFamily",
					fontWeightKey: "libraryItemsFontWeight",
					sizeKey: "libraryItemsFontSize",
					cssPrefix: "--sf-lib-items",
					preview: (s) => libraryItems(s),
				},
			],
		},
		{
			heading: "Unplaced",
			rows: [
				{
					name: "Header",
					overrideFontKey: "unplacedOverrideFont",
					fontFamilyKey: "unplacedFontFamily",
					fontWeightKey: "unplacedFontWeight",
					sizeKey: "unplacedFontSize",
					cssPrefix: "--sf-unplaced",
					smallCapsKey: "unplacedSmallCaps",
					preview: (s) => unplaced(s),
				},
				{
					name: "Unplaced items",
					overrideFontKey: "unplacedItemsOverrideFont",
					fontFamilyKey: "unplacedItemsFontFamily",
					fontWeightKey: "unplacedItemsFontWeight",
					sizeKey: "unplacedItemsFontSize",
					cssPrefix: "--sf-unplaced-items",
					preview: (s) => unplaced(s),
				},
			],
		},
		{
			heading: "Codex",
			rows: [
				{
					name: "Codex font",
					overrideFontKey: "codexNoteLabelOverrideFont",
					fontFamilyKey: "codexNoteLabelFontFamily",
					fontWeightKey: "codexNoteLabelFontWeight",
					sizeKey: "codexNoteLabelFontSize",
					cssPrefix: "--sf-codex-note",
					preview: (s) => codex(s),
				},
			],
		},
		{
			heading: "storytelling",
			rows: [
				{
					name: "storyTelling items",
					overrideFontKey: "storytellingItemsOverrideFont",
					fontFamilyKey: "storytellingItemsFontFamily",
					fontWeightKey: "storytellingItemsFontWeight",
					sizeKey: "storytellingItemsFontSize",
					cssPrefix: "--sf-storytelling-items",
					preview: (s) =>
						s.storytellingLinkItemsColorToLibrary
							? libraryItems(s)
							: mutedOr(s.storytellingItemsColor, s.storytellingItemsMuted),
				},
			],
		},
		{
			heading: "Novel",
			rows: [
				{
					name: "Novel title",
					overrideFontKey: "recommendNovelTitleOverrideFont",
					fontFamilyKey: "recommendNovelTitleFontFamily",
					fontWeightKey: "recommendNovelTitleFontWeight",
					sizeKey: "recommendNovelTitleFontSize",
					cssPrefix: "--sf-recommend-novel-title",
					smallCapsKey: "recommendNovelTitleSmallCaps",
					preview: (s) => mutedOr(s.recommendNovelTitleColor, s.recommendNovelTitleMuted),
				},
				{
					name: "Novel subtitle",
					overrideFontKey: "recommendNovelSubtitleOverrideFont",
					fontFamilyKey: "recommendNovelSubtitleFontFamily",
					fontWeightKey: "recommendNovelSubtitleFontWeight",
					sizeKey: "recommendNovelSubtitleFontSize",
					cssPrefix: "--sf-recommend-novel-subtitle",
					smallCapsKey: "recommendNovelSubtitleSmallCaps",
					preview: (s) => mutedOr(s.recommendNovelSubtitleColor, s.recommendNovelSubtitleMuted),
				},
			],
		},
		{
			heading: "Chapter",
			rows: [
				{
					name: "Chapter title",
					overrideFontKey: "recommendChapterTitleOverrideFont",
					fontFamilyKey: "recommendChapterTitleFontFamily",
					fontWeightKey: "recommendChapterTitleFontWeight",
					sizeKey: "recommendChapterTitleFontSize",
					cssPrefix: "--sf-recommend-chapter",
					smallCapsKey: "recommendChapterTitleSmallCaps",
					preview: () => thread.text,
					previewBackground: () => thread.background,
				},
				{
					name: "option",
					overrideFontKey: "recommendMetaLabelOverrideFont",
					fontFamilyKey: "recommendMetaLabelFontFamily",
					fontWeightKey: "recommendMetaLabelFontWeight",
					sizeKey: "recommendMetaLabelFontSize",
					cssPrefix: "--sf-recommend-meta-label",
					smallCapsKey: "recommendMetaLabelSmallCaps",
					preview: (s) => mutedOr(s.recommendMetaLabelColor, s.recommendMetaLabelMuted),
					previewKind: "option-selectee",
				},
				{
					name: "selectee",
					overrideFontKey: "recommendMetaControlOverrideFont",
					fontFamilyKey: "recommendMetaControlFontFamily",
					fontWeightKey: "recommendMetaControlFontWeight",
					sizeKey: "recommendMetaControlFontSize",
					cssPrefix: "--sf-recommend-meta-control",
					preview: (s) => mutedOr(s.recommendMetaControlColor, s.recommendMetaControlMuted),
					skipPreview: true,
				},
				{
					name: "Synopsis",
					overrideFontKey: "recommendSynopsisOverrideFont",
					fontFamilyKey: "recommendSynopsisFontFamily",
					fontWeightKey: "recommendSynopsisFontWeight",
					sizeKey: "recommendSynopsisFontSize",
					cssPrefix: "--sf-recommend-synopsis",
					preview: (s) => mutedOr(s.recommendSynopsisColor, false),
				},
			],
		},
		{
			heading: "Sections",
			rows: [
				{
					name: "Labels",
					overrideFontKey: "recommendSectionTitleOverrideFont",
					fontFamilyKey: "recommendSectionTitleFontFamily",
					fontWeightKey: "recommendSectionTitleFontWeight",
					sizeKey: "recommendSectionTitleFontSize",
					cssPrefix: "--sf-recommend-section",
					smallCapsKey: "recommendSectionTitleSmallCaps",
					preview: () => thread.text,
					previewBackground: () => thread.background,
				},
				{
					name: "Text",
					overrideFontKey: "recommendItemsOverrideFont",
					fontFamilyKey: "recommendItemsFontFamily",
					fontWeightKey: "recommendItemsFontWeight",
					sizeKey: "recommendItemsFontSize",
					cssPrefix: "--sf-recommend-items",
					preview: (s) => mutedOr(s.recommendItemsColor, s.recommendItemsMuted),
				},
			],
		},
		{
			heading: "Dossier",
			rows: [
				{
					name: "Dossier search",
					overrideFontKey: "recommendDossierHeaderOverrideFont",
					fontFamilyKey: "recommendDossierHeaderFontFamily",
					fontWeightKey: "recommendDossierHeaderFontWeight",
					sizeKey: "recommendDossierHeaderFontSize",
					cssPrefix: "--sf-recommend-dossier",
					smallCapsKey: "recommendDossierHeaderSmallCaps",
					preview: (s) => mutedOr(s.recommendDossierHeaderColor, s.recommendDossierHeaderMuted),
				},
			],
		},
		{
			heading: "Archive",
			rows: [
				{
					name: "Header",
					overrideFontKey: "archiveHeaderOverrideFont",
					fontFamilyKey: "archiveHeaderFontFamily",
					fontWeightKey: "archiveHeaderFontWeight",
					sizeKey: "archiveHeaderFontSize",
					cssPrefix: "--sf-archive-header",
					smallCapsKey: "archiveHeaderSmallCaps",
					preview: (s) => archive(s),
				},
				{
					name: "Archive items",
					overrideFontKey: "archiveItemsOverrideFont",
					fontFamilyKey: "archiveItemsFontFamily",
					fontWeightKey: "archiveItemsFontWeight",
					sizeKey: "archiveItemsFontSize",
					cssPrefix: "--sf-archive-items",
					preview: (s) => archive(s),
				},
			],
		},
	];
}

export function restyleForPrefix(plugin: StoryForgePlugin, cssPrefix: string): () => void {
	return () => {
		if (cssPrefix.startsWith("--sf-lib-")) plugin.applyLibraryHeaderStyles();
		else if (cssPrefix.startsWith("--sf-unplaced")) plugin.applyHeaderStyles();
		else if (cssPrefix.startsWith("--sf-codex-")) {
			plugin.applyCodexFolderStyle();
			plugin.applyCodexNoteLabelStyle();
		} else if (cssPrefix.startsWith("--sf-storytelling-")) {
			plugin.applyStorytellingItemsStyle();
			plugin.applyHighlightStyle();
		} else plugin.applyRightRailPanelStyles();
		refreshAlignedPreview();
	};
}

/** Family, weight, variant, and size vars the live chrome uses for this row. */
export function chromeTypeStyles(prefix: string): Record<string, string> {
	return {
		fontFamily: `var(${prefix}-family, inherit)`,
		fontVariationSettings: `var(${prefix}-variation, normal)`,
		fontWeight: `var(${prefix}-weight, inherit)`,
		fontVariant: `var(${prefix}-variant, normal)`,
		fontSize: `var(${prefix}-size, inherit)`,
	};
}

export function paintChromeTextPreview(
	slot: HTMLElement,
	plugin: StoryForgePlugin,
	row: ChromeRow,
	sample: string,
): void {
	const s = plugin.getSettings();
	const color = row.preview(s, plugin);
	const background = row.previewBackground?.(s, plugin);
	slot.empty();
	const sampleEl = slot.createDiv({
		cls: background ? "sf-row-preview-pill" : "sf-row-preview-sample",
		text: sample,
	});
	sampleEl.setCssStyles({
		color,
		...(background ? { backgroundColor: background } : {}),
		...chromeTypeStyles(row.cssPrefix),
	});
}

export function paintPairedChromePreview(
	slot: HTMLElement,
	plugin: StoryForgePlugin,
	left: ChromeRow,
	right: ChromeRow,
	leftSample: string,
	rightSample: string,
): void {
	slot.empty();
	slot.addClass("sf-row-preview-pair");
	paintChromeTextPreview(slot.createDiv({ cls: "sf-row-preview-pair-half" }), plugin, left, leftSample);
	paintChromeTextPreview(slot.createDiv({ cls: "sf-row-preview-pair-half" }), plugin, right, rightSample);
}

/** Shared specimen for option/selectee in list text and size. */
export function paintOptionSelecteeChromePreview(slot: HTMLElement, plugin: StoryForgePlugin): void {
	const s = plugin.getSettings();
	slot.empty();
	const line = slot.createDiv({ cls: "sf-row-preview-sample" });
	const option = line.createSpan({ text: "excepteur:" });
	option.setCssStyles({
		color: mutedOr(s.recommendMetaLabelColor, s.recommendMetaLabelMuted),
		...chromeTypeStyles("--sf-recommend-meta-label"),
	});
	const selectee = line.createSpan({ text: " non proident" });
	selectee.setCssStyles({
		color: mutedOr(s.recommendMetaControlColor, s.recommendMetaControlMuted),
		...chromeTypeStyles("--sf-recommend-meta-control"),
	});
}
