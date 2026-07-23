import { Notice, Platform, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { Extension } from "@codemirror/state";
import { createCyclingGuideViewPlugin } from "./cyclingGuide";
import { StoryForgeView, STORYFORGE_VIEW_TYPE } from "./view/StoryForgeView";
import { ToolsView, TOOLS_VIEW_TYPE } from "./view/ToolsPanel";
import { RecommendationView, RECOMMEND_VIEW_TYPE, activateRecommendView } from "./view/RecommendationView";
import { ArchiveView, ARCHIVE_VIEW_TYPE, activateArchiveView } from "./view/ArchiveView";
import { SpacerView, SPACER_VIEW_TYPE } from "./view/SpacerView";
import { recomputeChapterRecommend } from "./recommend/recompute";
import { CODEX_TYPES } from "./codex";
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
import { registerCustomFontFaces, resolveCustomFontFamilyParts, CUSTOM_FONTS, CustomFontEntry } from "./fonts";
import { refreshTabTitles, registerTabTitleOverrides } from "./tabTitles";
import { PaletteColor, PaletteName } from "./colorPalettes";
import { runContentBackup } from "./backup";

export type CodexFolderIndicatorThickness = "none" | "thin" | "medium" | "thick";

const CODEX_FOLDER_INDICATOR_WIDTH_PX: Record<CodexFolderIndicatorThickness, number> = {
	none: 0,
	thin: 1,
	medium: 2,
	thick: 4,
};

export type HeadingDividerThickness = "thin" | "medium" | "thick" | "extra-thick";
export type EditorScrollbarThickness = "thin" | "medium" | "thick";

export type CustomFontFamily =
	| "alan-sans"
	| "caveat"
	| "courier-prime"
	| "exo-2"
	| "fredoka"
	| "grenze"
	| "ibm-plex-sans-var"
	| "libre-baskerville"
	| "nunito"
	| "playpen-sans"
	| "roboto-flex"
	| "sn-pro";

export type FontWeight = "300" | "400" | "500" | "600" | "700" | "800" | "900";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";

export type StatusBarView = "hidden" | "sync-only" | "all";

export type CyclingGuideInterval = "short" | "medium" | "large";

const CYCLING_GUIDE_INTERVAL_WORDS: Record<CyclingGuideInterval, number> = {
	short: 300,
	medium: 500,
	large: 750,
};

const HEADING_DIVIDER_WIDTH_PX: Record<HeadingDividerThickness, number> = {
	thin: 1,
	medium: 2,
	thick: 4,
	"extra-thick": 6,
};

/** Editor scrollbar widths: thick ≈ roomy; thin = practical minimum; medium midway. */
const EDITOR_SCROLLBAR_WIDTH_PX: Record<EditorScrollbarThickness, number> = {
	thin: 6,
	medium: 12,
	thick: 20,
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
	hideHeading1Links: boolean;
	bodyTextOverrideSize: boolean;
	bodyTextOverrideColor: boolean;
	bodyTextSize: number;
	bodyTextColor: string;
	bodyTextOverrideEmphasisColor: boolean;
	bodyTextBoldColor: string;
	bodyTextItalicColor: string;
	bodyTextOverrideFont: boolean;
	bodyTextFontWeight: FontWeight;
	bodyTextFontFamily: CustomFontFamily;
	heading1OverrideSize: boolean;
	heading1OverrideColor: boolean;
	heading1Size: number;
	heading1Color: string;
	heading1OverrideFont: boolean;
	heading1FontWeight: FontWeight;
	heading1FontFamily: CustomFontFamily;
	heading1SmallCaps: boolean;
	heading1DividerAbove: boolean;
	heading1DividerAboveThickness: HeadingDividerThickness;
	heading1DividerBelow: boolean;
	heading1DividerBelowThickness: HeadingDividerThickness;
	heading2OverrideSize: boolean;
	heading2OverrideColor: boolean;
	heading2Size: number;
	heading2Color: string;
	heading2OverrideFont: boolean;
	heading2FontWeight: FontWeight;
	heading2FontFamily: CustomFontFamily;
	heading2SmallCaps: boolean;
	heading2DividerAbove: boolean;
	heading2DividerAboveThickness: HeadingDividerThickness;
	heading2DividerBelow: boolean;
	heading2DividerBelowThickness: HeadingDividerThickness;
	heading3OverrideSize: boolean;
	heading3OverrideColor: boolean;
	heading3Size: number;
	heading3Color: string;
	heading3OverrideFont: boolean;
	heading3FontWeight: FontWeight;
	heading3FontFamily: CustomFontFamily;
	heading3SmallCaps: boolean;
	heading3DividerAbove: boolean;
	heading3DividerAboveThickness: HeadingDividerThickness;
	heading3DividerBelow: boolean;
	heading3DividerBelowThickness: HeadingDividerThickness;
	heading4OverrideSize: boolean;
	heading4OverrideColor: boolean;
	heading4Size: number;
	heading4Color: string;
	heading4OverrideFont: boolean;
	heading4FontWeight: FontWeight;
	heading4FontFamily: CustomFontFamily;
	heading4SmallCaps: boolean;
	heading4DividerAbove: boolean;
	heading4DividerAboveThickness: HeadingDividerThickness;
	heading4DividerBelow: boolean;
	heading4DividerBelowThickness: HeadingDividerThickness;
	heading5OverrideSize: boolean;
	heading5OverrideColor: boolean;
	heading5Size: number;
	heading5Color: string;
	heading5OverrideFont: boolean;
	heading5FontWeight: FontWeight;
	heading5FontFamily: CustomFontFamily;
	heading5SmallCaps: boolean;
	heading5DividerAbove: boolean;
	heading5DividerAboveThickness: HeadingDividerThickness;
	heading5DividerBelow: boolean;
	heading5DividerBelowThickness: HeadingDividerThickness;
	heading6OverrideSize: boolean;
	heading6OverrideColor: boolean;
	heading6Size: number;
	heading6Color: string;
	heading6OverrideFont: boolean;
	heading6FontWeight: FontWeight;
	heading6FontFamily: CustomFontFamily;
	heading6SmallCaps: boolean;
	heading6DividerAbove: boolean;
	heading6DividerAboveThickness: HeadingDividerThickness;
	heading6DividerBelow: boolean;
	heading6DividerBelowThickness: HeadingDividerThickness;
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
	automaticBackupFolder: string;
	lastAutomaticBackupAt: number;
	/** Per Codex type id → H2 heading label used for structured Facts in notes. */
	codexFactSectionByType: Record<string, string>;
	/** When true, the recommendation engine lists proper-name candidates not in Codex. */
	recommendIncludeUnknownNames: boolean;
	/** Thumb (foreground) colour of the manuscript editor scrollbar. */
	editorScrollbarThumbColor: string;
	/** Track (rail) colour of the manuscript editor scrollbar. */
	editorScrollbarTrackColor: string;
	/** Width of the manuscript editor scrollbar. */
	editorScrollbarThickness: EditorScrollbarThickness;
}

type FontFamilySettingKey =
	| "bodyTextFontFamily"
	| "heading1FontFamily"
	| "heading2FontFamily"
	| "heading3FontFamily"
	| "heading4FontFamily"
	| "heading5FontFamily"
	| "heading6FontFamily"
	| "librarySeriesTitleFontFamily"
	| "libraryBookTitleFontFamily"
	| "libraryBookSubtitleFontFamily"
	| "libraryItemsFontFamily"
	| "unplacedFontFamily"
	| "unplacedItemsFontFamily"
	| "codexFontFamily"
	| "codexFolderFontFamily"
	| "codexNoteLabelFontFamily";

const FONT_FAMILY_SETTING_KEYS: FontFamilySettingKey[] = [
	"bodyTextFontFamily",
	"heading1FontFamily",
	"heading2FontFamily",
	"heading3FontFamily",
	"heading4FontFamily",
	"heading5FontFamily",
	"heading6FontFamily",
	"librarySeriesTitleFontFamily",
	"libraryBookTitleFontFamily",
	"libraryBookSubtitleFontFamily",
	"libraryItemsFontFamily",
	"unplacedFontFamily",
	"unplacedItemsFontFamily",
	"codexFontFamily",
	"codexFolderFontFamily",
	"codexNoteLabelFontFamily",
];

/** Caroni was removed as a font choice; any settings still carrying its id (from before the removal) fall back to the current default font. */
function migrateRemovedCaroniFont(settings: StoryForgePluginSettings): void {
	for (const key of FONT_FAMILY_SETTING_KEYS) {
		if ((settings[key] as string) === "caroni") settings[key] = "ibm-plex-sans-var";
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
	hideHeading1Links: true,
	bodyTextOverrideSize: false,
	bodyTextOverrideColor: false,
	bodyTextSize: 1,
	bodyTextColor: "#c8c8c8",
	bodyTextOverrideEmphasisColor: false,
	bodyTextBoldColor: "#c8c8c8",
	bodyTextItalicColor: "#c8c8c8",
	bodyTextOverrideFont: false,
	bodyTextFontWeight: "400",
	bodyTextFontFamily: "ibm-plex-sans-var",
	heading1OverrideSize: false,
	heading1OverrideColor: false,
	heading1Size: 1,
	heading1Color: "#c8c8c8",
	heading1OverrideFont: false,
	heading1FontWeight: "400",
	heading1FontFamily: "ibm-plex-sans-var",
	heading1SmallCaps: false,
	heading1DividerAbove: false,
	heading1DividerAboveThickness: "medium",
	heading1DividerBelow: false,
	heading1DividerBelowThickness: "medium",
	heading2OverrideSize: false,
	heading2OverrideColor: false,
	heading2Size: 1,
	heading2Color: "#c8c8c8",
	heading2OverrideFont: false,
	heading2FontWeight: "400",
	heading2FontFamily: "ibm-plex-sans-var",
	heading2SmallCaps: false,
	heading2DividerAbove: false,
	heading2DividerAboveThickness: "medium",
	heading2DividerBelow: false,
	heading2DividerBelowThickness: "medium",
	heading3OverrideSize: false,
	heading3OverrideColor: false,
	heading3Size: 1,
	heading3Color: "#c8c8c8",
	heading3OverrideFont: false,
	heading3FontWeight: "400",
	heading3FontFamily: "ibm-plex-sans-var",
	heading3SmallCaps: false,
	heading3DividerAbove: false,
	heading3DividerAboveThickness: "medium",
	heading3DividerBelow: false,
	heading3DividerBelowThickness: "medium",
	heading4OverrideSize: false,
	heading4OverrideColor: false,
	heading4Size: 1,
	heading4Color: "#c8c8c8",
	heading4OverrideFont: false,
	heading4FontWeight: "400",
	heading4FontFamily: "ibm-plex-sans-var",
	heading4SmallCaps: false,
	heading4DividerAbove: false,
	heading4DividerAboveThickness: "medium",
	heading4DividerBelow: false,
	heading4DividerBelowThickness: "medium",
	heading5OverrideSize: false,
	heading5OverrideColor: false,
	heading5Size: 1,
	heading5Color: "#c8c8c8",
	heading5OverrideFont: false,
	heading5FontWeight: "400",
	heading5FontFamily: "ibm-plex-sans-var",
	heading5SmallCaps: false,
	heading5DividerAbove: false,
	heading5DividerAboveThickness: "medium",
	heading5DividerBelow: false,
	heading5DividerBelowThickness: "medium",
	heading6OverrideSize: false,
	heading6OverrideColor: false,
	heading6Size: 1,
	heading6Color: "#c8c8c8",
	heading6OverrideFont: false,
	heading6FontWeight: "400",
	heading6FontFamily: "ibm-plex-sans-var",
	heading6SmallCaps: false,
	heading6DividerAbove: false,
	heading6DividerAboveThickness: "medium",
	heading6DividerBelow: false,
	heading6DividerBelowThickness: "medium",
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
	automaticBackupFolder: "",
	lastAutomaticBackupAt: 0,
	codexFactSectionByType: {
		person: "Facts",
		place: "Facts",
		populace: "Facts",
	},
	recommendIncludeUnknownNames: true,
	editorScrollbarThumbColor: "#6b7280",
	editorScrollbarTrackColor: "#00000020",
	editorScrollbarThickness: "thick",
};

export default class StoryForgePlugin extends Plugin {
	private recomputeDebouncers = new Map<string, () => void>();
	private pluginSettings: StoryForgePluginSettings = DEFAULT_SETTINGS;
	/** Documents of currently open pop-out windows, kept in sync via the "window-open"/"window-close" workspace events. */
	private extraDocs = new Set<Document>();
	/** Tracks which documents already have the embedded custom fonts registered (CUSTOM_FONTS is fixed, so this only ever needs doing once per doc). */
	private fontFacesRegisteredFor = new Set<Document>();
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

	async onload(): Promise<void> {
		// Loaded first, before registerView() below - Obsidian can start restoring a previously-open
		// leaf of our view type as soon as it's registered, without waiting for the rest of onload()
		// to resolve, so StoryForgeView.onOpen() must never risk reading pre-load default settings.
		await this.loadSettings();

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
		this.registerView(SPACER_VIEW_TYPE, (leaf) => new SpacerView(leaf));

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

		this.addSettingTab(new StoryForgeSettingsTab(this.app, this));
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
			void this.ensureSidePanels();
			this.registerPanelOrderWatcher();
			this.refreshCustomIcons();
			refreshTabTitles(this.app);
			this.applyEditorScrollbarStyles();
			this.syncSpacerActiveClass();
			void this.maybeRunScheduledBackup("vault-open");
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.syncSpacerActiveClass()),
		);
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.syncSpacerActiveClass()),
		);

		if (Platform.isDesktopApp) {
			this.registerInterval(window.setInterval(() => void this.maybeRunScheduledBackup("interval"), 30 * 60 * 1000));
		}
	}

	/**
	 * Runs the automatic backup if enabled, a folder is configured, and it's due. "every-open" only
	 * fires on `trigger === "vault-open"` - the recurring interval check exists purely to catch
	 * daily/weekly backups becoming due while Obsidian is left open across multiple days.
	 */
	private async maybeRunScheduledBackup(trigger: "vault-open" | "interval"): Promise<void> {
		if (!Platform.isDesktopApp || this.backupInProgress) return;
		const { automaticBackupEnabled, automaticBackupFrequency, automaticBackupFolder, lastAutomaticBackupAt } = this.pluginSettings;
		if (!automaticBackupEnabled || !automaticBackupFolder) return;

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
			await runContentBackup(this.app, automaticBackupFolder, includeTime);
			await this.updateSetting("lastAutomaticBackupAt", now);
		} catch (err) {
			new Notice(`storyForge: automatic backup failed — ${(err as Error).message}`);
		} finally {
			this.backupInProgress = false;
		}
	}

	/**
	 * Leaves restored from a saved workspace layout can draw their tab icon before this
	 * plugin's custom icons finish registering, leaving Obsidian's fallback icon stuck in
	 * the tab header. Re-applying each leaf's own view state forces Obsidian to redraw it.
	 */
	private refreshCustomIcons(): void {
		for (const type of [STORYFORGE_VIEW_TYPE, TOOLS_VIEW_TYPE, RECOMMEND_VIEW_TYPE, ARCHIVE_VIEW_TYPE, SPACER_VIEW_TYPE]) {
			for (const leaf of this.app.workspace.getLeavesOfType(type)) {
				void leaf.setViewState(leaf.getViewState());
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
		document.body.classList.remove(
			"sf-use-tools-panel",
			"sf-tools-open",
			"sf-editor-scrollbar",
			"sf-sb-thin",
			"sf-sb-medium",
			"sf-sb-thick",
			"sf-spacer-active",
		);
		this.clearStyleVars(document);
		for (const doc of this.extraDocs) this.clearStyleVars(doc);
		this.extraDocs.clear();
		this.fontFacesRegisteredFor.clear();
	}

	/** Removes every `--sf-*` custom property this plugin has set on `doc.body`, so disabling/unloading leaves no styling behind. */
	private clearStyleVars(doc: Document): void {
		const names: string[] = [];
		for (let i = 0; i < doc.body.style.length; i++) {
			const name = doc.body.style.item(i);
			if (name.startsWith("--sf-")) names.push(name);
		}
		for (const name of names) doc.body.style.removeProperty(name);
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateRemovedCaroniFont(this.pluginSettings);
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
		this.pluginSettings[key] = value;
		await this.saveSettings();
	}

	/** Replaces all settings with `data` (merged over defaults, same as `loadSettings`), persists, and re-applies every style/extension so the change takes effect immediately. */
	async importSettings(data: unknown): Promise<void> {
		this.pluginSettings = Object.assign({}, DEFAULT_SETTINGS, data);
		migrateRemovedCaroniFont(this.pluginSettings);
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

	/** Sets (or, for a `null` value, clears) each named CSS custom property on `doc.body`. */
	private setStyleVars(doc: Document, vars: Record<string, string | null>): void {
		for (const [name, value] of Object.entries(vars)) {
			if (value === null) doc.body.style.removeProperty(name);
			else doc.body.style.setProperty(name, value);
		}
	}

	/** Applies `vars` to the main document and every open pop-out window. */
	private applyStyleVarsToAllDocs(vars: Record<string, string | null>): void {
		this.setStyleVars(document, vars);
		for (const doc of this.extraDocs) {
			this.setStyleVars(doc, vars);
		}
	}

	/**
	 * Tags the vault-drawer help button's `.clickable-icon` wrapper with `sf-vault-help` so styles.css
	 * can target it without `:has()` - the wrapper carries no attribute of its own, only its inner
	 * `.help` icon does. Idempotent; no-ops if the drawer/button isn't in `doc` yet.
	 */
	private tagVaultHelpButton(doc: Document): void {
		doc.body.querySelector(".workspace-drawer-vault-actions .help")?.closest(".clickable-icon")?.addClass("sf-vault-help");
	}

	/** Registers the embedded custom fonts into the main document and every open pop-out window (idempotent - see `fontFacesRegisteredFor`). */
	private registerCustomFontFacesForAllDocs(): void {
		if (!this.fontFacesRegisteredFor.has(document)) {
			this.fontFacesRegisteredFor.add(document);
			registerCustomFontFaces(document);
		}
		for (const doc of this.extraDocs) {
			if (this.fontFacesRegisteredFor.has(doc)) continue;
			this.fontFacesRegisteredFor.add(doc);
			registerCustomFontFaces(doc);
		}
	}

	/** The full "recompute every derived CSS/DOM styling surface" sequence, shared by initial
	 * load, new-window setup, and settings import — anywhere the plugin needs every style
	 * category rebuilt from current settings. */
	private applyAllStyles(): void {
		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyHeading1LinkStyle();
		this.applyTextStyleOverrides();
		this.registerCustomFontFacesForAllDocs();
		this.applyCyclingGuideStyle();
		this.applyEditorScrollbarStyles();
	}

	applyVisibilityStyles(): void {
		const s = this.pluginSettings;
		// Static rules for all of these live in styles.css, gated by --sf-*-display custom
		// properties defaulting to `revert` (i.e. "no override") when unset. See that file's
		// "Dynamic Styling" section for the corresponding selectors.
		this.applyStyleVarsToAllDocs({
			// Hides the Help button's own clickable wrapper (not just the icon glyph) when on, so
			// no empty ghost button is left behind; when off, force-shows the row it lives in
			// instead (Obsidian only reveals it on hover otherwise) - "off" should mean "shown".
			"--sf-help-display": s.hideHelp ? "none" : null,
			"--sf-vault-actions-display": s.hideHelp ? null : "flex",
			"--sf-search-display": s.hideSearch ? "none" : null,
			"--sf-bookmarks-display": s.hideBookmarks ? "none" : null,
			"--sf-files-display": s.hideFiles ? "none" : null,
			"--sf-backlinks-display": s.hideBacklinks ? "none" : null,
			"--sf-outgoing-links-display": s.hideOutgoingLinks ? "none" : null,
			"--sf-tags-display": s.hideTags ? "none" : null,
			"--sf-outline-display": s.hideOutline ? "none" : null,
			"--sf-all-properties-display": s.hideAllProperties ? "none" : null,
			"--sf-sidebar-left-display": s.hideLeftPanel ? "none" : null,
			"--sf-sidebar-right-display": s.hideRightPanel ? "none" : null,
			"--sf-filename-bar-display": s.hideFileNameBar ? "none" : null,
			"--sf-nav-row-display": s.hideNavRow ? "none" : null,
			"--sf-statusbar-hidden-display": s.statusBarView === "hidden" ? "none" : null,
			"--sf-statusbar-nonsync-display": s.statusBarView === "sync-only" ? "none" : null,
		});

		this.tagVaultHelpButton(document);
		for (const doc of this.extraDocs) this.tagVaultHelpButton(doc);

		// The ribbon-relocation rules (ribbon-width var, ribbon hide/show, tab-header padding) are
		// static in styles.css, scoped entirely by this class - no custom properties needed.
		if (s.useToolsPanel) {
			document.body.classList.add("sf-use-tools-panel");
		} else {
			document.body.classList.remove("sf-use-tools-panel");
		}
	}

	applyHeaderStyles(): void {
		const s = this.pluginSettings;
		const unplacedColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		const codexColor = s.codexMuted ? "var(--text-muted)" : s.codexColor;
		let unplacedItemsColor: string;
		if (s.unplacedUseHeaderColorForAll) {
			unplacedItemsColor = s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
		} else if (s.unplacedItemsMuted) {
			unplacedItemsColor = "var(--text-muted)";
		} else {
			unplacedItemsColor = s.unplacedItemsColor;
		}
		const vars: Record<string, string | null> = {
			"--sf-unplaced-color": unplacedColor,
			"--sf-unplaced-variant": s.unplacedSmallCaps ? "small-caps" : "normal",
			"--sf-unplaced-size": `${s.unplacedFontSize}em`,
			"--sf-unplaced-items-size": `${s.unplacedItemsFontSize}em`,
			"--sf-unplaced-items-color": unplacedItemsColor,
			"--sf-codex-color": codexColor,
			"--sf-codex-variant": s.codexSmallCaps ? "small-caps" : "normal",
			"--sf-codex-size": `${s.codexFontSize}em`,
		};
		this.assignUiFontVars(vars, "--sf-unplaced", s.unplacedOverrideFont, s.unplacedFontFamily, s.unplacedFontWeight);
		this.assignUiFontVars(vars, "--sf-unplaced-items", s.unplacedItemsOverrideFont, s.unplacedItemsFontFamily, s.unplacedItemsFontWeight);
		this.assignUiFontVars(vars, "--sf-codex", s.codexOverrideFont, s.codexFontFamily, s.codexFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	/** Resolves the codex folder colour, respecting `codexUseHeaderColorForAll`'s override of the folder colour picker. */
	private resolveCodexFolderColor(): string {
		const s = this.pluginSettings;
		return s.codexUseHeaderColorForAll ? (s.codexMuted ? "var(--text-muted)" : s.codexColor) : s.codexFolderColor;
	}

	applyHighlightStyle(): void {
		const s = this.pluginSettings;
		const unplacedHighlightColor = s.unplacedUseHeaderColorForAll
			? s.unplacedMuted
				? "var(--text-muted)"
				: s.unplacedColor
			: s.unplacedHighlightColor;
		const codexHighlightColor = s.codexUseHeaderColorForAll
			? s.codexMuted
				? "var(--text-muted)"
				: s.codexColor
			: s.codexHighlightColor;
		// Flat colour only — the indent-guide truncate gradient lives in styles.css so folder
		// indent vars resolve on the selected file, not on body.
		this.applyStyleVarsToAllDocs({
			"--sf-highlight-bg": s.highlightColor,
			"--sf-highlight-text": s.highlightTextColor,
			"--sf-unplaced-highlight-bg": unplacedHighlightColor,
			"--sf-unplaced-highlight-text": s.unplacedHighlightTextColor,
			"--sf-codex-highlight-bg": codexHighlightColor,
			"--sf-codex-highlight-text": s.codexHighlightTextColor,
		});
	}

	/** Restyles the "Cycling guide" floating divider (thickness/colour only - the CM6 extension itself is toggled by `setCyclingGuideEnabled`). */
	applyCyclingGuideStyle(): void {
		const s = this.pluginSettings;
		const px = HEADING_DIVIDER_WIDTH_PX[s.cyclingGuideThickness];
		const flagSizeEm = s.cyclingGuideFlagSize === "large" ? 1 : s.cyclingGuideFlagSize === "small" ? 0.6 : 0.75;
		const baseBadgePx = 18;
		const baseFlagEm = 0.75;
		const basePad = 3;
		const pad = basePad * 0.9; // equal L/R/B margin, reduced 10% from base
		const baseIconPx = baseBadgePx - 2 * basePad; // 12
		const iconPx = baseIconPx * flagSizeEm / baseFlagEm;
		// Badge is right-aligned, so shrinking width trims the left margin only.
		const badgeW = Math.round(iconPx + 2 * pad) - 1;
		// Keep existing top: -1px; compensate so visible bottom == pad, then trim bottom further.
		const badgeH = Math.round(iconPx + pad - 1) - 3;
		const borderRadius = s.cyclingGuideRoundedLines ? "3px 3px 0 3px" : "0";
		// Box = the divider's own colour; the icon inside it is coloured with the editor's
		// background so it reads as "knocked out" of the coloured box, per the icon's design (see styles.css).
		this.applyStyleVarsToAllDocs({
			"--sf-cg-height": `${px}px`,
			"--sf-cg-color": s.cyclingGuideColor,
			"--sf-cg-radius": borderRadius,
			"--sf-cg-badge-size": `${badgeW}px`,
			"--sf-cg-badge-inner-height": `${badgeH}px`,
			"--sf-cg-flag-size": `${flagSizeEm}em`,
		});
	}

	/** Manuscript editor scrollbar thumb/track colours and width. */
	applyEditorScrollbarStyles(): void {
		const s = this.pluginSettings;
		const width = EDITOR_SCROLLBAR_WIDTH_PX[s.editorScrollbarThickness];
		this.applyStyleVarsToAllDocs({
			"--sf-editor-scrollbar-width": `${width}px`,
			"--sf-editor-scrollbar-thumb": s.editorScrollbarThumbColor,
			"--sf-editor-scrollbar-track": s.editorScrollbarTrackColor,
		});
		this.applyEditorScrollbarBodyClass(document.body, s.editorScrollbarThickness);
		for (const doc of this.extraDocs) this.applyEditorScrollbarBodyClass(doc.body, s.editorScrollbarThickness);
	}

	private applyEditorScrollbarBodyClass(body: HTMLElement, thickness: EditorScrollbarThickness): void {
		body.classList.add("sf-editor-scrollbar");
		body.classList.remove("sf-sb-thin", "sf-sb-medium", "sf-sb-thick");
		body.classList.add(`sf-sb-${thickness}`);
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
		const s = this.pluginSettings;
		const itemsColor = s.libraryItemsMuted ? "var(--text-muted)" : s.libraryItemsColor;
		const vars: Record<string, string | null> = {
			"--sf-lib-series-size": `${s.librarySeriesTitleFontSize}em`,
			"--sf-lib-series-color": s.librarySeriesTitleColor,
			"--sf-lib-series-variant": s.librarySeriesTitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-book-size": `${s.libraryBookTitleFontSize}em`,
			"--sf-lib-book-color": s.libraryBookTitleColor,
			"--sf-lib-book-variant": s.libraryBookTitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-subtitle-size": `${s.libraryBookSubtitleFontSize}em`,
			"--sf-lib-subtitle-variant": s.libraryBookSubtitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-header-divider": s.libraryHeaderDividerBelow ? "1px solid var(--background-modifier-border)" : "none",
			"--sf-lib-items-size": `${s.libraryItemsFontSize}em`,
			"--sf-lib-items-color": itemsColor,
		};
		this.assignUiFontVars(vars, "--sf-lib-series", s.librarySeriesTitleOverrideFont, s.librarySeriesTitleFontFamily, s.librarySeriesTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-lib-book", s.libraryBookTitleOverrideFont, s.libraryBookTitleFontFamily, s.libraryBookTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-lib-subtitle", s.libraryBookSubtitleOverrideFont, s.libraryBookSubtitleFontFamily, s.libraryBookSubtitleFontWeight);
		this.assignUiFontVars(vars, "--sf-lib-items", s.libraryItemsOverrideFont, s.libraryItemsFontFamily, s.libraryItemsFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	applyCodexFolderStyle(): void {
		const s = this.pluginSettings;
		const indicatorWidth = CODEX_FOLDER_INDICATOR_WIDTH_PX[s.codexFolderIndicatorThickness];
		const folderColor = this.resolveCodexFolderColor();
		const vars: Record<string, string | null> = {
			"--sf-codex-folder-color": folderColor,
			"--sf-codex-folder-size": `${s.codexFolderFontSize}em`,
			"--sf-codex-folder-indicator-width": `${indicatorWidth}px`,
		};
		this.assignUiFontVars(vars, "--sf-codex-folder", s.codexFolderOverrideFont, s.codexFolderFontFamily, s.codexFolderFontWeight);
		this.applyStyleVarsToAllDocs(vars);
		this.applyCodexIndentBodyClass(document.body, s.codexFolderIndicatorThickness);
		for (const doc of this.extraDocs) this.applyCodexIndentBodyClass(doc.body, s.codexFolderIndicatorThickness);
	}

	/** When the folder indicator is off, selected Codex files use a flat highlight (no truncate-to-guide). */
	private applyCodexIndentBodyClass(body: HTMLElement, thickness: CodexFolderIndicatorThickness): void {
		body.classList.toggle("sf-codex-indent-none", thickness === "none");
	}

	applyCodexNoteLabelStyle(): void {
		const s = this.pluginSettings;
		let color: string;
		if (s.codexUseHeaderColorForAll) {
			color = s.codexMuted ? "var(--text-muted)" : s.codexColor;
		} else if (s.codexNoteLabelUseFolderColor) {
			color = s.codexFolderColor;
		} else if (s.codexNoteLabelUseDefaultColor) {
			color = "var(--text-normal)";
		} else {
			color = s.codexNoteLabelColor;
		}
		const vars: Record<string, string | null> = {
			"--sf-codex-note-color": color,
			"--sf-codex-note-size": `${s.codexNoteLabelFontSize}em`,
		};
		this.assignUiFontVars(vars, "--sf-codex-note", s.codexNoteLabelOverrideFont, s.codexNoteLabelFontFamily, s.codexNoteLabelFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	applyHeading1LinkStyle(): void {
		const on = this.pluginSettings.hideHeading1Links;
		this.applyStyleVarsToAllDocs({
			"--sf-h1-link-color": on ? "inherit" : null,
			"--sf-h1-link-decoration": on ? "inherit" : null,
		});
	}

	/**
	 * Writes `--{prefix}-family` / `-variation` / `-weight` for storyForge panel chrome.
	 * When a custom variable font is active, weight is left unset (variation carries wght);
	 * otherwise the weight setting is applied as `font-weight`.
	 */
	private assignUiFontVars(
		vars: Record<string, string | null>,
		prefix: string,
		overrideFont: boolean,
		fontFamily: CustomFontFamily,
		fontWeight: FontWeight,
	): void {
		const resolved = this.resolveCustomFontVars(overrideFont, fontFamily, fontWeight);
		vars[`${prefix}-family`] = resolved.family;
		vars[`${prefix}-variation`] = resolved.variation;
		vars[`${prefix}-weight`] = overrideFont && resolved.font && resolved.variation != null ? null : fontWeight;
	}

	/**
	 * The `--sf-*-family`/`--sf-*-variation` custom-property values for switching a text-style
	 * target to a custom embedded font at the given weight, when one is picked. Returns the
	 * matched font alongside the values so callers can adjust other properties that depend on
	 * whether a custom font (rather than the theme's own) is active for that target.
	 */
	private resolveCustomFontVars(
		overrideFont: boolean,
		fontFamily: CustomFontFamily,
		fontWeight: FontWeight,
	): { family: string | null; variation: string | null; font: CustomFontEntry | null } {
		if (!overrideFont) return { family: null, variation: null, font: null };
		const font = CUSTOM_FONTS.find((f) => f.id === fontFamily);
		if (!font) return { family: null, variation: null, font: null };
		const { family, variation } = resolveCustomFontFamilyParts(font, Number(fontWeight));
		return { family, variation, font };
	}

	/** Resolves the size/colour/weight/small-caps/divider custom-property values for one heading level. */
	private buildHeadingVars(
		level: 1 | 2 | 3 | 4 | 5 | 6,
		overrideSize: boolean,
		size: number,
		overrideColor: boolean,
		color: string,
		overrideFont: boolean,
		fontWeight: FontWeight,
		usingCustomFont: boolean,
		smallCaps: boolean,
		dividerAbove: boolean,
		dividerAboveThickness: HeadingDividerThickness,
		dividerBelow: boolean,
		dividerBelowThickness: HeadingDividerThickness,
	): Record<string, string | null> {
		const p = `--sf-h${level}`;
		return {
			[`${p}-size`]: overrideSize ? `${size}em` : null,
			// The specificity-boost trick (`:not(#storyforge-specificity-boost)`, needed because some
			// themes set heading colour with !important too, and equal-importance ties go to
			// specificity before source order) lives in styles.css's static selectors - only the
			// value is dynamic here.
			[`${p}-color`]: overrideColor ? color : null,
			// Skipped when a custom font is active: the family/variation vars already handle weight
			// for that case (real interpolation for a variable font, a no-op for a fixed one) -
			// applying this literal font-weight on top would force the browser to synthesize a
			// weight a fixed-weight embedded font doesn't have, reintroducing fake bold.
			[`${p}-weight`]: overrideFont && !usingCustomFont ? fontWeight : null,
			// Forced either way (small-caps or normal) whenever the font override is on, not just
			// when the toggle is "on" - otherwise turning it off would leave whatever font-variant
			// was already cascading in place (from the theme, or a stale value), reading as stuck on.
			[`${p}-variant`]: overrideFont ? (smallCaps ? "small-caps" : "normal") : null,
			[`${p}-border-top`]: dividerAbove
				? `${HEADING_DIVIDER_WIDTH_PX[dividerAboveThickness]}px solid ${overrideColor ? color : "currentColor"}`
				: null,
			[`${p}-border-bottom`]: dividerBelow
				? `${HEADING_DIVIDER_WIDTH_PX[dividerBelowThickness]}px solid ${overrideColor ? color : "currentColor"}`
				: null,
		};
	}

	applyTextStyleOverrides(): void {
		const s = this.pluginSettings;
		const vars: Record<string, string | null> = {};

		vars["--sf-body-size"] = s.bodyTextOverrideSize ? `${s.bodyTextSize}em` : null;
		vars["--sf-body-color"] = s.bodyTextOverrideColor ? s.bodyTextColor : null;
		vars["--sf-body-bold-color"] = s.bodyTextOverrideEmphasisColor ? s.bodyTextBoldColor : null;
		vars["--sf-body-italic-color"] = s.bodyTextOverrideEmphasisColor ? s.bodyTextItalicColor : null;

		const bodyFont = this.resolveCustomFontVars(s.bodyTextOverrideFont, s.bodyTextFontFamily, s.bodyTextFontWeight);
		vars["--sf-body-weight"] = s.bodyTextOverrideFont && !bodyFont.font ? s.bodyTextFontWeight : null;
		vars["--sf-body-family"] = bodyFont.family;
		vars["--sf-body-variation"] = bodyFont.variation;

		const headingConfigs: {
			level: 1 | 2 | 3 | 4 | 5 | 6;
			overrideSize: boolean;
			size: number;
			overrideColor: boolean;
			color: string;
			overrideFont: boolean;
			fontWeight: FontWeight;
			fontFamily: CustomFontFamily;
			smallCaps: boolean;
			dividerAbove: boolean;
			dividerAboveThickness: HeadingDividerThickness;
			dividerBelow: boolean;
			dividerBelowThickness: HeadingDividerThickness;
		}[] = [
			{
				level: 1,
				overrideSize: s.heading1OverrideSize,
				size: s.heading1Size,
				overrideColor: s.heading1OverrideColor,
				color: s.heading1Color,
				overrideFont: s.heading1OverrideFont,
				fontWeight: s.heading1FontWeight,
				fontFamily: s.heading1FontFamily,
				smallCaps: s.heading1SmallCaps,
				dividerAbove: s.heading1DividerAbove,
				dividerAboveThickness: s.heading1DividerAboveThickness,
				dividerBelow: s.heading1DividerBelow,
				dividerBelowThickness: s.heading1DividerBelowThickness,
			},
			{
				level: 2,
				overrideSize: s.heading2OverrideSize,
				size: s.heading2Size,
				overrideColor: s.heading2OverrideColor,
				color: s.heading2Color,
				overrideFont: s.heading2OverrideFont,
				fontWeight: s.heading2FontWeight,
				fontFamily: s.heading2FontFamily,
				smallCaps: s.heading2SmallCaps,
				dividerAbove: s.heading2DividerAbove,
				dividerAboveThickness: s.heading2DividerAboveThickness,
				dividerBelow: s.heading2DividerBelow,
				dividerBelowThickness: s.heading2DividerBelowThickness,
			},
			{
				level: 3,
				overrideSize: s.heading3OverrideSize,
				size: s.heading3Size,
				overrideColor: s.heading3OverrideColor,
				color: s.heading3Color,
				overrideFont: s.heading3OverrideFont,
				fontWeight: s.heading3FontWeight,
				fontFamily: s.heading3FontFamily,
				smallCaps: s.heading3SmallCaps,
				dividerAbove: s.heading3DividerAbove,
				dividerAboveThickness: s.heading3DividerAboveThickness,
				dividerBelow: s.heading3DividerBelow,
				dividerBelowThickness: s.heading3DividerBelowThickness,
			},
			{
				level: 4,
				overrideSize: s.heading4OverrideSize,
				size: s.heading4Size,
				overrideColor: s.heading4OverrideColor,
				color: s.heading4Color,
				overrideFont: s.heading4OverrideFont,
				fontWeight: s.heading4FontWeight,
				fontFamily: s.heading4FontFamily,
				smallCaps: s.heading4SmallCaps,
				dividerAbove: s.heading4DividerAbove,
				dividerAboveThickness: s.heading4DividerAboveThickness,
				dividerBelow: s.heading4DividerBelow,
				dividerBelowThickness: s.heading4DividerBelowThickness,
			},
			{
				level: 5,
				overrideSize: s.heading5OverrideSize,
				size: s.heading5Size,
				overrideColor: s.heading5OverrideColor,
				color: s.heading5Color,
				overrideFont: s.heading5OverrideFont,
				fontWeight: s.heading5FontWeight,
				fontFamily: s.heading5FontFamily,
				smallCaps: s.heading5SmallCaps,
				dividerAbove: s.heading5DividerAbove,
				dividerAboveThickness: s.heading5DividerAboveThickness,
				dividerBelow: s.heading5DividerBelow,
				dividerBelowThickness: s.heading5DividerBelowThickness,
			},
			{
				level: 6,
				overrideSize: s.heading6OverrideSize,
				size: s.heading6Size,
				overrideColor: s.heading6OverrideColor,
				color: s.heading6Color,
				overrideFont: s.heading6OverrideFont,
				fontWeight: s.heading6FontWeight,
				fontFamily: s.heading6FontFamily,
				smallCaps: s.heading6SmallCaps,
				dividerAbove: s.heading6DividerAbove,
				dividerAboveThickness: s.heading6DividerAboveThickness,
				dividerBelow: s.heading6DividerBelow,
				dividerBelowThickness: s.heading6DividerBelowThickness,
			},
		];

		for (const h of headingConfigs) {
			const font = this.resolveCustomFontVars(h.overrideFont, h.fontFamily, h.fontWeight);
			Object.assign(
				vars,
				this.buildHeadingVars(
					h.level,
					h.overrideSize,
					h.size,
					h.overrideColor,
					h.color,
					h.overrideFont,
					h.fontWeight,
					Boolean(font.font),
					h.smallCaps,
					h.dividerAbove,
					h.dividerAboveThickness,
					h.dividerBelow,
					h.dividerBelowThickness,
				),
			);
			vars[`--sf-h${h.level}-family`] = font.family;
			vars[`--sf-h${h.level}-variation`] = font.variation;
		}

		this.applyStyleVarsToAllDocs(vars);
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
		await recomputeChapterRecommend(this.app, bookFolderName, chapterFilename, bookId, {
			codexFactSectionByType: this.pluginSettings.codexFactSectionByType,
			recommendIncludeUnknownNames: this.pluginSettings.recommendIncludeUnknownNames,
		});
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

	/**
	 * Creates missing storyForge / Tools / right-rail leaves and focuses storyForge on the
	 * left (Tools stays as a sibling tab, not the active one). Expands the right rail so Spacer,
	 * Story Context, and Archive are ready the same way the left panels are.
	 */
	private async ensureSidePanels(): Promise<void> {
		await this.ensureLeaf(STORYFORGE_VIEW_TYPE, "left", true);
		if (this.pluginSettings.useToolsPanel) {
			await this.ensureLeaf(TOOLS_VIEW_TYPE, "left", false);
		}
		await this.ensureRightRailPanels();
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

	/** Ensure Spacer → Story Context → Archive exist in that order on the right. */
	private async ensureRightRailPanels(): Promise<void> {
		const types = [SPACER_VIEW_TYPE, RECOMMEND_VIEW_TYPE, ARCHIVE_VIEW_TYPE];
		if (!this.isRightRailOrderCanonical()) {
			for (const type of types) this.app.workspace.detachLeavesOfType(type);
			for (let i = 0; i < types.length; i++) {
				await this.ensureLeaf(types[i], "right", types[i] === RECOMMEND_VIEW_TYPE);
			}
			return;
		}
		for (const type of types) {
			await this.ensureLeaf(type, "right", type === RECOMMEND_VIEW_TYPE);
		}
	}

	/** True when right-rail storyForge tabs appear in Spacer → Story Context → Archive order (missing tabs are OK). */
	private isRightRailOrderCanonical(): boolean {
		const expected = [SPACER_VIEW_TYPE, RECOMMEND_VIEW_TYPE, ARCHIVE_VIEW_TYPE];
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

	/** Ensure a leaf of `type` exists in the left or right sidebar. Does not reveal/focus. */
	private async ensureLeaf(
		type: string,
		side: "left" | "right",
		active: boolean,
	): Promise<WorkspaceLeaf | null> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(type)[0] ?? null;
		if (!leaf) {
			leaf = side === "left" ? workspace.getLeftLeaf(false) : workspace.getRightLeaf(false);
			await leaf?.setViewState({ type, active });
		}
		return leaf ?? null;
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
