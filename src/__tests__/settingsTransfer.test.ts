import { describe, expect, it } from "vitest";
import type { StoryForgePluginSettings } from "../main";
import {
	buildStoryForgeSettingsDocument,
	parseStoryForgeSettingsDocument,
	STORYFORGE_SETTINGS_FORMAT,
	stringifyStoryForgeSettingsDocument,
} from "../settingsTransfer";

const SETTINGS = {
	automaticBackupEnabled: false,
	bodyTextSize: 1,
	recommendHeaderColor: "#abcdef",
	colorPaletteName: "Custom",
	colorPaletteVariant: "",
	customPaletteColors: [{ name: "Ink", hex: "#232427" }],
} as unknown as StoryForgePluginSettings;

describe("storyForge settings transfer", () => {
	it("splits story, formatting, and palette settings", () => {
		const document = buildStoryForgeSettingsDocument(
			SETTINGS,
			{
				bodyTextSize: SETTINGS.bodyTextSize,
				recommendHeaderColor: SETTINGS.recommendHeaderColor,
				colorPaletteName: SETTINGS.colorPaletteName,
			},
			new Date("2026-08-05T10:30:00.000Z"),
			{ description: "  Roman series  " },
		);

		expect(document.format).toBe(STORYFORGE_SETTINGS_FORMAT);
		expect(document.description).toBe("Roman series");
		expect(document.exportedAt).toBe("2026-08-05T10:30:00.000Z");
		expect(document.storySettings).not.toHaveProperty("bodyTextSize");
		expect(document.formatting).toMatchObject({
			bodyTextSize: SETTINGS.bodyTextSize,
			recommendHeaderColor: SETTINGS.recommendHeaderColor,
		});
		expect(document.formatting).not.toHaveProperty("colorPaletteName");
		expect(document.palette).toMatchObject({
			colorPaletteName: SETTINGS.colorPaletteName,
		});
		expect(parseStoryForgeSettingsDocument(
			stringifyStoryForgeSettingsDocument(document),
		)).toEqual(document);
	});

	it("creates section-only exports", () => {
		const document = buildStoryForgeSettingsDocument(
			SETTINGS,
			{ bodyTextSize: SETTINGS.bodyTextSize },
			new Date(),
			{
				included: { storySettings: false, formatting: true, palette: false },
			},
		);
		expect(document.storySettings).toBeNull();
		expect(document.formatting).toEqual({ bodyTextSize: SETTINGS.bodyTextSize });
		expect(document.palette).toBeNull();
	});

	it("accepts legacy raw settings and rejects other versioned formats", () => {
		const legacy = parseStoryForgeSettingsDocument(
			JSON.stringify({ automaticBackupEnabled: true }),
		);
		expect(legacy.description).toContain("Legacy");
		expect(legacy.storySettings).toEqual({ automaticBackupEnabled: true });
		expect(() =>
			parseStoryForgeSettingsDocument(JSON.stringify({ format: "other", version: 1 })),
		).toThrow("not a storyForge");
	});
});
