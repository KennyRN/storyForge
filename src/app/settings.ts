import { isFontFamily, type FontFamily } from "../core/fontFamilies";
import { BASE_DEFAULTS, FOLLOW, TYPE_STYLES, isStyleFont, isStyleSize, type StyleFont, type TypeStyleId } from "../core/typeStyles";
/**
 * Settings (decision 23; docs/tauri-shell.md §7).
 *
 * **Project settings** travel with the project, in `_backstage/storyforge/project.md` (YAML
 * frontmatter, edited with the minimal-rewrite editor, so unknown keys survive). A project without it
 * is format 0 (plain 0.17): fully supported, using values read once from the plugin's
 * `.obsidian/plugins/storyforge/data.json` (never written to) or defaults. `project.md` is created or
 * changed only when a setting changes, so opening a project still writes nothing.
 *
 * **Machine settings** (window, recent projects, the session snapshot, and where you were in the
 * project) live in the app's data folder, outside the project.
 *
 * The last automatic backup time is never stored: it is the newest zip's date in `_sf-backup/`.
 */
import { SF_LAYOUTS } from "../layout";
import type { AutomaticBackupFrequency } from "../core/backup";
import { ReadOnlyProjectError } from "../backends/tauri";
import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "../core/numberingStyle";
import type { Project } from "../core/project";
import type { SfLayout } from "../layout";
import { BACKSTAGE_ROOT } from "../core/paths";
import { DEFAULT_ELISIONS, DEFAULT_SPECIAL_CHARACTERS } from "../core/typing/defaults";
import { isCharacterList, isElisionList, isNameList, isShortcodeMap } from "../core/typing/lists";

export const PROJECT_SETTINGS_PATH = `${BACKSTAGE_ROOT}/project.md`;
export const PLUGIN_DATA_PATH = ".obsidian/plugins/storyforge/data.json";
/** The highest `format-version` this build understands. A higher one opens the project read-only. */
export const SUPPORTED_FORMAT = 1;

/** The Codex list's colour (decisions 62 and 67): the default text colour, or one of Everforest's foreground colours (not red, which is trouble). Green, blue and orange are reserved elsewhere (decision 8); for the Codex list only, that is amended. */
export const CODEX_COLOURS = ["text", "yellow", "green", "aqua", "blue", "purple", "orange", "grey"] as const;
export type CodexColour = (typeof CODEX_COLOURS)[number];

/** The data colour (Brief 15, amending decision 8): one per project, chosen by the author, for every data bar. Stored as the role name. Red is trouble and green is the accent, so neither is offered. */
export const DATA_COLOURS = ["yellow", "aqua", "blue", "orange", "purple"] as const;
export type DataColour = (typeof DATA_COLOURS)[number];

/** The chapter length bar's colour (Brief 20, decision 160): `data` (the default, the project's data colour as it is now) or one of the five. Stored as the role name, written only on a change. */
export const CHAPTER_BAR_COLOURS = ["data", ...DATA_COLOURS] as const;
export type ChapterBarColour = (typeof CHAPTER_BAR_COLOURS)[number];

/** The text colours (Brief 17, decision 122), each stored as a role name like `data-colour`. The selection: blue (the default), plum (Everforest's visual background), green, yellow or grey (red is trouble). The highlight and the three emphasis colours take the same five colours as the data bars (red and green are excluded, decision 8); an emphasis colour may also be "text" (none: the text colour). */
export const SELECTION_COLOURS = ["plum", "blue", "green", "yellow", "grey"] as const;
export type SelectionColour = (typeof SELECTION_COLOURS)[number];
export const EMPHASIS_COLOURS = ["text", ...DATA_COLOURS] as const;
export type EmphasisColour = (typeof EMPHASIS_COLOURS)[number];

/** The data label's and the data's colours (round five): the text colour, the muted grey, or one of the five. */
export const LABEL_COLOURS = ["text", "muted", ...DATA_COLOURS] as const;
export type LabelColour = (typeof LABEL_COLOURS)[number];
/** The bar's rail (the frame round a chapter bar): a background colour only, bg1 to bg4 (Everforest has no bg5), bg2 by default, the no-cover box's fill (decision 155). A stored grey or data colour (1.11.1 and earlier) draws the default and is never rewritten. */
export const RAIL_COLOURS = ["bg1", "bg2", "bg3", "bg4"] as const;
export type RailColour = (typeof RAIL_COLOURS)[number];

/** One story or a series of them (decision 81): whether the storytelling side shows a series line. Missing or unknown means a series. */
export type StoryKind = "series" | "standalone";

/**
 * The four parts of the storytelling side whose type the author chooses (decision 79), each with a font, a weight, a size in rem and, for Fraunces, Softness and
 * (Wonk was removed in 1.6.1: the drawing always sets it off, and an `appearance-<part>-wonk` key already on disk is never read or rewritten). The defaults are the author's own choices (decision 84).
 */
