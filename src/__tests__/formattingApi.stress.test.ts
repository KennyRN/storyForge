/**
 * Stress tests for storyForge formatting host API (v2) used by formatForge.
 * Uses a lightweight fake plugin host — avoids importing Plugin subclasses.
 */
import { describe, expect, it, vi } from "vitest";
import { createHostApi, STORYFORGE_API_VERSION } from "../hostApi";
import type { FormatCompanionRegistration, SfLinkedFormattingKey } from "../formattingApi";
import type StoryForgePlugin from "../main";
import { PALETTE_NAMES } from "../colorPalettes";

type SettingsBag = Record<string, unknown>;

/** Enum-typed linked keys: cycle within the allowed set (not free-form string mutation). */
const LINKED_ENUM_CYCLES: Partial<Record<SfLinkedFormattingKey, readonly string[]>> = {
	colorPaletteName: PALETTE_NAMES,
	librarySeriesTitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	libraryBookTitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	libraryBookSubtitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	libraryItemsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	storytellingItemsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	unplacedFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	unplacedItemsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	codexFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	codexFolderFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	codexNoteLabelFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendTabsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendChapterTitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendDossierHeaderFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendNovelTitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendNovelSubtitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendPlotChapterFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendSectionTitleFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendItemsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendDetailsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendMetaLabelFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendMetaControlFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	recommendSynopsisFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	archiveHeaderFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	archiveItemsFontWeight: ["300", "400", "500", "600", "700", "800", "900"],
	codexFolderIndicatorThickness: ["none", "thin", "medium", "thick"],
	cyclingGuideThickness: ["thin", "medium", "thick", "extra-thick"],
	cyclingGuideFlagSize: ["small", "medium", "large"],
	cyclingGuideInterval: ["short", "medium", "large"],
	editorScrollbarThickness: ["thin", "medium", "thick"],
};

function nextLinkedValue(key: SfLinkedFormattingKey, current: unknown, round: number): unknown {
	const cycle = LINKED_ENUM_CYCLES[key];
	if (cycle) {
		const i = typeof current === "string" ? cycle.indexOf(current) : -1;
		return cycle[(Math.max(i, 0) + 1) % cycle.length];
	}
	if (typeof current === "boolean") return !current;
	if (typeof current === "number") return current + 0.1;
	if (typeof current === "string") return `${current}-x${round}`;
	if (Array.isArray(current)) return [...current];
	return current;
}

