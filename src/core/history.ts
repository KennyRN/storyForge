import { bookWordCountFilePath, libraryChapterPath } from "./paths";
import { editYamlText, parseYamlText, stringifyYamlText } from "./frontmatter";
import type { Project } from "./project";
import {
	addDaysISO,
	dailyNetsForRange,
	mostRecentMondayISO,
	isoWeekNumber,
	sumNetsThisWeek,
	todayISOInEngland,
	weeklyNetsFromDaily,
	wordsThisWeek,
	wordsToday,
	type DayNet,
	type WeekNet,
} from "./historyMath";
import { getBookChapterFiles, readBookFrontmatter } from "./book";
import { countWords } from "./wordCount";
import { getLibraryBookFolders } from "./series";

export {
	todayISOInEngland,
	wordsThisWeek,
	wordsToday,
	dailyNetsForRange,
	weeklyNetsFromDaily,
	sumNetsThisWeek,
	addDaysISO,
	mostRecentMondayISO,
	isoWeekNumber,
};
export type { DayNet, WeekNet };

export interface ChapterWordState {
	words: number;
	archivedWords: number | null;
}

export interface DailyEntry {
	net: number;
	chapters: Record<string, number>;
}

export interface BookWordCountData {
	version: 2;
	current: number;
	lifetimeWritten: number;
	lifetimeRemoved: number;
	chapters: Record<string, ChapterWordState>;
	daily: Record<string, DailyEntry>;
}

export interface BookWordStats {
	current: number;
	lifetimeWritten: number;
	lifetimeRemoved: number;
	todayNet: number;
	weekNet: number;
	daily: Record<string, DailyEntry>;
	chapters: Record<string, ChapterWordState>;
}

export interface ProjectWordStats {
	current: number;
	lifetimeWritten: number;
	lifetimeRemoved: number;
}

function emptyBookData(): BookWordCountData {
	return {
		version: 2,
		current: 0,
		lifetimeWritten: 0,
		lifetimeRemoved: 0,
		chapters: {},
		daily: {},
	};
}

function parseBookData(parsed: Partial<BookWordCountData> | null): BookWordCountData {
	if (!parsed || typeof parsed !== "object") return emptyBookData();
	return {
		version: 2,
		current: typeof parsed.current === "number" ? parsed.current : 0,
		lifetimeWritten: typeof parsed.lifetimeWritten === "number" ? parsed.lifetimeWritten : 0,
		lifetimeRemoved: typeof parsed.lifetimeRemoved === "number" ? parsed.lifetimeRemoved : 0,
		chapters: sanitizeChapters(parsed.chapters),
		daily: sanitizeDaily(parsed.daily),
	};
}

function sanitizeChapters(raw: unknown): Record<string, ChapterWordState> {
	if (!raw || typeof raw !== "object") return {};
	const out: Record<string, ChapterWordState> = {};
	for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		out[name] = {
			words: typeof entry.words === "number" ? entry.words : 0,
			archivedWords: typeof entry.archivedWords === "number" ? entry.archivedWords : null,
		};
	}
	return out;
}

function sanitizeDaily(raw: unknown): Record<string, DailyEntry> {
	if (!raw || typeof raw !== "object") return {};
	const out: Record<string, DailyEntry> = {};
	for (const [date, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		const chapters: Record<string, number> = {};
		if (entry.chapters && typeof entry.chapters === "object") {
			for (const [ch, n] of Object.entries(entry.chapters as Record<string, unknown>)) {
				if (typeof n === "number") chapters[ch] = n;
			}
		}
		out[date] = {
			net: typeof entry.net === "number" ? entry.net : 0,
			chapters,
		};
	}
	return out;
}

function dailyNetsMap(daily: Record<string, DailyEntry>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [date, entry] of Object.entries(daily)) {
		out[date] = entry.net;
	}
	return out;
}

/** Rebuild cumulative date→total map from daily nets (for legacy helpers / migration checks). */
export function totalsFromDailyNets(daily: Record<string, DailyEntry>): Record<string, number> {
	const dates = Object.keys(daily).sort();
	const totals: Record<string, number> = {};
	let running = 0;
	for (const date of dates) {
		running += daily[date]?.net ?? 0;
		totals[date] = running;
	}
	return totals;
}

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
	const run = writeQueue.then(task);
	writeQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

async function readBookFile(project: Project, bookFolderName: string): Promise<BookWordCountData> {
	const path = bookWordCountFilePath(bookFolderName);
	if (!project.isFile(path)) return emptyBookData();
	return parseBookData(parseYamlText(await project.readText(path), path) as Partial<BookWordCountData>);
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return !!v && typeof v === "object" && !Array.isArray(v);
}

