import type StoryForgePlugin from "./main";
import type { StoryForgePluginSettings } from "./main";
import { PREFERENCE_SESSION_KEYS } from "./preferencesExport";
import {
	applyPlotThreadsDocument,
	buildPlotThreadsExport,
	DEFAULT_NEW_THREAD_LABEL,
	parsePlotThreadsExport,
	PLOT_THREADS_EXPORT_FORMAT,
	stringifyPlotThreadsExport,
	type PlotThreadsExportDocument,
} from "./plotThreadsExport";
import { MAIN_THREAD_ID, MAIN_THREAD_LABEL, readPlotThreads, type PlotThread } from "./plotThreads";
import {
	applyTypesTagsDocument,
	buildTypesTagsExport,
	parseTypesTagsExport,
	stringifyTypesTagsExport,
	TYPES_TAGS_EXPORT_FORMAT,
	type TypesTagsExportDocument,
} from "./typesTagsExport";
import { readTagRegistry, type TagDefinition, type TagRegistryShape } from "./tagRegistry";
import { readVaultTags, type VaultTagsShape } from "./vaultTags";
import {
	DEFAULT_TITLEFORGE_SETTINGS,
	type TitleForgeSettings,
	type TitleForgeTab,
	type TitleForgeScope,
} from "./titleforge/settings";
import type { SeriesStrategy } from "./titleforge/engine/types";

export const COMPLETE_EXPORT_FORMAT = "storyforge-complete" as const;
export const COMPLETE_EXPORT_VERSION = 1 as const;

