/**
 * Formatting host surface for formatForge (and future typography siblings).
 * Bundled into `StoryForgeHostApi.formatting` (API version >= 2).
 *
 * Persistence split:
 * - SF-linked keys (UI chrome, palette, editor sizes, guides, scrollbar, …) live in storyForge.
 * - Editor-only typography (colours, fonts, heading dividers, hide H1 links, …) lives in formatForge.
 *
 * When formatForge is registered, storyForge hides editor/palette formatting UI and defers
 * to it. Interface chrome stays in storyForge's modal; formatForge adds font pickers there.
 */

import type { PaletteColor, PaletteName } from "./colorPalettes";

/** Keys formatForge may read/write on storyForge (stored in SF data.json). */
export type SfLinkedFormattingKey =
	(typeof import("./hostApi").LINKED_FORMATTING_KEYS)[number];

/** Linked-key snapshot: each key is typed from `StoryForgePluginSettings`. */
export type LinkedFormattingValues = {
	[K in SfLinkedFormattingKey]: import("./main").StoryForgePluginSettings[K];
};

export type FontResolveResult = {
	family: string;
	variation: string | null;
};

/** One entry in formatForge's font catalog, as exposed to a host via `listFonts`. */
export interface FontCatalogEntry {
	id: string;
	label: string;
	weightMin: number;
	weightMax: number;
}

export interface OpenFontPickerOptions {
	currentFamilyId: string;
	previewFontSizeEm: number;
	onPick: (familyId: string) => void;
	/**
	 * Present when the caller has an "override vs theme default" concept for this field — appends
	 * a "Theme default" row to formatForge's picker (current formatForge behaviour, replacing the
	 * older separate "Override theme's default font" toggle). `isThemeDefault` marks that row
	 * selected when the field isn't currently overriding; picking it calls `onPickThemeDefault`
	 * instead of `onPick`. Both optional so an older formatForge (which ignores unknown option
	 * fields) still opens a plain picker with no theme-default row.
	 */
	isThemeDefault?: boolean;
	onPickThemeDefault?: () => void;
}

/**
 * formatForge registers once on load. storyForge uses this to hide local formatting UI,
 * resolve font CSS vars, register faces into pop-out windows, and notify on restyle.
 *
 * `listFonts`/`openFontPicker` mirror the same two methods formatForge already exposes to
 * timelineForge (see formatForge's timelineForgeBridge.ts) — storyForge's own UI Formatting modal
 * uses them the same way: list font labels for a "Font" row, delegate the actual picker UI to
 * formatForge's own FontPickerModal via `openFontPicker` rather than duplicating a font catalog
 * or picker UI locally. Both are optional so storyForge's font cards simply don't render against
 * an older formatForge that predates them.
 */
export interface FormatCompanionRegistration {
	pluginId: string;
	version: number;
	/** Open formatForge's settings / main formatting UI (the Obsidian Settings window, scrolled to
	 * formatForge's tab). Prefer `openFormattingModal` below when a specific modal is wanted
	 * directly — this is the catch-all fallback for an older formatForge that doesn't register
	 * those. Interface chrome lives in storyForge's own modal (`StoryForgeFormattingApi.openInterfaceModal`). */
	openSettings?: () => void;
	/** Open formatForge's combined settings modal (Text styling + Formatting themes + Palette)
	 * directly, bypassing the Obsidian Settings window. */
	openFormattingModal?: () => void;
	/** Open formatForge's own Text styling modal directly, bypassing the Obsidian Settings window. */
	openTextStyleModal?: () => void;
	/** Open formatForge's own Formatting themes modal directly, bypassing the Obsidian Settings
	 * window. */
	openThemesModal?: () => void;
	/** After storyForge reapplies linked styles (so companion can refresh editor/font vars). */
	onHostStylesApplied?: () => void;
	/**
	 * Host API v9: storyForge is unloading. Called after `--sf-*` vars have been stripped
	 * so the companion can restyle from its local copy. `linked` is a snapshot taken while
	 * the host was still alive. Optional so older companions ignore it and rely on the poll.
	 */
	onHostDisconnect?: (linked: LinkedFormattingValues) => void;
	/** Resolve a font id + weight into CSS font-family / font-variation-settings values. */
	resolveFont?: (familyId: string, weight: number) => FontResolveResult | null;
	/** Register embedded @font-face / FontFace entries into `doc` (idempotent). */
	registerFacesForDocument?: (doc: Document) => void;
	/** List formatForge's font catalog so a host can render its own "Font" picker row. */
	listFonts?: () => FontCatalogEntry[];
	/** Open formatForge's own font-picker modal, scoped to one host field. */
	openFontPicker?: (opts: OpenFontPickerOptions) => void;
	/**
	 * Snapshot of formatForge-owned settings for a complete pack. Merged into the same
	 * `settings` object as storyForge keys; storyForge ignores keys it does not own.
	 * Optional so an older companion is skipped and those keys are simply absent.
	 */
	exportLocalSettings?: () => Record<string, unknown>;
	/**
	 * Apply formatForge-owned keys from a complete pack. Unknown keys are ignored, so the
	 * same settings object can be handed to storyForge and formatForge.
	 */
	importLocalSettings?: (data: Record<string, unknown>) => Promise<void>;
}

