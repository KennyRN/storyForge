import { describe, expect, it } from "vitest";
import {
	buildCompleteExport,
	COMPLETE_EXPORT_FORMAT,
	completePreviewCounts,
	parseCompleteExport,
	stringifyCompleteExport,
} from "../completeExport";
import { DEFAULT_NEW_THREAD_LABEL } from "../plotThreadsExport";
import { MAIN_THREAD_ID, MAIN_THREAD_LABEL, type PlotThread } from "../plotThreads";
import type { TagRegistryShape } from "../tagRegistry";
import { DEFAULT_TITLEFORGE_SETTINGS } from "../titleforge/settings";
import type { StoryForgePluginSettings } from "../main";

const settings = {
	layout: "hybrid",
	hideHelp: true,
	librarySeriesTitleFontSize: 22,
	colorPaletteName: "Custom",
	selectedNovel: "book-one",
	selectedObject: "codex/person.md",
	collapsedCodexFolderIds: ["places"],
	collapsedPlotChapterKeys: ["book-one/ch1.md"],
	lastAutomaticBackupAt: 123,
	storyContextShellApplied: true,
	welcomeNoteCreatedOnOnboarding: false,
	automaticBackupEnabled: true,
} as unknown as StoryForgePluginSettings;

const registry: TagRegistryShape = {
	codexTypes: [{ id: "person", label: "Person", iconAlias: "person-fill" }],
	chapterTags: [{ id: "draft", label: "Draft", iconAlias: "pencil" }],
	novelTags: [{ id: "editing", label: "Editing", iconAlias: "warning-square" }],
	ideaTypes: [],
	archiveTypes: [],
};

const threads: PlotThread[] = [
	{ id: MAIN_THREAD_ID, label: "main thread", color: "#f59e0b", textColor: "#111111" },
	{ id: "romance", label: "Romance", color: "#4a90d9", textColor: "#ffffff" },
];

describe("complete export", () => {
	it("round-trips every bundled section in one settings bag", () => {
		const document = buildCompleteExport(
			{
				settings,
				registry,
				threads,
				titleforge: DEFAULT_TITLEFORGE_SETTINGS,
				formatting: { bodyTextFontFamily: "ibm-plex-sans-var", codeSize: 1.1 },
			},
			new Date("2026-08-29T12:00:00.000Z"),
			{ description: "roman complete" },
		);
		expect(document.format).toBe(COMPLETE_EXPORT_FORMAT);
		expect(document.template).toBe(false);
		expect(document.description).toBe("roman complete");
		expect(document.settings.layout).toBe("hybrid");
		expect(document.settings.selectedNovel).toBe("book-one");
		expect(document.settings.bodyTextFontFamily).toBe("ibm-plex-sans-var");
		expect(document.settings.codeSize).toBe(1.1);
		expect(document.types).toEqual(registry.codexTypes);
		expect(document.codexTags).toEqual({ order: [], tags: [] });
		expect(document.chapterTags).toEqual(registry.chapterTags);
		expect(document.novelTags).toEqual(registry.novelTags);
		expect(document.threads.map((thread) => thread.label)).toEqual(["main thread", "Romance"]);
		expect(document.titleforge?.seriesStrategy).toBe("echo");

		const parsed = parseCompleteExport(stringifyCompleteExport(document));
		expect(parsed).toEqual(document);
	});

	it("round-trips vault #tag config as codex tags", () => {
		const vaultTags = {
			order: ["hero"],
			tags: [{ id: "hero", iconAlias: "person-fill", display: true, notesDisplay: false, pageOrder: ["Codex/Jane.md"] }],
		};
		const document = buildCompleteExport(
			{
				settings,
				registry,
				vaultTags,
				threads,
				titleforge: DEFAULT_TITLEFORGE_SETTINGS,
			},
			new Date("2026-08-29T12:00:00.000Z"),
		);
		expect(document.codexTags).toEqual(vaultTags);
		expect(parseCompleteExport(stringifyCompleteExport(document)).codexTags).toEqual(vaultTags);
		expect(completePreviewCounts(document).find((row) => row.label === "codex tags")?.count).toBe("1 settings");
	});

	it("does not invent codex tags when a legacy complete file omits them", () => {
		const parsed = parseCompleteExport(
			JSON.stringify({
				format: COMPLETE_EXPORT_FORMAT,
				version: 1,
				exportedAt: "2026-08-29T12:00:00.000Z",
				template: false,
				settings: { layout: "hybrid" },
				types: [],
				chapterTags: [],
				novelTags: [],
				threads: [],
				titleforge: null,
			}),
		);
		expect(parsed.codexTags).toBeUndefined();
	});

	it("strips template-only fields while keeping colours and formatForge keys", () => {
		const document = buildCompleteExport(
			{
				settings,
				registry,
				threads,
				titleforge: DEFAULT_TITLEFORGE_SETTINGS,
				formatting: { bodyTextFontFamily: "courier-prime" },
			},
			new Date("2026-08-29T12:00:00.000Z"),
			{ template: true },
		);
		expect(document.template).toBe(true);
		expect(document.titleforge).toBeNull();
		expect(document.settings.layout).toBe("hybrid");
		expect(document.settings.bodyTextFontFamily).toBe("courier-prime");
		expect(document.settings.selectedNovel).toBeUndefined();
		expect(document.settings.selectedObject).toBeUndefined();
		expect(document.settings.collapsedCodexFolderIds).toBeUndefined();
		expect(document.settings.collapsedPlotChapterKeys).toBeUndefined();
		expect(document.settings.lastAutomaticBackupAt).toBeUndefined();
		expect(document.settings.storyContextShellApplied).toBeUndefined();
		expect(document.threads).toEqual([
			{
				id: MAIN_THREAD_ID,
				label: MAIN_THREAD_LABEL,
				color: "#f59e0b",
				textColor: "#111111",
				use: false,
			},
			{
				id: "romance",
				label: DEFAULT_NEW_THREAD_LABEL,
				color: "#4a90d9",
				textColor: "#ffffff",
				use: false,
			},
		]);
	});

	it("rejects JSON that is not a complete export", () => {
		expect(() => parseCompleteExport("{")).toThrow("not valid");
		expect(() => parseCompleteExport(JSON.stringify({ format: "storyforge-preferences" }))).toThrow(
			"complete export",
		);
	});

	it("labels every preview count as settings", () => {
		const document = buildCompleteExport(
			{
				settings,
				registry,
				threads,
				titleforge: DEFAULT_TITLEFORGE_SETTINGS,
			},
			new Date("2026-08-29T12:00:00.000Z"),
		);
		expect(completePreviewCounts(document).map((row) => row.count)).toEqual([
			`${Object.keys(document.settings).length} settings`,
			"1 settings",
			"0 settings",
			"1 settings",
			"1 settings",
			"2 settings",
			`${Object.keys(document.titleforge ?? {}).length} settings`,
		]);
	});
});
