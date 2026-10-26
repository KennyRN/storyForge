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

export const PROJECT_SETTINGS_PATH = `${BACKSTAGE_ROOT}/project.md`;
export const PLUGIN_DATA_PATH = ".obsidian/plugins/storyforge/data.json";
/** The highest `format-version` this build understands. A higher one opens the project read-only. */
export const SUPPORTED_FORMAT = 1;

export interface ProjectSettings {
	hideSeriesPane: boolean;
	autoFocus: boolean;
	layout: SfLayout;
	highlightActiveChapter: boolean;
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
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	hideSeriesPane: false,
	autoFocus: true,
	layout: "novelBrowse",
	highlightActiveChapter: true,
	automaticBackup: false,
	automaticBackupFrequency: "daily",
	codexFactSectionByType: { person: "Facts", place: "Facts", populace: "Facts" },
	seriesNumberingStyle: "arabic",
	chapterNumberingStyle: "arabic",
	sessionIdleMinutes: 3,
	sessionMinShownMinutes: 5,
	sessionEditingWpm: null,
	showSessionReadout: false,
};

type Key = keyof ProjectSettings;

/** key in `project.md`, key in the plugin's `data.json`, and how to check a value. */
const FIELDS: Record<Key, { file: string; plugin: string; valid: (v: unknown) => boolean }> = {
	hideSeriesPane: { file: "hide-series-pane", plugin: "hideSeriesPane", valid: (v) => typeof v === "boolean" },
	autoFocus: { file: "auto-focus", plugin: "autoFocus", valid: (v) => typeof v === "boolean" },
	layout: { file: "layout", plugin: "layout", valid: (v) => typeof v === "string" && (SF_LAYOUTS as string[]).includes(v) },
	highlightActiveChapter: { file: "highlight-active-chapter", plugin: "highlightActiveChapter", valid: (v) => typeof v === "boolean" },
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
};

/** The ranges the settings view offers, so the view and the check agree. */
export const SESSION_LIMITS = { idleMinutes: [1, 30], minShownMinutes: [0, 60], editingWpm: [1, 60] } as const;
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

const DEFAULT_PROJECT_CONTENT = `---\nformat-version: ${SUPPORTED_FORMAT}\n---\n`;

/**
 * Changes one setting. Writes `project.md` only if the value actually differs from what is in effect.
 * The first write also carries over the other values in effect (from the plugin's `data.json`), so the
 * project stays whole if it moves without `.obsidian/`. Unknown keys already in the file are kept.
 */
export async function setSetting<K extends Key>(project: Project, current: LoadedSettings, key: K, value: ProjectSettings[K]): Promise<void> {
	if (current.readOnly) throw new ReadOnlyProjectError(PROJECT_SETTINGS_PATH, current.readOnlyReason);
	const field = FIELDS[key];
	if (!field.valid(value)) throw new Error(`"${String(value)}" is not a valid value for ${key}`);
	const unchanged = JSON.stringify(current.values[key]) === JSON.stringify(value);
	const hasFile = project.exists(PROJECT_SETTINGS_PATH);
	if (unchanged && (hasFile ? current.sources[key] === "project.md" : true)) return;
	await project.modifyFrontmatter(PROJECT_SETTINGS_PATH, DEFAULT_PROJECT_CONTENT, (fm) => {
		if (!hasFile) {
			for (const k of Object.keys(FIELDS) as Key[]) {
				if (current.sources[k] !== "default") fm[FIELDS[k].file] = clone(current.values[k]);
			}
		}
		if (value === null) delete fm[field.file]; // "off" is the key's absence
		else fm[field.file] = clone(value);
	});
	current.values[key] = clone(value);
	current.sources[key] = "project.md";
	current.formatVersion = Math.max(current.formatVersion, 1);
}

// ------------------------------------------------------------------------- machine settings

/** Where you were in this project: a position, not a preference, so it stays on this computer. */
export interface MachineProjectState {
	selectedNovel: string | null;
	selectedObject: string | null;
	collapsedCodexFolderIds: string[];
	/** Panel widths in pixels: screens differ between Macs, so they stay on this computer (decision 26). */
	leftWidth?: number;
	loreWidth?: number;
	/** View ▸ Show or Hide Lore Slot. */
	loreHidden?: boolean;
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
			...(parsed.loreHidden === true ? { loreHidden: true } : {}),
		};
	} catch {
		return base;
	}
}

export function saveMachineProjectState(store: MachineStore, projectKey: string, state: MachineProjectState): Promise<void> {
	return store.set(`project-ui/${projectKey}`, JSON.stringify(state));
}
