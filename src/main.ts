import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { Extension } from "@codemirror/state";
import { createCyclingGuideViewPlugin } from "./cyclingGuide";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { ToolsView, TOOLS_VIEW_TYPE } from "./view/ToolsPanel";
import { RecommendationView, RECOMMEND_VIEW_TYPE, activateRecommendView } from "./view/RecommendationView";
import { ArchiveView, ARCHIVE_VIEW_TYPE, activateArchiveView } from "./view/ArchiveView";
import { SpacerView, SPACER_VIEW_TYPE } from "./view/SpacerView";
import { ForgeView, FORGE_VIEW_TYPE } from "./view/ForgeView";
import { recomputeChapterRecommend } from "./recommend/recompute";
import { isNlpReady } from "./recommend/nlp";
import { CODEX_TYPES } from "./codex";
import { buildRightRailTypeOrder } from "./rightRailOrder";
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
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders, getBookId } from "./series";
import { ensureAllChapterEntries, syncAllBookReferenceFields } from "./book";
import { migrateVaultSchema } from "./migration";
import { registerReconciliationEvents } from "./reconciliation";
import {
	isLibraryChapterPath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	seriesFilePath,
	LIBRARY_ROOT,
	CODEX_ROOT,
} from "./paths";
import { SeriesOnboardingModal } from "./view/SeriesOnboardingModal";
import { ensureWelcomeNote } from "./welcomeNote";
import { recordChapterEdit } from "./history";
import { extractFingerprint } from "./fingerprint";
import { updateChapterFingerprint } from "./chapterSidecar";
import { debounce } from "./debounce";
import { countWords } from "./wordCount";
import { registerCustomIcons } from "./icons";
import type { FormatCompanionRegistration } from "./formattingApi";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteName } from "./colorPalettes";
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
	hideSeriesPane: boolean;
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
	heading1OverrideSize: boolean;
	heading1Size: number;
	heading2OverrideSize: boolean;
	heading2Size: number;
	heading3OverrideSize: boolean;
	heading3Size: number;
	heading4OverrideSize: boolean;
	heading4Size: number;
	heading5OverrideSize: boolean;
	heading5Size: number;
	heading6OverrideSize: boolean;
	heading6Size: number;
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
	/** Width of the manuscript editor scrollbar. */
	editorScrollbarThickness: EditorScrollbarThickness;
	/** Colour of companion icons in the Forge right-rail secondary header. */
	forgeCompanionIconColor: string;
	recommendHeaderFontSize: number;
	recommendHeaderOverrideFont: boolean;
	recommendHeaderFontFamily: CustomFontFamily;
	recommendHeaderFontWeight: FontWeight;
	recommendHeaderColor: string;
	recommendHeaderMuted: boolean;
	recommendHeaderSmallCaps: boolean;
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
	| "recommendHeaderFontFamily"
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
	"recommendHeaderFontFamily",
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
 * One-time: unhide the right sidebar toggle and hide Obsidian's native right tabs so the
 * Story Context rail can own that side. Skipped once `storyContextShellApplied` is set.
 */
