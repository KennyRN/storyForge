import type { StoryForgePluginSettings } from "./main";

export const PREFERENCES_EXPORT_FORMAT = "storyforge-preferences" as const;
export const PREFERENCES_EXPORT_VERSION = 1 as const;

export type PreferencesExportSection = "general" | "obsidian" | "backup";

export interface PreferencesExportSelection {
	general: boolean;
	obsidian: boolean;
	backup: boolean;
}

export interface PreferencesExportDocument {
	format: typeof PREFERENCES_EXPORT_FORMAT;
	version: typeof PREFERENCES_EXPORT_VERSION;
	exportedAt: string;
	description?: string;
	included: PreferencesExportSelection;
	general: Record<string, unknown> | null;
	obsidian: Record<string, unknown> | null;
	backup: Record<string, unknown> | null;
}

/** Vault/session state that is not a portable preference. */
export const PREFERENCE_SESSION_KEYS = [
	"selectedNovel",
	"selectedObject",
	"collapsedCodexFolderIds",
	"collapsedPlotChapterKeys",
	"lastAutomaticBackupAt",
	"storyContextShellApplied",
	"welcomeNoteCreatedOnOnboarding",
] as const;

/** Behaviour settings that are not themes, storyForge interface, types/tags, or threads. */
export const PREFERENCE_GENERAL_KEYS = [
	"layout",
	"statusBarView",
	"useToolsPanel",
	"hideToolsPanelIcon",
	"panelOrderMode",
	"codexFactSectionByType",
	"recommendIncludeUnknownNames",
	"seriesNumberingStyle",
	"chapterNumberingStyle",
] as const satisfies ReadonlyArray<keyof StoryForgePluginSettings>;

export const PREFERENCE_OBSIDIAN_KEYS = [
	"hideHelp",
	"hideSearch",
	"hideBookmarks",
	"hideFiles",
	"hideObsidianSettingsIcon",
	"hideLeftPanel",
	"hideRightPanel",
	"hideBacklinks",
	"hideOutgoingLinks",
	"hideTags",
	"hideOutline",
	"hideAllProperties",
	"hideFileNameBar",
	"hideNavRow",
	"hideEditorTabs",
] as const satisfies ReadonlyArray<keyof StoryForgePluginSettings>;

export const PREFERENCE_BACKUP_KEYS = [
	"automaticBackupEnabled",
	"automaticBackupFrequency",
] as const satisfies ReadonlyArray<keyof StoryForgePluginSettings>;

export function hasPreferencesSelection(included: PreferencesExportSelection): boolean {
	return included.general || included.obsidian || included.backup;
}

function pickKeys(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
	return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function includedFlag(raw: unknown, fallback: boolean): boolean {
	if (raw === false) return false;
	if (raw === true) return true;
	return fallback;
}

export function buildPreferencesExport(
	settings: StoryForgePluginSettings,
	exportedAt: Date = new Date(),
	options: {
		description?: string;
		included?: Partial<PreferencesExportSelection>;
	} = {},
): PreferencesExportDocument {
	const included: PreferencesExportSelection = {
		general: options.included?.general ?? true,
		obsidian: options.included?.obsidian ?? true,
		backup: options.included?.backup ?? true,
	};
	const all = settings as unknown as Record<string, unknown>;
	const description = options.description?.trim();
	return {
		format: PREFERENCES_EXPORT_FORMAT,
		version: PREFERENCES_EXPORT_VERSION,
		exportedAt: exportedAt.toISOString(),
		...(description ? { description } : {}),
		included,
		general: included.general ? pickKeys(all, PREFERENCE_GENERAL_KEYS) : null,
		obsidian: included.obsidian ? pickKeys(all, PREFERENCE_OBSIDIAN_KEYS) : null,
		backup: included.backup ? pickKeys(all, PREFERENCE_BACKUP_KEYS) : null,
	};
}

export function stringifyPreferencesExport(document: PreferencesExportDocument): string {
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function flattenPreferencesDocument(document: PreferencesExportDocument): Record<string, unknown> {
	const incoming: Record<string, unknown> = {};
	if (document.general) Object.assign(incoming, document.general);
	if (document.obsidian) Object.assign(incoming, document.obsidian);
	if (document.backup) Object.assign(incoming, document.backup);
	for (const key of PREFERENCE_SESSION_KEYS) delete incoming[key];
	return incoming;
}

export function parsePreferencesExport(raw: string): PreferencesExportDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Preferences JSON is not valid");
	}
	if (!isRecord(parsed)) throw new Error("Preferences JSON is not an object");
	if (parsed.format !== PREFERENCES_EXPORT_FORMAT) {
		throw new Error("JSON is not a storyForge preferences export");
	}
	const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
	const exportedAt =
		typeof parsed.exportedAt === "string" && parsed.exportedAt
			? parsed.exportedAt
			: new Date().toISOString();
	const includedRaw = isRecord(parsed.included) ? parsed.included : {};
	const section = (name: PreferencesExportSection): Record<string, unknown> | null => {
		const value = parsed[name];
		if (value == null) return null;
		if (!isRecord(value)) throw new Error(`The ${name} section is invalid`);
		return { ...value };
	};
	const general = section("general");
	const obsidian = section("obsidian");
	const backup = section("backup");
	const included: PreferencesExportSelection = {
		general: includedFlag(includedRaw.general, general !== null),
		obsidian: includedFlag(includedRaw.obsidian, obsidian !== null),
		backup: includedFlag(includedRaw.backup, backup !== null),
	};
	return {
		format: PREFERENCES_EXPORT_FORMAT,
		version: PREFERENCES_EXPORT_VERSION,
		exportedAt,
		...(description ? { description } : {}),
		included: {
			general: included.general && general !== null,
			obsidian: included.obsidian && obsidian !== null,
			backup: included.backup && backup !== null,
		},
		general: included.general ? general : null,
		obsidian: included.obsidian ? obsidian : null,
		backup: included.backup ? backup : null,
	};
}
