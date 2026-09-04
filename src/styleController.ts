/**
 * CSS-variable / body-class styling layer for storyForge.
 * Owned by the plugin as a thin delegating facade; unit-testable via StyleHost.
 */

import type { FormatCompanionRegistration } from "./formattingApi";
import type {
	CodexFolderIndicatorThickness,
	CustomFontFamily,
	EditorScrollbarThickness,
	FontWeight,
	HeadingDividerThickness,
	RecommendSectionChrome,
	StoryForgePluginSettings,
} from "./main";
import { resolveTitleShadow } from "./titleShadow";

export interface StyleHost {
	getSettings(): StoryForgePluginSettings;
	getStyleDocuments(): Document[];
	/** Needed so UI font overrides can resolve through the format companion. */
	getFormatCompanion(): FormatCompanionRegistration | null;
}

const CODEX_FOLDER_INDICATOR_WIDTH_PX: Record<CodexFolderIndicatorThickness, number> = {
	none: 0,
	thin: 1,
	medium: 2,
	thick: 4,
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

export class StyleController {
	constructor(private readonly host: StyleHost) {}

	/** Runs the linked-formatting apply sequence in the current `applyLinkedFormattingStyles` order. */
	applyAllLinked(): void {
		this.applyVisibilityStyles();
		this.applyHeaderStyles();
		this.applyHighlightStyle();
		this.applyLibraryHeaderStyles();
		this.applyCodexFolderStyle();
		this.applyCodexNoteLabelStyle();
		this.applyTextStyleOverrides();
		this.applyCyclingGuideStyle();
		this.applyEditorScrollbarStyles();
		this.applyRightRailPanelStyles();
		this.applyRightRailChrome();
	}

	/** Public entry for host-API style-var writes across all style documents. */
	applyStyleVars(vars: Record<string, string | null>): void {
		this.applyStyleVarsToAllDocs(vars);
	}

	/**
	 * Removes every `--sf-*` property from each style document and the styling-owned body classes
	 * this controller sets. Does not remove `sf-tools-open`.
	 */
	clearAll(): void {
		for (const doc of this.host.getStyleDocuments()) {
			const names: string[] = [];
			for (let i = 0; i < doc.body.style.length; i++) {
				const name = doc.body.style.item(i);
				if (name.startsWith("--sf-")) names.push(name);
			}
			for (const name of names) doc.body.style.removeProperty(name);
			doc.body.classList.remove(
				"sf-editor-scrollbar",
				"sf-sb-thin",
				"sf-sb-medium",
				"sf-sb-thick",
				"sf-use-tools-panel",
				"sf-section-chrome-box",
				"sf-section-chrome-pill",
				"sf-section-chrome-text",
			);
		}
	}

	applyVisibilityStyles(): void {
		const s = this.host.getSettings();
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
			"--sf-settings-icon-display": s.hideObsidianSettingsIcon ? "none" : null,
			"--sf-tools-panel-icon-display": s.hideToolsPanelIcon ? "none" : null,
			"--sf-backlinks-display": s.hideBacklinks ? "none" : null,
			"--sf-outgoing-links-display": s.hideOutgoingLinks ? "none" : null,
			"--sf-tags-display": s.hideTags ? "none" : null,
			"--sf-outline-display": s.hideOutline ? "none" : null,
			"--sf-all-properties-display": s.hideAllProperties ? "none" : null,
			"--sf-sidebar-left-display": s.hideLeftPanel ? "none" : null,
			"--sf-sidebar-right-display": s.hideRightPanel ? "none" : null,
			"--sf-filename-bar-display": s.hideFileNameBar ? "none" : null,
			"--sf-nav-row-display": s.hideNavRow ? "none" : null,
			"--sf-editor-tabs-display": s.hideEditorTabs ? "none" : null,
			"--sf-statusbar-hidden-display": s.statusBarView === "hidden" ? "none" : null,
			"--sf-statusbar-nonsync-display": s.statusBarView === "sync-only" ? "none" : null,
		});

		for (const doc of this.host.getStyleDocuments()) {
			this.tagVaultHelpButton(doc);
			this.tagObsidianSettingsButton(doc);
		}

		// The ribbon-relocation rules (ribbon-width var, ribbon hide/show, tab-header padding) are
		// static in styles.css, scoped entirely by this class - no custom properties needed.
		// Applied per style document so pop-out windows match the main window (clearAll also
		// removes it from every document).
		for (const doc of this.host.getStyleDocuments()) {
			doc.body.classList.toggle("sf-use-tools-panel", s.useToolsPanel);
		}
	}

	applyHeaderStyles(): void {
		const s = this.host.getSettings();
		const unplacedColor = this.resolveUnplacedColour();
		const codexColor = this.resolveCodexHeaderColorForAll();
		const vars: Record<string, string | null> = {
			"--sf-unplaced-color": unplacedColor,
			"--sf-unplaced-variant": s.unplacedSmallCaps ? "small-caps" : "normal",
			"--sf-unplaced-size": `${s.unplacedFontSize}em`,
			"--sf-unplaced-items-size": `${s.unplacedItemsFontSize}em`,
			"--sf-unplaced-items-color": unplacedColor,
			"--sf-codex-color": codexColor,
			"--sf-codex-variant": s.codexSmallCaps ? "small-caps" : "normal",
			"--sf-codex-size": `${s.codexFontSize}em`,
		};
		this.assignUiFontVars(vars, "--sf-unplaced", s.unplacedOverrideFont, s.unplacedFontFamily, s.unplacedFontWeight);
		this.assignUiFontVars(vars, "--sf-unplaced-items", s.unplacedItemsOverrideFont, s.unplacedItemsFontFamily, s.unplacedItemsFontWeight);
		this.assignUiFontVars(vars, "--sf-codex", s.codexOverrideFont, s.codexFontFamily, s.codexFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	applyHighlightStyle(): void {
		const s = this.host.getSettings();
		const libraryColour = this.resolveLibraryColour();
		const unplacedColour = this.resolveUnplacedColour();
		const codexColour = this.resolveCodexHeaderColorForAll();
		// Highlight *text* is the one colour that stays independent of the panel's single colour
		// (background uses that colour; putting the same value on the text would make the selected
		// row unreadable).
		this.applyStyleVarsToAllDocs({
			"--sf-highlight-bg": libraryColour,
			"--sf-highlight-text": s.highlightTextColor,
			"--sf-unplaced-highlight-bg": unplacedColour,
			"--sf-unplaced-highlight-text": s.unplacedHighlightTextColor,
			"--sf-codex-highlight-bg": codexColour,
			"--sf-codex-highlight-text": s.codexHighlightTextColor,
			"--sf-storytelling-highlight-bg": this.resolveStorytellingItemsColour(),
			"--sf-storytelling-highlight-text": s.storytellingLinkItemsColorToLibrary
				? s.highlightTextColor
				: s.storytellingHighlightTextColor,
		});
	}

	/**
	 * storyTelling panel's own chapter-item styling. Colour respects
	 * `storytellingLinkItemsColorToLibrary` — when that palette option is selected, mirrors the
	 * storyLibrary panel's chapter colour (its own Muted toggle included) instead of storyTelling's
	 * own colour picker.
	 */
	applyStorytellingItemsStyle(): void {
		const s = this.host.getSettings();
		const vars: Record<string, string | null> = {
			"--sf-storytelling-items-size": `${s.storytellingItemsFontSize}em`,
			"--sf-storytelling-items-color": this.resolveStorytellingItemsColour(),
		};
		this.assignUiFontVars(vars, "--sf-storytelling-items", s.storytellingItemsOverrideFont, s.storytellingItemsFontFamily, s.storytellingItemsFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	/** Restyles the "Cycling guide" floating divider (thickness/colour only - the CM6 extension itself is toggled by `setCyclingGuideEnabled`). */
	applyCyclingGuideStyle(): void {
		const s = this.host.getSettings();
		const px = HEADING_DIVIDER_WIDTH_PX[s.cyclingGuideThickness];
		const flagSizeEm = s.cyclingGuideFlagSize === "large" ? 1 : s.cyclingGuideFlagSize === "small" ? 0.6 : 0.75;
		const baseBadgePx = 18;
		const baseFlagEm = 0.75;
		const basePad = 3;
		const pad = basePad * 0.9; // equal L/R/B margin, reduced 10% from base
		const baseIconPx = baseBadgePx - 2 * basePad; // 12
		const iconPx = (baseIconPx * flagSizeEm) / baseFlagEm;
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

	/** Manuscript editor scrollbar thumb colour and width. The track stays transparent so the document background shows through. */
	applyEditorScrollbarStyles(): void {
		const s = this.host.getSettings();
		const width = EDITOR_SCROLLBAR_WIDTH_PX[s.editorScrollbarThickness];
		// "Theme default" hands the thumb back to the same var Obsidian's own native scrollbars
		// (sidebar, etc.) already use, rather than the plugin's own fixed custom colour.
		const thumbColor = s.editorScrollbarUseThemeColor ? "var(--scrollbar-thumb-bg)" : s.editorScrollbarThumbColor;
		this.applyStyleVarsToAllDocs({
			"--sf-editor-scrollbar-width": `${width}px`,
			"--sf-editor-scrollbar-thumb": thumbColor,
			"--sf-editor-scrollbar-track": null,
		});
		for (const doc of this.host.getStyleDocuments()) {
			this.applyEditorScrollbarBodyClass(doc.body, s.editorScrollbarThickness);
		}
	}

	/**
	 * Align right-rail chrome with the left sidedock’s painted background, and snapshot the
	 * manuscript editor’s `--background-primary` as a concrete colour.
	 *
	 * `--sf-editor-bg` must be an already-resolved colour (rgb/hex), not `var(--background-primary)`:
	 * `.mod-right-split` remaps that token to the sidebar, and an inherited `var()` would re-resolve
	 * there. Notebook’s grafted editor reads `--sf-editor-bg` so it matches the centre pane.
	 *
	 * `--sf-right-rail-bg` is set on each style document’s body (consumed by styles.css).
	 * Prefer the left leaf’s computed colour when available so themes like Minimal match;
	 * otherwise fall back to `--background-secondary`.
	 */
	applyRightRailChrome(): void {
		for (const doc of this.host.getStyleDocuments()) {
			const win = doc.defaultView;
			const left =
				doc.querySelector<HTMLElement>(".mod-left-split .workspace-leaf-content") ??
				doc.querySelector<HTMLElement>(".mod-left-split");
			let railBg = "var(--background-secondary)";
			if (left && win) {
				const painted = win.getComputedStyle(left).backgroundColor;
				if (painted && painted !== "rgba(0, 0, 0, 0)" && painted !== "transparent") {
					railBg = painted;
				}
			}
			doc.body.setCssProps({
				"--sf-right-rail-bg": railBg,
				"--sf-editor-bg": paintedThemePrimary(doc),
			});
		}
	}

	/** Forge companion icons + Story Context / Archive panel chrome. */
	applyRightRailPanelStyles(): void {
		const s = this.host.getSettings();

		const recommendItemsColor = s.recommendItemsMuted ? "var(--text-muted)" : s.recommendItemsColor;
		const recommendChapterColor = s.recommendChapterTitleMuted ? "var(--text-muted)" : s.recommendChapterTitleColor;
		const recommendDossierHeaderColor = s.recommendDossierHeaderMuted
			? "var(--text-muted)"
			: s.recommendDossierHeaderColor;
		const recommendNovelTitleColor = s.recommendNovelTitleMuted ? "var(--text-muted)" : s.recommendNovelTitleColor;
		const recommendNovelSubtitleColor = s.recommendNovelSubtitleMuted
			? "var(--text-muted)"
			: s.recommendNovelSubtitleColor;
		const recommendSectionColor = s.recommendSectionTitleMuted ? "var(--text-muted)" : s.recommendSectionTitleColor;
		const recommendUnknownColor = s.recommendUnknownMuted
			? "var(--text-muted)"
			: s.recommendUnknownColor;
		const recommendUnknownHeaderColor = s.recommendUnknownHeaderMuted
			? "var(--text-muted)"
			: s.recommendUnknownHeaderColor;
		const recommendMetaLabelColor = s.recommendMetaLabelMuted ? "var(--text-muted)" : s.recommendMetaLabelColor;
		const recommendMetaControlColor = s.recommendMetaControlMuted
			? "var(--text-muted)"
			: s.recommendMetaControlColor;
		const recommendSynopsisColor = s.recommendSynopsisColor;
		const recommendTabsColor = s.recommendTabsMuted
			? "var(--text-muted)"
			: s.recommendTabsColor;
		const recommendTabsActiveColor = s.recommendTabsActiveColor;
		const recommendFocusModeIconColor = s.recommendFocusModeIconColor;
		const recommendHighlightBg = s.recommendHighlightColor;

		const archiveHeaderColor = s.archiveHeaderMuted ? "var(--text-muted)" : s.archiveHeaderColor;
		const archiveItemsColor = archiveHeaderColor;
		const archiveHighlightBg = archiveHeaderColor;

		const vars: Record<string, string | null> = {
			"--sf-forge-companion-color": recommendTabsColor,
			"--sf-recommend-tabs-size": `${s.recommendTabsFontSize}em`,
			"--sf-recommend-tabs-color": recommendTabsColor,
			"--sf-recommend-tabs-active-color": recommendTabsActiveColor,
			"--sf-recommend-focus-mode-icon-color": recommendFocusModeIconColor,
			"--sf-recommend-chapter-size": `${s.recommendChapterTitleFontSize}em`,
			"--sf-recommend-chapter-color": recommendChapterColor,
			"--sf-recommend-chapter-variant": s.recommendChapterTitleSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-dossier-size": `${s.recommendDossierHeaderFontSize}em`,
			"--sf-recommend-dossier-color": recommendDossierHeaderColor,
			"--sf-recommend-dossier-variant": s.recommendDossierHeaderSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-novel-title-size": `${s.recommendNovelTitleFontSize}em`,
			"--sf-recommend-novel-title-color": recommendNovelTitleColor,
			"--sf-recommend-novel-title-variant": s.recommendNovelTitleSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-novel-subtitle-size": `${s.recommendNovelSubtitleFontSize}em`,
			"--sf-recommend-novel-subtitle-color": recommendNovelSubtitleColor,
			"--sf-recommend-novel-subtitle-variant": s.recommendNovelSubtitleSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-plot-chapter-size": `${s.recommendChapterTitleFontSize}em`,
			"--sf-recommend-plot-chapter-color": recommendChapterColor,
			"--sf-recommend-plot-chapter-variant": s.recommendChapterTitleSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-section-size": `${s.recommendSectionTitleFontSize}em`,
			"--sf-recommend-section-color": recommendSectionColor,
			"--sf-recommend-section-variant": s.recommendSectionTitleSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-items-color": recommendItemsColor,
			"--sf-recommend-items-size": `${s.recommendItemsFontSize}em`,
			"--sf-recommend-details-size": `${s.recommendItemsFontSize}em`,
			"--sf-recommend-details-color": recommendItemsColor,
			"--sf-recommend-unknown-color": recommendUnknownColor,
			"--sf-recommend-unknown-header-color": recommendUnknownHeaderColor,
			"--sf-recommend-unknown-title-shadow": resolveTitleShadow(
				this.host.getStyleDocuments()[0] ?? document,
				recommendUnknownHeaderColor,
				recommendUnknownColor,
			),
			"--sf-recommend-meta-label-size": `${s.recommendMetaLabelFontSize}em`,
			"--sf-recommend-meta-label-color": recommendMetaLabelColor,
			"--sf-recommend-meta-label-variant": s.recommendMetaLabelSmallCaps ? "small-caps" : "normal",
			"--sf-recommend-meta-control-size": `${s.recommendMetaLabelFontSize}em`,
			"--sf-recommend-meta-control-color": recommendMetaControlColor,
			"--sf-recommend-synopsis-size": `${s.recommendSynopsisFontSize}em`,
			"--sf-recommend-synopsis-color": recommendSynopsisColor,
			"--sf-recommend-highlight-bg": recommendHighlightBg,
			"--sf-recommend-highlight-text": s.recommendHighlightTextColor,
			"--sf-archive-header-color": archiveHeaderColor,
			"--sf-archive-header-size": `${s.archiveHeaderFontSize}em`,
			"--sf-archive-header-variant": s.archiveHeaderSmallCaps ? "small-caps" : "normal",
			"--sf-archive-items-color": archiveItemsColor,
			"--sf-archive-items-size": `${s.archiveItemsFontSize}em`,
			"--sf-archive-highlight-bg": archiveHighlightBg,
			"--sf-archive-highlight-text": s.archiveHighlightTextColor,
		};
		this.assignUiFontVars(vars, "--sf-recommend-tabs", s.recommendTabsOverrideFont, s.recommendTabsFontFamily, s.recommendTabsFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-chapter", s.recommendChapterTitleOverrideFont, s.recommendChapterTitleFontFamily, s.recommendChapterTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-dossier", s.recommendDossierHeaderOverrideFont, s.recommendDossierHeaderFontFamily, s.recommendDossierHeaderFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-novel-title", s.recommendNovelTitleOverrideFont, s.recommendNovelTitleFontFamily, s.recommendNovelTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-novel-subtitle", s.recommendNovelSubtitleOverrideFont, s.recommendNovelSubtitleFontFamily, s.recommendNovelSubtitleFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-plot-chapter", s.recommendChapterTitleOverrideFont, s.recommendChapterTitleFontFamily, s.recommendChapterTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-section", s.recommendSectionTitleOverrideFont, s.recommendSectionTitleFontFamily, s.recommendSectionTitleFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-items", s.recommendItemsOverrideFont, s.recommendItemsFontFamily, s.recommendItemsFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-details", s.recommendItemsOverrideFont, s.recommendItemsFontFamily, s.recommendItemsFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-meta-label", s.recommendMetaLabelOverrideFont, s.recommendMetaLabelFontFamily, s.recommendMetaLabelFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-meta-control", s.recommendMetaControlOverrideFont, s.recommendMetaControlFontFamily, s.recommendMetaControlFontWeight);
		this.assignUiFontVars(vars, "--sf-recommend-synopsis", s.recommendSynopsisOverrideFont, s.recommendSynopsisFontFamily, s.recommendSynopsisFontWeight);
		this.assignUiFontVars(vars, "--sf-archive-header", s.archiveHeaderOverrideFont, s.archiveHeaderFontFamily, s.archiveHeaderFontWeight);
		this.assignUiFontVars(vars, "--sf-archive-items", s.archiveItemsOverrideFont, s.archiveItemsFontFamily, s.archiveItemsFontWeight);
		this.applyStyleVarsToAllDocs(vars);
		for (const doc of this.host.getStyleDocuments()) {
			this.applySectionChromeBodyClass(doc.body, s.recommendSectionChrome ?? "box");
		}
	}

	applyLibraryHeaderStyles(): void {
		const s = this.host.getSettings();
		const itemsColor = this.resolveLibraryColour();
		const vars: Record<string, string | null> = {
			"--sf-lib-series-size": `${s.librarySeriesTitleFontSize}em`,
			"--sf-lib-series-color": s.librarySeriesTitleColor,
			"--sf-lib-series-variant": s.librarySeriesTitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-book-size": `${s.libraryBookTitleFontSize}em`,
			"--sf-lib-book-color": itemsColor,
			"--sf-lib-book-variant": s.libraryBookTitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-subtitle-size": `${s.libraryBookSubtitleFontSize}em`,
			"--sf-lib-subtitle-variant": s.libraryBookSubtitleSmallCaps ? "small-caps" : "normal",
			"--sf-lib-header-divider": "1px solid var(--background-modifier-border)",
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
		const s = this.host.getSettings();
		const indicatorWidth = CODEX_FOLDER_INDICATOR_WIDTH_PX[s.codexFolderIndicatorThickness];
		const folderColor = this.resolveCodexFolderColor();
		const vars: Record<string, string | null> = {
			"--sf-codex-folder-color": folderColor,
			"--sf-codex-folder-size": `${s.codexNoteLabelFontSize}em`,
			"--sf-codex-folder-indicator-width": `${indicatorWidth}px`,
		};
		this.assignUiFontVars(vars, "--sf-codex-folder", s.codexNoteLabelOverrideFont, s.codexNoteLabelFontFamily, s.codexNoteLabelFontWeight);
		this.applyStyleVarsToAllDocs(vars);
		for (const doc of this.host.getStyleDocuments()) {
			this.applyCodexIndentBodyClass(doc.body, s.codexFolderIndicatorThickness);
		}
	}

	applyCodexNoteLabelStyle(): void {
		const s = this.host.getSettings();
		const vars: Record<string, string | null> = {
			"--sf-codex-note-color": this.resolveCodexHeaderColorForAll(),
			"--sf-codex-note-size": `${s.codexNoteLabelFontSize}em`,
		};
		this.assignUiFontVars(vars, "--sf-codex-note", s.codexNoteLabelOverrideFont, s.codexNoteLabelFontFamily, s.codexNoteLabelFontWeight);
		this.applyStyleVarsToAllDocs(vars);
	}

	/**
	 * Editor body/heading sizes, plus storyForge's own native colour overrides (built on its own
	 * colour palette, not formatForge's — see the settings' own doc comment on
	 * `bodyTextOverrideColor`). Font, small-caps, and dividers stay formatForge-only (applied via
	 * `formatting.setStyleVars`) since those need real font-face resolution this plugin doesn't
	 * carry on its own.
	 */
	applyTextStyleOverrides(): void {
		const s = this.host.getSettings();
		const vars: Record<string, string | null> = {
			"--sf-body-size": s.bodyTextOverrideSize ? `${s.bodyTextSize}em` : null,
			"--sf-body-color": s.bodyTextOverrideColor ? s.bodyTextColor : null,
			"--sf-h1-size": s.heading1OverrideSize ? `${s.heading1Size}em` : null,
			"--sf-h1-color": s.heading1OverrideColor ? s.heading1Color : null,
			"--sf-h2-size": s.heading2OverrideSize ? `${s.heading2Size}em` : null,
			"--sf-h2-color": s.heading2OverrideColor ? s.heading2Color : null,
			"--sf-h3-size": s.heading3OverrideSize ? `${s.heading3Size}em` : null,
			"--sf-h3-color": s.heading3OverrideColor ? s.heading3Color : null,
			"--sf-h4-size": s.heading4OverrideSize ? `${s.heading4Size}em` : null,
			"--sf-h4-color": s.heading4OverrideColor ? s.heading4Color : null,
			"--sf-h5-size": s.heading5OverrideSize ? `${s.heading5Size}em` : null,
			"--sf-h5-color": s.heading5OverrideColor ? s.heading5Color : null,
			"--sf-h6-size": s.heading6OverrideSize ? `${s.heading6Size}em` : null,
			"--sf-h6-color": s.heading6OverrideColor ? s.heading6Color : null,
			"--sf-quote-size": s.blockquoteOverrideSize ? `${s.blockquoteSize}em` : null,
			"--sf-quote-color": s.blockquoteOverrideColor ? s.blockquoteColor : null,
			"--sf-quote-bg": s.blockquoteOverrideBg ? s.blockquoteBgColor : null,
			"--sf-quote-border": s.blockquoteOverrideBorder ? s.blockquoteBorderColor : null,
			"--sf-body-link-color": s.bodyLinkOverrideColor ? s.bodyLinkColor : null,
			"--sf-body-link-color-hover": s.bodyLinkOverrideHoverColor ? s.bodyLinkHoverColor : null,
			"--sf-body-link-decoration": s.bodyLinkRemoveUnderline ? "none" : null,
			"--sf-ol-marker": s.orderedListOverrideColor ? s.orderedListColor : null,
			"--sf-ul-marker": s.unorderedListOverrideColor ? s.unorderedListColor : null,
		};
		this.applyStyleVarsToAllDocs(vars);
	}

	/** Sets (or, for a `null` value, clears) each named CSS custom property on `doc.body`. Obsidian's
	 * `setCssProps` has no removal counterpart, so clearing still goes through the raw `style`
	 * object — everything else routes through it instead of a direct assignment. */
	private setStyleVars(doc: Document, vars: Record<string, string | null>): void {
		for (const [name, value] of Object.entries(vars)) {
			if (value === null) doc.body.style.removeProperty(name);
			else doc.body.setCssProps({ [name]: value });
		}
	}

	/** Applies `vars` to every style document (main + open pop-outs). */
	private applyStyleVarsToAllDocs(vars: Record<string, string | null>): void {
		for (const doc of this.host.getStyleDocuments()) {
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

	/**
	 * Tags the vault-actions row's Settings button with `sf-vault-settings` so styles.css can
	 * target it without pinning down its exact structure in advance. Tries a direct `aria-label`
	 * match first (Search/Bookmarks/Files all carry their own `aria-label`, so this is the likely
	 * shape), falling back to matching by the inner icon the same way tagVaultHelpButton does for
	 * Help above, in case Settings turns out to lack its own `aria-label` too. Idempotent; no-ops
	 * if the drawer/button isn't in `doc` yet.
	 */
	private tagObsidianSettingsButton(doc: Document): void {
		const container = doc.body.querySelector(".workspace-drawer-vault-actions");
		if (!container) return;
		const button =
			container.querySelector<HTMLElement>('.clickable-icon[aria-label="Settings"]') ??
			container.querySelector<HTMLElement>(".clickable-icon:has(.lucide-settings)") ??
			container.querySelector<HTMLElement>(".clickable-icon:has(.gear)");
		button?.addClass("sf-vault-settings");
	}

	/** Library's single colour (book titles, items, highlight background), respecting muted. */
	private resolveLibraryColour(): string {
		const s = this.host.getSettings();
		return s.libraryItemsMuted ? "var(--text-muted)" : s.libraryItemsColor;
	}

	private resolveStorytellingItemsColour(): string {
		const s = this.host.getSettings();
		if (s.storytellingLinkItemsColorToLibrary) return this.resolveLibraryColour();
		return s.storytellingItemsMuted ? "var(--text-muted)" : s.storytellingItemsColor;
	}

	/** Unplaced's single colour (header, items, highlight background), respecting muted. */
	private resolveUnplacedColour(): string {
		const s = this.host.getSettings();
		return s.unplacedMuted ? "var(--text-muted)" : s.unplacedColor;
	}

	/** Codex folder colour — the same single Codex colour as header, notes, and highlight background. */
	private resolveCodexFolderColor(): string {
		return this.resolveCodexHeaderColorForAll();
	}

	/**
	 * Codex's single colour (header, folders, notes, highlight background), respecting muted.
	 * Highlight *text* stays independent so the selected row remains readable.
	 */
	private resolveCodexHeaderColorForAll(): string {
		const s = this.host.getSettings();
		return s.codexMuted ? "var(--text-muted)" : s.codexColor;
	}

	private applyEditorScrollbarBodyClass(body: HTMLElement, thickness: EditorScrollbarThickness): void {
		body.classList.add("sf-editor-scrollbar");
		body.classList.remove("sf-sb-thin", "sf-sb-medium", "sf-sb-thick");
		body.classList.add(`sf-sb-${thickness}`);
	}

	private applySectionChromeBodyClass(body: HTMLElement, chrome: RecommendSectionChrome): void {
		body.classList.remove("sf-section-chrome-box", "sf-section-chrome-pill", "sf-section-chrome-text");
		body.classList.add(`sf-section-chrome-${chrome}`);
	}

	/** When the folder indicator is off, selected Codex files use a flat highlight (no truncate-to-guide). */
	private applyCodexIndentBodyClass(body: HTMLElement, thickness: CodexFolderIndicatorThickness): void {
		body.classList.toggle("sf-codex-indent-none", thickness === "none");
	}

	/**
	 * Writes `--{prefix}-family` / `-variation` / `-weight` for storyLibrary panel chrome.
	 * Font faces come from formatForge via the registered companion; without it, overrides no-op.
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
		if (!overrideFont) {
			vars[`${prefix}-weight`] = null;
		} else if (resolved.resolved && resolved.variation != null) {
			vars[`${prefix}-weight`] = null;
		} else if (resolved.resolved) {
			vars[`${prefix}-weight`] = fontWeight;
		} else {
			vars[`${prefix}-weight`] = null;
		}
	}

	private resolveCustomFontVars(
		overrideFont: boolean,
		fontFamily: CustomFontFamily,
		fontWeight: FontWeight,
	): { family: string | null; variation: string | null; resolved: boolean } {
		if (!overrideFont) return { family: null, variation: null, resolved: false };
		const result = this.host.getFormatCompanion()?.resolveFont?.(fontFamily, Number(fontWeight));
		if (!result) return { family: null, variation: null, resolved: false };
		return { family: result.family, variation: result.variation, resolved: true };
	}
}

/** Resolve the theme's manuscript `--background-primary` on `body` (not inside `.mod-right-split`). */
function paintedThemePrimary(doc: Document): string {
	const win = doc.defaultView;
	if (!win) return "var(--background-primary)";
	const probe = doc.createElement("div");
	probe.style.position = "absolute";
	probe.style.left = "-9999px";
	probe.style.backgroundColor = "var(--background-primary)";
	doc.body.appendChild(probe);
	const painted = win.getComputedStyle(probe).backgroundColor;
	probe.remove();
	if (painted && painted !== "rgba(0, 0, 0, 0)" && painted !== "transparent") return painted;
	return "var(--background-primary)";
}
