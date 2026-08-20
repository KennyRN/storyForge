import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { Extension } from "@codemirror/state";
import { createCyclingGuideViewPlugin } from "./cyclingGuide";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { StorytellingView, STORYTELLING_VIEW_TYPE } from "./view/StorytellingView";
import { ContinuousReadView, STORYFORGE_CONTINUOUS_VIEW_TYPE } from "./view/ContinuousReadView";
import { SeriesOverviewView, STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE } from "./view/SeriesOverviewView";
import { NovelOverviewView, STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE } from "./view/NovelOverviewView";
import { NewChapterView, STORYFORGE_NEW_CHAPTER_VIEW_TYPE } from "./view/NewChapterView";
import { ToolsView, TOOLS_VIEW_TYPE } from "./view/ToolsPanel";
import { RecommendationView, RECOMMEND_VIEW_TYPE, activateRecommendView } from "./view/RecommendationView";
import { ArchiveView, ARCHIVE_VIEW_TYPE, activateArchiveView } from "./view/ArchiveView";
import { recomputeChapterRecommend } from "./recommend/recompute";
import { isNlpReady } from "./recommend/nlp";
import { CODEX_TYPES } from "./codex";
import { buildRightRailTypeOrder, isCanonicalTypeOrder } from "./rightRailOrder";
import {
	createHostApi,
	findInvalidLinkedSettings,
	type RightRailRegistration,
	type StoryForgeCompanionPanel,
	type StoryForgeHostApi,
	type StoryForgeViewContribution,
} from "./hostApi";
import { StyleController } from "./styleController";
import { StoryForgeSettingsTab } from "./view/StoryForgeSettingsTab";
import { UiFormattingModal } from "./view/UiFormattingModal";
import { TagRegistryModal } from "./view/TagRegistryModal";
import { FORMATFORGE_PLUGIN_ID, formatCompanionState } from "./formatCompanionActive";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders, getBookId } from "./series";
import { ensureTagRegistryFile, loadCodexTypesIntoRegistry } from "./tagRegistry";
import { createBook, createChapter, ensureAllChapterEntries, syncAllBookReferenceFields, writeBookChapterOrder } from "./book";
import { migrateStructuralLayout, migrateTitleforgeLocation, migrateVaultSchema } from "./migration";
import { registerReconciliationEvents } from "./reconciliation";
import {
	isLibraryChapterPath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	libraryChapterPath,
	seriesFilePath,
	LIBRARY_ROOT,
	CODEX_ROOT,
} from "./paths";
import type { SfLayout } from "./layout";
import { ensureWelcomeNote } from "./welcomeNote";
import { recordChapterEdit } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { countWords } from "./wordCount";
import { registerCustomIcons, ICON_LAYOUT_SELECTOR, ICON_TAG_EDIT } from "./icons";
import type { FormatCompanionRegistration } from "./formattingApi";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteName } from "./colorPalettes";
import { runContentBackup } from "./backup";
import { TitleForgeController } from "./titleforge/TitleForgeController";

export type CodexFolderIndicatorThickness = "none" | "thin" | "medium" | "thick";

export type HeadingDividerThickness = "thin" | "medium" | "thick" | "extra-thick";
export type EditorScrollbarThickness = "thin" | "medium" | "thick";

/** Font catalog lives in formatForge; SF only stores the companion's font id string. */
export type CustomFontFamily = string;

export type FontWeight = "300" | "400" | "500" | "600" | "700" | "800" | "900";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";

export type StatusBarView = "hidden" | "sync-only" | "all";

export type CyclingGuideInterval = "short" | "medium" | "large";

const CYCLING_GUIDE_INTERVAL_WORDS: Record<CyclingGuideInterval, number> = {
	short: 300,
	medium: 500,
	large: 750,
};