function migrateStoryContextShell(settings: StoryForgePluginSettings, data: unknown): boolean {
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
	hideLeftPanel: false,
	hideRightPanel: false,
	hideBacklinks: true,
	hideOutgoingLinks: true,
	hideTags: true,
	hideOutline: true,
	hideAllProperties: true,
	storyContextShellApplied: true,
	hideFileNameBar: true,
	hideNavRow: true,
	hideSeriesPane: false,
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
	heading1OverrideSize: false,
	heading1Size: 1,
	heading2OverrideSize: false,
	heading2Size: 1,
	heading3OverrideSize: false,
	heading3Size: 1,
	heading4OverrideSize: false,
	heading4Size: 1,
	heading5OverrideSize: false,
	heading5Size: 1,
	heading6OverrideSize: false,
	heading6Size: 1,
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
	editorScrollbarThickness: "thick",
	forgeCompanionIconColor: "var(--text-accent)",
	recommendHeaderFontSize: 1,
	recommendHeaderOverrideFont: false,
	recommendHeaderFontFamily: "ibm-plex-sans-var",
	recommendHeaderFontWeight: "600",
	recommendHeaderColor: "var(--text-accent)",
	recommendHeaderMuted: false,
	recommendHeaderSmallCaps: true,
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
	/** Contributions into storyForge panel / future slots. */
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

	async onload(): Promise<void> {
		// Loaded first, before registerView() below - Obsidian can start restoring a previously-open
		// leaf of our view type as soon as it's registered, without waiting for the rest of onload()
		// to resolve, so StoryForgeView.onOpen() must never risk reading pre-load default settings.
		await this.loadSettings();
		this.style = new StyleController(this);
		// Expose host API as early as possible so siblings (nameForge, …) can soft-connect
		// during the rest of onload / immediately after a hot-reload.
		this.api = createHostApi(this);

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
		this.registerView(TOOLS_VIEW_TYPE, (leaf) => new ToolsView(leaf));
		this.registerView(RECOMMEND_VIEW_TYPE, (leaf) => new RecommendationView(leaf, this));
		this.registerView(ARCHIVE_VIEW_TYPE, (leaf) => new ArchiveView(leaf, this));
		this.registerView(SPACER_VIEW_TYPE, (leaf) => new SpacerView(leaf, this));
		this.registerView(FORGE_VIEW_TYPE, (leaf) => new ForgeView(leaf, this));

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
			name: "Open panel",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-tools-view",
			name: "Open Tools panel",
			callback: () => void this.activateToolsView(),
		});

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
			this.syncSpacerActiveClass();
			void this.maybeRunScheduledBackup("vault-open");
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.syncSpacerActiveClass()),
		);
		const refreshRightRailChrome = debounce(() => this.style.applyRightRailChrome(), 50);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.syncSpacerActiveClass();
				refreshRightRailChrome();
			}),
		);
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
			TOOLS_VIEW_TYPE,
			RECOMMEND_VIEW_TYPE,
			ARCHIVE_VIEW_TYPE,
			SPACER_VIEW_TYPE,
			FORGE_VIEW_TYPE,
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

	/** Forces any open storyForge view(s) to re-render, e.g. after a settings change with no other trigger. */
	refreshStoryForgeViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)) {
			(leaf.view as StoryForgeView).render();
		}
	}

	onunload(): void {
		// Restores the native ribbon directly (without detaching the leaf, which would reset
		// its position on next load) by running the same DOM restoration ToolsView.onClose() does.
		for (const leaf of this.app.workspace.getLeavesOfType(TOOLS_VIEW_TYPE)) {
			if (leaf.view instanceof ToolsView) {
				leaf.view.restoreRibbon();
			}
		}
		document.body.classList.remove("sf-tools-open", "sf-spacer-active");
		this.style.clearAll();
		this.extraDocs.clear();
		this.fontFacesRegisteredFor.clear();
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateRemovedFonts(this.pluginSettings);
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
		await this.updateSettings({ [key]: value } as Partial<StoryForgePluginSettings>);
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

	/** Canonical right-rail types: Spacer → Story Context → Forge → registered (orderHint). */
	private rightRailTypes(): string[] {
		return buildRightRailTypeOrder(
			SPACER_VIEW_TYPE,
			RECOMMEND_VIEW_TYPE,
			FORGE_VIEW_TYPE,
			this.rightRailRegistry,
		);
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
		this.refreshSpacerContributions();
		return () => {
			this.viewContributions = this.viewContributions.filter((c) => c !== opt);
			this.refreshSpacerContributions();
		};
	}

	getViewContributions(slot: string): StoryForgeViewContribution[] {
		return this.viewContributions.filter((c) => c.slot === slot);
	}

	/** Re-mount spacer-slot contributions on any open Spacer leaves. */
	private refreshSpacerContributions(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(SPACER_VIEW_TYPE)) {
			const view = leaf.view as { renderContributions?: () => void };
			// Duck-type: `instanceof SpacerView` fails across hot-reload module identities.
			if (typeof view.renderContributions === "function") view.renderContributions();
		}
	}

	registerCompanionPanel(opt: StoryForgeCompanionPanel): () => void {
		const existing = this.companionPanels.findIndex((p) => p.id === opt.id);
		if (existing >= 0) this.companionPanels[existing] = opt;
		else this.companionPanels.push(opt);
		this.companionPanels.sort((a, b) => a.orderHint - b.orderHint || a.id.localeCompare(b.id));
		this.refreshForgeCompanions();
		return () => {
			this.companionPanels = this.companionPanels.filter((p) => p !== opt);
			this.refreshForgeCompanions();
		};
	}

	getCompanionPanels(): StoryForgeCompanionPanel[] {
		return this.companionPanels.slice();
	}

	/** Re-mount companion headers/panels on any open Forge leaves. */
	private refreshForgeCompanions(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(FORGE_VIEW_TYPE)) {
			const view = leaf.view as { renderCompanions?: () => void };
			if (typeof view.renderCompanions === "function") view.renderCompanions();
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

	/** Eagerly creates the story library and Codex root folders (mirrors the already-eager _sf-backstage
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

	/** Shown only on true first run (series.md doesn't exist yet), before ensureSeriesFile() would
	 * otherwise silently seed it with "Untitled Series". Resolves once the modal closes by any path. */
	private showFirstRunModal(): Promise<void> {
		return new Promise((resolve) => {
			new SeriesOnboardingModal(this.app, this, resolve).open();
		});
	}

	private async initializeVaultState(): Promise<void> {
		await this.ensureEagerFolders();
		const isFirstRun = !this.app.vault.getAbstractFileByPath(seriesFilePath());
		if (isFirstRun) {
			await this.showFirstRunModal();
			try {
				const welcomeFile = await ensureWelcomeNote(this.app);
				await this.app.workspace.getLeaf(false).openFile(welcomeFile);
			} catch (err) {
				console.error("storyForge: failed to create welcome note", err);
			}
		}
		await ensureSeriesFile(this.app);
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
	 * left (Tools stays as a sibling tab, not the active one). Expands the right rail so Spacer
	 * and Story Context are ready the same way the left panels are.
	 */
	private async ensureSidePanels(): Promise<void> {
		return this.enqueueEnsurePanels(() => this.ensureSidePanelsUnlocked());
	}

	private async ensureSidePanelsUnlocked(): Promise<void> {
		// Strip stacked copies from prior hot-reloads / raced ensures before creating anything.
		for (const type of [
			STORYFORGE_VIEW_TYPE,
			TOOLS_VIEW_TYPE,
			SPACER_VIEW_TYPE,
			RECOMMEND_VIEW_TYPE,
			FORGE_VIEW_TYPE,
			ARCHIVE_VIEW_TYPE,
			...this.rightRailRegistry.map((r) => r.viewType),
		]) {
			this.dedupeLeavesOfType(type);
		}

		await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (this.pluginSettings.useToolsPanel) {
			await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", false);
		} else {
			this.dedupeLeavesOfType(TOOLS_VIEW_TYPE);
		}
		await this.ensureRightRailPanelsUnlocked();
		await this.enforcePanelOrder();

		const sfLeaf = this.app.workspace.getLeavesOfType(STORYFORGE_VIEW_TYPE)[0] ?? null;
		if (sfLeaf) await this.app.workspace.revealLeaf(sfLeaf);

		const right = this.app.workspace.rightSplit;
		if (typeof right.expand === "function") right.expand();
		const contextLeaf = this.app.workspace.getLeavesOfType(RECOMMEND_VIEW_TYPE)[0] ?? null;
		if (contextLeaf) {
			await contextLeaf.setViewState({ type: RECOMMEND_VIEW_TYPE, active: true });
		}
		this.syncSpacerActiveClass();
	}

	/** Ensure Spacer → Story Context → Forge → [hosted] exist in that order on the right. */
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
	 * When the Spacer tab is the visible leaf in the right rail, drop the divider between the
	 * editor and the sidebar so the empty spacer blends into the writing surface.
	 */
	private syncSpacerActiveClass(): void {
		const spacerShowing = !!document.querySelector(
			'.mod-right-split .workspace-leaf.mod-active .workspace-leaf-content[data-type="storyforge-spacer-view"]',
		);
		document.body.classList.toggle("sf-spacer-active", spacerShowing);
		for (const doc of this.extraDocs) {
			const showing = !!doc.querySelector(
				'.mod-right-split .workspace-leaf.mod-active .workspace-leaf-content[data-type="storyforge-spacer-view"]',
			);
			doc.body.classList.toggle("sf-spacer-active", showing);
		}
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

	/** True if the StoryForge leaf is visited before the Tools leaf when walking the workspace's layout tree (i.e. sits earlier among tabs in a shared group). If either is absent, there's nothing to enforce. */
	private isSfBeforeTools(): boolean {
		const order: string[] = [];
		this.app.workspace.iterateAllLeaves((leaf) => {
			const type = leaf.view.getViewType();
			if (type === STORYFORGE_VIEW_TYPE) order.push("sf");
			else if (type === TOOLS_VIEW_TYPE) order.push("tools");
		});
		const sfIndex = order.indexOf("sf");
		const toolsIndex = order.indexOf("tools");
		if (sfIndex === -1 || toolsIndex === -1) return true;
		return sfIndex < toolsIndex;
	}

	/**
	 * Corrects StoryForge/Tools tab order back to canonical (SF before Tools) when it's drifted -
	 * e.g. an upgraded vault where Tools had previously been created first. Obsidian exposes no
	 * public API to reorder two existing tabs in place, so this detaches and recreates both leaves
	 * via ensureLeaf(), guarded so the layout-change watcher below never mistakes this
	 * self-correction for a user drag. No-ops once the user has deliberately reordered the tabs
	 * (panelOrderMode === "user"). Does not touch Story Context on the right.
	 */
	private async enforcePanelOrder(): Promise<void> {
		if (this.pluginSettings.panelOrderMode !== "canonical") return;
		if (this.isSfBeforeTools()) return;
		this.isAdjustingPanelOrder = true;
		try {
			this.app.workspace.detachLeavesOfType(STORYFORGE_VIEW_TYPE);
			this.app.workspace.detachLeavesOfType(TOOLS_VIEW_TYPE);
			await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
			if (this.pluginSettings.useToolsPanel) await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", false);
		} finally {
			this.isAdjustingPanelOrder = false;
		}
	}

	/** Detects a deliberate user drag of Tools ahead of StoryForge and switches to "user" mode permanently - after which Obsidian's own layout persistence carries the user's order across reopens with no further enforcement. */
	private registerPanelOrderWatcher(): void {
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				if (this.isAdjustingPanelOrder) return;
				if (this.pluginSettings.panelOrderMode !== "canonical") return;
				if (!this.isSfBeforeTools()) {
					void this.updateSetting("panelOrderMode", "user");
				}
			}),
		);
	}
}
