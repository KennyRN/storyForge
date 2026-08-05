/**
 * Formatting host surface for formatForge (and future typography siblings).
 * Bundled into `StoryForgeHostApi.formatting` (API version >= 2).
 *
 * Persistence split:
 * - SF-linked keys (UI chrome, palette, editor sizes, guides, scrollbar, …) live in storyForge.
 * - Editor-only typography (colours, fonts, heading dividers, hide H1 links, …) lives in formatForge.
 *
 * When formatForge is registered, storyForge hides its formatting settings UI and defers to it.
 */

import type { PaletteColor, PaletteName } from "./colorPalettes";

/** Keys formatForge may read/write on storyForge (stored in SF `data.json`). */
export type SfLinkedFormattingKey =
	| "colorPaletteName"
	| "colorPaletteVariant"
	| "customPaletteColors"
	| "highlightActiveChapter"
	| "highlightColor"
	| "highlightTextColor"
	| "librarySeriesTitleFontSize"
	| "librarySeriesTitleOverrideFont"
	| "librarySeriesTitleFontFamily"
	| "librarySeriesTitleFontWeight"
	| "librarySeriesTitleColor"
	| "librarySeriesTitleSmallCaps"
	| "libraryBookTitleFontSize"
	| "libraryBookTitleOverrideFont"
	| "libraryBookTitleFontFamily"
	| "libraryBookTitleFontWeight"
	| "libraryBookTitleColor"
	| "libraryBookTitleSmallCaps"
	| "libraryBookSubtitleFontSize"
	| "libraryBookSubtitleOverrideFont"
	| "libraryBookSubtitleFontFamily"
	| "libraryBookSubtitleFontWeight"
	| "libraryBookSubtitleSmallCaps"
	| "libraryHeaderDividerBelow"
	| "libraryItemsFontSize"
	| "libraryItemsOverrideFont"
	| "libraryItemsFontFamily"
	| "libraryItemsFontWeight"
	| "libraryItemsColor"
	| "libraryItemsMuted"
	| "unplacedHighlightColor"
	| "unplacedHighlightTextColor"
	| "codexHighlightColor"
	| "codexHighlightTextColor"
	| "unplacedMuted"
	| "unplacedSmallCaps"
	| "unplacedColor"
	| "unplacedFontSize"
	| "unplacedOverrideFont"
	| "unplacedFontFamily"
	| "unplacedFontWeight"
	| "unplacedItemsFontSize"
	| "unplacedItemsOverrideFont"
	| "unplacedItemsFontFamily"
	| "unplacedItemsFontWeight"
	| "unplacedItemsColor"
	| "unplacedItemsMuted"
	| "unplacedUseHeaderColorForAll"
	| "codexMuted"
	| "codexSmallCaps"
	| "codexColor"
	| "codexFontSize"
	| "codexOverrideFont"
	| "codexFontFamily"
	| "codexFontWeight"
	| "codexFolderFontSize"
	| "codexFolderOverrideFont"
	| "codexFolderFontFamily"
	| "codexFolderFontWeight"
	| "codexFolderColor"
	| "codexFolderIndicatorThickness"
	| "codexNoteLabelFontSize"
	| "codexNoteLabelOverrideFont"
	| "codexNoteLabelFontFamily"
	| "codexNoteLabelFontWeight"
	| "codexNoteLabelColor"
	| "codexNoteLabelUseDefaultColor"
	| "codexNoteLabelUseFolderColor"
	| "codexUseHeaderColorForAll"
	| "hideSeriesPane"
	| "bodyTextOverrideSize"
	| "bodyTextSize"
	| "heading1OverrideSize"
	| "heading1Size"
	| "heading2OverrideSize"
	| "heading2Size"
	| "heading3OverrideSize"
	| "heading3Size"
	| "heading4OverrideSize"
	| "heading4Size"
	| "heading5OverrideSize"
	| "heading5Size"
	| "heading6OverrideSize"
	| "heading6Size"
	| "cyclingGuideEnabled"
	| "cyclingGuideThickness"
	| "cyclingGuideColor"
	| "cyclingGuideFlagSize"
	| "cyclingGuideRoundedLines"
	| "cyclingGuideInterval"
	| "editorScrollbarThumbColor"
	| "editorScrollbarTrackColor"
	| "editorScrollbarThickness"
	| "forgeCompanionIconColor"
	| "recommendHeaderFontSize"
	| "recommendHeaderOverrideFont"
	| "recommendHeaderFontFamily"
	| "recommendHeaderFontWeight"
	| "recommendHeaderColor"
	| "recommendHeaderMuted"
	| "recommendHeaderSmallCaps"
	| "recommendTabsFontSize"
	| "recommendTabsOverrideFont"
	| "recommendTabsFontFamily"
	| "recommendTabsFontWeight"
	| "recommendTabsColor"
	| "recommendTabsActiveColor"
	| "recommendChapterTitleFontSize"
	| "recommendChapterTitleOverrideFont"
	| "recommendChapterTitleFontFamily"
	| "recommendChapterTitleFontWeight"
	| "recommendChapterTitleColor"
	| "recommendChapterTitleMuted"
	| "recommendChapterTitleSmallCaps"
	| "recommendDossierHeaderFontSize"
	| "recommendDossierHeaderOverrideFont"
	| "recommendDossierHeaderFontFamily"
	| "recommendDossierHeaderFontWeight"
	| "recommendDossierHeaderColor"
	| "recommendDossierHeaderMuted"
	| "recommendDossierHeaderSmallCaps"
	| "recommendNovelTitleFontSize"
	| "recommendNovelTitleOverrideFont"
	| "recommendNovelTitleFontFamily"
	| "recommendNovelTitleFontWeight"
	| "recommendNovelTitleColor"
	| "recommendNovelTitleMuted"
	| "recommendNovelTitleSmallCaps"
	| "recommendNovelSubtitleFontSize"
	| "recommendNovelSubtitleOverrideFont"
	| "recommendNovelSubtitleFontFamily"
	| "recommendNovelSubtitleFontWeight"
	| "recommendNovelSubtitleColor"
	| "recommendNovelSubtitleMuted"
	| "recommendNovelSubtitleSmallCaps"
	| "recommendPlotChapterFontSize"
	| "recommendPlotChapterOverrideFont"
	| "recommendPlotChapterFontFamily"
	| "recommendPlotChapterFontWeight"
	| "recommendPlotChapterColor"
	| "recommendPlotChapterMuted"
	| "recommendPlotChapterSmallCaps"
	| "recommendSectionTitleFontSize"
	| "recommendSectionTitleOverrideFont"
	| "recommendSectionTitleFontFamily"
	| "recommendSectionTitleFontWeight"
	| "recommendSectionTitleColor"
	| "recommendSectionTitleMuted"
	| "recommendSectionTitleSmallCaps"
	| "recommendItemsFontSize"
	| "recommendItemsOverrideFont"
	| "recommendItemsFontFamily"
	| "recommendItemsFontWeight"
	| "recommendItemsColor"
	| "recommendItemsMuted"
	| "recommendDetailsFontSize"
	| "recommendDetailsOverrideFont"
	| "recommendDetailsFontFamily"
	| "recommendDetailsFontWeight"
	| "recommendDetailsColor"
	| "recommendDetailsMuted"
	| "recommendMetaLabelFontSize"
	| "recommendMetaLabelOverrideFont"
	| "recommendMetaLabelFontFamily"
	| "recommendMetaLabelFontWeight"
	| "recommendMetaLabelColor"
	| "recommendMetaLabelMuted"
	| "recommendMetaLabelSmallCaps"
	| "recommendMetaControlFontSize"
	| "recommendMetaControlOverrideFont"
	| "recommendMetaControlFontFamily"
	| "recommendMetaControlFontWeight"
	| "recommendMetaControlColor"
	| "recommendMetaControlMuted"
	| "recommendSynopsisFontSize"
	| "recommendSynopsisOverrideFont"
	| "recommendSynopsisFontFamily"
	| "recommendSynopsisFontWeight"
	| "recommendSynopsisColor"
	| "recommendHighlightColor"
	| "recommendHighlightTextColor"
	| "recommendUseHeaderColorForAll"
	| "archiveHeaderFontSize"
	| "archiveHeaderOverrideFont"
	| "archiveHeaderFontFamily"
	| "archiveHeaderFontWeight"
	| "archiveHeaderColor"
	| "archiveHeaderMuted"
	| "archiveHeaderSmallCaps"
	| "archiveItemsFontSize"
	| "archiveItemsOverrideFont"
	| "archiveItemsFontFamily"
	| "archiveItemsFontWeight"
	| "archiveItemsColor"
	| "archiveItemsMuted"
	| "archiveHighlightColor"
	| "archiveHighlightTextColor"
	| "archiveUseHeaderColorForAll";