export interface StoryForgePluginSettings {
	hideHelp: boolean;
	hideSearch: boolean;
	hideBookmarks: boolean;
	hideFiles: boolean;
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
	 * storyTelling panel's own chapter-item styling (UiFormattingModal's "storyTelling" tab) —
	 * independent of the storyLibrary panel's "Library items" settings above, except for colour and
	 * highlight colour, which `storytellingLinkItemsColorToLibrary` can keep mirrored to
	 * `libraryItemsColor`/`highlightColor`/`highlightTextColor` instead (on by default, so
	 * upgrading users see no visual change until they explicitly opt out).
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
	useToolsPanel: boolean;
	/** "canonical" enforces SF-before-Tools tab order on open; flips to "user" (permanently) the first time the user drags Tools ahead of SF. */
	panelOrderMode: "canonical" | "user";
	colorPaletteName: PaletteName;
	colorPaletteVariant: string;
	customPaletteColors: PaletteColor[];
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	cyclingGuideEnabled: boolean;
	cyclingGuideThickness: HeadingDividerThickness;
	cyclingGuideColor: string;
	cyclingGuideFlagSize: "small" | "medium" | "large";
	cyclingGuideRoundedLines: boolean;
	cyclingGuideInterval: CyclingGuideInterval;
	automaticBackupEnabled: boolean;
	automaticBackupFrequency: AutomaticBackupFrequency;
	lastAutomaticBackupAt: number;
	/** Per Codex type id → H2 heading label used for structured Facts in notes. */
	codexFactSectionByType: Record<string, string>;
	/** When true, the recommendation engine lists proper-name candidates not in Codex. */
	recommendIncludeUnknownNames: boolean;
	/** Thumb (foreground) colour of the manuscript editor scrollbar. */
	editorScrollbarThumbColor: string;
	/** When true, the thumb uses the active theme's own scrollbar colour instead of `editorScrollbarThumbColor`. */
	editorScrollbarUseThemeColor: boolean;
	/** Width of the manuscript editor scrollbar. */
	editorScrollbarThickness: EditorScrollbarThickness;
	/** Colour of companion icons in the Forge right-rail secondary header. */
	forgeCompanionIconColor: string;
	/** Base colour for the Story Context panel; also its fallback when "use for all" is on. Labeled "Base colour" in settings — no visible header remains to name it after. */
	recommendHeaderColor: string;
	recommendHeaderMuted: boolean;
	recommendTabsFontSize: number;
	recommendTabsOverrideFont: boolean;
	recommendTabsFontFamily: CustomFontFamily;
	recommendTabsFontWeight: FontWeight;
	recommendTabsColor: string;
	recommendTabsActiveColor: string;
	recommendChapterTitleFontSize: number;
	recommendChapterTitleOverrideFont: boolean;
	recommendChapterTitleFontFamily: CustomFontFamily;
	recommendChapterTitleFontWeight: FontWeight;
	recommendChapterTitleColor: string;
	recommendChapterTitleMuted: boolean;
	recommendChapterTitleSmallCaps: boolean;
	recommendDossierHeaderFontSize: number;
	recommendDossierHeaderOverrideFont: boolean;
	recommendDossierHeaderFontFamily: CustomFontFamily;
	recommendDossierHeaderFontWeight: FontWeight;
	recommendDossierHeaderColor: string;
	recommendDossierHeaderMuted: boolean;
	recommendDossierHeaderSmallCaps: boolean;
	recommendNovelTitleFontSize: number;
	recommendNovelTitleOverrideFont: boolean;
	recommendNovelTitleFontFamily: CustomFontFamily;
	recommendNovelTitleFontWeight: FontWeight;
	recommendNovelTitleColor: string;
	recommendNovelTitleMuted: boolean;
	recommendNovelTitleSmallCaps: boolean;
	recommendNovelSubtitleFontSize: number;
	recommendNovelSubtitleOverrideFont: boolean;
	recommendNovelSubtitleFontFamily: CustomFontFamily;
	recommendNovelSubtitleFontWeight: FontWeight;
	recommendNovelSubtitleColor: string;
	recommendNovelSubtitleMuted: boolean;
	recommendNovelSubtitleSmallCaps: boolean;
	recommendPlotChapterFontSize: number;
	recommendPlotChapterOverrideFont: boolean;
	recommendPlotChapterFontFamily: CustomFontFamily;
	recommendPlotChapterFontWeight: FontWeight;
	recommendPlotChapterColor: string;
	recommendPlotChapterMuted: boolean;
	recommendPlotChapterSmallCaps: boolean;
	recommendSectionTitleFontSize: number;
	recommendSectionTitleOverrideFont: boolean;
	recommendSectionTitleFontFamily: CustomFontFamily;
	recommendSectionTitleFontWeight: FontWeight;
	recommendSectionTitleColor: string;
	recommendSectionTitleMuted: boolean;
	recommendSectionTitleSmallCaps: boolean;
	recommendItemsFontSize: number;
	recommendItemsOverrideFont: boolean;
	recommendItemsFontFamily: CustomFontFamily;
	recommendItemsFontWeight: FontWeight;
	recommendItemsColor: string;
	recommendItemsMuted: boolean;
	recommendDetailsFontSize: number;
	recommendDetailsOverrideFont: boolean;
	recommendDetailsFontFamily: CustomFontFamily;
	recommendDetailsFontWeight: FontWeight;
	recommendDetailsColor: string;
	recommendDetailsMuted: boolean;
	recommendMetaLabelFontSize: number;
	recommendMetaLabelOverrideFont: boolean;
	recommendMetaLabelFontFamily: CustomFontFamily;
	recommendMetaLabelFontWeight: FontWeight;
	recommendMetaLabelColor: string;
	recommendMetaLabelMuted: boolean;
	recommendMetaLabelSmallCaps: boolean;
	recommendMetaControlFontSize: number;
	recommendMetaControlOverrideFont: boolean;
	recommendMetaControlFontFamily: CustomFontFamily;
	recommendMetaControlFontWeight: FontWeight;
	recommendMetaControlColor: string;
	recommendMetaControlMuted: boolean;
	recommendSynopsisFontSize: number;
	recommendSynopsisOverrideFont: boolean;
	recommendSynopsisFontFamily: CustomFontFamily;
	recommendSynopsisFontWeight: FontWeight;
	recommendSynopsisColor: string;
	recommendHighlightColor: string;
	recommendHighlightTextColor: string;
	recommendUseHeaderColorForAll: boolean;
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
	| "recommendTabsFontFamily"
	| "recommendChapterTitleFontFamily"
	| "recommendDossierHeaderFontFamily"
	| "recommendSectionTitleFontFamily"
	| "recommendItemsFontFamily"
	| "recommendDetailsFontFamily"
	| "recommendMetaLabelFontFamily"
	| "recommendMetaControlFontFamily"
	| "recommendSynopsisFontFamily"
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
	"recommendTabsFontFamily",
	"recommendChapterTitleFontFamily",
	"recommendDossierHeaderFontFamily",
	"recommendSectionTitleFontFamily",
	"recommendItemsFontFamily",
	"recommendDetailsFontFamily",
	"recommendMetaLabelFontFamily",
	"recommendMetaControlFontFamily",
	"recommendSynopsisFontFamily",
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