/** Minimal linked-settings bag covering every SfLinkedFormattingKey. */
function makeLinkedDefaults(): SettingsBag {
	return {
		colorPaletteName: "Custom",
		colorPaletteVariant: "",
		customPaletteColors: [],
		highlightActiveChapter: true,
		highlightColor: "#fef3c7",
		highlightTextColor: "#111111",
		librarySeriesTitleFontSize: 1.2,
		librarySeriesTitleOverrideFont: false,
		librarySeriesTitleFontFamily: "ibm-plex-sans-var",
		librarySeriesTitleFontWeight: "700",
		librarySeriesTitleColor: "#ffffff",
		librarySeriesTitleSmallCaps: false,
		libraryBookTitleFontSize: 1.1,
		libraryBookTitleOverrideFont: false,
		libraryBookTitleFontFamily: "ibm-plex-sans-var",
		libraryBookTitleFontWeight: "600",
		libraryBookTitleColor: "#ffffff",
		libraryBookTitleSmallCaps: false,
		libraryBookSubtitleFontSize: 0.9,
		libraryBookSubtitleOverrideFont: false,
		libraryBookSubtitleFontFamily: "ibm-plex-sans-var",
		libraryBookSubtitleFontWeight: "400",
		libraryBookSubtitleSmallCaps: false,
		libraryHeaderDividerBelow: false,
		libraryItemsFontSize: 0.95,
		libraryItemsOverrideFont: false,
		libraryItemsFontFamily: "ibm-plex-sans-var",
		libraryItemsFontWeight: "400",
		libraryItemsColor: "#cccccc",
		libraryItemsMuted: false,
		storytellingItemsFontSize: 1,
		storytellingItemsOverrideFont: false,
		storytellingItemsFontFamily: "ibm-plex-sans-var",
		storytellingItemsFontWeight: "400",
		storytellingItemsColor: "#c8c8c8",
		storytellingItemsMuted: false,
		storytellingLinkItemsColorToLibrary: true,
		storytellingHighlightColor: "#fef3c7",
		storytellingHighlightTextColor: "#1f2937",
		unplacedHighlightColor: "#333333",
		unplacedHighlightTextColor: "#ffffff",
		codexHighlightColor: "#333333",
		codexHighlightTextColor: "#ffffff",
		unplacedMuted: false,
		unplacedSmallCaps: false,
		unplacedColor: "#aaaaaa",
		unplacedFontSize: 1,
		unplacedOverrideFont: false,
		unplacedFontFamily: "ibm-plex-sans-var",
		unplacedFontWeight: "400",
		unplacedItemsFontSize: 0.9,
		unplacedItemsOverrideFont: false,
		unplacedItemsFontFamily: "ibm-plex-sans-var",
		unplacedItemsFontWeight: "400",
		unplacedItemsColor: "#bbbbbb",
		unplacedItemsMuted: false,
		unplacedUseHeaderColorForAll: false,
		codexMuted: false,
		codexSmallCaps: false,
		codexColor: "#aaaaaa",
		codexFontSize: 1,
		codexOverrideFont: false,
		codexFontFamily: "ibm-plex-sans-var",
		codexFontWeight: "400",
		codexFolderFontSize: 0.95,
		codexFolderOverrideFont: false,
		codexFolderFontFamily: "ibm-plex-sans-var",
		codexFolderFontWeight: "400",
		codexFolderColor: "#888888",
		codexFolderIndicatorThickness: "thin",
		codexNoteLabelFontSize: 0.9,
		codexNoteLabelOverrideFont: false,
		codexNoteLabelFontFamily: "ibm-plex-sans-var",
		codexNoteLabelFontWeight: "400",
		codexNoteLabelColor: "#cccccc",
		codexNoteLabelUseDefaultColor: true,
		codexNoteLabelUseFolderColor: false,
		codexUseHeaderColorForAll: false,
		hideSeriesPane: false,
		bodyTextOverrideSize: false,
		bodyTextSize: 1,
		heading1OverrideSize: false,
		heading1Size: 1.8,
		heading2OverrideSize: false,
		heading2Size: 1.5,
		heading3OverrideSize: false,
		heading3Size: 1.3,
		heading4OverrideSize: false,
		heading4Size: 1.15,
		heading5OverrideSize: false,
		heading5Size: 1.05,
		heading6OverrideSize: false,
		heading6Size: 1,
		cyclingGuideEnabled: false,
		cyclingGuideThickness: "thin",
		cyclingGuideColor: "#888888",
		cyclingGuideFlagSize: "medium",
		cyclingGuideRoundedLines: false,
		cyclingGuideInterval: "medium",
		editorScrollbarThumbColor: "#6b7280",
		editorScrollbarThickness: "thick",
		forgeCompanionIconColor: "#7c3aed",
		recommendHeaderColor: "#7c3aed",
		recommendHeaderMuted: false,
		recommendTabsFontSize: 0.85,
		recommendTabsOverrideFont: false,
		recommendTabsFontFamily: "ibm-plex-sans-var",
		recommendTabsFontWeight: "400",
		recommendTabsColor: "var(--text-muted)",
		recommendTabsMuted: false,
		recommendTabsActiveColor: "var(--text-accent)",
		recommendFocusModeIconColor: "var(--text-muted)",
		recommendChapterTitleFontSize: 1,
		recommendChapterTitleOverrideFont: false,
		recommendChapterTitleFontFamily: "ibm-plex-sans-var",
		recommendChapterTitleFontWeight: "600",
		recommendChapterTitleColor: "var(--text-accent)",
		recommendChapterTitleMuted: false,
		recommendChapterTitleSmallCaps: false,
		recommendDossierHeaderFontSize: 1.15,
		recommendDossierHeaderOverrideFont: false,
		recommendDossierHeaderFontFamily: "ibm-plex-sans-var",
		recommendDossierHeaderFontWeight: "600",
		recommendDossierHeaderColor: "var(--text-accent)",
		recommendDossierHeaderMuted: false,
		recommendDossierHeaderSmallCaps: false,
		recommendNovelTitleFontSize: 1.1,
		recommendNovelTitleOverrideFont: false,
		recommendNovelTitleFontFamily: "ibm-plex-sans-var",
		recommendNovelTitleFontWeight: "600",
		recommendNovelTitleColor: "var(--text-normal)",
		recommendNovelTitleMuted: false,
		recommendNovelTitleSmallCaps: false,
		recommendNovelSubtitleFontSize: 0.9,
		recommendNovelSubtitleOverrideFont: false,
		recommendNovelSubtitleFontFamily: "ibm-plex-sans-var",
		recommendNovelSubtitleFontWeight: "400",
		recommendNovelSubtitleColor: "var(--text-muted)",
		recommendNovelSubtitleMuted: false,
		recommendNovelSubtitleSmallCaps: false,
		recommendPlotChapterFontSize: 1,
		recommendPlotChapterOverrideFont: false,
		recommendPlotChapterFontFamily: "ibm-plex-sans-var",
		recommendPlotChapterFontWeight: "600",
		recommendPlotChapterColor: "var(--text-normal)",
		recommendPlotChapterMuted: false,
		recommendPlotChapterSmallCaps: false,
		recommendSectionTitleFontSize: 0.85,
		recommendSectionTitleOverrideFont: false,
		recommendSectionTitleFontFamily: "ibm-plex-sans-var",
		recommendSectionTitleFontWeight: "600",
		recommendSectionTitleColor: "var(--text-muted)",
		recommendSectionTitleMuted: false,
		recommendSectionTitleSmallCaps: false,
		recommendItemsFontSize: 1,
		recommendItemsOverrideFont: false,
		recommendItemsFontFamily: "ibm-plex-sans-var",
		recommendItemsFontWeight: "400",
		recommendItemsColor: "#c8c8c8",
		recommendItemsMuted: false,
		recommendDetailsFontSize: 0.9,
		recommendDetailsOverrideFont: false,
		recommendDetailsFontFamily: "ibm-plex-sans-var",
		recommendDetailsFontWeight: "400",
		recommendDetailsColor: "var(--text-normal)",
		recommendDetailsMuted: false,
		recommendUnknownColor: "var(--text-muted)",
		recommendUnknownMuted: true,
		recommendUnknownHeaderColor: "var(--background-primary)",
		recommendUnknownHeaderMuted: false,
		recommendCaptureColor: "var(--interactive-accent)",
		recommendCaptureMuted: false,
		recommendCaptureHeaderColor: "var(--text-on-accent)",
		recommendCaptureHeaderMuted: false,
		recommendHoldingColor: "var(--text-warning)",
		recommendHoldingMuted: false,
		recommendHoldingHeaderColor: "var(--background-primary)",
		recommendHoldingHeaderMuted: false,
		recommendResolvedColor: "var(--text-muted)",
		recommendResolvedMuted: true,
		recommendResolvedHeaderColor: "var(--background-primary)",
		recommendResolvedHeaderMuted: false,
		recommendMetaLabelFontSize: 0.9,
		recommendMetaLabelOverrideFont: false,
		recommendMetaLabelFontFamily: "ibm-plex-sans-var",
		recommendMetaLabelFontWeight: "500",
		recommendMetaLabelColor: "var(--text-muted)",
		recommendMetaLabelMuted: false,
		recommendMetaLabelSmallCaps: false,
		recommendMetaControlFontSize: 1,
		recommendMetaControlOverrideFont: false,
		recommendMetaControlFontFamily: "ibm-plex-sans-var",
		recommendMetaControlFontWeight: "400",
		recommendMetaControlColor: "var(--text-normal)",
		recommendMetaControlMuted: false,
		recommendSynopsisFontSize: 1,
		recommendSynopsisOverrideFont: false,
		recommendSynopsisFontFamily: "ibm-plex-sans-var",
		recommendSynopsisFontWeight: "400",
		recommendSynopsisColor: "var(--text-normal)",
		recommendHighlightColor: "#fef3c7",
		recommendHighlightTextColor: "#1f2937",
		recommendUseHeaderColorForAll: false,
		archiveHeaderFontSize: 1,
		archiveHeaderOverrideFont: false,
		archiveHeaderFontFamily: "ibm-plex-sans-var",
		archiveHeaderFontWeight: "600",
		archiveHeaderColor: "#7c3aed",
		archiveHeaderMuted: false,
		archiveHeaderSmallCaps: true,
		archiveItemsFontSize: 1,
		archiveItemsOverrideFont: false,
		archiveItemsFontFamily: "ibm-plex-sans-var",
		archiveItemsFontWeight: "400",
		archiveItemsColor: "#c8c8c8",
		archiveItemsMuted: false,
		archiveHighlightColor: "#fef3c7",
		archiveHighlightTextColor: "#1f2937",
		archiveUseHeaderColorForAll: false,
		// Non-linked keys createHostApi may still touch via other methods:
		selectedNovel: null,
		codexFactSectionByType: { person: "Facts", place: "Facts", populace: "Facts" },
	};
}

