import type { App } from "obsidian";
import {
	isPlotThreadColor,
	MAIN_THREAD_FALLBACK_COLOR,
	MAIN_THREAD_ID,
	MAIN_THREAD_LABEL,
	parsePlotThreads,
	readPlotThreads,
	replacePlotThreads,
	type PlotThread,
} from "./plotThreads";
import { mintId } from "./slug";

export const PLOT_THREADS_EXPORT_FORMAT = "storyforge-plot-threads" as const;
export const PLOT_THREADS_EXPORT_VERSION = 1 as const;
export const SECONDARY_THREAD_LABEL = "secondary threads";
export const DEFAULT_NEW_THREAD_LABEL = "new plot thread";

export type PlotThreadsApplyMode = "replace" | "add";

export interface PlotThreadsExportSelection {
	colours: boolean;
	names: boolean;
}

export interface PlotThreadsExportDocument {
	format: typeof PLOT_THREADS_EXPORT_FORMAT;
	version: typeof PLOT_THREADS_EXPORT_VERSION;
	exportedAt: string;
	description?: string;
	included: PlotThreadsExportSelection;
	threads: PlotThread[];
}

export function hasPlotThreadsSelection(included: PlotThreadsExportSelection): boolean {
	return included.colours || included.names;
}

function parseExportedThread(value: unknown): PlotThread | null {
	if (!value || typeof value !== "object") return null;
	const entry = value as Record<string, unknown>;
	const id = typeof entry.id === "string" ? entry.id.trim() : "";
	if (!id) return null;
	const colorRaw = entry.color;
	if (!isPlotThreadColor(colorRaw)) return null;
	const label = typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : id;
	const textRaw = entry.textColor ?? entry["text-color"];
	const thread: PlotThread = { id, label, color: colorRaw };
	if (isPlotThreadColor(textRaw)) thread.textColor = textRaw;
	if (entry.use === false) thread.use = false;
	return thread;
}

function includedFlag(raw: unknown, fallback: boolean): boolean {
	if (raw === false) return false;
	if (raw === true) return true;
	return fallback;
}

function primaryThread(threads: PlotThread[]): PlotThread | undefined {
	return threads.find((thread) => thread.id === MAIN_THREAD_ID) ?? threads[0];
}

export function applyPlotThreadsExportSelection(
	threads: PlotThread[],
	included: PlotThreadsExportSelection,
): PlotThread[] {
	const primary = primaryThread(threads);
	const primaryColor = primary?.color ?? MAIN_THREAD_FALLBACK_COLOR;
	const primaryText = primary?.textColor;
	return threads.map((thread) => {
		const isPrimary = primary ? thread.id === primary.id : false;
		const next: PlotThread = { ...thread };
		if (!included.names) {
			next.label = isPrimary ? MAIN_THREAD_LABEL : SECONDARY_THREAD_LABEL;
		}
		if (!included.colours) {
			next.color = primaryColor;
			if (primaryText) next.textColor = primaryText;
			else delete next.textColor;
		}
		return next;
	});
}

/** Builds a portable plot-threads document from the live registry. */
export function buildPlotThreadsExport(
	threads: PlotThread[],
	exportedAt: Date = new Date(),
	options: {
		description?: string;
		included?: Partial<PlotThreadsExportSelection>;
	} = {},
): PlotThreadsExportDocument {
	const included: PlotThreadsExportSelection = {
		colours: options.included?.colours ?? true,
		names: options.included?.names ?? true,
	};
	const description = options.description?.trim();
	return {
		format: PLOT_THREADS_EXPORT_FORMAT,
		version: PLOT_THREADS_EXPORT_VERSION,
		exportedAt: exportedAt.toISOString(),
		...(description ? { description } : {}),
		included,
		threads: applyPlotThreadsExportSelection(threads, included).map((thread) => ({ ...thread })),
	};
}

export function stringifyPlotThreadsExport(document: PlotThreadsExportDocument): string {
	return `${JSON.stringify(document, null, 2)}\n`;
}