/** `next`'s entries, each merged over the matching existing raw entry so keys this module doesn't know survive. */
function mergeEntries(existing: unknown, next: Record<string, object>): Record<string, unknown> {
	const raw = isRecord(existing) ? existing : {};
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(next)) {
		out[key] = { ...(isRecord(raw[key]) ? (raw[key] as Record<string, unknown>) : {}), ...value };
	}
	return out;
}

/** The file's new text: only the keys this module manages change; unknown keys, comments and layout are kept. */
function renderBookData(current: string | null, data: BookWordCountData, path: string): string {
	if (current === null) return stringifyYamlText({ ...data } as unknown as Record<string, unknown>);
	return editYamlText(
		current,
		(raw) => {
			raw.version = 2;
			raw.current = data.current;
			raw.lifetimeWritten = data.lifetimeWritten;
			raw.lifetimeRemoved = data.lifetimeRemoved;
			raw.chapters = mergeEntries(raw.chapters, data.chapters as unknown as Record<string, object>);
			const daily: Record<string, object> = {};
			for (const [date, entry] of Object.entries(data.daily)) {
				const existing = isRecord(raw.daily) && isRecord(raw.daily[date]) ? (raw.daily[date] as Record<string, unknown>) : {};
				daily[date] = { ...existing, net: entry.net, chapters: entry.chapters };
			}
			raw.daily = mergeEntries(raw.daily, daily);
		},
		path,
	);
}

async function mutateBook(
	project: Project,
	bookFolderName: string,
	mutator: (data: BookWordCountData) => void | Promise<void>,
): Promise<BookWordCountData> {
	return enqueueWrite(async () => {
		const path = bookWordCountFilePath(bookFolderName);
		const data = await readBookFile(project, bookFolderName);
		await mutator(data);
		await project.updateText(path, (current) => renderBookData(current, data, path));
		return data;
	});
}

function ensureDaily(data: BookWordCountData, dateISO: string): DailyEntry {
	if (!data.daily[dateISO]) {
		data.daily[dateISO] = { net: 0, chapters: {} };
	}
	return data.daily[dateISO];
}

function ensureChapter(data: BookWordCountData, filename: string): ChapterWordState {
	if (!data.chapters[filename]) {
		data.chapters[filename] = { words: 0, archivedWords: null };
	}
	return data.chapters[filename];
}

async function sumLiveChapterWords(project: Project, bookFolderName: string): Promise<{
	total: number;
	byFile: Record<string, number>;
}> {
	const chapterFiles = getBookChapterFiles(project, bookFolderName);
	const archived = new Set(readBookFrontmatter(project, bookFolderName)?.archive ?? []);
	const liveFiles = chapterFiles.filter((f) => !archived.has(f.name));
	// The index holds each chapter's word count (countWords over the whole file, as before).
	const byFile: Record<string, number> = {};
	let total = 0;
	for (const f of liveFiles) {
		byFile[f.name] = project.wordCount(f.path);
		total += byFile[f.name];
	}
	return { total, byFile };
}

function toStats(data: BookWordCountData, todayISO: string): BookWordStats {
	const nets = dailyNetsMap(data.daily);
	return {
		current: data.current,
		lifetimeWritten: data.lifetimeWritten,
		lifetimeRemoved: data.lifetimeRemoved,
		todayNet: nets[todayISO] ?? 0,
		weekNet: sumNetsThisWeek(nets, todayISO),
		daily: data.daily,
		chapters: data.chapters,
	};
}

export async function getBookWordStats(
	project: Project,
	bookFolderName: string,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const data = await readBookFile(project, bookFolderName);
	const todayISO = todayISOInEngland(now);
	const stats = toStats(data, todayISO);
	// Always surface live manuscript totals so the Stats pane stays accurate
	// even before the first debounced persist (or on a fresh vault with no file yet).
	const { total } = await sumLiveChapterWords(project, bookFolderName);
	stats.current = total;
	return stats;
}

export async function getChapterDaily(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
	dateISO?: string,
): Promise<number> {
	const data = await readBookFile(project, bookFolderName);
	const day = dateISO ?? todayISOInEngland();
	return data.daily[day]?.chapters[chapterFilename] ?? 0;
}

export async function getProjectWordStats(project: Project): Promise<ProjectWordStats> {
	const folders = getLibraryBookFolders(project);
	let current = 0;
	let lifetimeWritten = 0;
	let lifetimeRemoved = 0;
	for (const folder of folders) {
		const data = await readBookFile(project, folder.name);
		current += data.current;
		lifetimeWritten += data.lifetimeWritten;
		lifetimeRemoved += data.lifetimeRemoved;
	}
	return { current, lifetimeWritten, lifetimeRemoved };
}