export const APPEARANCE_PARTS = ["codex", "novel", "series", "chapter"] as const;
export type AppearancePart = (typeof APPEARANCE_PARTS)[number];
/** The size range in rem each part allows (decision 83), and the step the size control moves by. */
export const APPEARANCE_SIZE_RANGE: Record<AppearancePart, readonly [number, number]> = { codex: [0.75, 1.75], novel: [0.75, 2], series: [0.75, 2], chapter: [0.75, 1.75] };
export const APPEARANCE_SIZE_STEP = 0.125;
export const APPEARANCE_SIZE_STEP_SHIFT = 0.25;
/** The base the Appearance sizes (stored in rem) are drawn against, in pixels. One constant for every size, so a later base-size setting scales them all together. The app's own root font size is not changed. */
export const APPEARANCE_BASE_PX = 16;
/** The author's defaults for each part (decision 84): font, weight and size in rem. A stored value that no longer exists falls back to these and is never rewritten. */
export const APPEARANCE_DEFAULTS: Record<AppearancePart, { font: FontFamily; weight: number; size: number }> = {
	codex: { font: "Atkinson Hyperlegible Next", weight: 400, size: 1 },
	novel: { font: "Sofia Sans", weight: 900, size: 1 },
	series: { font: "Sofia Sans", weight: 600, size: 0.75 },
	chapter: { font: "SN Pro", weight: 300, size: 1.375 },
};
type Cap<P extends string> = Capitalize<P>;
export type AppearanceKeys = {
	[P in AppearancePart as `appearance${Cap<P>}Font`]: StyleFont;
} & {
	[P in AppearancePart as `appearance${Cap<P>}Weight`]: number;
} & {
	[P in AppearancePart as `appearance${Cap<P>}Size`]: number;
} & {
};
export const appearanceKey = <S extends "Font" | "Weight" | "Size">(part: AppearancePart, what: S) => `appearance${part[0].toUpperCase()}${part.slice(1)}${what}` as keyof AppearanceKeys & `appearance${string}${S}`;


/** The type styles' keys (Brief 18): the two base fonts, then font, weight, size (pixels) and Softness for each style. `type<Style><What>`, stored as `appearance-<style>-<what>`. */
type StyleCap<I extends string> = Capitalize<I>;
export type TypeStyleKeys = { typeInterfaceFont: FontFamily; typeWritingFont: FontFamily } & {
	[I in TypeStyleId as `type${StyleCap<I>}Font`]: StyleFont;
} & {
	[I in TypeStyleId as `type${StyleCap<I>}Weight`]: number;
} & {
	[I in TypeStyleId as `type${StyleCap<I>}Size`]: number;
};
export const typeKey = (id: TypeStyleId, what: "Font" | "Weight" | "Size") => `type${id[0].toUpperCase()}${id.slice(1)}${what}` as keyof TypeStyleKeys;
const kebab = (id: string): string => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const typeDefaults = (): Record<string, unknown> => {
	const out: Record<string, unknown> = { typeInterfaceFont: BASE_DEFAULTS.interface, typeWritingFont: BASE_DEFAULTS.writing };
	for (const s of TYPE_STYLES) Object.assign(out, { [typeKey(s.id, "Font")]: FOLLOW, [typeKey(s.id, "Weight")]: s.weight, [typeKey(s.id, "Size")]: s.size });
	return out;
};
const typeFields = (): Record<string, { file: string; plugin: string; valid: (v: unknown) => boolean }> => {
	const out: Record<string, { file: string; plugin: string; valid: (v: unknown) => boolean }> = {
		typeInterfaceFont: { file: "appearance-interface-font", plugin: "-", valid: isFontFamily },
		typeWritingFont: { file: "appearance-writing-font", plugin: "-", valid: isFontFamily },
	};
	for (const s of TYPE_STYLES) {
		const f = `appearance-${kebab(s.id)}`;
		out[typeKey(s.id, "Font")] = { file: `${f}-font`, plugin: "-", valid: isStyleFont };
		out[typeKey(s.id, "Weight")] = { file: `${f}-weight`, plugin: "-", valid: isWeight };
		out[typeKey(s.id, "Size")] = { file: `${f}-size`, plugin: "-", valid: (v) => isStyleSize(s.id, v) };
	}
	return out;
};

