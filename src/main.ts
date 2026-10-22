import { MarkdownView, Notice, Plugin, TFile, WorkspaceLeaf, type PaneType } from "obsidian";
import { existingMainContentLeaf, resolveMainContentLeaf, type MainContentWorkspace } from "./mainContentLeaf";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { LEGACY_STORYTELLING_VIEW_TYPE, storytellingModeForAutoFocus } from "./view/leftPanelMode";
import { StoryContextView, STORY_CONTEXT_VIEW_TYPE, activateArchiveView, activateStoryContextView } from "./view/StoryContextView";
import { CODEX_TYPES, pruneMissingCodexNotes } from "./codex";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders } from "./series";
import { ensureTagRegistryFile, loadCodexTypesIntoRegistry } from "./tagRegistry";
import { seedPlotCardTiers, type PlotCardTierMap } from "./view/plotCardTier";
import { createBook, createChapter, ensureAllChapterEntries, getBookChapters, pruneMissingChapterCodexRefs, pruneMissingChapterEntries, readBookFrontmatter, syncAllBookReferenceFields, writeBookChapterOrder } from "./book";
import { resolveStorytellingCenterPath } from "./storytellingCenter";
import type { NumberingStyle } from "./numberingStyle";
import { migrateStructuralLayout, migrateVaultSchema } from "./migration";
import { registerReconciliationEvents } from "./reconciliation";
import {
	isLibraryChapterPath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	libraryChapterPath,
	seriesFilePath,
	LIBRARY_ROOT,
	CODEX_ROOT,
	NOTES_ROOT,
} from "./paths";
import type { SfLayout } from "./layout";
import { recordChapterEdit } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { countWords } from "./wordCount";
import { ICON_STORYTELLING, registerCustomIcons } from "./icons";
import { runContentBackup } from "./backup";

export type CodexFolderIndicatorThickness = "none" | "thin" | "medium" | "thick";

export type HeadingDividerThickness = "thin" | "medium" | "thick" | "extra-thick";
export type EditorScrollbarThickness = "thin" | "medium" | "thick";

/** Font catalog lives in formatForge; SF only stores the companion's font id string. */
export type CustomFontFamily = string;

export type FontWeight = "300" | "400" | "500" | "600" | "700" | "800" | "900";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";

export type StatusBarView = "hidden" | "sync-only" | "all";

export type CyclingGuideInterval = "short" | "medium" | "large";

export type DepthGuideLevel = "standard" | "deep" | "extremely-deep";

/** Story Context section chrome: boxed card, header-only pill, or title text. */
export type StoryContextSectionChrome = "box" | "pill" | "text";

const CYCLING_GUIDE_INTERVAL_WORDS: Record<CyclingGuideInterval, number> = {
	short: 300,
	medium: 500,
	large: 750,
};

const DEPTH_GUIDE_WORDS: Record<DepthGuideLevel, number> = {
	standard: 300,
	deep: 450,
	"extremely-deep": 600,
};