export type FontResolveResult = {
	family: string;
	variation: string | null;
};

/**
 * formatForge registers once on load. storyForge uses this to hide local formatting UI,
 * resolve font CSS vars, register faces into pop-out windows, and notify on restyle.
 */
export interface FormatCompanionRegistration {
	pluginId: string;
	version: number;
	/** Open formatForge's settings / main formatting UI. */
	openSettings?: () => void;
	/** After storyForge reapplies linked styles (so companion can refresh editor/font vars). */
	onHostStylesApplied?: () => void;
	/** Resolve a font id + weight into CSS font-family / font-variation-settings values. */
	resolveFont?: (familyId: string, weight: number) => FontResolveResult | null;
	/** Register embedded @font-face / FontFace entries into `doc` (idempotent). */
	registerFacesForDocument?: (doc: Document) => void;
}

export interface StoryForgeFormattingApi {
	/** Same as host `version` when formatting is available (2+). */
	version: number;
	/** True while a format companion is registered. */
	isCompanionActive(): boolean;
	getCompanion(): FormatCompanionRegistration | null;
	/**
	 * Register formatForge (or a future typography sibling). Returns an unregister function.
	 * Only one companion is active; a new registration replaces the previous.
	 */
	registerCompanion(reg: FormatCompanionRegistration): () => void;
	/** Snapshot of SF-persisted formatting-related settings. */
	getLinkedSettings(): Record<SfLinkedFormattingKey, unknown>;
	getLinkedSetting<K extends SfLinkedFormattingKey>(key: K): unknown;
	updateLinkedSetting(key: SfLinkedFormattingKey, value: unknown): Promise<void>;
	/** Re-apply storyForge chrome + size CSS vars (not companion-owned editor typography). */
	applyLinkedStyles(): void;
	/** Apply CSS custom properties on the main doc and every open pop-out. */
	setStyleVars(vars: Record<string, string | null>): void;
	/** Documents that need FontFace registration (main + pop-outs). */
	getStyleDocuments(): Document[];
	getPalette(): {
		name: PaletteName;
		variant: string;
		customColors: PaletteColor[];
	};
	updatePalette( partial: {
		name?: PaletteName;
		variant?: string;
		customColors?: PaletteColor[];
	}): Promise<void>;
	/**
	 * Contribute UI into a storyForge view slot. `render` mounts into the provided
	 * container and must return a disposer. Known slots: `"spacer"` (blank right-rail
	 * tab bottom dock), `"storyforge-panel"` (left panel; reserved).
	 * Prefer the top-level `api.registerViewContribution` for new callers.
	 */
	registerViewContribution(opt: {
		/** Stable slot id (e.g. `"spacer"`, `"storyforge-panel"`). */
		slot: string;
		orderHint?: number;
		render: (containerEl: HTMLElement) => () => void;
	}): () => void;
}
