import type { ProjectSettings } from "../../app/settings";
import { TYPE_STYLES } from "../../core/typeStyles";

const NAMES: Partial<Record<keyof ProjectSettings, string>> = {
	storyKind: "This story is",
	codexColour: "Codex colour",
	dataColour: "Data colour",
	selectionColour: "Selection colour",
	highlightColour: "Highlight colour",
	boldColour: "Bold colour",
	italicColour: "Italic colour",
	boldItalicColour: "Bold italic colour",
	smallHeadingColour: "Small heading colour",
	hideSeriesPane: "Hide the series pane",
	autoFocus: "Opens in",
	layout: "Layout",
	automaticBackup: "Automatic backups",
	automaticBackupFrequency: "Backup frequency",
	seriesNumberingStyle: "Series numbering",
	chapterNumberingStyle: "Chapter numbering",
	sessionIdleMinutes: "Idle limit (minutes)",
	sessionMinShownMinutes: "Shortest session listed (minutes)",
	sessionEditingWpm: "Editing pace (words a minute)",
	showSessionReadout: "Live session readout",
	typingSmartPunctuation: "Smart punctuation",
	typingNameAutocorrect: "Name autocorrect",
	typingShortcodes: "Shortcodes",
	typingShortcodeNames: "Names in the shortcode popup",
	typingSpecialCharactersButton: "Special-characters button",
	typingElisions: "Elisions",
	typingNameOptOuts: "Names not corrected",
	typingWordList: "Word list",
	typingShortcodeList: "Shortcodes",
	typingSpecialCharacters: "Special characters",
};
const PARTS: Record<string, string> = { Codex: "Codex list", Novel: "Novel title", Series: "Series name", Chapter: "Selected chapter" };

/** The name the settings view gives a setting. */
export function settingName(key: string): string {
	const known = NAMES[key as keyof ProjectSettings];
	if (known) return known;
	const m = /^appearance(Codex|Novel|Series|Chapter)(Font|Weight|Size|Soft)$/.exec(key);
	if (m) return `${PARTS[m[1]]}: ${m[2].toLowerCase()}`;
	if (key === "typeInterfaceFont") return "Interface font";
	if (key === "typeWritingFont") return "Writing font";
	const t = /^type([A-Z][A-Za-z]*?)(Font|Weight|Size|Soft)$/.exec(key);
	const style = t && TYPE_STYLES.find((s) => s.id.toLowerCase() === t[1].toLowerCase());
	return t && style ? `${style.name}: ${t[2].toLowerCase()}` : key;
}

/** A value as a person reads it. */
export function settingValue(value: unknown): string {
	if (value === true) return "On";
	if (value === false) return "Off";
	if (value === null || value === undefined) return "Off";
	if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
	if (typeof value === "object") return `${Object.keys(value).length} entries`;
	return String(value);
}