export interface StoryForgePluginSettings {
	hideHelp: boolean;
	hideSearch: boolean;
	hideBookmarks: boolean;
	hideFiles: boolean;
	/** Hide Obsidian's own Settings-cog icon in the vault-actions row. Defaults off (unhidden) —
	 * unlike the other hide-* flags above, which default to hidden. */
	hideObsidianSettingsIcon: boolean;
	/** Hide storyForge's own Tools panel view's tab icon in the left sidebar's tab header row.
	 * Only meaningful while useToolsPanel is on. Defaults off (unhidden). */
	hideToolsPanelIcon: boolean;
	hideLeftPanel: boolean;
	hideRightPanel: boolean;
	/** Hide Obsidian's Backlinks tab in the right sidebar. */
	hideBacklinks: boolean;
	/** Hide Obsidian's Outgoing links tab in the right sidebar. */
	hideOutgoingLinks: boolean;
	/** Hide Obsidian's Tags tab in the right sidebar. */
	hideTags: boolean;
	/** Hide Obsidian's Outline tab in the right sidebar. */
	hideOutline: boolean;
	/** Hide Obsidian's All properties tab in the right sidebar. */
	hideAllProperties: boolean;
	/**
	 * One-time Story Context rail defaults (unhide right toggle; hide native right tabs).
	 * Set after migration runs so re-loads don't re-force user choices.
	 */
	storyContextShellApplied: boolean;
	hideFileNameBar: boolean;
	hideNavRow: boolean;
	/** Hides Obsidian's tab bar in the main editor window (left/storyLibrary/right sidebars keep their own). */
	hideEditorTabs: boolean;
	hideSeriesPane: boolean;
	/**
	 * Vault-open landing for the combined left-rail panel: on → storytelling mode + Focus on;
	 * off → storyforge + Focus off. Session face changes after that stay independent of this flag.
	 */
	autoFocus: boolean;
	/**
	 * Set at the end of first-run onboarding: true only if the user opted in and
	 * `ensureWelcomeNote` ran. Not shown in settings UI. Existing vaults stay false.
	 */
	welcomeNoteCreatedOnOnboarding: boolean;
	/** The panel layout chosen from the layout selector menu (hand-off brief §2/§5.1). Persists across reloads. */
	layout: SfLayout;
	statusBarView: StatusBarView;
	highlightActiveChapter: boolean;
	highlightColor: string;
	highlightTextColor: string;
	librarySeriesTitleFontSize: number;
	librarySeriesTitleOverrideFont: boolean;
	librarySeriesTitleFontFamily: CustomFontFamily;
	librarySeriesTitleFontWeight: FontWeight;
	librarySeriesTitleColor: string;
	librarySeriesTitleSmallCaps: boolean;
	libraryBookTitleFontSize: number;
	libraryBookTitleOverrideFont: boolean;
	libraryBookTitleFontFamily: CustomFontFamily;
	libraryBookTitleFontWeight: FontWeight;
	libraryBookTitleColor: string;
	libraryBookTitleSmallCaps: boolean;
	libraryBookSubtitleFontSize: number;
	libraryBookSubtitleOverrideFont: boolean;
	libraryBookSubtitleFontFamily: CustomFontFamily;
	libraryBookSubtitleFontWeight: FontWeight;
	libraryBookSubtitleSmallCaps: boolean;
	libraryHeaderDividerBelow: boolean;
	libraryItemsFontSize: number;
	libraryItemsOverrideFont: boolean;
	libraryItemsFontFamily: CustomFontFamily;
	libraryItemsFontWeight: FontWeight;
	libraryItemsColor: string;
	libraryItemsMuted: boolean;
	/**
	 * storyTelling panel's own chapter-item styling (UiFormattingModal's "storytelling" tab) —
	 * independent of the storyLibrary panel's "Library items" settings above, except that the
	 * palette picker's "Chapter colour" option (`storytellingLinkItemsColorToLibrary`) mirrors
	 * `libraryItemsColor` and `highlightTextColor`. Highlight background always uses the items
	 * colour. Default is on, so upgrading users see no visual change until they pick another colour.
	 */
	storytellingItemsFontSize: number;
	storytellingItemsOverrideFont: boolean;
	storytellingItemsFontFamily: CustomFontFamily;
	storytellingItemsFontWeight: FontWeight;
	storytellingItemsColor: string;
	storytellingItemsMuted: boolean;
	storytellingLinkItemsColorToLibrary: boolean;
	storytellingHighlightColor: string;
	storytellingHighlightTextColor: string;
	unplacedHighlightColor: string;
	unplacedHighlightTextColor: string;
	codexHighlightColor: string;
	codexHighlightTextColor: string;
	unplacedMuted: boolean;
	unplacedSmallCaps: boolean;
	unplacedColor: string;
	unplacedFontSize: number;
	unplacedOverrideFont: boolean;
	unplacedFontFamily: CustomFontFamily;
	unplacedFontWeight: FontWeight;
	unplacedItemsFontSize: number;
	unplacedItemsOverrideFont: boolean;
	unplacedItemsFontFamily: CustomFontFamily;
	unplacedItemsFontWeight: FontWeight;
	unplacedItemsColor: string;
	unplacedItemsMuted: boolean;
	unplacedUseHeaderColorForAll: boolean;
	codexMuted: boolean;
	codexSmallCaps: boolean;
	codexColor: string;
	codexFontSize: number;
	codexOverrideFont: boolean;
	codexFontFamily: CustomFontFamily;
	codexFontWeight: FontWeight;
	codexFolderFontSize: number;
	codexFolderOverrideFont: boolean;
	codexFolderFontFamily: CustomFontFamily;
	codexFolderFontWeight: FontWeight;
	codexFolderColor: string;
	codexFolderIndicatorThickness: CodexFolderIndicatorThickness;
	codexNoteLabelFontSize: number;
	codexNoteLabelOverrideFont: boolean;
	codexNoteLabelFontFamily: CustomFontFamily;
	codexNoteLabelFontWeight: FontWeight;
	codexNoteLabelColor: string;
	codexNoteLabelUseDefaultColor: boolean;
	codexNoteLabelUseFolderColor: boolean;
	codexUseHeaderColorForAll: boolean;
	bodyTextOverrideSize: boolean;
	bodyTextSize: number;
	/**
	 * Manuscript body/heading text colour, native to storyForge (built on its own colour
	 * palette — see colorPalettes.ts) so it never depends on formatForge. Only reachable while
	 * formatForge is disconnected — TextStyleModal's one entry point is gated the same way the
	 * rest of that modal already is, so there's no risk of both plugins writing the same
	 * --sf-body-color/--sf-h#-color vars at once.
	 */
	bodyTextOverrideColor: boolean;
	bodyTextColor: string;
	heading1OverrideSize: boolean;
	heading1Size: number;
	heading1OverrideColor: boolean;
	heading1Color: string;
	heading2OverrideSize: boolean;
	heading2Size: number;
	heading2OverrideColor: boolean;
	heading2Color: string;
	heading3OverrideSize: boolean;
	heading3Size: number;
	heading3OverrideColor: boolean;
	heading3Color: string;
	heading4OverrideSize: boolean;
	heading4Size: number;
	heading4OverrideColor: boolean;
	heading4Color: string;
	heading5OverrideSize: boolean;
	heading5Size: number;
	heading5OverrideColor: boolean;
	heading5Color: string;
	heading6OverrideSize: boolean;
	heading6Size: number;
	heading6OverrideColor: boolean;
	heading6Color: string;
	/**
	 * Quote / link / list colour and quote size — same native-when-disconnected split as
	 * body/heading colour. formatForge owns fonts and, while connected, writes the same
	 * `--sf-quote-*` / `--sf-body-link-*` / `--sf-*-marker` vars from its own settings.
	 */
	blockquoteOverrideSize: boolean;
	blockquoteSize: number;
	blockquoteOverrideColor: boolean;
	blockquoteColor: string;
	blockquoteOverrideBg: boolean;
	blockquoteBgColor: string;
	blockquoteOverrideBorder: boolean;
	blockquoteBorderColor: string;
	bodyLinkOverrideColor: boolean;
	bodyLinkColor: string;
	bodyLinkOverrideHoverColor: boolean;
	bodyLinkHoverColor: string;
	bodyLinkRemoveUnderline: boolean;
	orderedListOverrideColor: boolean;
	orderedListColor: string;
	unorderedListOverrideColor: boolean;
	unorderedListColor: string;
	useToolsPanel: boolean;
	/** "canonical" enforces SF-before-Tools tab order on open; flips to "user" (permanently) the first time the user drags Tools ahead of SF. */
	panelOrderMode: "canonical" | "user";
	colorPaletteName: string;
	colorPaletteVariant: string;
	customPaletteColors: { name: string; hex: string }[];
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	/** Legacy two-state collapse list for chapter plot cards (`${bookFolderName}/${filename}`).
	 * No longer written — kept only as the one-time seed for both three-tier maps below (see
	 * migratePlotCardTiers). */
	collapsedPlotChapterKeys: string[];
	/** Novel overview centre pane chapter card tiers, same key as `collapsedPlotChapterKeys`.
	 * Only non-extended cards are stored; an absent key means extended. Seeded once from
	 * `collapsedPlotChapterKeys` (see migratePlotCardTiers), then fully independent of it. */
	novelOverviewPlotCardTiers: PlotCardTierMap;
	/** Story Context right sidebar Novel tab chapter card tiers — same shape and seeding as
	 * `novelOverviewPlotCardTiers`, independent of it. */
	storyContextPlotCardTiers: PlotCardTierMap;
	cyclingGuideEnabled: boolean;
	cyclingGuideThickness: HeadingDividerThickness;
	cyclingGuideColor: string;
	cyclingGuideFlagSize: "small" | "medium" | "large";
	cyclingGuideRoundedLines: boolean;
	cyclingGuideInterval: CyclingGuideInterval;
	depthGuideEnabled: boolean;
	depthGuideLevel: DepthGuideLevel;
	depthGuideChaptersCovered: number;
	/** Novel overview's novel length bar: divide the unwritten remainder into planned-chapter-length blocks. */
	novelGhostChaptersEnabled: boolean;
	/** Novel overview's novel length bar: 4px striped structure strip beneath the bar. */
	novelStructureGuidelinesEnabled: boolean;
	automaticBackupEnabled: boolean;
	automaticBackupFrequency: AutomaticBackupFrequency;
	lastAutomaticBackupAt: number;
	/** Per Codex type id → H2 heading label used for structured Facts in notes. */
	codexFactSectionByType: Record<string, string>;
	/** When true, the Story Context engine lists proper-name candidates not in Codex. */
	storyContextIncludeUnknownNames: boolean;
	/** How "#" resolves in book titles within a series (numberedBookTitle). */
	seriesNumberingStyle: NumberingStyle;
	/** How "#" resolves in chapter titles within a book (numberedChapterTitle). */
	chapterNumberingStyle: NumberingStyle;
	/** Thumb (foreground) colour of the manuscript editor scrollbar. */
	editorScrollbarThumbColor: string;
	/** When true, the thumb uses the active theme's own scrollbar colour instead of `editorScrollbarThumbColor`. */
	editorScrollbarUseThemeColor: boolean;
	/** Width of the manuscript editor scrollbar. */
	editorScrollbarThickness: EditorScrollbarThickness;
	/** Colour of companion icons in the Forge right-rail secondary header. */
	forgeCompanionIconColor: string;
	/** Kept for settings compatibility; Navigation no longer exposes a base colour. */
	storyContextHeaderColor: string;
	storyContextHeaderMuted: boolean;
	storyContextTabsFontSize: number;
	storyContextTabsOverrideFont: boolean;
	storyContextTabsFontFamily: CustomFontFamily;
	storyContextTabsFontWeight: FontWeight;
	storyContextTabsColor: string;
	storyContextTabsMuted: boolean;
	storyContextTabsActiveColor: string;
	storyContextFocusModeIconColor: string;
	storyContextChapterTitleFontSize: number;
	storyContextChapterTitleOverrideFont: boolean;
	storyContextChapterTitleFontFamily: CustomFontFamily;
	storyContextChapterTitleFontWeight: FontWeight;
	storyContextChapterTitleColor: string;
	storyContextChapterTitleMuted: boolean;
	storyContextChapterTitleSmallCaps: boolean;
	storyContextDossierHeaderFontSize: number;
	storyContextDossierHeaderOverrideFont: boolean;
	storyContextDossierHeaderFontFamily: CustomFontFamily;
	storyContextDossierHeaderFontWeight: FontWeight;
	storyContextDossierHeaderColor: string;
	storyContextDossierHeaderMuted: boolean;
	storyContextDossierHeaderSmallCaps: boolean;
	storyContextNovelTitleFontSize: number;
	storyContextNovelTitleOverrideFont: boolean;
	storyContextNovelTitleFontFamily: CustomFontFamily;
	storyContextNovelTitleFontWeight: FontWeight;
	storyContextNovelTitleColor: string;
	storyContextNovelTitleMuted: boolean;
	storyContextNovelTitleSmallCaps: boolean;
	storyContextNovelSubtitleFontSize: number;
	storyContextNovelSubtitleOverrideFont: boolean;
	storyContextNovelSubtitleFontFamily: CustomFontFamily;
	storyContextNovelSubtitleFontWeight: FontWeight;
	storyContextNovelSubtitleColor: string;
	storyContextNovelSubtitleMuted: boolean;
	storyContextNovelSubtitleSmallCaps: boolean;
	storyContextPlotChapterFontSize: number;
	storyContextPlotChapterOverrideFont: boolean;
	storyContextPlotChapterFontFamily: CustomFontFamily;
	storyContextPlotChapterFontWeight: FontWeight;
	storyContextPlotChapterColor: string;
	storyContextPlotChapterMuted: boolean;
	storyContextPlotChapterSmallCaps: boolean;
	storyContextSectionTitleFontSize: number;
	storyContextSectionTitleOverrideFont: boolean;
	storyContextSectionTitleFontFamily: CustomFontFamily;
	storyContextSectionTitleFontWeight: FontWeight;
	storyContextSectionTitleColor: string;
	storyContextSectionTitleMuted: boolean;
	storyContextSectionTitleSmallCaps: boolean;
	storyContextSectionChrome: StoryContextSectionChrome;
	storyContextItemsFontSize: number;
	storyContextItemsOverrideFont: boolean;
	storyContextItemsFontFamily: CustomFontFamily;
	storyContextItemsFontWeight: FontWeight;
	storyContextItemsColor: string;
	storyContextItemsMuted: boolean;
	storyContextDetailsFontSize: number;
	storyContextDetailsOverrideFont: boolean;
	storyContextDetailsFontFamily: CustomFontFamily;
	storyContextDetailsFontWeight: FontWeight;
	storyContextDetailsColor: string;
	storyContextDetailsMuted: boolean;
	storyContextUnknownColor: string;
	storyContextUnknownMuted: boolean;
	storyContextUnknownHeaderColor: string;
	storyContextUnknownHeaderMuted: boolean;
	storyContextCaptureColor: string;
	storyContextCaptureMuted: boolean;
	storyContextCaptureHeaderColor: string;
	storyContextCaptureHeaderMuted: boolean;
	storyContextHoldingColor: string;
	storyContextHoldingMuted: boolean;
	storyContextHoldingHeaderColor: string;
	storyContextHoldingHeaderMuted: boolean;
	storyContextResolvedColor: string;
	storyContextResolvedMuted: boolean;
	storyContextResolvedHeaderColor: string;
	storyContextResolvedHeaderMuted: boolean;
	storyContextMetaLabelFontSize: number;
	storyContextMetaLabelOverrideFont: boolean;
	storyContextMetaLabelFontFamily: CustomFontFamily;
	storyContextMetaLabelFontWeight: FontWeight;
	storyContextMetaLabelColor: string;
	storyContextMetaLabelMuted: boolean;
	storyContextMetaLabelSmallCaps: boolean;
	storyContextMetaControlFontSize: number;
	storyContextMetaControlOverrideFont: boolean;
	storyContextMetaControlFontFamily: CustomFontFamily;
	storyContextMetaControlFontWeight: FontWeight;
	storyContextMetaControlColor: string;
	storyContextMetaControlMuted: boolean;
	storyContextSynopsisFontSize: number;
	storyContextSynopsisOverrideFont: boolean;
	storyContextSynopsisFontFamily: CustomFontFamily;
	storyContextSynopsisFontWeight: FontWeight;
	storyContextSynopsisColor: string;
	storyContextHighlightColor: string;
	storyContextHighlightTextColor: string;
	storyContextUseHeaderColorForAll: boolean;
	archiveHeaderFontSize: number;
	archiveHeaderOverrideFont: boolean;
	archiveHeaderFontFamily: CustomFontFamily;
	archiveHeaderFontWeight: FontWeight;
	archiveHeaderColor: string;
	archiveHeaderMuted: boolean;
	archiveHeaderSmallCaps: boolean;
	archiveItemsFontSize: number;
	archiveItemsOverrideFont: boolean;
	archiveItemsFontFamily: CustomFontFamily;
	archiveItemsFontWeight: FontWeight;
	archiveItemsColor: string;
	archiveItemsMuted: boolean;
	archiveHighlightColor: string;
	archiveHighlightTextColor: string;
	archiveUseHeaderColorForAll: boolean;
}

