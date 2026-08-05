/**
 * Cross-plugin handoff stress: simulates formatForge driving storyForge formatting API
 * the way the real plugins would at runtime (no Obsidian).
 *
 * Run: npx vitest run src/__tests__/handoff.stress.test.ts
 */
import { describe, expect, it, vi } from "vitest";
import { createHostApi } from "../hostApi";
import type { FormatCompanionRegistration } from "../formattingApi";
import type StoryForgePlugin from "../main";

function makeDoc() {
	const styles = new Map<string, string>();
	return {
		body: {
			style: {
				setProperty: (k: string, v: string) => styles.set(k, v),
				removeProperty: (k: string) => styles.delete(k),
				getPropertyValue: (k: string) => styles.get(k) ?? "",
			},
		},
		_styles: styles,
	} as unknown as Document & { _styles: Map<string, string> };
}

function makeHost() {
	const settings: Record<string, unknown> = {
		colorPaletteName: "Custom",
		colorPaletteVariant: "",
		customPaletteColors: [],
		bodyTextOverrideSize: false,
		bodyTextSize: 1,
		heading1OverrideSize: false,
		heading1Size: 1.8,
		librarySeriesTitleColor: "#fff",
		librarySeriesTitleFontSize: 1.2,
		librarySeriesTitleOverrideFont: false,
		librarySeriesTitleFontFamily: "ibm-plex-sans-var",
		librarySeriesTitleFontWeight: "700",
		librarySeriesTitleSmallCaps: false,
		selectedNovel: null,
		codexFactSectionByType: {},
		// fill remaining linked keys with harmless defaults so getLinkedSettings is complete
		highlightActiveChapter: true,
		highlightColor: "#fef3c7",
		highlightTextColor: "#111",
		libraryBookTitleFontSize: 1,
		libraryBookTitleOverrideFont: false,
		libraryBookTitleFontFamily: "ibm-plex-sans-var",
		libraryBookTitleFontWeight: "400",
		libraryBookTitleColor: "#fff",
		libraryBookTitleSmallCaps: false,
		libraryBookSubtitleFontSize: 1,
		libraryBookSubtitleOverrideFont: false,
		libraryBookSubtitleFontFamily: "ibm-plex-sans-var",
		libraryBookSubtitleFontWeight: "400",
		libraryBookSubtitleSmallCaps: false,
		libraryHeaderDividerBelow: false,
		libraryItemsFontSize: 1,
		libraryItemsOverrideFont: false,
		libraryItemsFontFamily: "ibm-plex-sans-var",
		libraryItemsFontWeight: "400",
		libraryItemsColor: "#ccc",
		libraryItemsMuted: false,
		unplacedHighlightColor: "#333",
		unplacedHighlightTextColor: "#fff",
		codexHighlightColor: "#333",
		codexHighlightTextColor: "#fff",
		unplacedMuted: false,
		unplacedSmallCaps: false,
		unplacedColor: "#aaa",
		unplacedFontSize: 1,
		unplacedOverrideFont: false,
		unplacedFontFamily: "ibm-plex-sans-var",
		unplacedFontWeight: "400",
		unplacedItemsFontSize: 1,
		unplacedItemsOverrideFont: false,
		unplacedItemsFontFamily: "ibm-plex-sans-var",
		unplacedItemsFontWeight: "400",
		unplacedItemsColor: "#bbb",
		unplacedItemsMuted: false,
		unplacedUseHeaderColorForAll: false,
		codexMuted: false,
		codexSmallCaps: false,
		codexColor: "#aaa",
		codexFontSize: 1,
		codexOverrideFont: false,
		codexFontFamily: "ibm-plex-sans-var",
		codexFontWeight: "400",
		codexFolderFontSize: 1,
		codexFolderOverrideFont: false,
		codexFolderFontFamily: "ibm-plex-sans-var",
		codexFolderFontWeight: "400",
		codexFolderColor: "#888",
		codexFolderIndicatorThickness: "thin",
		codexNoteLabelFontSize: 1,
		codexNoteLabelOverrideFont: false,
		codexNoteLabelFontFamily: "ibm-plex-sans-var",
		codexNoteLabelFontWeight: "400",
		codexNoteLabelColor: "#ccc",
		codexNoteLabelUseDefaultColor: true,
		codexNoteLabelUseFolderColor: false,
		codexUseHeaderColorForAll: false,
		hideSeriesPane: false,
		heading2OverrideSize: false,
		heading2Size: 1.5,
		heading3OverrideSize: false,
		heading3Size: 1.3,
		heading4OverrideSize: false,
		heading4Size: 1.1,
		heading5OverrideSize: false,
		heading5Size: 1,
		heading6OverrideSize: false,
		heading6Size: 1,
		cyclingGuideEnabled: false,
		cyclingGuideThickness: "thin",
		cyclingGuideColor: "#888",
		cyclingGuideFlagSize: "medium",
		cyclingGuideRoundedLines: false,
		cyclingGuideInterval: "medium",
		editorScrollbarThumbColor: "#6b7280",
		editorScrollbarThickness: "thick",
	};

	let companion: FormatCompanionRegistration | null = null;
	const docs = [makeDoc(), makeDoc(), makeDoc()];

	const plugin = {
		getSettings: () => settings,
		async updateSetting(k: string, v: unknown) {
			settings[k] = v;
		},
		async updateSettings(partial: Record<string, unknown>) {
			Object.assign(settings, partial);
		},
		applyLinkedFormattingStyles() {
			companion?.onHostStylesApplied?.();
		},
		applyHostStyleVars(vars: Record<string, string | null>) {
			for (const doc of docs) {
				for (const [k, v] of Object.entries(vars)) {
					if (v == null) doc.body.style.removeProperty(k);
					else doc.body.style.setProperty(k, v);
				}
			}
		},
		getStyleDocuments: () => docs,
		getFormatCompanion: () => companion,
		registerFormatCompanion(reg: FormatCompanionRegistration) {
			companion = reg;
			return () => {
				if (companion === reg) companion = null;
			};
		},
		registerViewContribution() {
			return () => undefined;
		},
		addActiveBookListener() {
			return () => undefined;
		},
		registerHostedRightRailView() {},
	};

	return { plugin: plugin as unknown as StoryForgePlugin, docs, settings };
}

