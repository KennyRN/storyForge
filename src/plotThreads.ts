import { App, type FrontMatterCache } from "obsidian";
import { plotThreadsFilePath } from "./paths";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { mintId } from "./slug";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** Always-present default thread — unassigned chapters belong to it, and it cannot be deleted. */
export const MAIN_THREAD_ID = "main-thread";
export const MAIN_THREAD_LABEL = "main thread";
/** Used when the live palette isn't available yet (file seed / ensure before settings resolve).
 * Amber is a mid-tone — visible on both light and dark chrome — matching defaultSeriesPlotThreadColor's
 * "not an extreme" rule. The live default is a single series-wide colour (plot-threads.md), never
 * a per-novel book accent. */
export const MAIN_THREAD_FALLBACK_COLOR = "#f59e0b";

export function isPlotThreadColor(value: unknown): value is string {
	return typeof value === "string" && HEX_COLOR_RE.test(value);
}

/** One named plot thread — a colour from the live palette plus a label. Chapters pick a thread
 * (ChapterTitleModal) rather than an anonymous colour; the Novel panel's plot-line gutter is one
 * line per thread in use, not one line per distinct hex. */
export interface PlotThread {
	/** Slug id, minted from `label` when created. Stable once created — this is what per-chapter
	 * assignments store (`plot-thread` on the novel.md chapters map). */
	id: string;
	label: string;
	/** `#rrggbb` from the plugin's colour palette. */
	color: string;
	/** `#rrggbb` for text drawn on `color`. Omitted on older files — callers contrast-resolve. */
	textColor?: string;
}

export function seedMainThread(color: string = MAIN_THREAD_FALLBACK_COLOR, textColor?: string): PlotThread {
	const thread: PlotThread = {
		id: MAIN_THREAD_ID,
		label: MAIN_THREAD_LABEL,
		color: isPlotThreadColor(color) ? color : MAIN_THREAD_FALLBACK_COLOR,
	};
	if (textColor && isPlotThreadColor(textColor)) thread.textColor = textColor;
	return thread;
}

interface RawPlotThread {
	id?: unknown;
	label?: unknown;
	color?: unknown;
	textColor?: unknown;
}

/** The raw, dash-cased on-disk shape of plot-threads.md's frontmatter. */
export interface RawPlotThreadsFrontmatter extends FrontMatterCache {
	"plot-threads"?: unknown;
}

export const DEFAULT_PLOT_THREADS_CONTENT = `---\nplot-threads: []\n---\n`;

function toRaw(entry: PlotThread): { id: string; label: string; color: string; textColor?: string } {
	const raw: { id: string; label: string; color: string; textColor?: string } = {
		id: entry.id,
		label: entry.label,
		color: entry.color,
	};
	if (entry.textColor) raw.textColor = entry.textColor;
	return raw;
}

function parsePlotThreads(raw: unknown): PlotThread[] {
	if (!Array.isArray(raw)) return [];
	const result: PlotThread[] = [];
	for (const value of raw) {
		if (!value || typeof value !== "object") continue;
		const entry = value as RawPlotThread;
		const id = typeof entry.id === "string" ? entry.id : null;
		if (!id) continue;
		if (!isPlotThreadColor(entry.color)) continue;
		const label = typeof entry.label === "string" ? entry.label : id;
		const parsed: PlotThread = { id, label, color: entry.color };
		if (isPlotThreadColor(entry.textColor)) parsed.textColor = entry.textColor;
		result.push(parsed);
	}
	return result;
}

function withMainThread(entries: PlotThread[], color: string = MAIN_THREAD_FALLBACK_COLOR, textColor?: string): PlotThread[] {
	if (entries.some((t) => t.id === MAIN_THREAD_ID)) return entries;
	return [seedMainThread(color, textColor), ...entries];
}

export function readPlotThreads(app: App): PlotThread[] {
	const path = plotThreadsFilePath();
	const file = app.vault.getAbstractFileByPath(path);
	if (!file) return [seedMainThread()];
	const cache = app.metadataCache.getCache(path);
	return withMainThread(parsePlotThreads(cache?.frontmatter?.["plot-threads"]));
}

export function getPlotThread(app: App, id: string): PlotThread | null {
	return readPlotThreads(app).find((t) => t.id === id) ?? null;
}

/** Idempotent: creates plot-threads.md seeded with "main thread" if it doesn't exist yet, and
 * inserts that default into an existing file that's missing it (e.g. the empty list from the first
 * plot-thread rollout). Returns the file's resulting contents — computed from the write rather
 * than a metadataCache re-read (same hazard tagRegistry.ts's ensureTagRegistryFile documents). */