export interface ProjectSettings extends AppearanceKeys, TypeStyleKeys {
	storyKind: StoryKind;
	/** The colour of the Codex list on both sides: text, icons, folder lines, the strip and the highlight. */
	codexColour: CodexColour;
	/** The colour of the data bars (chapter, series and the novel's progress segments). */
	dataColour: DataColour;
	/** The text colours (Brief 17): the selection, and bold, italic and bold italic. */
	selectionColour: SelectionColour;
	boldColour: EmphasisColour;
	italicColour: EmphasisColour;
	boldItalicColour: EmphasisColour;
	/** The small headings' colour (round three): the text colour (default) or one of the five. */
	smallHeadingColour: EmphasisColour;
	/** The library side's headers (Placed Chapters, Unplaced Chapters, Unplaced Novels, the archive's): the text colour or one of the five. */
	libraryHeaderColour: EmphasisColour;
	/** The novel tab's two chapter lists: each has a colour, for its rows' text and their highlight, as the Codex list has the Codex colour. */
	placedColour: CodexColour;
	unplacedColour: CodexColour;
	/** The label before a colon (Default PoV, PoV, Location) and the value after it. */
	dataLabelColour: LabelColour;
	dataValueColour: LabelColour;
	/** The rail round a chapter bar. */
	railColour: RailColour;
	/** The chapter length bar under the chapter box on the storytelling side (Brief 20). */
	chapterBarColour: ChapterBarColour;
	hideSeriesPane: boolean;
	autoFocus: boolean;
	layout: SfLayout;
	automaticBackup: boolean;
	automaticBackupFrequency: AutomaticBackupFrequency;
	codexFactSectionByType: Record<string, string>;
	seriesNumberingStyle: NumberingStyle;
	chapterNumberingStyle: NumberingStyle;
	/** Writing sessions (docs/sessions.md §9): minutes without an edit that end a session. */
	sessionIdleMinutes: number;
	/** Sessions shorter than this many minutes are recorded but not listed. 0 lists them all. */
	sessionMinShownMinutes: number;
	/** A session slower than this many words a minute counts as editing. `null`: off. */
	sessionEditingWpm: number | null;
	/** Show the current session's time and words in the stats panel. */
	showSessionReadout: boolean;
	/** The typing aids (docs/typing-aids.md): each has its own switch; the lists belong to the project. */
	typingSmartPunctuation: boolean;
	typingNameAutocorrect: boolean;
	typingShortcodes: boolean;
	/** Codex names are offered in the shortcode popup too. */
	typingShortcodeNames: boolean;
	typingSpecialCharactersButton: boolean;
	/** Words that begin with an apostrophe (`tis` for `’tis`). */
	typingElisions: string[];
	/** Names the autocorrect never puts in place of an all-lower-case word. */
	typingNameOptOuts: string[];
	/** Names without a Codex note. */
	typingWordList: string[];
	/** Shortcodes: the letters after `~`, and the full text. */
	typingShortcodeList: Record<string, string>;
	/** The characters in the palette, in order. */
	typingSpecialCharacters: string[];
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	storyKind: "series",
	...(typeDefaults() as unknown as TypeStyleKeys),
	appearanceCodexFont: APPEARANCE_DEFAULTS.codex.font,
	appearanceCodexWeight: APPEARANCE_DEFAULTS.codex.weight,
	appearanceCodexSize: APPEARANCE_DEFAULTS.codex.size,
	appearanceNovelFont: APPEARANCE_DEFAULTS.novel.font,
	appearanceNovelWeight: APPEARANCE_DEFAULTS.novel.weight,
	appearanceNovelSize: APPEARANCE_DEFAULTS.novel.size,
	appearanceSeriesFont: APPEARANCE_DEFAULTS.series.font,
	appearanceSeriesWeight: APPEARANCE_DEFAULTS.series.weight,
	appearanceSeriesSize: APPEARANCE_DEFAULTS.series.size,
	appearanceChapterFont: APPEARANCE_DEFAULTS.chapter.font,
	appearanceChapterWeight: APPEARANCE_DEFAULTS.chapter.weight,
	appearanceChapterSize: APPEARANCE_DEFAULTS.chapter.size,
	codexColour: "text",
	dataColour: "blue",
	selectionColour: "blue",
	boldColour: "orange",
	italicColour: "orange",
	boldItalicColour: "orange",
	smallHeadingColour: "text",
	libraryHeaderColour: "text",
	placedColour: "green",
	unplacedColour: "green",
	dataLabelColour: "muted",
	dataValueColour: "text",
	railColour: "bg2",
	chapterBarColour: "data",
	hideSeriesPane: false,
	autoFocus: true,
	layout: "novelBrowse",
	automaticBackup: false,
	automaticBackupFrequency: "daily",
	codexFactSectionByType: { person: "Facts", place: "Facts", populace: "Facts" },
	seriesNumberingStyle: "arabic",
	chapterNumberingStyle: "arabic",
	sessionIdleMinutes: 3,
	sessionMinShownMinutes: 5,
	sessionEditingWpm: null,
	showSessionReadout: false,
	typingSmartPunctuation: true,
	typingNameAutocorrect: true,
	typingShortcodes: true,
	typingShortcodeNames: true,
	typingSpecialCharactersButton: true,
	typingElisions: [...DEFAULT_ELISIONS],
	typingNameOptOuts: [],
	typingWordList: [],
	typingShortcodeList: {},
	typingSpecialCharacters: [...DEFAULT_SPECIAL_CHARACTERS],
};