export interface CompleteExportDocument {
	format: typeof COMPLETE_EXPORT_FORMAT;
	version: typeof COMPLETE_EXPORT_VERSION;
	exportedAt: string;
	description?: string;
	template: boolean;
	settings: Record<string, unknown>;
	types: TagDefinition[];
	codexTags?: VaultTagsShape;
	chapterTags: TagDefinition[];
	novelTags: TagDefinition[];
	threads: PlotThread[];
	titleforge: TitleForgeSettings | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

const TITLEFORGE_TABS: TitleForgeTab[] = ["series", "webFiction", "novels", "kept"];
const TITLEFORGE_SCOPES: TitleForgeScope[] = ["all", "series", "novels"];
const SERIES_STRATEGIES: SeriesStrategy[] = ["echo", "anchor", "free"];

function parseTitleForgeSettings(raw: unknown): TitleForgeSettings {
	const source = isRecord(raw) ? raw : {};
	const lastTabByScope = { ...DEFAULT_TITLEFORGE_SETTINGS.lastTabByScope };
	if (isRecord(source.lastTabByScope)) {
		for (const scope of TITLEFORGE_SCOPES) {
			const tab = source.lastTabByScope[scope];
			if (typeof tab === "string" && TITLEFORGE_TABS.includes(tab as TitleForgeTab)) {
				lastTabByScope[scope] = tab as TitleForgeTab;
			}
		}
	}
	const strategy =
		typeof source.seriesStrategy === "string" && SERIES_STRATEGIES.includes(source.seriesStrategy as SeriesStrategy)
			? (source.seriesStrategy as SeriesStrategy)
			: DEFAULT_TITLEFORGE_SETTINGS.seriesStrategy;
	return {
		lastGenre: typeof source.lastGenre === "string" ? source.lastGenre : DEFAULT_TITLEFORGE_SETTINGS.lastGenre,
		lastFamily: typeof source.lastFamily === "string" ? source.lastFamily : DEFAULT_TITLEFORGE_SETTINGS.lastFamily,
		lastPlatform: typeof source.lastPlatform === "string" ? source.lastPlatform : DEFAULT_TITLEFORGE_SETTINGS.lastPlatform,
		seriesMode: typeof source.seriesMode === "boolean" ? source.seriesMode : DEFAULT_TITLEFORGE_SETTINGS.seriesMode,
		seriesStrategy: strategy,
		seriesVolumes:
			typeof source.seriesVolumes === "number" && Number.isFinite(source.seriesVolumes)
				? source.seriesVolumes
				: DEFAULT_TITLEFORGE_SETTINGS.seriesVolumes,
		lastTabByScope,
		lastQuantity:
			typeof source.lastQuantity === "number" && Number.isFinite(source.lastQuantity)
				? source.lastQuantity
				: DEFAULT_TITLEFORGE_SETTINGS.lastQuantity,
	};
}

function templatizePlotThreads(threads: PlotThread[]): PlotThread[] {
	return threads.map((thread) => ({
		...thread,
		label: thread.id === MAIN_THREAD_ID ? MAIN_THREAD_LABEL : DEFAULT_NEW_THREAD_LABEL,
		use: false,
	}));
}

export function prepareCompleteDocument(document: CompleteExportDocument): CompleteExportDocument {
	if (!document.template) return document;
	const settings = { ...document.settings };
	for (const key of PREFERENCE_SESSION_KEYS) delete settings[key];
	return {
		...document,
		settings,
		threads: templatizePlotThreads(document.threads),
		titleforge: null,
	};
}

function typesTagsDocumentFromComplete(
	document: CompleteExportDocument,
): TypesTagsExportDocument {
	return parseTypesTagsExport(
		stringifyTypesTagsExport({
			format: TYPES_TAGS_EXPORT_FORMAT,
			version: 1,
			exportedAt: document.exportedAt,
			included: {
				types: true,
				codexTags: document.codexTags != null,
				chapterTags: true,
				novelTags: true,
			},
			types: document.types,
			codexTags: document.codexTags ?? null,
			chapterTags: document.chapterTags,
			novelTags: document.novelTags,
		}),
	);
}

function threadsDocumentFromComplete(document: CompleteExportDocument): PlotThreadsExportDocument {
	return parsePlotThreadsExport(
		stringifyPlotThreadsExport({
			format: PLOT_THREADS_EXPORT_FORMAT,
			version: 1,
			exportedAt: document.exportedAt,
			included: { colours: true, names: true },
			threads: document.threads,
		}),
	);
}

export function buildCompleteExport(
	input: {
		settings: StoryForgePluginSettings;
		registry: TagRegistryShape;
		vaultTags?: VaultTagsShape;
		threads: PlotThread[];
		titleforge: TitleForgeSettings;
		formatting?: Record<string, unknown> | null;
	},
	exportedAt: Date = new Date(),
	options: { description?: string; template?: boolean } = {},
): CompleteExportDocument {
	const typesTags = buildTypesTagsExport(input.registry, exportedAt, {
		vaultTags: input.vaultTags,
	});
	const threads = buildPlotThreadsExport(input.threads, exportedAt);
	const description = options.description?.trim();
	const settings = cloneJson(input.settings as unknown as Record<string, unknown>);
	if (input.formatting) Object.assign(settings, cloneJson(input.formatting));
	const document: CompleteExportDocument = {
		format: COMPLETE_EXPORT_FORMAT,
		version: COMPLETE_EXPORT_VERSION,
		exportedAt: exportedAt.toISOString(),
		...(description ? { description } : {}),
		template: options.template === true,
		settings,
		types: typesTags.types ?? [],
		codexTags: typesTags.codexTags ?? { order: [], tags: [] },
		chapterTags: typesTags.chapterTags ?? [],
		novelTags: typesTags.novelTags ?? [],
		threads: threads.threads,
		titleforge: cloneJson(input.titleforge),
	};
	return prepareCompleteDocument(document);
}

export function liveCompleteExport(
	plugin: StoryForgePlugin,
	exportedAt: Date = new Date(),
	options: { description?: string; template?: boolean } = {},
): CompleteExportDocument {
	let formatting: Record<string, unknown> | null = null;
	try {
		formatting = plugin.getFormatCompanion()?.exportLocalSettings?.() ?? null;
	} catch {
		formatting = null;
	}
	return buildCompleteExport(
		{
			settings: plugin.getSettings(),
			registry: readTagRegistry(plugin.app),
			vaultTags: readVaultTags(plugin.app),
			threads: readPlotThreads(plugin.app),
			titleforge: plugin.titleForge.settings,
			formatting,
		},
		exportedAt,
		options,
	);
}

export function stringifyCompleteExport(document: CompleteExportDocument): string {
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseCompleteExport(raw: string): CompleteExportDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Complete JSON is not valid");
	}
	if (!isRecord(parsed)) throw new Error("Complete JSON is not an object");
	if (parsed.format !== COMPLETE_EXPORT_FORMAT) {
		throw new Error("JSON is not a storyForge complete export");
	}
	if (!isRecord(parsed.settings)) throw new Error("The settings section is invalid");
	const exportedAt =
		typeof parsed.exportedAt === "string" && parsed.exportedAt
			? parsed.exportedAt
			: new Date().toISOString();
	const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
	const typesTags = parseTypesTagsExport(
		stringifyTypesTagsExport({
			format: TYPES_TAGS_EXPORT_FORMAT,
			version: 1,
			exportedAt,
			included: {
				types: true,
				codexTags: parsed.codexTags != null,
				chapterTags: true,
				novelTags: true,
			},
			types: Array.isArray(parsed.types) ? (parsed.types as TagDefinition[]) : [],
			codexTags: (parsed.codexTags as VaultTagsShape | null) ?? null,
			chapterTags: Array.isArray(parsed.chapterTags) ? (parsed.chapterTags as TagDefinition[]) : [],
			novelTags: Array.isArray(parsed.novelTags) ? (parsed.novelTags as TagDefinition[]) : [],
		}),
	);
	const threads = parsePlotThreadsExport(
		stringifyPlotThreadsExport({
			format: PLOT_THREADS_EXPORT_FORMAT,
			version: 1,
			exportedAt,
			included: { colours: true, names: true },
			threads: Array.isArray(parsed.threads) ? (parsed.threads as PlotThread[]) : [],
		}),
	);
	return {
		format: COMPLETE_EXPORT_FORMAT,
		version: COMPLETE_EXPORT_VERSION,
		exportedAt,
		...(description ? { description } : {}),
		template: parsed.template === true,
		settings: { ...parsed.settings },
		types: typesTags.types ?? [],
		...(typesTags.codexTags ? { codexTags: typesTags.codexTags } : {}),
		chapterTags: typesTags.chapterTags ?? [],
		novelTags: typesTags.novelTags ?? [],
		threads: threads.threads,
		titleforge: parsed.titleforge == null ? null : parseTitleForgeSettings(parsed.titleforge),
	};
}

