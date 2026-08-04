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
	StoryForgePluginSettings,
} from "./main";

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

/** Injected last into document.head so it wins over theme CSS (plugins load before themes). */
const RIGHT_RAIL_CHROME_STYLE_ID = "sf-right-rail-chrome";

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
		this.applyRightRailChrome();
	}

	/** Public entry for host-API style-var writes across all style documents. */
	applyStyleVars(vars: Record<string, string | null>): void {
		this.applyStyleVarsToAllDocs(vars);
	}

	/**
	 * Removes every `--sf-*` property from each style document and the styling-owned body classes
	 * this controller sets. Does not remove `sf-tools-open` or `sf-spacer-active`.
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
			);
			doc.getElementById(RIGHT_RAIL_CHROME_STYLE_ID)?.remove();
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

		for (const doc of this.host.getStyleDocuments()) this.tagVaultHelpButton(doc);

		// The ribbon-relocation rules (ribbon-width var, ribbon hide/show, tab-header padding) are
		// static in styles.css, scoped entirely by this class - no custom properties needed.
		if (s.useToolsPanel) {
			document.body.classList.add("sf-use-tools-panel");
		} else {
			document.body.classList.remove("sf-use-tools-panel");
		}
	}

	applyHeaderStyles(): void {
		const s = this.host.getSettings();
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

	applyHighlightStyle(): void {
		const s = this.host.getSettings();
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

	/** Manuscript editor scrollbar thumb/track colours and width. */
	applyEditorScrollbarStyles(): void {
		const s = this.host.getSettings();
		const width = EDITOR_SCROLLBAR_WIDTH_PX[s.editorScrollbarThickness];
		this.applyStyleVarsToAllDocs({
			"--sf-editor-scrollbar-width": `${width}px`,
			"--sf-editor-scrollbar-thumb": s.editorScrollbarThumbColor,
			"--sf-editor-scrollbar-track": s.editorScrollbarTrackColor,
		});
		for (const doc of this.host.getStyleDocuments()) {
			this.applyEditorScrollbarBodyClass(doc.body, s.editorScrollbarThickness);
		}
	}

	/**
	 * Force the right sidedock to match the left sidedock’s painted background.
	 *
	 * Plugin `styles.css` loads before community themes, so stylesheet rules alone lose to
	 * Minimal (right rail tracks --background-primary / editor colour). Injecting a <style>
	 * at the end of <head> after layout, using the left leaf’s computed colour, wins the cascade.
	 */
	applyRightRailChrome(): void {
		for (const doc of this.host.getStyleDocuments()) {
			const left =
				doc.querySelector<HTMLElement>(".mod-left-split .workspace-leaf-content") ??
				doc.querySelector<HTMLElement>(".mod-left-split");
			let bg = "var(--background-secondary)";
			const win = doc.defaultView;
			if (left && win) {
				const painted = win.getComputedStyle(left).backgroundColor;
				if (painted && painted !== "rgba(0, 0, 0, 0)" && painted !== "transparent") {
					bg = painted;
				}
			}

			let styleEl = doc.getElementById(RIGHT_RAIL_CHROME_STYLE_ID) as HTMLStyleElement | null;
			if (!styleEl) {
				styleEl = doc.head.createEl("style");
				styleEl.id = RIGHT_RAIL_CHROME_STYLE_ID;
			}
			styleEl.textContent = `
.mod-right-split {
	--background-primary: var(--background-secondary) !important;
	--background-primary-alt: var(--background-secondary-alt, var(--background-secondary)) !important;
	--tab-container-background: ${bg} !important;
	background-color: ${bg} !important;
}
.mod-right-split .view-content,
.mod-right-split .workspace-leaf-content,
.mod-right-split .workspace-leaf,
.mod-right-split .workspace-tabs,
.mod-right-split .workspace-tab-header-container,
.mod-right-split .workspace-tab-header-container-inner,
.mod-right-split .workspace-tabs.mod-top,
.mod-right-split .view-header,
.workspace-tabs.mod-top-right-space .workspace-tab-header-container {
	--tab-container-background: ${bg} !important;
	background-color: ${bg} !important;
}
.mod-right-split .workspace-tab-header {
	background-color: transparent !important;
}
`.trim();
			// Re-append so this sheet is last among siblings and beats theme stylesheets.
			doc.head.appendChild(styleEl);
		}
	}

	applyLibraryHeaderStyles(): void {
		const s = this.host.getSettings();
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
		const s = this.host.getSettings();
		const indicatorWidth = CODEX_FOLDER_INDICATOR_WIDTH_PX[s.codexFolderIndicatorThickness];
		const folderColor = this.resolveCodexFolderColor();
		const vars: Record<string, string | null> = {
			"--sf-codex-folder-color": folderColor,
			"--sf-codex-folder-size": `${s.codexFolderFontSize}em`,
			"--sf-codex-folder-indicator-width": `${indicatorWidth}px`,
		};
		this.assignUiFontVars(vars, "--sf-codex-folder", s.codexFolderOverrideFont, s.codexFolderFontFamily, s.codexFolderFontWeight);
		this.applyStyleVarsToAllDocs(vars);
		for (const doc of this.host.getStyleDocuments()) {
			this.applyCodexIndentBodyClass(doc.body, s.codexFolderIndicatorThickness);
		}
	}

	applyCodexNoteLabelStyle(): void {
		const s = this.host.getSettings();
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

	/**
	 * Editor body/heading *sizes* only. Colour, font, small-caps, and dividers are owned by
	 * formatForge when present (applied via `formatting.setStyleVars`).
	 */
	applyTextStyleOverrides(): void {
		const s = this.host.getSettings();
		const vars: Record<string, string | null> = {
			"--sf-body-size": s.bodyTextOverrideSize ? `${s.bodyTextSize}em` : null,
			"--sf-h1-size": s.heading1OverrideSize ? `${s.heading1Size}em` : null,
			"--sf-h2-size": s.heading2OverrideSize ? `${s.heading2Size}em` : null,
			"--sf-h3-size": s.heading3OverrideSize ? `${s.heading3Size}em` : null,
			"--sf-h4-size": s.heading4OverrideSize ? `${s.heading4Size}em` : null,
			"--sf-h5-size": s.heading5OverrideSize ? `${s.heading5Size}em` : null,
			"--sf-h6-size": s.heading6OverrideSize ? `${s.heading6Size}em` : null,
		};
		this.applyStyleVarsToAllDocs(vars);
	}

	/** Sets (or, for a `null` value, clears) each named CSS custom property on `doc.body`. */
	private setStyleVars(doc: Document, vars: Record<string, string | null>): void {
		for (const [name, value] of Object.entries(vars)) {
			if (value === null) doc.body.style.removeProperty(name);
			else doc.body.style.setProperty(name, value);
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

	/** Resolves the codex folder colour, respecting `codexUseHeaderColorForAll`'s override of the folder colour picker. */
	private resolveCodexFolderColor(): string {
		const s = this.host.getSettings();
		return s.codexUseHeaderColorForAll ? (s.codexMuted ? "var(--text-muted)" : s.codexColor) : s.codexFolderColor;
	}

	private applyEditorScrollbarBodyClass(body: HTMLElement, thickness: EditorScrollbarThickness): void {
		body.classList.add("sf-editor-scrollbar");
		body.classList.remove("sf-sb-thin", "sf-sb-medium", "sf-sb-thick");
		body.classList.add(`sf-sb-${thickness}`);
	}

	/** When the folder indicator is off, selected Codex files use a flat highlight (no truncate-to-guide). */
	private applyCodexIndentBodyClass(body: HTMLElement, thickness: CodexFolderIndicatorThickness): void {
		body.classList.toggle("sf-codex-indent-none", thickness === "none");
	}

	/**
	 * Writes `--{prefix}-family` / `-variation` / `-weight` for storyForge panel chrome.
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