type Key = keyof ProjectSettings;

/** key in `project.md`, key in the plugin's `data.json`, and how to check a value. */
const FIELDS: Record<Key, { file: string; plugin: string; valid: (v: unknown) => boolean }> = {
	appearanceCodexFont: { file: "appearance-codex-font", plugin: "-", valid: isStyleFont },
	appearanceCodexWeight: { file: "appearance-codex-weight", plugin: "-", valid: isWeight },
	appearanceCodexSize: { file: "appearance-codex-size", plugin: "-", valid: (v) => isRemIn(v, APPEARANCE_SIZE_RANGE.codex) },
	appearanceNovelFont: { file: "appearance-novel-font", plugin: "-", valid: isStyleFont },
	appearanceNovelWeight: { file: "appearance-novel-weight", plugin: "-", valid: isWeight },
	appearanceNovelSize: { file: "appearance-novel-size", plugin: "-", valid: (v) => isRemIn(v, APPEARANCE_SIZE_RANGE.novel) },
	appearanceSeriesFont: { file: "appearance-series-font", plugin: "-", valid: isStyleFont },
	appearanceSeriesWeight: { file: "appearance-series-weight", plugin: "-", valid: isWeight },
	appearanceSeriesSize: { file: "appearance-series-size", plugin: "-", valid: (v) => isRemIn(v, APPEARANCE_SIZE_RANGE.series) },
	appearanceChapterFont: { file: "appearance-chapter-font", plugin: "-", valid: isStyleFont },
	appearanceChapterWeight: { file: "appearance-chapter-weight", plugin: "-", valid: isWeight },
	appearanceChapterSize: { file: "appearance-chapter-size", plugin: "-", valid: (v) => isRemIn(v, APPEARANCE_SIZE_RANGE.chapter) },
	...(typeFields() as Record<keyof TypeStyleKeys, { file: string; plugin: string; valid: (v: unknown) => boolean }>),
	storyKind: { file: "story-kind", plugin: "-", valid: (v) => v === "series" || v === "standalone" },
	codexColour: { file: "codex-colour", plugin: "-", valid: (v) => typeof v === "string" && (CODEX_COLOURS as readonly string[]).includes(v) },
	dataColour: { file: "data-colour", plugin: "-", valid: (v) => typeof v === "string" && (DATA_COLOURS as readonly string[]).includes(v) },
	selectionColour: { file: "selection-colour", plugin: "-", valid: (v) => typeof v === "string" && (SELECTION_COLOURS as readonly string[]).includes(v) },
	boldColour: { file: "bold-colour", plugin: "-", valid: (v) => typeof v === "string" && (EMPHASIS_COLOURS as readonly string[]).includes(v) },
	italicColour: { file: "italic-colour", plugin: "-", valid: (v) => typeof v === "string" && (EMPHASIS_COLOURS as readonly string[]).includes(v) },
	libraryHeaderColour: { file: "library-header-colour", plugin: "-", valid: (v) => typeof v === "string" && (EMPHASIS_COLOURS as readonly string[]).includes(v) },
	placedColour: { file: "placed-colour", plugin: "-", valid: (v) => typeof v === "string" && (CODEX_COLOURS as readonly string[]).includes(v) },
	unplacedColour: { file: "unplaced-colour", plugin: "-", valid: (v) => typeof v === "string" && (CODEX_COLOURS as readonly string[]).includes(v) },
	dataLabelColour: { file: "data-label-colour", plugin: "-", valid: (v) => typeof v === "string" && (LABEL_COLOURS as readonly string[]).includes(v) },
	dataValueColour: { file: "data-value-colour", plugin: "-", valid: (v) => typeof v === "string" && (LABEL_COLOURS as readonly string[]).includes(v) },
	chapterBarColour: { file: "chapter-bar-colour", plugin: "-", valid: (v) => typeof v === "string" && (CHAPTER_BAR_COLOURS as readonly string[]).includes(v) },
	railColour: { file: "rail-colour", plugin: "-", valid: (v) => typeof v === "string" && (RAIL_COLOURS as readonly string[]).includes(v) },
	smallHeadingColour: { file: "small-heading-colour", plugin: "-", valid: (v) => typeof v === "string" && (EMPHASIS_COLOURS as readonly string[]).includes(v) },
	boldItalicColour: { file: "bold-italic-colour", plugin: "-", valid: (v) => typeof v === "string" && (EMPHASIS_COLOURS as readonly string[]).includes(v) },
	hideSeriesPane: { file: "hide-series-pane", plugin: "hideSeriesPane", valid: (v) => typeof v === "boolean" },
	autoFocus: { file: "auto-focus", plugin: "autoFocus", valid: (v) => typeof v === "boolean" },
	layout: { file: "layout", plugin: "layout", valid: (v) => typeof v === "string" && (SF_LAYOUTS as string[]).includes(v) },
	automaticBackup: { file: "automatic-backup", plugin: "automaticBackupEnabled", valid: (v) => typeof v === "boolean" },
	automaticBackupFrequency: { file: "automatic-backup-frequency", plugin: "automaticBackupFrequency", valid: (v) => v === "every-open" || v === "daily" || v === "weekly" },
	codexFactSectionByType: {
		file: "codex-fact-section-by-type",
		plugin: "codexFactSectionByType",
		valid: (v) => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v as Record<string, unknown>).every((x) => typeof x === "string"),
	},
	seriesNumberingStyle: { file: "series-numbering-style", plugin: "seriesNumberingStyle", valid: (v) => typeof v === "string" && v in NUMBERING_STYLE_OPTIONS },
	chapterNumberingStyle: { file: "chapter-numbering-style", plugin: "chapterNumberingStyle", valid: (v) => typeof v === "string" && v in NUMBERING_STYLE_OPTIONS },
	// New in the app: the plugin never had them, so `plugin` names a key that is never there.
	sessionIdleMinutes: { file: "session-idle-minutes", plugin: "-", valid: (v) => isIntIn(v, 1, 30) },
	sessionMinShownMinutes: { file: "session-min-shown-minutes", plugin: "-", valid: (v) => isIntIn(v, 0, 60) },
	sessionEditingWpm: { file: "session-editing-wpm", plugin: "-", valid: (v) => v === null || isIntIn(v, 1, 60) },
	showSessionReadout: { file: "show-session-readout", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingSmartPunctuation: { file: "typing-smart-punctuation", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingNameAutocorrect: { file: "typing-name-autocorrect", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingShortcodes: { file: "typing-shortcodes", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingShortcodeNames: { file: "typing-shortcode-names", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingSpecialCharactersButton: { file: "typing-special-characters-button", plugin: "-", valid: (v) => typeof v === "boolean" },
	typingElisions: { file: "typing-elisions", plugin: "-", valid: isElisionList },
	typingNameOptOuts: { file: "typing-name-opt-outs", plugin: "-", valid: isNameList },
	typingWordList: { file: "typing-word-list", plugin: "-", valid: isNameList },
	typingShortcodeList: { file: "typing-shortcodes-list", plugin: "-", valid: isShortcodeMap },
	typingSpecialCharacters: { file: "typing-special-characters", plugin: "-", valid: isCharacterList },
};

/** The ranges the settings view offers, so the view and the check agree. */
export const SESSION_LIMITS = { idleMinutes: [1, 30], minShownMinutes: [0, 60], editingWpm: [1, 60] } as const;
function isWeight(v: unknown): boolean {
	return isIntIn(v, 100, 1000) && (v as number) % 100 === 0;
}
function isRemIn(v: unknown, [lo, hi]: readonly [number, number]): boolean {
	return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
}
function isIntIn(v: unknown, lo: number, hi: number): boolean {
	return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
}

export type SettingSource = "project.md" | "data.json" | "default";

export interface LoadedSettings {
	values: ProjectSettings;
	/** Where each value came from, for the diagnostic window. */
	sources: Record<Key, SettingSource>;
	/** 0 when there is no `project.md` (plain 0.17). */
	formatVersion: number;
	/** The project was made by a newer storyForge: nothing may be written into it. */
	readOnly: boolean;
	readOnlyReason?: string;
	/**
	 * Set when a re-read after an outside change found the file unreadable or of a newer format (decision 99): settings writes are
	 * refused (`readOnly`) but the rest of the project carries on. Cleared when the file reads again.
	 */
	frozen?: "unreadable" | "newer";
	/** The plugin's `selectedNovel` / `selectedObject` / `collapsedCodexFolderIds`, as a starting point for machine settings. */
	pluginPosition: Partial<MachineProjectState>;
}

/** Reads a file outside storyForge's own folders (the plugin's `data.json`), read-only. */
export type OutsideReader = (path: string) => Promise<string>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

async function readPluginData(readOutside: OutsideReader | undefined): Promise<Record<string, unknown>> {
	if (!readOutside) return {};
	try {
		const parsed: unknown = JSON.parse(await readOutside(PLUGIN_DATA_PATH));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {}; // no plugin data, or not readable: defaults
	}
}

/** Reads the effective settings. Never writes. */
export async function loadSettings(project: Project, readOutside?: OutsideReader): Promise<LoadedSettings> {
	const values = clone(DEFAULT_PROJECT_SETTINGS);
	const sources = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, "default"])) as Record<Key, SettingSource>;

	let fm: Record<string, unknown> | null = null;
	let unreadable = false;
	if (project.exists(PROJECT_SETTINGS_PATH)) {
		try {
			fm = project.frontmatter(PROJECT_SETTINGS_PATH);
		} catch {
			unreadable = true;
		}
	}
	const rawVersion = fm?.["format-version"];
	const formatVersion = fm === null ? 0 : typeof rawVersion === "number" && Number.isInteger(rawVersion) ? rawVersion : 0;

	const plugin = await readPluginData(readOutside);
	for (const key of Object.keys(FIELDS) as Key[]) {
		const field = FIELDS[key];
		if (fm && field.file in fm && field.valid(fm[field.file])) {
			(values as unknown as Record<string, unknown>)[key] = fm[field.file];
			sources[key] = "project.md";
		} else if (field.plugin in plugin && field.valid(plugin[field.plugin])) {
			(values as unknown as Record<string, unknown>)[key] = plugin[field.plugin];
			sources[key] = "data.json";
		}
	}

	const pluginPosition: Partial<MachineProjectState> = {};
	if (typeof plugin.selectedNovel === "string") pluginPosition.selectedNovel = plugin.selectedNovel;
	if (typeof plugin.selectedObject === "string") pluginPosition.selectedObject = plugin.selectedObject;
	if (Array.isArray(plugin.collapsedCodexFolderIds)) pluginPosition.collapsedCodexFolderIds = plugin.collapsedCodexFolderIds.filter((x): x is string => typeof x === "string");

	const newer = formatVersion > SUPPORTED_FORMAT;
	return {
		values,
		sources,
		formatVersion,
		readOnly: newer || unreadable,
		...(newer ? { readOnlyReason: `This project was made by a newer storyForge (format ${formatVersion}; this one understands up to ${SUPPORTED_FORMAT}). Update storyForge to edit it.` } : {}),
		...(unreadable ? { readOnlyReason: "The project's settings file (project.md) can't be read safely, so the project is open read-only." } : {}),
		pluginPosition,
	};
}

export interface SettingsRefresh {
	/** `ok`: read and applied. `unreadable`, `newer` and `absent`: nothing applied, the last values stay. */
	state: "ok" | "unreadable" | "newer" | "absent";
	changed: Key[];
	formatVersion: number;
}

/**
 * Re-reads `project.md` after an outside change and applies it to `current` in place (decision 96). Only keys whose value differs
 * are replaced, so an unchanged list keeps its identity. Never writes. A file that can't be read, was deleted, or is of a newer
 * format changes nothing here: the caller decides what to tell the author.
 */
export async function refreshSettings(project: Project, current: LoadedSettings, readOutside?: OutsideReader): Promise<SettingsRefresh> {
	const fresh = await loadSettings(project, readOutside);
	const freeze = (why: "unreadable" | "newer", reason: string): void => {
		current.frozen = why;
		current.readOnly = true;
		current.readOnlyReason = reason;
	};
	if (!project.exists(PROJECT_SETTINGS_PATH)) return { state: "absent", changed: [], formatVersion: current.formatVersion };
	if (fresh.formatVersion > SUPPORTED_FORMAT) {
		freeze("newer", fresh.readOnlyReason ?? "This project was made by a newer storyForge.");
		return { state: "newer", changed: [], formatVersion: fresh.formatVersion };
	}
	if (fresh.readOnly) {
		freeze("unreadable", "The project's settings file (project.md) can't be read, so settings can't be changed until it can.");
		return { state: "unreadable", changed: [], formatVersion: current.formatVersion };
	}
	if (current.frozen) {
		current.frozen = undefined;
		current.readOnly = false;
		current.readOnlyReason = undefined;
	}
	const changed: Key[] = [];
	for (const key of Object.keys(FIELDS) as Key[]) {
		if (JSON.stringify(current.values[key]) !== JSON.stringify(fresh.values[key])) {
			(current.values as unknown as Record<string, unknown>)[key] = fresh.values[key];
			changed.push(key);
		}
		current.sources[key] = fresh.sources[key];
	}
	current.formatVersion = fresh.formatVersion;
	return { state: "ok", changed, formatVersion: fresh.formatVersion };
}

const DEFAULT_PROJECT_CONTENT = `---\nformat-version: ${SUPPORTED_FORMAT}\n---\n`;

/** What the file held for a key that the window had last read differently: the author's value replaced it (decision 96). */
export interface SettingReplaced {
	key: string;
	/** The value found in the file, as the window would have read it. */
	replaced: unknown;
}

/**
 * Changes one setting. Writes `project.md` only if the value actually differs from what is in effect.
 * The first write also carries over the other values in effect (from the plugin's `data.json`), so the
 * project stays whole if it moves without `.obsidian/`. Unknown keys already in the file are kept.
 *
 * The write is checked against the file inside the same transaction (decision 96): the author's value wins, and when the file
 * held something other than what the window last read (changed elsewhere), that value is returned so the caller can say so.
 * Other keys changed elsewhere are left as they are, and the next re-read brings them in.
 */
export async function setSetting<K extends Key>(project: Project, current: LoadedSettings, key: K, value: ProjectSettings[K]): Promise<SettingReplaced | null> {
	if (current.readOnly) throw new ReadOnlyProjectError(PROJECT_SETTINGS_PATH, current.readOnlyReason);
	const field = FIELDS[key];
	if (!field.valid(value)) throw new Error(`"${String(value)}" is not a valid value for ${key}`);
	const unchanged = JSON.stringify(current.values[key]) === JSON.stringify(value);
	const hasFile = project.exists(PROJECT_SETTINGS_PATH);
	if (unchanged && (hasFile ? current.sources[key] === "project.md" : true)) return null;
	let replaced: SettingReplaced | null = null;
	await project.modifyFrontmatter(PROJECT_SETTINGS_PATH, DEFAULT_PROJECT_CONTENT, (fm) => {
		replaced = null;
		if (!hasFile) {
			// A first creation (or a file deleted from outside): the marker and what came from `data.json`, never the deleted file's values.
			for (const k of Object.keys(FIELDS) as Key[]) {
				if (current.sources[k] === "data.json") fm[FIELDS[k].file] = clone(current.values[k]);
			}
		} else {
			const onDisk = field.file in fm && field.valid(fm[field.file]) ? fm[field.file] : current.sources[key] === "project.md" ? clone(DEFAULT_PROJECT_SETTINGS[key]) : current.values[key];
			if (JSON.stringify(onDisk) !== JSON.stringify(current.values[key]) && JSON.stringify(onDisk) !== JSON.stringify(value)) replaced = { key, replaced: clone(onDisk) };
		}
		if (value === null) delete fm[field.file]; // "off" is the key's absence
		else fm[field.file] = clone(value);
	});
	current.values[key] = clone(value);
	current.sources[key] = "project.md";
	current.formatVersion = Math.max(current.formatVersion, 1);
	return replaced;
}

// ------------------------------------------------------------------------- machine settings

/** The stats panel's counts, in the order the count icon steps through them (decision 68). */
export const STATS_COUNTS = ["day", "week", "session", "chapter", "novel"] as const;
export type StatsCount = (typeof STATS_COUNTS)[number];

export interface ViewWidths {
	left: number;
	lore: number;
}
const isViewWidths = (v: unknown): v is ViewWidths => !!v && typeof v === "object" && typeof (v as ViewWidths).left === "number" && Number.isFinite((v as ViewWidths).left) && typeof (v as ViewWidths).lore === "number" && Number.isFinite((v as ViewWidths).lore);

/** Where you were in this project: a position, not a preference, so it stays on this computer. */
export interface MachineProjectState {
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	/** Panel widths in pixels: screens differ between Macs, so they stay on this computer (decision 26). */
	leftWidth?: number;
	/** The library side's left panel (Fix 5). `leftWidth` is the storytelling side's. All in `widthUnit`, or pixels where it is absent (before 1.5.0). */
	libraryWidth?: number;
	loreWidth?: number;
	widthUnit?: "px" | "percent";
	/** The same-width switch; absent means on. */
	widthsLinked?: boolean;
	/** Brief 19: the same-width switch for the other views that offer it (the Codex and Archive rows; `widthsLinked` stays the storytelling set's). Absent means off. */
	widthsLinkedViews?: Partial<Record<"series" | "novel" | "codex" | "archive", boolean>>;
	/** Round five: the side panels' widths per view (the left panel and the context panel, in `widthUnit`), seeded from the keys above when absent. */
	storytellingWidths?: ViewWidths;
	seriesWidths?: ViewWidths;
	novelWidths?: ViewWidths;
	/** The Codex and Archive tabs have their own sets too (round five), starting from `libraryWidth` and `loreWidth`. */
	codexWidths?: ViewWidths;
	archiveWidths?: ViewWidths;
	/** View ▸ Show or Hide Lore Slot. */
	loreHidden?: boolean;
	/** The chapter card sizes of 1.6 and earlier (decision 41, retired in 1.7.0). No longer used: read exactly as stored and written back unchanged on every save, never interpreted, cleaned or dropped. */
	cardTiers?: unknown;
	/** Which count the stats panel shows (decision 68). Day is the default and isn't stored. */
	statsCount?: StatsCount;
	/** The last chapter written in each novel, by novel folder (Brief 19): where "Write this novel" reopens. A position, so it stays on this computer, never in the project. */
	lastChapters?: Record<string, string>;
	/** Brief 22: the paths of the names Windows can't hold that the author has already been told about, so the list is shown again only when new ones appear. */
	windowsNamesSeen?: string[];
}

export const DEFAULT_MACHINE_PROJECT_STATE: MachineProjectState = { selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [] };

/** Reads and writes the allow-listed machine settings (the Rust `machine_get` / `machine_set`). */
export interface MachineStore {
	get(name: string): Promise<string | null>;
	set(name: string, text: string): Promise<void>;
}

export async function loadMachineProjectState(store: MachineStore, projectKey: string, fallback: Partial<MachineProjectState> = {}): Promise<MachineProjectState> {
	const base: MachineProjectState = { ...DEFAULT_MACHINE_PROJECT_STATE, ...fallback };
	try {
		const text = await store.get(`project-ui/${projectKey}`);
		if (text === null) return base;
		const parsed = JSON.parse(text) as Partial<MachineProjectState>;
		return {
			selectedNovel: typeof parsed.selectedNovel === "string" ? parsed.selectedNovel : base.selectedNovel,
			selectedObject: typeof parsed.selectedObject === "string" ? parsed.selectedObject : base.selectedObject,
			collapsedCodexFolderIds: Array.isArray(parsed.collapsedCodexFolderIds) ? parsed.collapsedCodexFolderIds.filter((x): x is string => typeof x === "string") : base.collapsedCodexFolderIds,
			...(typeof parsed.leftWidth === "number" && Number.isFinite(parsed.leftWidth) ? { leftWidth: parsed.leftWidth } : {}),
			...(typeof parsed.loreWidth === "number" && Number.isFinite(parsed.loreWidth) ? { loreWidth: parsed.loreWidth } : {}),
			...(typeof parsed.libraryWidth === "number" && Number.isFinite(parsed.libraryWidth) ? { libraryWidth: parsed.libraryWidth } : {}),
			...(parsed.widthUnit === "px" || parsed.widthUnit === "percent" ? { widthUnit: parsed.widthUnit } : {}),
			...(typeof parsed.widthsLinked === "boolean" ? { widthsLinked: parsed.widthsLinked } : {}),
			...(parsed.widthsLinkedViews && typeof parsed.widthsLinkedViews === "object" && !Array.isArray(parsed.widthsLinkedViews) ? { widthsLinkedViews: Object.fromEntries((["series", "novel", "codex", "archive"] as const).filter((v) => typeof (parsed.widthsLinkedViews as Record<string, unknown>)[v] === "boolean").map((v) => [v, (parsed.widthsLinkedViews as Record<string, boolean>)[v]])) } : {}),
			...(isViewWidths(parsed.storytellingWidths) ? { storytellingWidths: { left: parsed.storytellingWidths.left, lore: parsed.storytellingWidths.lore } } : {}),
			...(isViewWidths(parsed.seriesWidths) ? { seriesWidths: { left: parsed.seriesWidths.left, lore: parsed.seriesWidths.lore } } : {}),
			...(isViewWidths(parsed.novelWidths) ? { novelWidths: { left: parsed.novelWidths.left, lore: parsed.novelWidths.lore } } : {}),
			...(isViewWidths(parsed.codexWidths) ? { codexWidths: { left: parsed.codexWidths.left, lore: parsed.codexWidths.lore } } : {}),
			...(isViewWidths(parsed.archiveWidths) ? { archiveWidths: { left: parsed.archiveWidths.left, lore: parsed.archiveWidths.lore } } : {}),
			...(parsed.loreHidden === true ? { loreHidden: true } : {}),
			...(STATS_COUNTS.some((c) => c === parsed.statsCount) && parsed.statsCount !== "day" ? { statsCount: parsed.statsCount as StatsCount } : {}),
			...(parsed.lastChapters && typeof parsed.lastChapters === "object" && !Array.isArray(parsed.lastChapters) ? { lastChapters: Object.fromEntries(Object.entries(parsed.lastChapters).filter(([, v]) => typeof v === "string")) as Record<string, string> } : {}),
			...(Array.isArray(parsed.windowsNamesSeen) ? { windowsNamesSeen: parsed.windowsNamesSeen.filter((v: unknown) => typeof v === "string") as string[] } : {}),
			...("cardTiers" in parsed ? { cardTiers: parsed.cardTiers } : {}),
		};
	} catch {
		return base;
	}
}

export function saveMachineProjectState(store: MachineStore, projectKey: string, state: MachineProjectState): Promise<void> {
	return store.set(`project-ui/${projectKey}`, JSON.stringify(state));
}

/** Whether the series pane is hidden: only a standalone story can hide it. While the project is a series the stored setting is ignored, whatever it holds, so an outside change never makes the app write anything (Brief 19). */
export const seriesPaneHidden = (v: Pick<ProjectSettings, "hideSeriesPane" | "storyKind">): boolean => v.hideSeriesPane && v.storyKind === "standalone";