export const DEFAULT_SETTINGS: StoryForgePluginSettings = {
	hideHelp: true,
	hideSearch: true,
	hideBookmarks: true,
	hideFiles: true,
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
	layout: "hybrid",
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
	cyclingGuideEnabled: false,
	cyclingGuideThickness: "thin",
	cyclingGuideColor: "#f59e0b",
	cyclingGuideFlagSize: "medium",
	cyclingGuideRoundedLines: false,
	cyclingGuideInterval: "medium",
	automaticBackupEnabled: false,
	automaticBackupFrequency: "daily",
	lastAutomaticBackupAt: 0,
	codexFactSectionByType: {
		person: "Facts",
		place: "Facts",
		populace: "Facts",
	},
	recommendIncludeUnknownNames: true,
	editorScrollbarThumbColor: "#6b7280",
	editorScrollbarUseThemeColor: false,
	editorScrollbarThickness: "thick",
	forgeCompanionIconColor: "var(--text-accent)",
	recommendHeaderColor: "var(--text-accent)",
	recommendHeaderMuted: false,
	recommendTabsFontSize: 0.85,
	recommendTabsOverrideFont: false,
	recommendTabsFontFamily: "ibm-plex-sans-var",
	recommendTabsFontWeight: "400",
	recommendTabsColor: "var(--text-muted)",
	recommendTabsActiveColor: "var(--text-accent)",
	recommendChapterTitleFontSize: 1,
	recommendChapterTitleOverrideFont: false,
	recommendChapterTitleFontFamily: "ibm-plex-sans-var",
	recommendChapterTitleFontWeight: "600",
	recommendChapterTitleColor: "var(--text-accent)",
	recommendChapterTitleMuted: false,
	recommendChapterTitleSmallCaps: false,
	recommendDossierHeaderFontSize: 1.15,
	recommendDossierHeaderOverrideFont: false,
	recommendDossierHeaderFontFamily: "ibm-plex-sans-var",
	recommendDossierHeaderFontWeight: "600",
	recommendDossierHeaderColor: "var(--text-accent)",
	recommendDossierHeaderMuted: false,
	recommendDossierHeaderSmallCaps: false,
	recommendNovelTitleFontSize: 1.1,
	recommendNovelTitleOverrideFont: false,
	recommendNovelTitleFontFamily: "ibm-plex-sans-var",
	recommendNovelTitleFontWeight: "600",
	recommendNovelTitleColor: "var(--text-normal)",
	recommendNovelTitleMuted: false,
	recommendNovelTitleSmallCaps: false,
	recommendNovelSubtitleFontSize: 0.9,
	recommendNovelSubtitleOverrideFont: false,
	recommendNovelSubtitleFontFamily: "ibm-plex-sans-var",
	recommendNovelSubtitleFontWeight: "400",
	recommendNovelSubtitleColor: "var(--text-muted)",
	recommendNovelSubtitleMuted: false,
	recommendNovelSubtitleSmallCaps: false,
	recommendPlotChapterFontSize: 1,
	recommendPlotChapterOverrideFont: false,
	recommendPlotChapterFontFamily: "ibm-plex-sans-var",
	recommendPlotChapterFontWeight: "600",
	recommendPlotChapterColor: "var(--text-normal)",
	recommendPlotChapterMuted: false,
	recommendPlotChapterSmallCaps: false,
	recommendSectionTitleFontSize: 0.85,
	recommendSectionTitleOverrideFont: false,
	recommendSectionTitleFontFamily: "ibm-plex-sans-var",
	recommendSectionTitleFontWeight: "600",
	recommendSectionTitleColor: "var(--text-muted)",
	recommendSectionTitleMuted: false,
	recommendSectionTitleSmallCaps: false,
	recommendItemsFontSize: 1,
	recommendItemsOverrideFont: false,
	recommendItemsFontFamily: "ibm-plex-sans-var",
	recommendItemsFontWeight: "400",
	recommendItemsColor: "#c8c8c8",
	recommendItemsMuted: false,
	recommendDetailsFontSize: 0.9,
	recommendDetailsOverrideFont: false,
	recommendDetailsFontFamily: "ibm-plex-sans-var",
	recommendDetailsFontWeight: "400",
	recommendDetailsColor: "var(--text-normal)",
	recommendDetailsMuted: false,
	recommendMetaLabelFontSize: 0.9,
	recommendMetaLabelOverrideFont: false,
	recommendMetaLabelFontFamily: "ibm-plex-sans-var",
	recommendMetaLabelFontWeight: "500",
	recommendMetaLabelColor: "var(--text-muted)",
	recommendMetaLabelMuted: false,
	recommendMetaLabelSmallCaps: false,
	recommendMetaControlFontSize: 1,
	recommendMetaControlOverrideFont: false,
	recommendMetaControlFontFamily: "ibm-plex-sans-var",
	recommendMetaControlFontWeight: "400",
	recommendMetaControlColor: "var(--text-normal)",
	recommendMetaControlMuted: false,
	recommendSynopsisFontSize: 1,
	recommendSynopsisOverrideFont: false,
	recommendSynopsisFontFamily: "ibm-plex-sans-var",
	recommendSynopsisFontWeight: "400",
	recommendSynopsisColor: "var(--text-normal)",
	recommendHighlightColor: "#fef3c7",
	recommendHighlightTextColor: "#1f2937",
	recommendUseHeaderColorForAll: false,
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

export default class StoryForgePlugin extends Plugin {
	/** Versioned host API for xForge siblings (`app.plugins.getPlugin("storyforge")?.api`). */
	api!: StoryForgeHostApi;
	private rightRailRegistry: RightRailRegistration[] = [];
	private activeBookListeners = new Set<(book: { folderName: string; bookId: string } | null) => void>();
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	/** Documents of currently open pop-out windows, kept in sync via the "window-open"/"window-close" workspace events. */
	private extraDocs = new Set<Document>();
	/** CSS-variable / body-class styling layer (constructed early in `onload`). */
	private style!: StyleController;
	/** Tracks which documents already had companion FontFace registration (idempotent per doc). */
	private fontFacesRegisteredFor = new Set<Document>();
	/** Active formatForge (or future typography) companion, if registered. */
	private formatCompanion: FormatCompanionRegistration | null = null;
	/** Settings tab — refreshed when format companion registers/unregisters. */
	private settingsTab: StoryForgeSettingsTab | null = null;
	/** Contributions into storyLibrary panel / future slots. */
	private viewContributions: StoryForgeViewContribution[] = [];
	/** Companion panels for the Forge right-rail tab (nameForge, …). */
	private companionPanels: StoryForgeCompanionPanel[] = [];
	/**
	 * Mutable extensions array registered once via `registerEditorExtension` - Obsidian rebuilds new
	 * `EditorState`s (e.g. when switching chapters) from this array's *current* contents, so mutating
	 * it plus `workspace.updateOptions()` keeps both open and freshly-opened editors in sync.
	 */
	private cyclingGuideExtensions: Extension[] = [];
	private currentCyclingGuidePlugin: ReturnType<typeof createCyclingGuideViewPlugin> | null = null;
	private backupInProgress = false;
	/** Guards enforcePanelOrder()'s own detach/recreate against being mistaken for a user tab drag by the layout-change watcher. */
	private isAdjustingPanelOrder = false;
	/** Serialises ensureSidePanels / ensureRightRailPanels so overlapping calls cannot create duplicate tabs. */
	private ensurePanelsChain: Promise<void> = Promise.resolve();
	/** The one main-area tab storyForge's own navigation (Series overview, continuous read, chapter
	 * opens, the new-chapter page, …) always reuses — see getMainContentLeaf(). Not persisted:
	 * starts fresh (null) every session, adopting whatever leaf the first such navigation touches. */
	private mainContentLeafId: string | null = null;
	/**
	 * titleForge — an in-tree, extraction-ready subplugin (see src/titleforge/README.md), not a
	 * storyForge feature. This is storyForge's whole touch point: construct it, await onload(),
	 * call onunload(). Not private — StoryForgeSettingsTab.ts opens TitleForgeSettingsModal with it.
	 */
	titleForge!: TitleForgeController;

	async onload(): Promise<void> {
		// Loaded first, before registerView() below - Obsidian can start restoring a previously-open
		// leaf of our view type as soon as it's registered, without waiting for the rest of onload()
		// to resolve, so StoryForgeView.onOpen() must never risk reading pre-load default settings.
		await this.loadSettings();
		this.style = new StyleController(this);
		// Expose host API as early as possible so siblings (nameForge, …) can soft-connect
		// during the rest of onload / immediately after a hot-reload.
		this.api = createHostApi(this);

		// Must run before TitleForgeController.onload() below, which touches
		// _backstage/titleforge/ immediately (ensureLexiconsSeeded, loadSettings)
		// — running this later inside initializeVaultState() (as the other
		// structural migrations do) would let titleForge seed fresh defaults at
		// the new path first, then find "the new path already exists" and skip,
		// orphaning the real data at the legacy path. See migrateTitleforgeLocation's
		// doc comment in migration.ts.
		await migrateTitleforgeLocation(this.app);
		this.titleForge = new TitleForgeController(this);
		await this.titleForge.onload();

		// Defensively remove any style tags a previous plugin version (before dynamic <style>
		// injection was replaced with CSS custom properties) left behind - both from a stale
		// hot-reloaded instance, and from upgrading from an older release of this plugin.
		document
			.querySelectorAll(
				"#storyforge-visibility-styles, #storyforge-header-styles, #storyforge-highlight-styles, #storyforge-library-header-styles, #storyforge-codex-folder-styles, #storyforge-codex-note-label-styles, #storyforge-heading1-link-styles, #storyforge-text-style-overrides, #storyforge-custom-fonts, #storyforge-cycling-guide-styles",
			)
			.forEach((el) => el.remove());

		registerCustomIcons();
		this.registerView(STORYFORGE_VIEW_TYPE, (leaf) => new StoryForgeView(leaf, this));
		this.registerView(STORYTELLING_VIEW_TYPE, (leaf) => new StorytellingView(leaf, this));
		this.registerView(STORYFORGE_CONTINUOUS_VIEW_TYPE, (leaf) => new ContinuousReadView(leaf, this));
		this.registerView(STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE, (leaf) => new SeriesOverviewView(leaf, this));
		this.registerView(STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE, (leaf) => new NovelOverviewView(leaf, this));
		this.registerView(STORYFORGE_NEW_CHAPTER_VIEW_TYPE, (leaf) => new NewChapterView(leaf, this));
		this.registerView(TOOLS_VIEW_TYPE, (leaf) => new ToolsView(leaf));
		this.registerView(RECOMMEND_VIEW_TYPE, (leaf) => new RecommendationView(leaf, this));
		this.registerView(ARCHIVE_VIEW_TYPE, (leaf) => new ArchiveView(leaf, this));

		this.addCommand({
			id: "open-recommendations",
			name: "Open Story Context",
			callback: () => void this.activateRecommendView(),
		});

		this.addCommand({
			id: "open-archive",
			name: "Open Archive",
			callback: () => void this.activateArchiveView("codex"),
		});

		this.addCommand({
			id: "open-view",
			name: "Open storyLibrary panel",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-tools-view",
			name: "Open Tools panel",
			callback: () => void this.activateToolsView(),
		});

		this.addCommand({
			id: "open-storytelling-view",
			name: "Open storyTelling panel",
			callback: () => void this.activateStorytellingView(),
		});

		// Hidden behind the "Use tools panel" setting like every other ribbon icon (ToolsPanel.ts
		// relocates the whole native ribbon into the Tools panel); this one reuses the "choose
		// layout" icon now that its original job (the storyLibrary panel's layout dropdown) has
		// moved to a tab row instead.
		this.addRibbonIcon(ICON_LAYOUT_SELECTOR, "Open storyForge interface", () => this.openStoryForgeInterface());
		this.addRibbonIcon(ICON_TAG_EDIT, "Open Tags & Codex types", () => this.openTagRegistry());

		this.settingsTab = new StoryForgeSettingsTab(this.app, this);
		this.addSettingTab(this.settingsTab);
		this.applyAllStyles();
		if (this.pluginSettings.cyclingGuideEnabled) this.rebuildCyclingGuideExtension();
		this.registerEditorExtension(this.cyclingGuideExtensions);
		registerTabTitleOverrides(this.app, (eventRef) => this.registerEvent(eventRef));

		registerReconciliationEvents(this.app, this);

		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && isLibraryChapterPath(file.path)) {
					this.scheduleRecompute(file.path);
				}
			}),
		);

		// CSS custom properties are only set on the document they were applied to, so a pane
		// detached into its own OS window (a WorkspaceWindow, with its own `doc`) starts out
		// with none of this plugin's styling. Track it and re-apply everything into it.
		this.registerEvent(
			this.app.workspace.on("window-open", (win) => {
				this.extraDocs.add(win.doc);
				this.applyAllStyles();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				this.extraDocs.delete(win.doc);
				this.fontFacesRegisteredFor.delete(win.doc);
			}),
		);

		this.app.workspace.onLayoutReady(() => {
			void this.initializeVaultState();
			void this.enqueueEnsurePanels(async () => {
				await this.ensureSidePanelsUnlocked();
				await this.refreshCustomIcons();
			});
			this.registerPanelOrderWatcher();
			refreshTabTitles(this.app);
			this.applyEditorScrollbarStyles();
			this.style.applyRightRailChrome();
			void this.maybeRunScheduledBackup("vault-open");
		});

		// Switching to the storyTelling panel is a leaf activation like any other (it's a sidebar
		// tab) rather than something StoryForgeView's own layout-tab click handler can see, so this
		// is a separate, plugin-level listener rather than living next to the Novel/Chapter
		// handling in StoryForgeView.ts's selectLayout().
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof StorytellingView) {
					this.leaveSeriesOverviewIfShowing();
					this.leaveNovelOverviewIfShowing();
				}
			}),
		);
		const refreshRightRailChrome = debounce(() => this.style.applyRightRailChrome(), 50);
		this.registerEvent(this.app.workspace.on("layout-change", () => refreshRightRailChrome()));
		this.register(() => refreshRightRailChrome.cancel());

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
	 * Inactive sidebar tabs often restore as DeferredView with a persisted fallback icon
	 * (`lucide-ghost`) and the raw view-type string as the title. Round-tripping
	 * `setViewState(getViewState())` re-applies that stale chrome. Load deferred leaves,
	 * drop duplicates, then rebuild so tab headers pick up registered custom icons.
	 */
	private async refreshCustomIcons(): Promise<void> {
		const types = [
			STORYFORGE_VIEW_TYPE,
			STORYFORGE_CONTINUOUS_VIEW_TYPE,
			STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE,
			STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE,
			STORYFORGE_NEW_CHAPTER_VIEW_TYPE,
			TOOLS_VIEW_TYPE,
			RECOMMEND_VIEW_TYPE,
			ARCHIVE_VIEW_TYPE,
			...this.rightRailRegistry.map((r) => r.viewType),
		];
		for (const type of types) {
			this.dedupeLeavesOfType(type);
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				await leaf.loadIfDeferred();
				// rebuildView is runtime-public on WorkspaceLeaf but not in the published typings.
				await (leaf as WorkspaceLeaf & { rebuildView(): Promise<void> }).rebuildView();
			}
		}
	}

	/**
	 * Forces any open storyForge view(s) to re-render, e.g. after a settings change with no other
	 * trigger. Inactive sidebar tabs restore as DeferredView (see refreshCustomIcons()'s doc
	 * comment) and have no `render()` of their own, so the `instanceof` checks double as a guard
	 * against that rather than being redundant type narrowing.
	 */
	refreshStoryForgeViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			if (leaf.view instanceof StoryForgeView) leaf.view.render();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(STORYTELLING_VIEW_TYPE)) {
			if (leaf.view instanceof StorytellingView) leaf.view.render();
		}
	}

	/** The Series overview page (main-pane view) always reads its selected novel straight from
	 * settings rather than holding its own copy — this is the one nudge it needs to notice a book
	 * picked elsewhere (StoryForgeView.ts's onSelectBook/followActiveFile). A no-op if it isn't
	 * currently open anywhere. */
	refreshSeriesOverviewView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE)) {
			if (leaf.view instanceof SeriesOverviewView) leaf.view.render();
		}
	}

	/** The Novel overview page (main-pane view) always reads its selected novel straight from
	 * settings too (NovelOverviewView.ts) — same nudge as refreshSeriesOverviewView() above, for the
	 * storyLibrary panel's Novel layout instead of its Series one. A no-op if it isn't currently
	 * open anywhere. */
	refreshNovelOverviewView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_NOVEL_OVERVIEW_VIEW_TYPE)) {
			if (leaf.view instanceof NovelOverviewView) leaf.view.render();
		}
	}

	/** Series panel's onSelectBook nudge (StoryForgeView.ts) — an already-open Story Context panel
	 * (right sidebar) should jump to its Novel tab and show the newly-picked book. A no-op if it
	 * isn't currently open anywhere. */
	focusRecommendationOnNovel(bookFolderName: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)) {
			if (leaf.view instanceof RecommendationView) leaf.view.focusNovel(bookFolderName);
		}
	}

	/** Novel panel's own entry nudge (StoryForgeView.ts's openNovelOverview), also fired from the
	 * storyLibrary panel's own Chapter layout tab whenever a chapter there is selected or opened
	 * (or that tab itself is switched into) — an already-open Story Context panel (right sidebar)
	 * should jump to its own Chapter tab and show the given chapter. A no-op if it isn't currently
	 * open anywhere. */
	focusRecommendationOnChapter(bookFolderName: string, filename: string): void {
		for (const leaf of this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)) {
			if (leaf.view instanceof RecommendationView) leaf.view.focusChapter(bookFolderName, filename);
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

	/** The tracked leaf if it still exists (hasn't been closed by the user) — null rather than
	 * creating one, for callers that only want to act on it if it's already open. */
	private getMainContentLeafIfExists(): WorkspaceLeaf | null {
		if (!this.mainContentLeafId) return null;
		return this.app.workspace.getLeafById(this.mainContentLeafId);
	}

	/**
	 * The one main-area tab all of storyForge's own navigation shares — Series overview, continuous
	 * read, chapter opens from the storyForge/storyTelling panels, the new-chapter page. Reusing a
	 * leaf by its own id (rather than `workspace.getLeaf(false)`'s "whatever's currently active")
	 * guarantees these transitions land on the *same* tab every time regardless of what else the
	 * user has since clicked into, so switching between Series/Novel/Chapter/storyTelling never
	 * piles up extra tabs of our own making.
	 */
	getMainContentLeaf(): WorkspaceLeaf {
		const existing = this.getMainContentLeafIfExists();
		if (existing) return existing;
		const leaf = this.app.workspace.getLeaf(false);
		// `id` is runtime-public on WorkspaceLeaf but not in the published typings (same situation
		// as rebuildView() elsewhere in this file).
		this.mainContentLeafId = (leaf as WorkspaceLeaf & { id: string }).id;
		return leaf;
	}

	/** Shared body of leaveSeriesOverviewIfShowing()/leaveNovelOverviewIfShowing() below, once the
	 * caller has already confirmed the tracked main-content leaf is showing the overview page it
	 * cares about: quietly swaps in whichever chapter was previously selected, or the blank
	 * "create new chapter" page if there's none (or it's since been deleted). */
	private replaceOverviewLeafWithEditor(leaf: WorkspaceLeaf): void {
		const bookFolderName = this.getSettings().selectedNovel;
		if (!bookFolderName) return;
		const chapterFilename = this.getSettings().selectedObject;
		const file = chapterFilename
			? this.app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, chapterFilename))
			: null;
		if (file instanceof TFile) {
			void leaf.openFile(file);
		} else {
			void leaf.setViewState({ type: STORYFORGE_NEW_CHAPTER_VIEW_TYPE, active: true, state: { bookFolderName } });
		}
	}

	/**
	 * Called whenever the user leaves the Series tab for Novel/Chapter (StoryForgeView.ts) or
	 * switches to the storyTelling panel (this plugin's own active-leaf-change listener, above) —
	 * a no-op unless the tracked main-content tab is actually showing the Series overview page.
	 */
	leaveSeriesOverviewIfShowing(): void {
		const leaf = this.getMainContentLeafIfExists();
		if (!leaf || !(leaf.view instanceof SeriesOverviewView)) return;
		this.replaceOverviewLeafWithEditor(leaf);
	}

	/** Same as leaveSeriesOverviewIfShowing() above, for the Novel layout's own overview page
	 * (NovelOverviewView.ts) — called whenever the user leaves the Novel tab for Codex/Chapter
	 * (StoryForgeView.ts) or switches to the storyTelling panel. */
	leaveNovelOverviewIfShowing(): void {
		const leaf = this.getMainContentLeafIfExists();
		if (!leaf || !(leaf.view instanceof NovelOverviewView)) return;
		this.replaceOverviewLeafWithEditor(leaf);
	}

	onunload(): void {
		this.titleForge?.onunload();
		// Restores the native ribbon directly (without detaching the leaf, which would reset
		// its position on next load) by running the same DOM restoration ToolsView.onClose() does.
		for (const leaf of this.app.workspace.getLeavesOfType(TOOLS_VIEW_TYPE)) {
			if (leaf.view instanceof ToolsView) {
				leaf.view.restoreRibbon();
			}
		}
		document.body.classList.remove("sf-tools-open");
		this.style.clearAll();
		this.extraDocs.clear();
		this.fontFacesRegisteredFor.clear();
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateRemovedFonts(this.pluginSettings);
		migrateCodexFocusLayout(this.pluginSettings);
		const shellMigrated = migrateStoryContextShell(this.pluginSettings, data);
		const sections = { ...DEFAULT_SETTINGS.codexFactSectionByType, ...this.pluginSettings.codexFactSectionByType };
		for (const opt of CODEX_TYPES) {
			if (!sections[opt.type]) sections[opt.type] = "Facts";
		}
		this.pluginSettings.codexFactSectionByType = sections;
		this.syncObsidianSettingsRef();
		if (shellMigrated) await this.saveSettings();
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
		const prevNovel = this.pluginSettings.selectedNovel;
		Object.assign(this.pluginSettings, partial);
		try {
			await this.saveSettings();
		} catch (error) {
			this.pluginSettings = previous;
			this.syncObsidianSettingsRef();
			throw error;
		}
		if (
			Object.prototype.hasOwnProperty.call(partial, "selectedNovel") &&
			prevNovel !== this.pluginSettings.selectedNovel
		) {
			this.notifyActiveBookListeners();
		}
	}

	/** Hosted siblings: register a right-rail tab after Forge (by orderHint). */
	registerHostedRightRailView(reg: RightRailRegistration): void {
		const existing = this.rightRailRegistry.findIndex((r) => r.viewType === reg.viewType);
		if (existing >= 0) this.rightRailRegistry[existing] = reg;
		else this.rightRailRegistry.push(reg);
		if (this.app.workspace.layoutReady) {
			void this.enqueueEnsurePanels(async () => {
				await this.ensureRightRailPanelsUnlocked();
				await this.refreshCustomIcons();
			});
		}
	}

	addActiveBookListener(cb: (book: { folderName: string; bookId: string } | null) => void): () => void {
		this.activeBookListeners.add(cb);
		return () => this.activeBookListeners.delete(cb);
	}

	private notifyActiveBookListeners(): void {
		const book = this.api?.getActiveBook() ?? null;
		for (const cb of this.activeBookListeners) {
			try {
				cb(book);
			} catch {
				/* sibling listener errors must not break SF */
			}
		}
	}

	/**
	 * Canonical right-rail types: Story Context → registered (orderHint). Forge-family companion
	 * panels (registerCompanionPanel) no longer get their own right-rail tab - they're embedded in
	 * Story Context's own "Forge family" tab instead (RecommendationView.ts).
	 */
	private rightRailTypes(): string[] {
		return buildRightRailTypeOrder(RECOMMEND_VIEW_TYPE, this.rightRailRegistry);
	}

	/** Replaces all settings with `data` (merged over defaults, same as `loadSettings`), persists, and re-applies every style/extension so the change takes effect immediately. */
	async importSettings(data: unknown): Promise<void> {
		if (!data || typeof data !== "object" || Array.isArray(data)) {
			throw new Error("Settings import must be a JSON object");
		}
		const incoming = data as Record<string, unknown>;
		// Formatting values must clear the same contract `updateLinkedSettings` enforces,
		// otherwise a hand-edited theme can persist an enum the CSS variable maps cannot resolve.
		const invalid = findInvalidLinkedSettings(incoming);
		if (invalid.length > 0) {
			const shown = invalid.slice(0, 5).join(", ");
			const rest = invalid.length > 5 ? `, and ${invalid.length - 5} more` : "";
			throw new Error(`Invalid formatting value for ${shown}${rest}`);
		}
		const merged = { ...this.pluginSettings };
		for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof StoryForgePluginSettings>) {
			if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
			(merged as unknown as Record<string, unknown>)[key as string] = incoming[key as string];
		}
		this.pluginSettings = merged;
		migrateRemovedFonts(this.pluginSettings);
		migrateCodexFocusLayout(this.pluginSettings);
		const sections = { ...DEFAULT_SETTINGS.codexFactSectionByType, ...this.pluginSettings.codexFactSectionByType };
		for (const opt of CODEX_TYPES) {
			if (!sections[opt.type]) sections[opt.type] = "Facts";
		}
		this.pluginSettings.codexFactSectionByType = sections;
		await this.saveSettings();

		this.applyAllStyles();
		this.setCyclingGuideEnabled(this.pluginSettings.cyclingGuideEnabled);
		this.refreshStoryForgeViews();
	}

	/** Asks the format companion to register faces into the main document and every open pop-out. */
	private registerCustomFontFacesForAllDocs(): void {
		const register = this.formatCompanion?.registerFacesForDocument;
		if (!register) return;
		for (const doc of this.getStyleDocuments()) {
			if (this.fontFacesRegisteredFor.has(doc)) continue;
			this.fontFacesRegisteredFor.add(doc);
			register(doc);
		}
	}

	/** Notify companion after host restyles so it can refresh editor typography / font vars. */
	private notifyFormatCompanionStylesApplied(): void {
		try {
			this.formatCompanion?.onHostStylesApplied?.();
		} catch {
			/* companion errors must not break SF */
		}
	}

	getFormatCompanion(): FormatCompanionRegistration | null {
		return this.formatCompanion;
	}

	/**
	 * Only a live companion takes the formatting UI over. When formatForge is enabled but
	 * has not registered, storyForge keeps its own entries so a failed companion load does
	 * not leave the user with no formatting controls at all.
	 */
	isFormatCompanionActive(): boolean {
		return (
			formatCompanionState(
				this.getFormatCompanion(),
				this.api?.formatting?.isCompanionActive() === true,
				this.app,
			) === "connected"
		);
	}

	openFormatForgeSettings(): void {
		const open = this.getFormatCompanion()?.openSettings;
		if (open) {
			open();
			return;
		}
		const settingApp = (this.app as unknown as { setting?: { open(): void; openTabById(id: string): void } }).setting;
		settingApp?.open();
		settingApp?.openTabById(FORMATFORGE_PLUGIN_ID);
	}

	/** Ribbon/command entry point for "Open storyForge interface" — always opens the modal itself.
	 * Unlike the settings tab's "Formatting (formatForge)" action, this doesn't redirect to
	 * formatForge's own settings while it's the live companion: this is a dedicated ribbon icon
	 * for this modal, so it should open it, not a different plugin's settings page. */
	openStoryForgeInterface(): void {
		new UiFormattingModal(this.app, this).open();
	}

	/** Ribbon/command entry point for "Tags & Codex types". */
	openTagRegistry(): void {
		new TagRegistryModal(this.app, () => this.refreshStoryForgeViews()).open();
	}

	registerFormatCompanion(reg: FormatCompanionRegistration): () => void {
		this.formatCompanion = reg;
		this.fontFacesRegisteredFor.clear();
		this.applyLinkedFormattingStyles();
		this.settingsTab?.refreshDomState();
		return () => {
			if (this.formatCompanion === reg) {
				this.formatCompanion = null;
				this.fontFacesRegisteredFor.clear();
				this.applyLinkedFormattingStyles();
				this.settingsTab?.refreshDomState();
			}
		};
	}

	registerViewContribution(opt: StoryForgeViewContribution): () => void {
		this.viewContributions.push(opt);
		this.viewContributions.sort((a, b) => a.orderHint - b.orderHint);
		return () => {
			this.viewContributions = this.viewContributions.filter((c) => c !== opt);
		};
	}

	getViewContributions(slot: string): StoryForgeViewContribution[] {
		return this.viewContributions.filter((c) => c.slot === slot);
	}

	registerCompanionPanel(opt: StoryForgeCompanionPanel): () => void {
		const existing = this.companionPanels.findIndex((p) => p.id === opt.id);
		if (existing >= 0) this.companionPanels[existing] = opt;
		else this.companionPanels.push(opt);
		this.companionPanels.sort((a, b) => a.orderHint - b.orderHint || a.id.localeCompare(b.id));
		this.refreshForgeFamilyPanels();
		return () => {
			this.companionPanels = this.companionPanels.filter((p) => p !== opt);
			this.refreshForgeFamilyPanels();
		};
	}

	getCompanionPanels(): StoryForgeCompanionPanel[] {
		return this.companionPanels.slice();
	}

	/** Re-render any open Story Context leaf so its "Forge family" tab (RecommendationView.ts)
	 * picks up a companion panel registering/unregistering - that tab reads getCompanionPanels()
	 * fresh on every render, so this is just a nudge to re-render now rather than on the next
	 * unrelated event. */
	private refreshForgeFamilyPanels(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)) {
			const view = leaf.view as { refreshForgeFamily?: () => void };
			if (typeof view.refreshForgeFamily === "function") view.refreshForgeFamily();
		}
	}

	/** Main document plus open pop-out windows. */
	getStyleDocuments(): Document[] {
		return [document, ...this.extraDocs];
	}

	/** Public for host API: apply CSS vars across all style documents. */
	applyHostStyleVars(vars: Record<string, string | null>): void {
		this.style.applyStyleVars(vars);
	}

	/**
	 * Re-apply SF-owned formatting (chrome, sizes, guides, scrollbar) and notify formatForge.
	 * Editor colour/font/divider vars are owned by the companion when present.
	 */
	applyLinkedFormattingStyles(): void {
		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyStorytellingItemsStyle();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyTextStyleOverrides();
		this.registerCustomFontFacesForAllDocs();
		this.applyCyclingGuideStyle();
		this.applyEditorScrollbarStyles();
		this.applyRightRailPanelStyles();
		this.style.applyRightRailChrome();
		this.notifyFormatCompanionStylesApplied();
	}

	/** The full "recompute every derived CSS/DOM styling surface" sequence, shared by initial
	 * load, new-window setup, and settings import — anywhere the plugin needs every style
	 * category rebuilt from current settings. */
	private applyAllStyles(): void {
		this.applyLinkedFormattingStyles();
	}

	applyVisibilityStyles(): void {
		this.style.applyVisibilityStyles();
	}

	applyHeaderStyles(): void {
		this.style.applyHeaderStyles();
	}

	applyHighlightStyle(): void {
		this.style.applyHighlightStyle();
	}

	/** Restyles the "Cycling guide" floating divider (thickness/colour only - the CM6 extension itself is toggled by `setCyclingGuideEnabled`). */
	applyCyclingGuideStyle(): void {
		this.style.applyCyclingGuideStyle();
	}

	/** Manuscript editor scrollbar thumb/track colours and width. */
	applyEditorScrollbarStyles(): void {
		this.style.applyEditorScrollbarStyles();
	}

	applyRightRailPanelStyles(): void {
		this.style.applyRightRailPanelStyles();
	}

	/** Rebuilds the cycling guide CM6 extension with the current interval setting. */
	rebuildCyclingGuideExtension(): void {
		this.cyclingGuideExtensions.length = 0;
		this.currentCyclingGuidePlugin = createCyclingGuideViewPlugin(CYCLING_GUIDE_INTERVAL_WORDS[this.pluginSettings.cyclingGuideInterval]);
		this.cyclingGuideExtensions.push(this.currentCyclingGuidePlugin);
		this.app.workspace.updateOptions();
	}

	/** Enables/disables the "Cycling guide" CM6 extension, applied to every currently-open editor and every editor opened from now on. */
	setCyclingGuideEnabled(enabled: boolean): void {
		this.cyclingGuideExtensions.length = 0;
		this.currentCyclingGuidePlugin = null;
		if (enabled) this.rebuildCyclingGuideExtension();
		this.app.workspace.updateOptions();
	}

	applyLibraryHeaderStyles(): void {
		this.style.applyLibraryHeaderStyles();
	}

	/** storyTelling panel's own chapter-item styling — see StoryForgePluginSettings.storytellingItemsFontSize's doc comment. */
	applyStorytellingItemsStyle(): void {
		this.style.applyStorytellingItemsStyle();
	}

	applyCodexFolderStyle(): void {
		this.style.applyCodexFolderStyle();
	}

	applyCodexNoteLabelStyle(): void {
		this.style.applyCodexNoteLabelStyle();
	}

	/**
	 * Editor body/heading *sizes* only. Colour, font, small-caps, and dividers are owned by
	 * formatForge when present (applied via `formatting.setStyleVars`).
	 */
	applyTextStyleOverrides(): void {
		this.style.applyTextStyleOverrides();
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
	}

	/** True first run only (see initializeVaultState's isFirstRun): seeds one book and one chapter,
	 * both placed (in series order / chapter-order, not left unplaced), so a brand-new vault opens
	 * with something in the library rather than an empty shelf. Both pick up their "#"-numbered
	 * defaults ("Novel #" / "Chapter #") from createBook/createChapter — no title passed here.
	 * The chapter is deliberately not opened, so it doesn't steal focus from the welcome note. */
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
		if (isFirstRun) {
			try {
				const welcomeFile = await ensureWelcomeNote(this.app);
				await this.app.workspace.getLeaf(false).openFile(welcomeFile);
			} catch (err) {
				console.error("storyForge: failed to create welcome note", err);
			}
		}
		await ensureSeriesFile(this.app);
		if (isFirstRun) await this.createFirstRunBookAndChapter();
		const tagRegistry = await ensureTagRegistryFile(this.app);
		loadCodexTypesIntoRegistry(this.app, tagRegistry);
		await migrateVaultSchema(this.app);
		const books = await ensureAllSeriesBookEntries(this.app);
		await syncAllBookReferenceFields(this.app, books);
		for (const folder of getLibraryBookFolders(this.app)) {
			await ensureAllChapterEntries(this.app, folder.name);
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

		const chapterFilename = chapterFilenameFromPath(chapterPath) ?? file.name;
		const bookId = getBookId(this.app, bookFolderName);
		// Story Context NLP is lazy: only refresh the recommend cache once the
		// panel has loaded winkNLP this session (first open pays the cost).
		if (isNlpReady()) {
			await recomputeChapterRecommend(this.app, bookFolderName, chapterFilename, bookId, {
				codexFactSectionByType: this.pluginSettings.codexFactSectionByType,
				recommendIncludeUnknownNames: this.pluginSettings.recommendIncludeUnknownNames,
			});
		}
	}

	async activateRecommendView(): Promise<void> {
		await activateRecommendView(this);
	}

	async activateArchiveView(tab: "codex" | "novel" = "codex"): Promise<void> {
		await activateArchiveView(this, tab);
	}

	async activateView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (leaf) await this.app.workspace.revealLeaf(leaf);
	}

	async activateToolsView(): Promise<void> {
		const leaf = await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", true);
		if (leaf) await this.app.workspace.revealLeaf(leaf);
	}

	async activateStorytellingView(): Promise<void> {
		const leaf = await this.ensureLeaf(STORYTELLING_VIEW_TYPE, "left", true);
		if (leaf) await this.app.workspace.revealLeaf(leaf);
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
		for (const type of [
			STORYFORGE_VIEW_TYPE,
			STORYTELLING_VIEW_TYPE,
			TOOLS_VIEW_TYPE,
			RECOMMEND_VIEW_TYPE,
			ARCHIVE_VIEW_TYPE,
			...this.rightRailRegistry.map((r) => r.viewType),
		]) {
			this.dedupeLeavesOfType(type);
		}

		// Canonical left order: Tools, storyForge, Storytelling.
		if (this.pluginSettings.useToolsPanel) {
			await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", false);
		} else {
			this.dedupeLeavesOfType(TOOLS_VIEW_TYPE);
		}
		// storyTelling opens active by default (rather than storyLibrary) — it's the always-available
		// navigator+codex+stats panel, the more useful landing spot on a fresh reload/first open.
		await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", false);
		await this.ensureLeaf(STORYTELLING_VIEW_TYPE, "left", true);
		await this.ensureRightRailPanelsUnlocked();
		await this.enforcePanelOrder();

		const storytellingLeaf = this.app.workspace.getLeavesOfType(STORYTELLING_VIEW_TYPE)[0] ?? null;
		if (storytellingLeaf) await this.app.workspace.revealLeaf(storytellingLeaf);

		const right = this.app.workspace.rightSplit;
		if (typeof right.expand === "function") right.expand();
		const contextLeaf = this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)[0] ?? null;
		if (contextLeaf) {
			await contextLeaf.setViewState({ type: RECOMMEND_VIEW_TYPE, active: true });
		}
	}

	/** Ensure Story Context → [hosted] exist in that order on the right. */
	private async ensureRightRailPanels(): Promise<void> {
		return this.enqueueEnsurePanels(() => this.ensureRightRailPanelsUnlocked());
	}

	private async ensureRightRailPanelsUnlocked(): Promise<void> {
		// Prefer Story Context before dropping legacy Archive tabs so the right split
		// doesn't collapse when Archive was the active leaf.
		const existingContext = this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)[0];
		if (existingContext) {
			await this.app.workspace.revealLeaf(existingContext);
		}
		this.app.workspace.detachLeavesOfType(ARCHIVE_VIEW_TYPE);
		// The dedicated Forge tab is retired - Forge-family companions are embedded in Story
		// Context's own tab instead (RecommendationView.ts). Detach any leftover leaf from a
		// previous version's saved workspace layout, same as the legacy Archive tab above.
		// Referenced by its old literal type id, not an import - view/ForgeView.ts is gone.
		this.app.workspace.detachLeavesOfType("storyforge-forge-view");

		const types = this.rightRailTypes();
		for (const type of types) this.dedupeLeavesOfType(type);
		if (!this.isRightRailOrderCanonical()) {
			for (const type of types) this.app.workspace.detachLeavesOfType(type);
			for (const type of types) {
				await this.ensureLeaf(type, "right", type === RECOMMEND_VIEW_TYPE);
			}
		} else {
			for (const type of types) {
				await this.ensureLeaf(type, "right", type === RECOMMEND_VIEW_TYPE);
			}
		}

		const right = this.app.workspace.rightSplit;
		if (typeof right.expand === "function") right.expand();
		const contextLeaf = this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)[0] ?? null;
		if (contextLeaf) {
			await contextLeaf.setViewState({ type: RECOMMEND_VIEW_TYPE, active: true });
			await this.app.workspace.revealLeaf(contextLeaf);
		}
	}

	/** Keeps the first leaf of `type` and detaches any extras (duplicate tab icons). */
	private dedupeLeavesOfType(type: string): void {
		const leaves = this.app.workspace.getLeavesOfType(type);
		for (let i = 1; i < leaves.length; i++) leaves[i].detach();
	}

	/** True when right-rail tabs appear in canonical order (missing tabs are OK). */
	private isRightRailOrderCanonical(): boolean {
		const expected = this.rightRailTypes();
		const order: string[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const type = leaf.view.getViewType();
			if (expected.includes(type)) order.push(type);
		});
		const present = expected.filter((t) => order.includes(t));
		const actual = order.filter((t) => expected.includes(t));
		return actual.join("\0") === present.join("\0");
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

	/** Canonical left-rail order: Tools, storyForge, Storytelling. */
	private readonly LEFT_RAIL_ORDER = [TOOLS_VIEW_TYPE, STORYFORGE_VIEW_TYPE, STORYTELLING_VIEW_TYPE];

	/** True if the present left-rail leaves (Tools/storyForge/Storytelling) appear in canonical
	 * order when walking the workspace's layout tree. Missing tabs are fine — only the relative
	 * order of whichever are actually present is checked. */
	private isCanonicalLeftOrder(): boolean {
		const order: string[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const type = leaf.view.getViewType();
			if (this.LEFT_RAIL_ORDER.includes(type)) order.push(type);
		});
		return isCanonicalTypeOrder(this.LEFT_RAIL_ORDER, order);
	}

	/**
	 * Corrects the Tools/storyForge/Storytelling tab order back to canonical when it's drifted -
	 * e.g. an upgraded vault where Tools or Storytelling had previously been created out of order.
	 * Obsidian exposes no public API to reorder existing tabs in place, so this detaches and
	 * recreates all three leaves via ensureLeaf(), guarded so the layout-change watcher below never
	 * mistakes this self-correction for a user drag. No-ops once the user has deliberately reordered
	 * the tabs (panelOrderMode === "user"). Does not touch Story Context on the right.
	 */
	private async enforcePanelOrder(): Promise<void> {
		if (this.pluginSettings.panelOrderMode !== "canonical") return;
		if (this.isCanonicalLeftOrder()) return;
		this.isAdjustingPanelOrder = true;
		try {
			this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(STORYFORGE_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(STORYTELLING_VIEW_TYPE);
			if (this.pluginSettings.useToolsPanel) await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", false);
			await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", false);
			await this.ensureLeaf(STORYTELLING_VIEW_TYPE, "left", true);
		} finally {
			this.isAdjustingPanelOrder = false;
		}
	}

	/** Detects a deliberate user drag out of Tools/storyForge/Storytelling order and switches to "user" mode permanently - after which Obsidian's own layout persistence carries the user's order across reopens with no further enforcement. */
	private registerPanelOrderWatcher(): void {
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.isAdjustingPanelOrder) return;
				if (this.pluginSettings.panelOrderMode !== "canonical") return;
				if (!this.isCanonicalLeftOrder()) {
					void this.updateSetting("panelOrderMode", "user");
				}
			}),
		);
	}
}