export async function applyCompleteExport(
	plugin: StoryForgePlugin,
	document: CompleteExportDocument,
): Promise<void> {
	const prepared = prepareCompleteDocument(document);
	await plugin.importSettings(prepared.settings);
	const companion = plugin.getFormatCompanion();
	if (companion?.importLocalSettings) {
		await companion.importLocalSettings(prepared.settings);
	}
	await applyTypesTagsDocument(plugin.app, typesTagsDocumentFromComplete(prepared), {
		types: true,
		codexTags: prepared.codexTags != null,
		chapterTags: true,
		novelTags: true,
	});
	await applyPlotThreadsDocument(plugin.app, threadsDocumentFromComplete(prepared), "replace");
	if (prepared.titleforge) {
		plugin.titleForge.settings = parseTitleForgeSettings(prepared.titleforge);
		await plugin.titleForge.saveSettings();
	}
	plugin.refreshStoryForgeViews();
	plugin.refreshNovelOverviewView();
}

export function completePreviewCounts(document: CompleteExportDocument): Array<{ label: string; count: string }> {
	const rows: Array<{ label: string; count: string }> = [
		{ label: document.template ? "template" : "complete", count: `${Object.keys(document.settings).length} settings` },
		{ label: "types", count: `${document.types.length} settings` },
		{ label: "codex tags", count: `${document.codexTags?.tags.length ?? 0} settings` },
		{ label: "chapter tags", count: `${document.chapterTags.length} settings` },
		{ label: "novel tags", count: `${document.novelTags.length} settings` },
		{ label: "threads", count: `${document.threads.length} settings` },
	];
	if (document.titleforge) {
		rows.push({ label: "titleforge", count: `${Object.keys(document.titleforge).length} settings` });
	}
	return rows;
}