function makeFakeDoc(): Document {
	const styles = new Map<string, string>();
	const body = {
		style: {
			setProperty(name: string, value: string) {
				styles.set(name, value);
			},
			removeProperty(name: string) {
				styles.delete(name);
			},
			getPropertyValue(name: string) {
				return styles.get(name) ?? "";
			},
			item(i: number) {
				return [...styles.keys()][i] ?? null;
			},
			get length() {
				return styles.size;
			},
		},
	};
	return { body } as unknown as Document;
}

function makeFakePlugin() {
	let settings: SettingsBag = makeLinkedDefaults();
	let companion: FormatCompanionRegistration | null = null;
	const docs = [makeFakeDoc(), makeFakeDoc()];
	const contributions: Array<{ slot: string; orderHint: number; render: (el: HTMLElement) => () => void }> = [];
	let applyLinkedCalls = 0;
	const styleWrites: Array<Record<string, string | null>> = [];

	const plugin = {
		getSettings: () => settings,
		async updateSetting(key: string, value: unknown) {
			settings[key] = value;
		},
		async updateSettings(partial: Record<string, unknown>) {
			Object.assign(settings, partial);
		},
		applyLinkedFormattingStyles() {
			applyLinkedCalls++;
			companion?.onHostStylesApplied?.();
		},
		applyHostStyleVars(vars: Record<string, string | null>) {
			styleWrites.push({ ...vars });
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
		openStoryForgeInterface() {},
		registerViewContribution(opt: { slot: string; orderHint: number; render: (el: HTMLElement) => () => void }) {
			contributions.push(opt);
			return () => {
				const i = contributions.indexOf(opt);
				if (i >= 0) contributions.splice(i, 1);
			};
		},
		addActiveBookListener() {
			return () => undefined;
		},
		registerHostedRightRailView() {},
		_debug: {
			get applyLinkedCalls() {
				return applyLinkedCalls;
			},
			get styleWrites() {
				return styleWrites;
			},
			get contributions() {
				return contributions;
			},
			get docs() {
				return docs;
			},
		},
	};

	return plugin as unknown as StoryForgePlugin & { _debug: typeof plugin._debug };
}

describe("formatting API stress", () => {
	it("exposes API version 8 with managed presets and batched updates", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		expect(STORYFORGE_API_VERSION).toBe(8);
		expect(api.version).toBe(8);
		expect(api.formatting).toBeDefined();
		expect(api.formatting.version).toBe(8);
		expect(api.formatting.isCompanionActive()).toBe(false);
		expect(api.formatting.updateLinkedSettings).toBeTypeOf("function");
		expect(api.formatting.saveFormattingExport).toBeTypeOf("function");
		expect(api.formatting.listSettingsExports).toBeTypeOf("function");
		expect(api.formatting.readSettingsExport).toBeTypeOf("function");
		expect(api.formatting.saveFormattingPreset).toBeTypeOf("function");
		expect(api.formatting.listFormattingPresets).toBeTypeOf("function");
		expect(api.formatting.readFormattingPreset).toBeTypeOf("function");
		expect(api.formatting.renameFormattingPreset).toBeTypeOf("function");
		expect(api.formatting.deleteFormattingPreset).toBeTypeOf("function");
		expect(api.formatting.openInterfaceModal).toBeTypeOf("function");
	});

	it("registers / replaces / unregisters companions under thrash", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const calls: string[] = [];

		for (let i = 0; i < 50; i++) {
			const id = `companion-${i}`;
			const unreg = api.formatting.registerCompanion({
				pluginId: id,
				version: 1,
				onHostStylesApplied: () => calls.push(id),
			});
			expect(api.formatting.isCompanionActive()).toBe(true);
			expect(api.formatting.getCompanion()?.pluginId).toBe(id);
			if (i % 3 === 0) {
				unreg();
				expect(api.formatting.isCompanionActive()).toBe(false);
			}
		}
		expect(api.formatting.getCompanion()?.pluginId).toBe("companion-49");
		api.formatting.applyLinkedStyles();
		expect(calls.at(-1)).toBe("companion-49");
	});

	it("round-trips every linked formatting key under burst updates", async () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const linked = api.formatting.getLinkedSettings();
		const keys = Object.keys(linked) as SfLinkedFormattingKey[];
		expect(keys.length).toBeGreaterThan(80);

		for (let round = 0; round < 5; round++) {
			for (const key of keys) {
				const current = api.formatting.getLinkedSetting(key);
				const next = nextLinkedValue(key, current, round);
				await api.formatting.updateLinkedSetting(key, next);
				expect(api.formatting.getLinkedSetting(key)).toEqual(next);
			}
		}
		expect(plugin._debug.applyLinkedCalls).toBe(keys.length * 5);
	});

	it("validates a linked batch before one persist and one restyle", async () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const beforeCalls = plugin._debug.applyLinkedCalls;

		await api.formatting.updateLinkedSettings({
			bodyTextOverrideSize: true,
			bodyTextSize: 1.35,
			recommendHeaderColor: "#abcdef",
			editorScrollbarThumbColor: "#112233",
		});
		expect(api.formatting.getLinkedSetting("bodyTextSize")).toBe(1.35);
		expect(api.formatting.getLinkedSetting("recommendHeaderColor")).toBe("#abcdef");
		expect(api.formatting.getLinkedSetting("editorScrollbarThumbColor")).toBe("#112233");
		expect(plugin._debug.applyLinkedCalls).toBe(beforeCalls + 1);

		const snapshot = api.formatting.getLinkedSettings();
		await expect(
			api.formatting.updateLinkedSettings({
				bodyTextSize: 1.7,
				recommendTabsFontWeight: "invalid",
			}),
		).rejects.toThrow("recommendTabsFontWeight");
		expect(api.formatting.getLinkedSettings()).toEqual(snapshot);
		expect(plugin._debug.applyLinkedCalls).toBe(beforeCalls + 1);
	});

	it("rejects unknown linked keys", async () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		await expect(
			api.formatting.updateLinkedSetting("notARealKey" as never, "x"),
		).rejects.toThrow(/not an SF-linked formatting key/);
	});

	it("setStyleVars writes to all style documents under burst", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const docs = api.formatting.getStyleDocuments();
		expect(docs).toHaveLength(2);

		for (let i = 0; i < 200; i++) {
			api.formatting.setStyleVars({
				"--sf-body-color": i % 2 === 0 ? `#${(i % 255).toString(16).padStart(2, "0")}0000` : null,
				"--sf-h1-size": `${1 + (i % 10) * 0.1}em`,
			});
		}
		expect(plugin._debug.styleWrites).toHaveLength(200);
		expect(docs[0].body.style.getPropertyValue("--sf-h1-size")).toBe("1.9em");
		expect(docs[0].body.style.getPropertyValue("--sf-body-color")).toBe("");
	});

	it("palette update persists through linked settings", async () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		await api.formatting.updatePalette({
			name: "Custom",
			variant: "",
			customColors: [
				{ name: "Ink", hex: "#111111" },
				{ name: "Paper", hex: "#f5f5f5" },
			],
		});
		const palette = api.formatting.getPalette();
		expect(palette.name).toBe("Custom");
		expect(palette.customColors).toHaveLength(2);
		expect(palette.customColors[0].hex).toBe("#111111");
	});

	it("rejects invalid palette updates", async () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		await expect(
			api.formatting.updatePalette({ name: "NotARealPalette" as never }),
		).rejects.toThrow("colorPaletteName");
		await expect(
			api.formatting.updatePalette({
				customColors: [{ name: "Ink", hex: 12 as never }],
			}),
		).rejects.toThrow("customPaletteColors");
	});

	it("view contributions accumulate and dispose cleanly", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const disposers: Array<() => void> = [];
		for (let i = 0; i < 30; i++) {
			disposers.push(
				api.formatting.registerViewContribution({
					slot: i % 2 === 0 ? "storyforge-panel" : "other",
					orderHint: 100 - i,
					render: () => () => undefined,
				}),
			);
		}
		expect(plugin._debug.contributions).toHaveLength(30);
		for (const d of disposers) d();
		expect(plugin._debug.contributions).toHaveLength(0);
	});

	it("companion resolveFont + registerFaces survive host restyle storms", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const resolve = vi.fn((id: string, w: number) => ({ family: `"${id}"`, variation: `"wght" ${w}` }));
		const registerFaces = vi.fn();
		const onApplied = vi.fn();

		api.formatting.registerCompanion({
			pluginId: "formatforge",
			version: 1,
			resolveFont: resolve,
			registerFacesForDocument: registerFaces,
			onHostStylesApplied: onApplied,
		});

		for (let i = 0; i < 100; i++) {
			api.formatting.applyLinkedStyles();
		}
		expect(onApplied).toHaveBeenCalledTimes(100);

		const companion = api.formatting.getCompanion();
		expect(companion?.resolveFont?.("nunito", 700)).toEqual({ family: `"nunito"`, variation: `"wght" 700` });
		companion?.registerFacesForDocument?.(api.formatting.getStyleDocuments()[0]);
		expect(registerFaces).toHaveBeenCalledTimes(1);
	});

	it("getLinkedSettings returns every key from the fake defaults bag", () => {
		const plugin = makeFakePlugin();
		const api = createHostApi(plugin);
		const linked = api.formatting.getLinkedSettings();
		const defaults = makeLinkedDefaults();
		for (const key of Object.keys(linked)) {
			expect(key in defaults).toBe(true);
		}
	});
});