/**
 * Apply an edit delta for one chapter. Positive deltas increase lifetimeWritten;
 * negative mid-edit deltas do not touch lifetimeRemoved.
 */
export async function recordChapterEdit(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
	newWordCount: number,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const archived = new Set(readBookFrontmatter(project, bookFolderName)?.archive ?? []);
	const isLive = !archived.has(chapterFilename);

	const data = await mutateBook(project, bookFolderName, async (d) => {
		const chapter = ensureChapter(d, chapterFilename);
		const previous = chapter.words;
		const delta = newWordCount - previous;
		chapter.words = newWordCount;

		if (delta !== 0) {
			if (delta > 0) d.lifetimeWritten += delta;
			const day = ensureDaily(d, today);
			day.net += delta;
			day.chapters[chapterFilename] = (day.chapters[chapterFilename] ?? 0) + delta;
		}

		if (isLive) {
			const { total, byFile } = await sumLiveChapterWords(project, bookFolderName);
			d.current = total;
			for (const [name, words] of Object.entries(byFile)) {
				ensureChapter(d, name).words = words;
			}
		} else {
			// Archived chapter edit: keep current as live sum only.
			const { total } = await sumLiveChapterWords(project, bookFolderName);
			d.current = total;
		}
	});

	return toStats(data, today);
}

export async function recordChapterArchive(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
	wordCount: number,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const data = await mutateBook(project, bookFolderName, async (d) => {
		const chapter = ensureChapter(d, chapterFilename);
		chapter.words = wordCount;
		chapter.archivedWords = wordCount;
		d.lifetimeRemoved += wordCount;
		const { total } = await sumLiveChapterWords(project, bookFolderName);
		d.current = total;
	});
	return toStats(data, today);
}

export async function recordChapterUnarchive(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const data = await mutateBook(project, bookFolderName, async (d) => {
		const chapter = ensureChapter(d, chapterFilename);
		const removed = chapter.archivedWords ?? chapter.words;
		d.lifetimeRemoved = Math.max(0, d.lifetimeRemoved - removed);
		chapter.archivedWords = null;
		const { total, byFile } = await sumLiveChapterWords(project, bookFolderName);
		d.current = total;
		for (const [name, words] of Object.entries(byFile)) {
			ensureChapter(d, name).words = words;
		}
	});
	return toStats(data, today);
}

/** Reconcile current + chapter snapshots from disk without changing lifetime counters. */
export async function recomputeBookCurrent(project: Project, bookFolderName: string): Promise<number> {
	const data = await mutateBook(project, bookFolderName, async (d) => {
		const { total, byFile } = await sumLiveChapterWords(project, bookFolderName);
		d.current = total;
		const archived = new Set(readBookFrontmatter(project, bookFolderName)?.archive ?? []);
		for (const [name, words] of Object.entries(byFile)) {
			const ch = ensureChapter(d, name);
			ch.words = words;
			if (!archived.has(name)) ch.archivedWords = null;
		}
	});
	return data.current;
}

/**
 * Legacy helper: stamp today's cumulative total. Prefer recordChapterEdit.
 * Kept so existing call sites can migrate gradually; writes v2 daily net from delta vs prior current.
 */
export async function recomputeBookTotal(project: Project, bookFolderName: string): Promise<number> {
	return recomputeBookCurrent(project, bookFolderName);
}

/** Heatmap helper: day nets for an inclusive ISO range from book stats. */
export function dayNetsFromStats(stats: BookWordStats, fromISO: string, toISO: string): DayNet[] {
	return dailyNetsForRange(dailyNetsMap(stats.daily), fromISO, toISO);
}

/** Heatmap helper: week nets from a day-net list. */
export function weekNetsFromDayNets(dayNets: DayNet[]): WeekNet[] {
	return weeklyNetsFromDaily(dayNets);
}

/** Default heatmap window: 16 weeks ending on `todayISO`. */
export function defaultHeatmapRange(todayISO: string): { fromISO: string; toISO: string } {
	const monday = mostRecentMondayISO(todayISO);
	const fromISO = addDaysISO(monday, -(15 * 7));
	return { fromISO, toISO: todayISO };
}

/** Read chapter word count from the library file (for archive hooks). */
export async function readChapterWordCount(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
): Promise<number> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	if (!project.isFile(path)) return 0;
	return countWords(await project.readText(path));
}
