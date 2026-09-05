import { describe, expect, it } from "vitest";
import type { StoryForgePluginSettings } from "../main";
import {
	buildPreferencesExport,
	flattenPreferencesDocument,
	hasPreferencesSelection,
	parsePreferencesExport,
	PREFERENCE_SESSION_KEYS,
	PREFERENCES_EXPORT_FORMAT,
	stringifyPreferencesExport,
} from "../preferencesExport";

const SETTINGS = {
	layout: "hybrid",
	statusBarView: "all",
	useToolsPanel: true,
	hideToolsPanelIcon: false,
	panelOrderMode: "canonical",
	codexFactSectionByType: { person: "Facts" },
	recommendIncludeUnknownNames: false,
	seriesNumberingStyle: "arabic",
	chapterNumberingStyle: "arabic",
	autoFocus: true,
	hideHelp: false,
	hideSearch: true,
	hideBookmarks: true,
	hideFiles: true,
	hideObsidianSettingsIcon: false,
	hideLeftPanel: false,
	hideRightPanel: false,
	hideBacklinks: true,
	hideOutgoingLinks: true,
	hideTags: true,
	hideOutline: true,
	hideAllProperties: true,
	hideFileNameBar: false,
	hideNavRow: false,
	hideEditorTabs: false,
	librarySeriesTitleFontSize: 22,
	colorPaletteName: "Custom",
	hideSeriesPane: true,
	cyclingGuideEnabled: true,
	highlightActiveChapter: false,
	automaticBackupEnabled: true,
	automaticBackupFrequency: "daily",
	selectedNovel: "book-one",
	selectedObject: "codex/person.md",
	collapsedCodexFolderIds: ["places"],
	collapsedPlotChapterKeys: ["book-one/ch1.md"],
	lastAutomaticBackupAt: 123,
	storyContextShellApplied: true,
	welcomeNoteCreatedOnOnboarding: false,
} as unknown as StoryForgePluginSettings;

describe("preferences export", () => {
	it("round-trips JSON and omits session, theme, and interface keys", () => {
		const document = buildPreferencesExport(SETTINGS, new Date("2026-08-29T12:00:00.000Z"), {
			description: "roman defaults",
		});
		expect(document.format).toBe(PREFERENCES_EXPORT_FORMAT);
		expect(document.included).toEqual({
			general: true,
			obsidian: true,
			backup: true,
		});
		expect(document.general?.layout).toBe("hybrid");
		expect(document.general?.autoFocus).toBe(true);
		expect(document.obsidian?.hideHelp).toBe(false);
		expect(document.backup?.automaticBackupEnabled).toBe(true);
		expect(document.description).toBe("roman defaults");
		expect(document).not.toHaveProperty("appearance");
		expect(document.general).not.toHaveProperty("colorPaletteName");
		expect(document.general).not.toHaveProperty("librarySeriesTitleFontSize");
		expect(document.general).not.toHaveProperty("hideSeriesPane");
		expect(document.general).not.toHaveProperty("cyclingGuideEnabled");
		expect(document.general).not.toHaveProperty("highlightActiveChapter");
		for (const key of PREFERENCE_SESSION_KEYS) {
			expect(document.general).not.toHaveProperty(key);
			expect(document.obsidian).not.toHaveProperty(key);
			expect(document.backup).not.toHaveProperty(key);
		}

		const parsed = parsePreferencesExport(stringifyPreferencesExport(document));
		expect(parsed.general).toEqual(document.general);
		expect(parsed.obsidian).toEqual(document.obsidian);
		expect(parsed.backup).toEqual(document.backup);

		const flattened = flattenPreferencesDocument(parsed);
		expect(flattened.layout).toBe("hybrid");
		expect(flattened.colorPaletteName).toBeUndefined();
		expect(flattened.selectedNovel).toBeUndefined();
		expect(flattened.lastAutomaticBackupAt).toBeUndefined();
	});

	it("includes only the selected sections", () => {
		const generalOnly = buildPreferencesExport(SETTINGS, new Date(), {
			included: { general: true, obsidian: false, backup: false },
		});
		expect(generalOnly.general).not.toBeNull();
		expect(generalOnly.obsidian).toBeNull();
		expect(generalOnly.backup).toBeNull();
		expect(hasPreferencesSelection(generalOnly.included)).toBe(true);

		const none = buildPreferencesExport(SETTINGS, new Date(), {
			included: { general: false, obsidian: false, backup: false },
		});
		expect(none.general).toBeNull();
		expect(hasPreferencesSelection(none.included)).toBe(false);
	});

	it("ignores a leftover appearance section from older JSON", () => {
		const parsed = parsePreferencesExport(
			JSON.stringify({
				format: PREFERENCES_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-29T12:00:00.000Z",
				included: { general: true, obsidian: false, appearance: true, backup: false },
				general: { layout: "hybrid" },
				appearance: { colorPaletteName: "Custom" },
				obsidian: null,
				backup: null,
			}),
		);
		expect(parsed.included).toEqual({ general: true, obsidian: false, backup: false });
		expect(parsed).not.toHaveProperty("appearance");
		expect(flattenPreferencesDocument(parsed)).toEqual({ layout: "hybrid" });
	});

	it("rejects JSON that is not a preferences export", () => {
		expect(() => parsePreferencesExport("{")).toThrow("not valid");
		expect(() => parsePreferencesExport(JSON.stringify({ format: "storyforge-types-tags" }))).toThrow(
			"preferences export",
		);
	});
});