/**
 * Host-unload sequence: snapshot linked settings, drop the companion pointer,
 * strip `--sf-*` vars, then notify. formatForge restyles after the strip so
 * editor typography does not vanish for a keepalive-poll interval.
 */
export function teardownFormatCompanion(opts: {
	getCompanion: () => FormatCompanionRegistration | null;
	getLinkedSettings: () => LinkedFormattingValues;
	forgetCompanion: () => void;
	clearHostStyles: () => void;
}): void {
	const companion = opts.getCompanion();
	let snapshot = {} as LinkedFormattingValues;
	try {
		snapshot = opts.getLinkedSettings();
	} catch {
		/* settings already gone */
	}
	opts.forgetCompanion();
	opts.clearHostStyles();
	try {
		companion?.onHostDisconnect?.(snapshot);
	} catch {
		/* companion errors must not break host unload */
	}
}

export interface StoryForgeFormattingApi {
	/** Same as host `version` when formatting is available (2+). */
	version: number;
	/** True while a format companion is registered. */
	isCompanionActive(): boolean;
	getCompanion(): FormatCompanionRegistration | null;
	/**
	 * Open storyForge's interface chrome modal. This is the single interface modal; formatForge
	 * adds font pickers to it when registered, rather than owning a second copy.
	 */
	openInterfaceModal(): void;
	/**
	 * Register formatForge (or a future typography sibling). Returns an unregister function.
	 * Only one companion is active; a new registration replaces the previous.
	 */
	registerCompanion(reg: FormatCompanionRegistration): () => void;
	/** Snapshot of SF-persisted formatting-related settings. */
	getLinkedSettings(): LinkedFormattingValues;
	getLinkedSetting<K extends SfLinkedFormattingKey>(key: K): LinkedFormattingValues[K];
	updateLinkedSetting(key: SfLinkedFormattingKey, value: unknown): Promise<void>;
	/**
	 * API v8: validate the complete patch before writing, persist once, then
	 * restyle once. This is the preferred path for theme imports.
	 */
	updateLinkedSettings(
		partial: Partial<Record<SfLinkedFormattingKey, unknown>>,
	): Promise<void>;
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
	 * Save a complete formatForge settings document into storyForge's vault-local
	 * `_sf-backup/` folder. The host owns the path and filename.
	 */
	saveFormattingExport(content: string): Promise<string>;
	/** Discover settings JSON files already stored in `_sf-backup/`. */
	listSettingsExports(): Promise<Array<{ path: string; name: string }>>;
	/** Read a discovered settings JSON file from `_sf-backup/`. */
	readSettingsExport(path: string): Promise<string>;
	/** Create/update a user-named formatForge preset in storyForge backstage. */
	saveFormattingPreset(name: string, content: string, overwrite?: boolean): Promise<{ path: string; name: string }>;
	/** List user-named formatForge presets from storyForge backstage. */
	listFormattingPresets(): Promise<Array<{ path: string; name: string }>>;
	/** Read one discovered formatForge preset. */
	readFormattingPreset(path: string): Promise<string>;
	renameFormattingPreset(path: string, newName: string, overwrite?: boolean): Promise<{ path: string; name: string }>;
	/** Move a named theme into `_backstage/storyforge/settings/archived-settings/`. */
	deleteFormattingPreset(path: string): Promise<void>;
	/**
	 * Contribute UI into a storyForge view slot. `render` mounts into the provided
	 * container and must return a disposer. Known slots: `"storyforge-panel"` (left
	 * panel; reserved). Prefer the top-level `api.registerViewContribution` for new callers.
	 */
	registerViewContribution(opt: {
		/** Stable slot id (e.g. `"storyforge-panel"`). */
		slot: string;
		orderHint?: number;
		render: (containerEl: HTMLElement) => () => void;
	}): () => void;
}