type FontFamilySettingKey =
	| "librarySeriesTitleFontFamily"
	| "libraryBookTitleFontFamily"
	| "libraryBookSubtitleFontFamily"
	| "libraryItemsFontFamily"
	| "unplacedFontFamily"
	| "unplacedItemsFontFamily"
	| "codexFontFamily"
	| "codexFolderFontFamily"
	| "codexNoteLabelFontFamily"
	| "storyContextTabsFontFamily"
	| "storyContextChapterTitleFontFamily"
	| "storyContextDossierHeaderFontFamily"
	| "storyContextSectionTitleFontFamily"
	| "storyContextItemsFontFamily"
	| "storyContextDetailsFontFamily"
	| "storyContextMetaLabelFontFamily"
	| "storyContextMetaControlFontFamily"
	| "storyContextSynopsisFontFamily"
	| "archiveHeaderFontFamily"
	| "archiveItemsFontFamily";

const FONT_FAMILY_SETTING_KEYS: FontFamilySettingKey[] = [
	"librarySeriesTitleFontFamily",
	"libraryBookTitleFontFamily",
	"libraryBookSubtitleFontFamily",
	"libraryItemsFontFamily",
	"unplacedFontFamily",
	"unplacedItemsFontFamily",
	"codexFontFamily",
	"codexFolderFontFamily",
	"codexNoteLabelFontFamily",
	"storyContextTabsFontFamily",
	"storyContextChapterTitleFontFamily",
	"storyContextDossierHeaderFontFamily",
	"storyContextSectionTitleFontFamily",
	"storyContextItemsFontFamily",
	"storyContextDetailsFontFamily",
	"storyContextMetaLabelFontFamily",
	"storyContextMetaControlFontFamily",
	"storyContextSynopsisFontFamily",
	"archiveHeaderFontFamily",
	"archiveItemsFontFamily",
];

/** Fonts removed as choices; any settings still carrying those ids fall back to the current default font. */
const REMOVED_FONT_IDS = new Set(["caroni", "roboto-flex"]);

function migrateRemovedFonts(settings: StoryForgePluginSettings): void {
	for (const key of FONT_FAMILY_SETTING_KEYS) {
		if (REMOVED_FONT_IDS.has(settings[key])) settings[key] = "ibm-plex-sans-var";
	}
}