export async function ensurePlotThreadsFile(
	app: App,
	defaultColor?: string,
	defaultTextColor?: string,
): Promise<PlotThread[]> {
	const path = plotThreadsFilePath();
	if (app.vault.getAbstractFileByPath(path)) {
		const current = parsePlotThreads(app.metadataCache.getCache(path)?.frontmatter?.["plot-threads"]);
		if (current.some((t) => t.id === MAIN_THREAD_ID)) return current;
	}
	const seed = seedMainThread(defaultColor, defaultTextColor);
	return mutatePlotThreads(app, (entries) => withMainThread(entries, seed.color, seed.textColor));
}

/**
 * Returns the freshly-written entries (the same array used to build the frontmatter) rather than
 * void — callers that need to reflect the mutation back into their own UI immediately
 * (PlotThreadRegistryModal, ChapterTitleModal) should use this return value instead of turning
 * around and calling readPlotThreads() again: `app.metadataCache` doesn't update synchronously
 * with `processFrontMatter` in real Obsidian.
 */
async function mutatePlotThreads(app: App, mutate: (entries: PlotThread[]) => PlotThread[]): Promise<PlotThread[]> {
	const path = plotThreadsFilePath();
	let result: PlotThread[] = [];
	await modifyBackstageFrontmatter<RawPlotThreadsFrontmatter>(
		app,
		app.vault,
		path,
		DEFAULT_PLOT_THREADS_CONTENT,
		(fm) => {
			const next = withMainThread(mutate(parsePlotThreads(fm["plot-threads"])));
			result = next;
			fm["plot-threads"] = next.map(toRaw);
		},
	);
	return result;
}

export interface PlotThreadMutationResult {
	entries: PlotThread[];
}

export async function addPlotThread(
	app: App,
	label: string,
	color: string,
	textColor?: string,
): Promise<{ id: string } & PlotThreadMutationResult> {
	const trimmed = label.trim();
	if (!trimmed) throw new Error("addPlotThread: label is required");
	if (!isPlotThreadColor(color)) throw new Error("addPlotThread: colour must be #rrggbb");
	if (textColor !== undefined && !isPlotThreadColor(textColor)) throw new Error("addPlotThread: text colour must be #rrggbb");
	let newId = "";
	const entries = await mutatePlotThreads(app, (current) => {
		newId = mintId(trimmed, current.map((e) => e.id));
		const next: PlotThread = { id: newId, label: trimmed, color };
		if (textColor) next.textColor = textColor;
		return [...current, next];
	});
	return { id: newId, entries };
}

export async function renamePlotThread(app: App, id: string, newLabel: string): Promise<PlotThreadMutationResult> {
	const trimmed = newLabel.trim();
	if (!trimmed) throw new Error("renamePlotThread: label is required");
	const entries = await mutatePlotThreads(app, (current) =>
		current.map((e) => (e.id === id ? { ...e, label: trimmed } : e)),
	);
	return { entries };
}

export async function setPlotThreadColor(app: App, id: string, color: string): Promise<PlotThreadMutationResult> {
	if (!isPlotThreadColor(color)) throw new Error("setPlotThreadColor: colour must be #rrggbb");
	const entries = await mutatePlotThreads(app, (current) =>
		current.map((e) => (e.id === id ? { ...e, color } : e)),
	);
	return { entries };
}

export async function setPlotThreadTextColor(app: App, id: string, textColor: string): Promise<PlotThreadMutationResult> {
	if (!isPlotThreadColor(textColor)) throw new Error("setPlotThreadTextColor: colour must be #rrggbb");
	const entries = await mutatePlotThreads(app, (current) =>
		current.map((e) => (e.id === id ? { ...e, textColor } : e)),
	);
	return { entries };
}

/** Removes `id` from the registry only — any chapter still referencing it keeps the raw id
 * untouched (non-destructive, same as deleteTagDefinition). No-ops for the default main thread
 * (see MAIN_THREAD_ID) — UI surfaces should already hide its delete affordance. */
export async function deletePlotThread(app: App, id: string): Promise<PlotThreadMutationResult> {
	if (id === MAIN_THREAD_ID) return { entries: readPlotThreads(app) };
	const entries = await mutatePlotThreads(app, (current) => current.filter((e) => e.id !== id));
	return { entries };
}

/** Reorders the list to match `newIdOrder`. Any existing id missing from `newIdOrder` is appended
 * at the end, preserving its relative order, so a stale/partial order can't silently drop entries. */
export async function reorderPlotThreads(app: App, newIdOrder: string[]): Promise<PlotThreadMutationResult> {
	const entries = await mutatePlotThreads(app, (current) => {
		const byId = new Map(current.map((e) => [e.id, e]));
		const reordered: PlotThread[] = [];
		for (const id of newIdOrder) {
			const entry = byId.get(id);
			if (entry) {
				reordered.push(entry);
				byId.delete(id);
			}
		}
		for (const leftover of current) {
			if (byId.has(leftover.id)) reordered.push(leftover);
		}
		return reordered;
	});
	return { entries };
}