describe("SF ↔ FF handoff stress", () => {
	it("enable/disable companion 100× without leaking active state", () => {
		const { plugin } = makeHost();
		const api = createHostApi(plugin);
		for (let i = 0; i < 100; i++) {
			const unreg = api.formatting.registerCompanion({
				pluginId: "formatforge",
				version: 1,
				onHostStylesApplied: () => undefined,
			});
			expect(api.formatting.isCompanionActive()).toBe(true);
			unreg();
			expect(api.formatting.isCompanionActive()).toBe(false);
		}
	});

	it("FF-style editor var bursts stay consistent across pop-out docs", async () => {
		const { plugin, docs } = makeHost();
		const api = createHostApi(plugin);
		const applied = vi.fn();
		api.formatting.registerCompanion({
			pluginId: "formatforge",
			version: 1,
			onHostStylesApplied: applied,
			resolveFont: (id, w) => ({ family: `"storyForge ${id}"`, variation: `"wght" ${w}` }),
		});

		for (let i = 0; i < 500; i++) {
			await api.formatting.updateLinkedSetting("bodyTextOverrideSize", true);
			await api.formatting.updateLinkedSetting("bodyTextSize", 0.8 + (i % 20) * 0.05);
			api.formatting.setStyleVars({
				"--sf-body-color": `#${(i % 200).toString(16).padStart(2, "0")}aa00`,
				"--sf-body-family": `"storyForge Nunito", var(--font-text)`,
				"--sf-body-variation": `"wght" ${400 + (i % 5) * 100}`,
				"--sf-h1-color": i % 2 === 0 ? "#ffffff" : null,
				"--sf-h1-link-color": i % 3 === 0 ? "inherit" : null,
			});
		}

		expect(applied.mock.calls.length).toBe(1000); // 2 linked updates × 500
		for (const doc of docs) {
			expect(doc.body.style.getPropertyValue("--sf-body-family")).toContain("Nunito");
			expect(doc.body.style.getPropertyValue("--sf-body-variation")).toMatch(/"wght"/);
		}
	});

	it("SF chrome font resolve via companion under concurrent restyles", () => {
		const { plugin } = makeHost();
		const api = createHostApi(plugin);
		let resolveCount = 0;
		api.formatting.registerCompanion({
			pluginId: "formatforge",
			version: 1,
			resolveFont: (id, w) => {
				resolveCount++;
				if (id === "missing") return null;
				return { family: `"${id}"`, variation: w >= 100 ? `"wght" ${w}` : null };
			},
			onHostStylesApplied: () => {
				// FF re-pushes editor vars whenever SF restyles
				api.formatting.setStyleVars({ "--sf-body-color": "#abc123" });
			},
		});

		for (let i = 0; i < 200; i++) {
			api.formatting.applyLinkedStyles();
			const c = api.formatting.getCompanion();
			expect(c?.resolveFont?.("nunito", 700)?.family).toBe(`"nunito"`);
			expect(c?.resolveFont?.("missing", 400)).toBeNull();
		}
		expect(resolveCount).toBe(400); // 200 iterations × 2 resolveFont calls
	});

	it("palette handoff: FF updates SF palette then SF still owns values after unregister", async () => {
		const { plugin, settings } = makeHost();
		const api = createHostApi(plugin);
		const unreg = api.formatting.registerCompanion({ pluginId: "formatforge", version: 1 });

		await api.formatting.updatePalette({
			name: "Custom",
			customColors: [{ name: "A", hex: "#010101" }],
		});
		expect(api.formatting.getPalette().customColors[0].hex).toBe("#010101");

		unreg();
		expect(api.formatting.isCompanionActive()).toBe(false);
		// Values remain in SF store
		expect(settings.customPaletteColors).toEqual([{ name: "A", hex: "#010101" }]);
		expect(api.formatting.getPalette().customColors[0].hex).toBe("#010101");
	});
});