/**
 * "Codex focus" was retired as a storyForge-panel layout (its navigator + codex + stats
 * composition moved out into its own always-available Storytelling panel — see layout.ts).
 * A saved `layout: "codexFocus"` from before that change is no longer a valid `SfLayout`, so
 * `layoutConfig()`'s switch would return `undefined` for it; migrate straight to "hybrid",
 * the remaining layout closest to what a "Codex focus" user was after (codex still visible).
 */
function migrateCodexFocusLayout(settings: StoryForgePluginSettings): void {
	if ((settings.layout as string) === "codexFocus") settings.layout = "hybrid";
}

/**
 * One-time: unhide the right sidebar toggle and hide Obsidian's native right tabs so the
 * Story Context rail can own that side. Skipped once `storyContextShellApplied` is set, and
 * on a genuinely fresh install (no prior data.json at all) - there DEFAULT_SETTINGS already
 * applies, and this migration would otherwise stomp its `hideRightPanel` default back to
 * false (it can't tell "never saved" from "saved before this flag existed" once `data` is
 * merged into `settings`, so it must inspect the raw save file instead).
 */
function migrateStoryContextShell(settings: StoryForgePluginSettings, data: unknown): boolean {
	if (data == null) return false;
	const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
	if (raw && raw.storyContextShellApplied === true) return false;
	settings.hideRightPanel = false;
	settings.hideBacklinks = true;
	settings.hideOutgoingLinks = true;
	settings.hideTags = true;
	settings.hideOutline = true;
	settings.hideAllProperties = true;
	settings.storyContextShellApplied = true;
	return true;
}

/**
 * One-time, per map: seed each host's own chapter card tiers (the Novel overview centre pane's and
 * the Story Context sidebar's) from the two-state collapsed list they used to use, so every card
 * collapsed before the upgrade stays collapsed (tier 2) and every other card stays extended.
 * Inspects the raw save file for the same reason migrateStoryContextShell does: once `data` is
 * merged into `settings` an absent key is indistinguishable from an empty one. A fresh install (no
 * save file) has nothing to copy and keeps the empty defaults.
 */
function migratePlotCardTiers(settings: StoryForgePluginSettings, data: unknown): boolean {
	if (data == null) return false;
	const raw = typeof data === "object" ? (data as Record<string, unknown>) : null;
	const collapsed = Array.isArray(settings.collapsedPlotChapterKeys) ? settings.collapsedPlotChapterKeys : [];
	let seeded = false;
	for (const key of ["novelOverviewPlotCardTiers", "storyContextPlotCardTiers"] as const) {
		if (raw && key in raw) continue;
		settings[key] = seedPlotCardTiers(collapsed);
		seeded = true;
	}
	return seeded;
}

