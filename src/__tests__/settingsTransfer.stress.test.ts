import { describe, expect, it } from "vitest";
import type { StoryForgePluginSettings } from "../main";
import {
	buildStoryForgeSettingsDocument,
	parseStoryForgeSettingsDocument,
	stringifyStoryForgeSettingsDocument,
	type StoryForgeTransferSelection,
} from "../settingsTransfer";

const SETTINGS = {
	automaticBackupEnabled: false,
	automaticBackupFrequency: "daily",
	selectedNovel: "Roman Republic",
	bodyTextSize: 1,
	recommendHeaderColor: "#abcdef",
	colorPaletteName: "Custom",
	colorPaletteVariant: "",
	customPaletteColors: [{ name: "Ink", hex: "#232427" }],
} as unknown as StoryForgePluginSettings;

const LINKED = {
	bodyTextSize: 1.25,
	recommendHeaderColor: "#123456",
	colorPaletteName: "Custom",
	colorPaletteVariant: "",
	customPaletteColors: [{ name: "Ink", hex: "#111111" }],
};

describe("storyForge settings transfer stress", () => {
	it("round-trips every partial section combination repeatedly", () => {
		for (let bits = 0; bits < 8; bits++) {
			const included: StoryForgeTransferSelection = {
				storySettings: (bits & 1) !== 0,
				formatting: (bits & 2) !== 0,
				palette: (bits & 4) !== 0,
			};
			for (let round = 0; round < 100; round++) {
				const document = buildStoryForgeSettingsDocument(
					{
						...SETTINGS,
						selectedNovel: `Novel ${round}`,
					},
					{
						...LINKED,
						bodyTextSize: 0.8 + (round % 20) * 0.05,
					},
					new Date(1_700_000_000_000 + round * 1000),
					{ description: ` Series ${round} `, included },
				);
				const reparsed = parseStoryForgeSettingsDocument(
					stringifyStoryForgeSettingsDocument(document),
				);
				expect(reparsed).toEqual(document);
				expect(reparsed.included).toEqual(included);
				expect(reparsed.description).toBe(`Series ${round}`);
				expect(reparsed.storySettings !== null).toBe(included.storySettings);
				expect(reparsed.formatting !== null).toBe(included.formatting);
				expect(reparsed.palette !== null).toBe(included.palette);
				if (reparsed.storySettings) {
					expect(reparsed.storySettings).not.toHaveProperty("bodyTextSize");
					expect(reparsed.storySettings).not.toHaveProperty("colorPaletteName");
				}
				if (reparsed.formatting) {
					expect(reparsed.formatting).not.toHaveProperty("colorPaletteName");
				}
			}
		}
	});

	it("accepts a large corpus of legacy raw settings unchanged", () => {
		for (let i = 0; i < 500; i++) {
			const raw = {
				selectedNovel: `Novel ${i}`,
				automaticBackupEnabled: i % 2 === 0,
				bodyTextSize: 0.8 + (i % 20) * 0.05,
				customUnknownFutureSetting: { round: i },
			};
			const migrated = parseStoryForgeSettingsDocument(JSON.stringify(raw));
			expect(migrated.storySettings).toEqual(raw);
			expect(migrated.formatting).toBeNull();
			expect(migrated.palette).toBeNull();
		}
	});

	it("rejects malformed or inconsistent versioned documents", () => {
		const valid = buildStoryForgeSettingsDocument(SETTINGS, LINKED);
		const mutations: Array<(value: Record<string, unknown>) => void> = [
			(value) => {
				value.exportedAt = "yesterday-ish";
			},
			(value) => {
				value.description = [];
			},
			(value) => {
				value.included = { storySettings: true, formatting: 1, palette: true };
			},
			(value) => {
				value.storySettings = [];
			},
			(value) => {
				value.formatting = "bad";
			},
			(value) => {
				value.palette = {
					colorPaletteName: "Custom",
					colorPaletteVariant: "",
					customPaletteColors: [{ name: false, hex: "#000000" }],
				};
			},
			(value) => {
				value.included = {
					storySettings: false,
					formatting: true,
					palette: true,
				};
			},
		];
		for (const mutate of mutations) {
			const value = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
			mutate(value);
			expect(() =>
				parseStoryForgeSettingsDocument(JSON.stringify(value)),
			).toThrow();
		}
	});
});