export function parsePlotThreadsExport(raw: string): PlotThreadsExportDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("Plot threads JSON is not valid");
	}
	if (!parsed || typeof parsed !== "object") throw new Error("Plot threads JSON is not an object");
	const value = parsed as Record<string, unknown>;
	if (value.format !== PLOT_THREADS_EXPORT_FORMAT) {
		throw new Error("JSON is not a storyForge plot threads export");
	}
	const fromList = Array.isArray(value.threads) ? value.threads : null;
	const threads: PlotThread[] = [];
	if (fromList) {
		for (const item of fromList) {
			const parsedThread = parseExportedThread(item);
			if (parsedThread) threads.push(parsedThread);
		}
	} else {
		threads.push(...parsePlotThreads(value["plot-threads"]));
	}
	const description = typeof value.description === "string" ? value.description.trim() : "";
	const exportedAt =
		typeof value.exportedAt === "string" && value.exportedAt
			? value.exportedAt
			: new Date().toISOString();
	const includedRaw =
		value.included && typeof value.included === "object"
			? (value.included as Record<string, unknown>)
			: {};
	const included: PlotThreadsExportSelection = {
		colours: includedFlag(includedRaw.colours ?? includedRaw.colors, true),
		names: includedFlag(includedRaw.names, true),
	};
	return {
		format: PLOT_THREADS_EXPORT_FORMAT,
		version: PLOT_THREADS_EXPORT_VERSION,
		exportedAt,
		...(description ? { description } : {}),
		included,
		threads,
	};
}

/** True when the live list has any thread besides the seeded main thread. */
export function isPlotThreadsListPopulated(threads: PlotThread[]): boolean {
	return threads.some((thread) => thread.id !== MAIN_THREAD_ID);
}

export function isFullPlotThreadsImport(included: PlotThreadsExportSelection): boolean {
	return included.colours && included.names;
}

function overlayPartialThread(
	current: PlotThread,
	incoming: PlotThread,
	included: PlotThreadsExportSelection,
): PlotThread {
	const next: PlotThread = { ...current };
	if (included.names) next.label = incoming.label;
	if (included.colours) {
		next.color = incoming.color;
		if (incoming.textColor) next.textColor = incoming.textColor;
		else delete next.textColor;
	}
	return next;
}

function equaliseImportedThread(incoming: PlotThread, included: PlotThreadsExportSelection): PlotThread {
	const next: PlotThread = { ...incoming };
	if (!included.names) next.label = DEFAULT_NEW_THREAD_LABEL;
	if (!included.colours) {
		next.color = MAIN_THREAD_FALLBACK_COLOR;
		delete next.textColor;
	}
	return next;
}

function withUniqueId(thread: PlotThread, usedIds: string[]): PlotThread {
	if (thread.id && thread.id !== MAIN_THREAD_ID && !usedIds.includes(thread.id)) return thread;
	return { ...thread, id: mintId(thread.label, usedIds) };
}

/** Merges an imported plot-threads document into the live list.
 * Replace + both colours and names uses the import as-is.
 * Partial replace overlays names or colours in list order and fills extra rows with defaults.
 * Add appends imported threads (except a second main thread) after the live list. */
export function mergePlotThreadsImport(
	current: PlotThread[],
	incoming: PlotThread[],
	included: PlotThreadsExportSelection,
	mode: PlotThreadsApplyMode,
): PlotThread[] {
	if (mode === "add") {
		const extras: PlotThread[] = [];
		const usedIds = () => [...current.map((thread) => thread.id), ...extras.map((thread) => thread.id)];
		for (const thread of incoming) {
			if (thread.id === MAIN_THREAD_ID) continue;
			extras.push(withUniqueId(equaliseImportedThread(thread, included), usedIds()));
		}
		return [...current, ...extras];
	}

	if (isFullPlotThreadsImport(included)) {
		return incoming.map((thread) => ({ ...thread }));
	}

	const length = Math.max(current.length, incoming.length);
	const result: PlotThread[] = [];
	for (let index = 0; index < length; index++) {
		const have = current[index];
		const src = incoming[index];
		if (have && src) {
			result.push(overlayPartialThread(have, src, included));
			continue;
		}
		if (have) {
			result.push({ ...have });
			continue;
		}
		if (src) {
			const usedIds = result.map((thread) => thread.id);
			result.push(withUniqueId(equaliseImportedThread(src, included), usedIds));
		}
	}
	return result;
}

export async function applyPlotThreadsDocument(
	app: App,
	document: PlotThreadsExportDocument,
	mode: PlotThreadsApplyMode = "replace",
): Promise<PlotThread[]> {
	const current = readPlotThreads(app);
	const merged = mergePlotThreadsImport(current, document.threads, document.included, mode);
	const { entries } = await replacePlotThreads(app, merged);
	return entries;
}

export function livePlotThreadsDocument(
	app: App,
	exportedAt: Date = new Date(),
	options: { description?: string; included?: Partial<PlotThreadsExportSelection> } = {},
): PlotThreadsExportDocument {
	return buildPlotThreadsExport(readPlotThreads(app), exportedAt, options);
}