export const DEFAULT_SETTINGS: StoryForgePluginSettings = {
	hideHelp: true,
	hideSearch: true,
	hideBookmarks: true,
	hideFiles: true,
	hideObsidianSettingsIcon: false,
	hideToolsPanelIcon: false,
	hideLeftPanel: true,
	hideRightPanel: true,
	hideBacklinks: true,
	hideOutgoingLinks: true,
	hideTags: true,
	hideOutline: true,
	hideAllProperties: true,
	storyContextShellApplied: true,
	hideFileNameBar: true,
	hideNavRow: true,
	hideEditorTabs: true,
	hideSeriesPane: false,
	autoFocus: true,
	welcomeNoteCreatedOnOnboarding: false,
	layout: "novelBrowse",
	statusBarView: "all",
	highlightActiveChapter: true,
	highlightColor: "#fef3c7",
	highlightTextColor: "#1f2937",
	librarySeriesTitleFontSize: 1,
	librarySeriesTitleOverrideFont: false,
	librarySeriesTitleFontFamily: "ibm-plex-sans-var",
	librarySeriesTitleFontWeight: "600",
	librarySeriesTitleColor: "#dcdcdc",
	librarySeriesTitleSmallCaps: false,
	libraryBookTitleFontSize: 1,
	libraryBookTitleOverrideFont: false,
	libraryBookTitleFontFamily: "ibm-plex-sans-var",
	libraryBookTitleFontWeight: "400",
	libraryBookTitleColor: "#9a9a9a",
	libraryBookTitleSmallCaps: false,
	libraryBookSubtitleFontSize: 0.5,
	libraryBookSubtitleOverrideFont: false,
	libraryBookSubtitleFontFamily: "ibm-plex-sans-var",
	libraryBookSubtitleFontWeight: "400",
	libraryBookSubtitleSmallCaps: false,
	libraryHeaderDividerBelow: false,
	libraryItemsFontSize: 1,
	libraryItemsOverrideFont: false,
	libraryItemsFontFamily: "ibm-plex-sans-var",
	libraryItemsFontWeight: "400",
	libraryItemsColor: "#c8c8c8",
	libraryItemsMuted: false,
	storytellingItemsFontSize: 1,
	storytellingItemsOverrideFont: false,
	storytellingItemsFontFamily: "ibm-plex-sans-var",
	storytellingItemsFontWeight: "400",
	storytellingItemsColor: "#c8c8c8",
	storytellingItemsMuted: false,
	storytellingLinkItemsColorToLibrary: true,
	storytellingHighlightColor: "#fef3c7",
	storytellingHighlightTextColor: "#1f2937",
	unplacedHighlightColor: "#fef3c7",
	unplacedHighlightTextColor: "#1f2937",
	codexHighlightColor: "#fef3c7",
	codexHighlightTextColor: "#1f2937",
	unplacedMuted: false,
	unplacedSmallCaps: true,
	unplacedColor: "var(--text-accent)",
	unplacedFontSize: 1,
	unplacedOverrideFont: false,
	unplacedFontFamily: "ibm-plex-sans-var",
	unplacedFontWeight: "400",
	unplacedItemsFontSize: 1,
	unplacedItemsOverrideFont: false,
	unplacedItemsFontFamily: "ibm-plex-sans-var",
	unplacedItemsFontWeight: "400",
	unplacedItemsColor: "#c8c8c8",
	unplacedItemsMuted: false,
	unplacedUseHeaderColorForAll: false,
	codexMuted: false,
	codexSmallCaps: true,
	codexColor: "var(--text-accent)",
	codexFontSize: 1,
	codexOverrideFont: false,
	codexFontFamily: "ibm-plex-sans-var",
	codexFontWeight: "400",
	codexFolderFontSize: 1,
	codexFolderOverrideFont: false,
	codexFolderFontFamily: "ibm-plex-sans-var",
	codexFolderFontWeight: "400",
	codexFolderColor: "#4ade80",
	codexFolderIndicatorThickness: "medium",
	codexNoteLabelFontSize: 1,
	codexNoteLabelOverrideFont: false,
	codexNoteLabelFontFamily: "ibm-plex-sans-var",
	codexNoteLabelFontWeight: "400",
	codexNoteLabelColor: "#c8c8c8",
	codexNoteLabelUseDefaultColor: false,
	codexNoteLabelUseFolderColor: false,
	codexUseHeaderColorForAll: false,
	bodyTextOverrideSize: false,
	bodyTextSize: 1,
	bodyTextOverrideColor: false,
	bodyTextColor: "var(--text-normal)",
	heading1OverrideSize: false,
	heading1Size: 1,
	heading1OverrideColor: false,
	heading1Color: "var(--text-normal)",
	heading2OverrideSize: false,
	heading2Size: 1,
	heading2OverrideColor: false,
	heading2Color: "var(--text-normal)",
	heading3OverrideSize: false,
	heading3Size: 1,
	heading3OverrideColor: false,
	heading3Color: "var(--text-normal)",
	heading4OverrideSize: false,
	heading4Size: 1,
	heading4OverrideColor: false,
	heading4Color: "var(--text-normal)",
	heading5OverrideSize: false,
	heading5Size: 1,
	heading5OverrideColor: false,
	heading5Color: "var(--text-normal)",
	heading6OverrideSize: false,
	heading6Size: 1,
	heading6OverrideColor: false,
	heading6Color: "var(--text-normal)",
	blockquoteOverrideSize: false,
	blockquoteSize: 1,
	blockquoteOverrideColor: false,
	blockquoteColor: "var(--text-normal)",
	blockquoteOverrideBg: false,
	blockquoteBgColor: "#2a2a2a",
	blockquoteOverrideBorder: false,
	blockquoteBorderColor: "#7eb8da",
	bodyLinkOverrideColor: false,
	bodyLinkColor: "#7eb8da",
	bodyLinkOverrideHoverColor: false,
	bodyLinkHoverColor: "#a8d4ef",
	bodyLinkRemoveUnderline: false,
	orderedListOverrideColor: false,
	orderedListColor: "#7eb8da",
	unorderedListOverrideColor: false,
	unorderedListColor: "#7eb8da",
	useToolsPanel: true,
	panelOrderMode: "canonical",
	colorPaletteName: "Custom",
	colorPaletteVariant: "",
	customPaletteColors: [
		{ name: "Ink", hex: "#232427" },
		{ name: "Paper", hex: "#F4F4F1" },
		{ name: "Rose", hex: "#E08C8C" },
		{ name: "Sage", hex: "#8FBF9A" },
		{ name: "Sky", hex: "#8FB0DE" },
	],
	selectedNovel: null,
	selectedObject: null,
	collapsedCodexFolderIds: [],
	collapsedPlotChapterKeys: [],
	novelOverviewPlotCardTiers: {},
	storyContextPlotCardTiers: {},
	cyclingGuideEnabled: false,
	cyclingGuideThickness: "thin",
	cyclingGuideColor: "#f59e0b",
	cyclingGuideFlagSize: "medium",
	cyclingGuideRoundedLines: false,
	cyclingGuideInterval: "medium",
	depthGuideEnabled: false,
	depthGuideLevel: "standard",
	depthGuideChaptersCovered: 10,
	novelGhostChaptersEnabled: true,
	novelStructureGuidelinesEnabled: true,
	automaticBackupEnabled: false,
	automaticBackupFrequency: "daily",
	lastAutomaticBackupAt: 0,
	codexFactSectionByType: {
		person: "Facts",
		place: "Facts",
		populace: "Facts",
	},
	storyContextIncludeUnknownNames: true,
	seriesNumberingStyle: "arabic",
	chapterNumberingStyle: "arabic",
	editorScrollbarThumbColor: "#6b7280",
	editorScrollbarUseThemeColor: false,
	editorScrollbarThickness: "thick",
	forgeCompanionIconColor: "var(--text-accent)",
	storyContextHeaderColor: "var(--text-accent)",
	storyContextHeaderMuted: false,
	storyContextTabsFontSize: 0.85,
	storyContextTabsOverrideFont: false,
	storyContextTabsFontFamily: "ibm-plex-sans-var",
	storyContextTabsFontWeight: "400",
	storyContextTabsColor: "var(--text-muted)",
	storyContextTabsMuted: false,
	storyContextTabsActiveColor: "var(--text-accent)",
	storyContextFocusModeIconColor: "var(--text-muted)",
	storyContextChapterTitleFontSize: 1,
	storyContextChapterTitleOverrideFont: false,
	storyContextChapterTitleFontFamily: "ibm-plex-sans-var",
	storyContextChapterTitleFontWeight: "600",
	storyContextChapterTitleColor: "var(--text-accent)",
	storyContextChapterTitleMuted: false,
	storyContextChapterTitleSmallCaps: false,
	storyContextDossierHeaderFontSize: 1.15,
	storyContextDossierHeaderOverrideFont: false,
	storyContextDossierHeaderFontFamily: "ibm-plex-sans-var",
	storyContextDossierHeaderFontWeight: "600",
	storyContextDossierHeaderColor: "var(--text-accent)",
	storyContextDossierHeaderMuted: false,
	storyContextDossierHeaderSmallCaps: false,
	storyContextNovelTitleFontSize: 1.1,
	storyContextNovelTitleOverrideFont: false,
	storyContextNovelTitleFontFamily: "ibm-plex-sans-var",
	storyContextNovelTitleFontWeight: "600",
	storyContextNovelTitleColor: "var(--text-normal)",
	storyContextNovelTitleMuted: false,
	storyContextNovelTitleSmallCaps: false,
	storyContextNovelSubtitleFontSize: 0.9,
	storyContextNovelSubtitleOverrideFont: false,
	storyContextNovelSubtitleFontFamily: "ibm-plex-sans-var",
	storyContextNovelSubtitleFontWeight: "400",
	storyContextNovelSubtitleColor: "var(--text-muted)",
	storyContextNovelSubtitleMuted: false,
	storyContextNovelSubtitleSmallCaps: false,
	storyContextPlotChapterFontSize: 1,
	storyContextPlotChapterOverrideFont: false,
	storyContextPlotChapterFontFamily: "ibm-plex-sans-var",
	storyContextPlotChapterFontWeight: "600",
	storyContextPlotChapterColor: "var(--text-normal)",
	storyContextPlotChapterMuted: false,
	storyContextPlotChapterSmallCaps: false,
	storyContextSectionTitleFontSize: 0.85,
	storyContextSectionTitleOverrideFont: false,
	storyContextSectionTitleFontFamily: "ibm-plex-sans-var",
	storyContextSectionTitleFontWeight: "600",
	storyContextSectionTitleColor: "var(--text-muted)",
	storyContextSectionTitleMuted: false,
	storyContextSectionTitleSmallCaps: false,
	storyContextSectionChrome: "box",
	storyContextItemsFontSize: 1,
	storyContextItemsOverrideFont: false,
	storyContextItemsFontFamily: "ibm-plex-sans-var",
	storyContextItemsFontWeight: "400",
	storyContextItemsColor: "#c8c8c8",
	storyContextItemsMuted: false,
	storyContextDetailsFontSize: 0.9,
	storyContextDetailsOverrideFont: false,
	storyContextDetailsFontFamily: "ibm-plex-sans-var",
	storyContextDetailsFontWeight: "400",
	storyContextDetailsColor: "var(--text-normal)",
	storyContextDetailsMuted: false,
	storyContextUnknownColor: "var(--text-muted)",
	storyContextUnknownMuted: true,
	storyContextUnknownHeaderColor: "var(--background-primary)",
	storyContextUnknownHeaderMuted: false,
	storyContextCaptureColor: "var(--interactive-accent)",
	storyContextCaptureMuted: false,
	storyContextCaptureHeaderColor: "var(--text-on-accent)",
	storyContextCaptureHeaderMuted: false,
	storyContextHoldingColor: "var(--text-warning)",
	storyContextHoldingMuted: false,
	storyContextHoldingHeaderColor: "var(--background-primary)",
	storyContextHoldingHeaderMuted: false,
	storyContextResolvedColor: "var(--text-muted)",
	storyContextResolvedMuted: true,
	storyContextResolvedHeaderColor: "var(--background-primary)",
	storyContextResolvedHeaderMuted: false,
	storyContextMetaLabelFontSize: 0.9,
	storyContextMetaLabelOverrideFont: false,
	storyContextMetaLabelFontFamily: "ibm-plex-sans-var",
	storyContextMetaLabelFontWeight: "500",
	storyContextMetaLabelColor: "var(--text-muted)",
	storyContextMetaLabelMuted: false,
	storyContextMetaLabelSmallCaps: false,
	storyContextMetaControlFontSize: 1,
	storyContextMetaControlOverrideFont: false,
	storyContextMetaControlFontFamily: "ibm-plex-sans-var",
	storyContextMetaControlFontWeight: "400",
	storyContextMetaControlColor: "var(--text-normal)",
	storyContextMetaControlMuted: false,
	storyContextSynopsisFontSize: 1,
	storyContextSynopsisOverrideFont: false,
	storyContextSynopsisFontFamily: "ibm-plex-sans-var",
	storyContextSynopsisFontWeight: "400",
	storyContextSynopsisColor: "var(--text-normal)",
	storyContextHighlightColor: "#fef3c7",
	storyContextHighlightTextColor: "#1f2937",
	storyContextUseHeaderColorForAll: false,
	archiveHeaderFontSize: 1,
	archiveHeaderOverrideFont: false,
	archiveHeaderFontFamily: "ibm-plex-sans-var",
	archiveHeaderFontWeight: "600",
	archiveHeaderColor: "var(--text-accent)",
	archiveHeaderMuted: false,
	archiveHeaderSmallCaps: true,
	archiveItemsFontSize: 1,
	archiveItemsOverrideFont: false,
	archiveItemsFontFamily: "ibm-plex-sans-var",
	archiveItemsFontWeight: "400",
	archiveItemsColor: "#c8c8c8",
	archiveItemsMuted: false,
	archiveHighlightColor: "#fef3c7",
	archiveHighlightTextColor: "#1f2937",
	archiveUseHeaderColorForAll: false,
};

/** View types of removed features, still possibly present in a saved layout. */
const RETIRED_VIEW_TYPES = [
	"storyforge-tools-view",
	"storyforge-archive-view",
	"storyforge-forge-view",
	"storyforge-continuous-view",
	"storyforge-series-overview-view",
	"storyforge-novel-overview-view",
	"storyforge-new-chapter-view",
];

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	private backupInProgress = false;
	/** Serialises ensureSidePanels / ensureRightRailPanels so overlapping calls cannot create duplicate tabs. */
	private ensurePanelsChain: Promise<void> = Promise.resolve();
	/** The one main-area tab storyForge's own navigation (Series overview, continuous read, chapter
	 * opens, the new-chapter page, …) always reuses — see getMainContentLeaf(). Not persisted:
	 * starts fresh (null) every session, adopting whatever leaf the first such navigation touches. */
	private mainContentLeafId: string | null = null;

	async onload(): Promise<void> {
		// Nothing that awaits may run before registerView(). Workspace restore races plugin
		// onload; if our types are missing (or Plugin.registerView unregisters them first),
		// saved tabs become EmptyView ("plugin has gone away"). Settings/API/icons are all
		// synchronous here so nameForge can touch `plugin.api` the moment those tabs restore.
		this.syncObsidianSettingsRef();
		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));
		this.registerView(STORY_CONTEXT_VIEW_TYPE, (leaf) => new StoryContextView(leaf, this));

		await this.loadSettings();
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-library-header-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles, #storyforge-heading1-link-styles, #storyforge-text-style-overrides, #storyforge-custom-fonts, #storyforge-cycling-guide-styles",
			)
			.forEach((el) => el.remove());

		this.addCommand({
			id: "open-story-context",
			name: "Open Context panel",
			callback: () => void this.activateStoryContextView(),
		});

		this.addCommand({
			id: "open-archive",
			name: "Open Archive",
			callback: () => void this.activateArchiveView("codex"),
		});

		this.addCommand({
			id: "open-view",
			name: "Open story library",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-storytelling-view",
			name: "Open storytelling mode",
			callback: () => void this.activateStorytellingView(),
		});

		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.onWorkspaceLayoutReady();
		});

		// Switching onto the combined left-rail tab in storytelling mode is a leaf activation like
		// any other (it's a sidebar tab) rather than something StoryForgeView's own layout-tab click
		// handler can see, so this is a separate, plugin-level listener rather than living next to
		// the Novel/Chapter handling in StoryForgeView.ts's selectLayout().
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof StoryForgeView && leaf.view.isStorytellingMode()) {
					void this.restoreStorytellingCenterEditor(false);
				}
			}),
		);

		this.registerInterval(window.setInterval(() => void this.maybeRunScheduledBackup("interval"), 30 * 60 * 1000));
	}

	/**
	 * Runs the automatic backup if enabled, a folder is configured, and it's due. "every-open" only
	 * fires on `trigger === "vault-open"` - the recurring interval check exists purely to catch
	 * daily/weekly backups becoming due while Obsidian is left open across multiple days.
	 */
	private async maybeRunScheduledBackup(trigger: "vault-open" | "interval"): Promise<void> {
		if (this.backupInProgress) return;
		const { automaticBackupEnabled, automaticBackupFrequency, lastAutomaticBackupAt } = this.pluginSettings;
		if (!automaticBackupEnabled) return;

		const now = Date.now();
		let includeTime = false;
		if (automaticBackupFrequency === "every-open") {
			if (trigger !== "vault-open") return;
			includeTime = true;
		} else {
			const thresholdMs = (automaticBackupFrequency === "daily" ? 24 : 24 * 7) * 60 * 60 * 1000;
			if (lastAutomaticBackupAt !== 0 && now - lastAutomaticBackupAt < thresholdMs) return;
		}

		this.backupInProgress = true;
		try {
			await runContentBackup(this.app, includeTime);
			await this.updateSetting("lastAutomaticBackupAt", now);
		} catch (err) {
			new Notice(`storyForge: automatic backup failed — ${(err as Error).message}`);
		} finally {
			this.backupInProgress = false;
		}
	}

	/**
	 * Vault I/O and leaf recovery wait for layout-ready: the in-memory vault index is not
	 * guaranteed during onload. A throw here must not unload the plugin — that is what turns restored
	 * leaves into "plugin has gone away".
	 */
	private async onWorkspaceLayoutReady(): Promise<void> {
		void (async () => {
			try {
				await this.initializeVaultState();
			} catch (err) {
				console.error("storyForge: vault initialization failed", err);
			}
		})();
		void this.enqueueEnsurePanels(async () => {
			this.detachRetiredLeaves();
			await this.ensureSidePanelsUnlocked();
			await this.hydratePluginViews();
			this.applyLeftPanelLanding();
			if (this.pluginSettings.autoFocus) {
				await this.restoreStorytellingCenterEditor(true);
			}
		});
		void this.maybeRunScheduledBackup("vault-open");
	}

	private allPluginViewTypes(): string[] {
		return [STORYFORGE_VIEW_TYPE, LEGACY_STORYTELLING_VIEW_TYPE, STORY_CONTEXT_VIEW_TYPE];
	}

	/**
	 * View types of features that have been removed. A saved layout can still hold a leaf of one of
	 * these; with no view registered it would show as "plugin has gone away", so close it.
	 */
	private detachRetiredLeaves(): void {
		for (const type of RETIRED_VIEW_TYPES) this.app.workspace.detachLeavesOfType(type);
	}

	/**
	 * Inactive sidebar tabs often restore as DeferredView. Load them so tab headers pick up
	 * registered custom icons. Do not rebuildView() here: that round-trips through EmptyView
	 * and is what turns a healthy restore into "plugin has gone away" on quit/reopen.
	 */
	private async hydratePluginViews(): Promise<void> {
		for (const type of this.allPluginViewTypes()) {
			this.dedupeLeavesOfType(type);
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				try {
					await leaf.loadIfDeferred();
				} catch (err) {
					console.error(`storyForge: loadIfDeferred failed for ${type}`, err);
				}
			}
		}
	}

	/**
	 * Forces any open storyForge view(s) to re-render, e.g. after a settings change with no other
	 * trigger. Inactive sidebar tabs restore as DeferredView and have no `render()` of their own,
	 */
	refreshStoryForgeViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) leaf.view.render();
		}
	}

	/** Series panel's onSelectBook nudge (StoryForgeView.ts) — an already-open Story Context panel
	 * (right sidebar) should jump to its Novel tab and show the newly-picked book. A no-op if it
	 * isn't currently open anywhere. */
	focusStoryContextOnNovel(bookFolderName: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.focusNovel(bookFolderName);
		}
	}

	/** Novel panel's own entry nudge (StoryForgeView.ts's openNovelOverview), also fired from the
	 * storyLibrary panel's own Chapter layout tab whenever a chapter there is selected or opened
	 * (or that tab itself is switched into) — an already-open Story Context panel (right sidebar)
	 * should jump to its own Chapter tab and show the given chapter. A no-op if it isn't currently
	 * open anywhere. */
	focusStoryContextOnChapter(bookFolderName: string, filename: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.focusChapter(bookFolderName, filename);
		}
	}

	/** storyTelling Codex lore click — show the note in Focus Mode's `.sf-codex-page` when that
	 * panel is in Focus Mode. Returns false so the caller can open the note in the center pane. */
	openCodexLoreInFocusPage(path: string): boolean {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView && leaf.view.openCodexLore(path)) return true;
		}
		return false;
	}

	/** Path currently shown in Focus Mode's `.sf-codex-page`, or null. storyTelling uses this to
	 * highlight the matching lore row without making the note the active file. */
	codexFocusPagePath(): string | null {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) {
				const path = leaf.view.codexPagePath();
				if (path) return path;
			}
		}
		return null;
	}

	/** Nudge storytelling mode after Focus Mode's lore page opens or closes, so its Codex
	 * highlight agrees with `.sf-codex-page` without a full storyforge re-render. */
	refreshStorytellingView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView && leaf.view.isStorytellingMode()) leaf.view.render();
		}
	}

	setStoryContextFocusMode(on: boolean): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)) {
			if (leaf.view instanceof StoryContextView) leaf.view.setFocusMode(on);
		}
	}

	applyLeftPanelLanding(options?: { restoreCenter?: boolean }): void {
		const storytelling = storytellingModeForAutoFocus(this.pluginSettings.autoFocus);
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) {
				leaf.view.setStorytellingMode(storytelling, { restoreCenter: options?.restoreCenter ?? false });
			}
		}
	}

	/** Novel overview page's own chapter-title click (NovelOverviewView.ts) — an already-open
	 * storyLibrary panel should select (not open) the same chapter, so its own Novel-pane list
	 * agrees with whichever chapter was clicked without leaving the Novel overview page. A no-op if
	 * the storyLibrary panel isn't currently open anywhere. */
	focusStoryLibraryOnChapter(bookFolderName: string, filename: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) leaf.view.selectChapter(bookFolderName, filename);
		}
	}

	/** Workspace adapter for {@link resolveMainContentLeaf}: never asks `getLeaf(false)`, which
	 * returns the active sidebar after storyTelling / Story Context is focused. */
	private mainContentWorkspace(): MainContentWorkspace<WorkspaceLeaf> {
		const ws = this.app.workspace;
		return {
			rootSplit: ws.rootSplit,
			getLeafById: (id) => ws.getLeafById(id),
			getMostRecentLeaf: (root) => ws.getMostRecentLeaf(root as typeof ws.rootSplit),
			getLeaf: (newLeaf) => ws.getLeaf(newLeaf as PaneType | boolean),
		};
	}

	/** The tracked leaf if it still exists in the center pane — null rather than creating one, for
	 * callers that only want to act on it if it's already open (Notebook auto-naming, restore).
	 * A sidebar leaf that was adopted by an older getLeaf(false) is treated as gone so the next
	 * open self-heals into the root split. */
	peekMainContentLeaf(): WorkspaceLeaf | null {
		return this.getMainContentLeafIfExists();
	}

	private getMainContentLeafIfExists(): WorkspaceLeaf | null {
		return existingMainContentLeaf(this.mainContentWorkspace(), this.mainContentLeafId);
	}

	/**
	 * The one main-area tab all of storyForge's own navigation shares — Series overview, continuous
	 * read, chapter opens from the storyForge/storyTelling panels, the new-chapter page. Reusing a
	 * leaf by its own id (rather than `workspace.getLeaf(false)`'s "whatever's currently active")
	 * guarantees these transitions land on the *same* tab every time regardless of what else the
	 * user has since clicked into, so switching between Series/Novel/Chapter/storyTelling never
	 * piles up extra tabs of our own making. Adoption is restricted to the root split so a click
	 * from the storyTelling sidebar cannot replace that sidebar with the editor.
	 */
	getMainContentLeaf(): WorkspaceLeaf {
		const leaf = resolveMainContentLeaf(this.mainContentWorkspace(), this.mainContentLeafId);
		// `id` is runtime-public on WorkspaceLeaf but not in the published typings (same situation
		// as rebuildView() elsewhere in this file).
		this.mainContentLeafId = (leaf as WorkspaceLeaf & { id: string }).id;
		return leaf;
	}

	/**
	 * Puts the chapter the storyTelling sidebar is pointing at into the center editor, without
	 * waiting for a row click. `force` is for layout-ready (plugin reload / vault open): replace
	 * whatever the workspace restored in the root split. Without `force` (switching onto the
	 * storyTelling tab), an already-open markdown file is left alone so a Codex note the user just
	 * opened isn't yanked back to the chapter.
	 */
	async restoreStorytellingCenterEditor(force = false): Promise<void> {
		if (!force) {
			const existing = this.getMainContentLeafIfExists();
			if (existing?.view instanceof MarkdownView && existing.view.file) return;
		}
		const file = this.resolveStorytellingCenterFile();
		if (file) {
			const leaf = this.getMainContentLeaf();
			await leaf.openFile(file, { active: true });
			await this.app.workspace.revealLeaf(leaf);
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
			return;
		}
	}

	private resolveStorytellingCenterFile(): TFile | null {
		const { selectedNovel, selectedObject } = this.getSettings();
		const firstOrdered = selectedNovel ? (getBookChapters(this.app, selectedNovel).ordered[0]?.name ?? null) : null;
		const path = resolveStorytellingCenterPath(selectedNovel, selectedObject, (p) => {
			return this.app.vault.getAbstractFileByPath(p) instanceof TFile;
		}, firstOrdered);
		if (!path) return null;
		const file = this.app.vault.getAbstractFileByPath(path);
		return file instanceof TFile ? file : null;
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateRemovedFonts(this.pluginSettings);
		migrateCodexFocusLayout(this.pluginSettings);
		const shellMigrated = migrateStoryContextShell(this.pluginSettings, data);
		const plotCardTiersSeeded = migratePlotCardTiers(this.pluginSettings, data);
		const sections = { ...DEFAULT_SETTINGS.codexFactSectionByType, ...this.pluginSettings.codexFactSectionByType };
		for (const opt of CODEX_TYPES) {
			if (!sections[opt.type]) sections[opt.type] = "Facts";
		}
		this.pluginSettings.codexFactSectionByType = sections;
		this.syncObsidianSettingsRef();
		if (shellMigrated || plotCardTiersSeeded) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		this.syncObsidianSettingsRef();
		await this.saveData(this.pluginSettings);
	}

	getSettings(): StoryForgePluginSettings {
		return this.pluginSettings;
	}

	/**
	 * Obsidian 1.13+ settings UI reads `plugin.settings`. Keep that mirror in sync with
	 * our real store so the settings tab (and search) never render against `undefined`.
	 */
	private syncObsidianSettingsRef(): void {
		this.settings = this.pluginSettings;
	}

	async updateSetting<K extends keyof StoryForgePluginSettings>(key: K, value: StoryForgePluginSettings[K]): Promise<void> {
		await this.updateSettings({ [key]: value });
	}

	/** Persist a validated settings patch in one save, rolling memory back on failure. */
	async updateSettings(partial: Partial<StoryForgePluginSettings>): Promise<void> {
		const previous = { ...this.pluginSettings };
		Object.assign(this.pluginSettings, partial);
		try {
			await this.saveSettings();
		} catch (error) {
			this.pluginSettings = previous;
			this.syncObsidianSettingsRef();
			throw error;
		}
	}

	/** Eagerly creates the story library and Codex root folders (mirrors the already-eager _backstage/storyforge
	 * creation that modifyBackstageFrontmatter performs), so a fresh vault immediately has a place to drop
	 * in existing notes. Each check is independent and idempotent - a no-op on every load after the first.
	 * Bypasses writeGuard: LIBRARY_ROOT/CODEX_ROOT are paths its assertBackstagePath() forbids outright,
	 * same as the existing lazy-creation call sites in book.ts and codex.ts. */
	private async ensureEagerFolders(): Promise<void> {
		if (!this.app.vault.getAbstractFileByPath(LIBRARY_ROOT)) {
			await this.app.vault.createFolder(LIBRARY_ROOT);
		}
		if (!this.app.vault.getAbstractFileByPath(CODEX_ROOT)) {
			await this.app.vault.createFolder(CODEX_ROOT);
		}
		if (!this.app.vault.getAbstractFileByPath(NOTES_ROOT)) {
			await this.app.vault.createFolder(NOTES_ROOT);
		}
	}

	/** True first run only (see initializeVaultState's isFirstRun): seeds one book and one chapter,
	 * both placed (in series order / chapter-order, not left unplaced), so a brand-new vault opens
	 * with something in the library rather than an empty shelf. Both pick up their "#"-numbered
	 * defaults ("Novel #" / "Chapter #") from createBook/createChapter — no title passed here.
	 * Neither is opened: onboarding chooses the first selected item (welcome note, or chapter 1). */
	private async createFirstRunBookAndChapter(): Promise<void> {
		const { folderName } = await createBook(this.app);
		const { filename } = await createChapter(this.app, folderName, { openFile: false });
		await writeBookChapterOrder(this.app, folderName, [filename]);
	}

	private async initializeVaultState(): Promise<void> {
		// Must run before anything below resolves seriesFilePath()/bookFilePath()
		// (including ensureEagerFolders's isFirstRun-adjacent checks) — see
		// migrateStructuralLayout's doc comment in migration.ts.
		await migrateStructuralLayout(this.app);
		await this.ensureEagerFolders();
		const isFirstRun = !this.app.vault.getAbstractFileByPath(seriesFilePath());
		await ensureSeriesFile(this.app);
		if (isFirstRun) await this.createFirstRunBookAndChapter();
		const tagRegistry = await ensureTagRegistryFile(this.app);
		loadCodexTypesIntoRegistry(this.app, tagRegistry);
		await migrateVaultSchema(this.app);
		await pruneMissingCodexNotes(this.app);
		await pruneMissingChapterCodexRefs(this.app);
		const books = await ensureAllSeriesBookEntries(this.app, (folderName) => {
			const fm = readBookFrontmatter(this.app, folderName);
			if (!fm?.bookIdReference) return null;
			return { bookId: fm.bookIdReference, bookTitle: fm.bookTitleReference || folderName };
		});
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
			await pruneMissingChapterEntries(this.app, folder.name);
		}
	}

	private scheduleRecompute(chapterPath: string): void {
		const bookFolderName = bookFolderNameFromChapterPath(chapterPath);
		if (!bookFolderName) return;
		let debounced = this.recomputeDebouncers.get(chapterPath);
		if (!debounced) {
			debounced = debounce(() => void this.recomputeChapter(bookFolderName, chapterPath), 1500);
			this.recomputeDebouncers.set(chapterPath, debounced);
		}
		debounced();
	}

	private async recomputeChapter(bookFolderName: string, chapterPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(chapterPath);
		if (!(file instanceof TFile)) return;

		const raw = await this.app.vault.read(file);
		const fingerprint = extractFingerprint(raw);
		await updateChapterFingerprint(this.app, bookFolderName, file.name, fingerprint);
		await recordChapterEdit(this.app, bookFolderName, file.name, countWords(raw));
	}

	async activateStoryContextView(): Promise<void> {
		await activateStoryContextView(this);
	}

	async activateArchiveView(tab: "codex" | "novel" = "codex"): Promise<void> {
		await activateArchiveView(this, tab);
	}

	async activateView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof StoryForgeView) leaf.view.setStorytellingMode(false);
		}
	}

	async activateStorytellingView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (leaf) {
			await this.app.workspace.revealLeaf(leaf);
			if (leaf.view instanceof StoryForgeView) leaf.view.setStorytellingMode(true);
		}
	}

	/** Runs panel-ensure work one-at-a-time (layout-ready + hosted registrations can overlap). */
	private enqueueEnsurePanels(work: () => Promise<void>): Promise<void> {
		const run = this.ensurePanelsChain.then(work, work);
		this.ensurePanelsChain = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/**
	 * Creates missing storyForge / Tools / right-rail leaves and focuses storyForge on the
	 * left (Tools stays as a sibling tab, not the active one). Expands the right rail so
	 * Story Context is ready the same way the left panels are.
	 */
	private async ensureSidePanels(): Promise<void> {
		return this.enqueueEnsurePanels(() => this.ensureSidePanelsUnlocked());
	}

	private async ensureSidePanelsUnlocked(): Promise<void> {
		// Strip stacked copies from prior hot-reloads / raced ensures before creating anything.
		for (const type of this.allPluginViewTypes()) this.dedupeLeavesOfType(type);

		// Combined left panel: one leaf. Detach the retired storytelling tab from saved layouts.
		this.app.workspace.detachLeavesOfType(LEGACY_STORYTELLING_VIEW_TYPE);
		await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		await this.ensureLeaf(STORY_CONTEXT_VIEW_TYPE, "right", true);

		const storyforgeLeaf = this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)[0] ?? null;
		if (storyforgeLeaf) await this.app.workspace.revealLeaf(storyforgeLeaf);

		const right = this.app.workspace.rightSplit;
		if (typeof right.expand === "function") right.expand();
		const contextLeaf = this.app.workspace.getLeavesOfType(STORY_CONTEXT_VIEW_TYPE)[0] ?? null;
		if (contextLeaf) {
			await contextLeaf.setViewState({ type: STORY_CONTEXT_VIEW_TYPE, active: true });
		}
	}

	/** Keeps the first leaf of `type` and detaches any extras (duplicate tab icons). */
	private dedupeLeavesOfType(type: string): void {
		const leaves = this.app.workspace.getLeavesOfType(type);
		for (let i = 1; i < leaves.length; i++) leaves[i].detach();
	}

	/**
	 * Ensure a leaf of `type` exists in the left or right sidebar. Does not reveal/focus.
	 * Uses Obsidian's `ensureSideLeaf` (reuses an existing leaf) and strips duplicates first —
	 * `getLeftLeaf`/`getRightLeaf` always insert a new tab, which previously stacked copies.
	 */
	private async ensureLeaf(
		type: string,
		side: "left" | "right",
		active: boolean,
	): Promise<WorkspaceLeaf | null> {
		this.dedupeLeavesOfType(type);
		return this.app.workspace.ensureSideLeaf(type, side, {
			active,
			reveal: false,
			split: false,
		});
	}
}
