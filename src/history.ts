import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { bookWordCountFilePath, libraryChapterPath, wordCountFilePath } from "./paths";
import { deleteBackstagePath, writeBackstageFile } from "./writeGuard";
import {
	addDaysISO,
	dailyNetsForRange,
	mostRecentMondayISO,
	sumNetsThisWeek,
	todayISOInEngland,
	weeklyNetsFromDaily,
	wordsThisWeek,
	wordsToday,
	type DayNet,
	type WeekNet,
} from "./historyMath";
import { getBookChapterFiles, readBookFrontmatter } from "./book";
import { countWords, sumWordCounts } from "./wordCount";
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

function parseBookData(raw: string): BookWordCountData {
	const parsed = parseYaml(raw) as Partial<BookWordCountData> | null;
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

async function readBookFile(app: App, bookFolderName: string): Promise<BookWordCountData> {
	const path = bookWordCountFilePath(bookFolderName);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return emptyBookData();
	return parseBookData(await app.vault.read(file));
}

async function writeBookFile(app: App, bookFolderName: string, data: BookWordCountData): Promise<void> {
	await writeBackstageFile(app.vault, bookWordCountFilePath(bookFolderName), stringifyYaml(data));
}

async function mutateBook(
	app: App,
	bookFolderName: string,
	mutator: (data: BookWordCountData) => void | Promise<void>,
): Promise<BookWordCountData> {
	return enqueueWrite(async () => {
		const data = await readBookFile(app, bookFolderName);
		await mutator(data);
		await writeBookFile(app, bookFolderName, data);
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

async function sumLiveChapterWords(app: App, bookFolderName: string): Promise<{
	total: number;
	byFile: Record<string, number>;
}> {
	const chapterFiles = getBookChapterFiles(app, bookFolderName);
	const archived = new Set(readBookFrontmatter(app, bookFolderName)?.archive ?? []);
	const liveFiles = chapterFiles.filter((f) => !archived.has(f.name));
	const contents = await Promise.all(liveFiles.map((f) => app.vault.cachedRead(f)));
	const byFile: Record<string, number> = {};
	for (let i = 0; i < liveFiles.length; i++) {
		byFile[liveFiles[i].name] = countWords(contents[i]);
	}
	return { total: sumWordCounts(contents), byFile };
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
	app: App,
	bookFolderName: string,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const data = await readBookFile(app, bookFolderName);
	const todayISO = todayISOInEngland(now);
	const stats = toStats(data, todayISO);
	// Always surface live manuscript totals so the Stats pane stays accurate
	// even before the first debounced persist (or on a fresh vault with no file yet).
	const { total } = await sumLiveChapterWords(app, bookFolderName);
	stats.current = total;
	return stats;
}

export async function getChapterDaily(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	dateISO?: string,
): Promise<number> {
	const data = await readBookFile(app, bookFolderName);
	const day = dateISO ?? todayISOInEngland();
	return data.daily[day]?.chapters[chapterFilename] ?? 0;
}

export async function getProjectWordStats(app: App): Promise<ProjectWordStats> {
	const folders = getLibraryBookFolders(app);
	let current = 0;
	let lifetimeWritten = 0;
	let lifetimeRemoved = 0;
	for (const folder of folders) {
		const data = await readBookFile(app, folder.name);
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
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	newWordCount: number,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const archived = new Set(readBookFrontmatter(app, bookFolderName)?.archive ?? []);
	const isLive = !archived.has(chapterFilename);

	const data = await mutateBook(app, bookFolderName, async (d) => {
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
			const { total, byFile } = await sumLiveChapterWords(app, bookFolderName);
			d.current = total;
			for (const [name, words] of Object.entries(byFile)) {
				ensureChapter(d, name).words = words;
			}
		} else {
			// Archived chapter edit: keep current as live sum only.
			const { total } = await sumLiveChapterWords(app, bookFolderName);
			d.current = total;
		}
	});

	return toStats(data, today);
}

export async function recordChapterArchive(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	wordCount: number,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const data = await mutateBook(app, bookFolderName, async (d) => {
		const chapter = ensureChapter(d, chapterFilename);
		chapter.words = wordCount;
		chapter.archivedWords = wordCount;
		d.lifetimeRemoved += wordCount;
		const { total } = await sumLiveChapterWords(app, bookFolderName);
		d.current = total;
	});
	return toStats(data, today);
}

export async function recordChapterUnarchive(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	now: Date = new Date(),
): Promise<BookWordStats> {
	const today = todayISOInEngland(now);
	const data = await mutateBook(app, bookFolderName, async (d) => {
		const chapter = ensureChapter(d, chapterFilename);
		const removed = chapter.archivedWords ?? chapter.words;
		d.lifetimeRemoved = Math.max(0, d.lifetimeRemoved - removed);
		chapter.archivedWords = null;
		const { total, byFile } = await sumLiveChapterWords(app, bookFolderName);
		d.current = total;
		for (const [name, words] of Object.entries(byFile)) {
			ensureChapter(d, name).words = words;
		}
	});
	return toStats(data, today);
}

/** Reconcile current + chapter snapshots from disk without changing lifetime counters. */
export async function recomputeBookCurrent(app: App, bookFolderName: string): Promise<number> {
	const data = await mutateBook(app, bookFolderName, async (d) => {
		const { total, byFile } = await sumLiveChapterWords(app, bookFolderName);
		d.current = total;
		const archived = new Set(readBookFrontmatter(app, bookFolderName)?.archive ?? []);
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
export async function recomputeBookTotal(app: App, bookFolderName: string): Promise<number> {
	return recomputeBookCurrent(app, bookFolderName);
}

/**
 * Migrate v1 `_sf-backstage/wordcount.md` into per-book v2 files, then trash the legacy file.
 * Safe to re-run: skips books that already have a v2 file; deletes legacy when done.
 */
export async function migrateWordCountV1ToV2(app: App): Promise<void> {
	const legacyPath = wordCountFilePath();
	const legacyFile = app.vault.getAbstractFileByPath(legacyPath);
	if (!(legacyFile instanceof TFile)) return;

	const raw = await app.vault.read(legacyFile);
	const parsed = (parseYaml(raw) as Record<string, Record<string, number>> | null) ?? {};

	await enqueueWrite(async () => {
		for (const [bookFolderName, dateTotals] of Object.entries(parsed)) {
			if (!dateTotals || typeof dateTotals !== "object") continue;
			const existing = app.vault.getAbstractFileByPath(bookWordCountFilePath(bookFolderName));
			if (existing instanceof TFile) continue;

			const dates = Object.keys(dateTotals).sort();
			const data = emptyBookData();
			let previous = 0;
			for (const date of dates) {
				const total = typeof dateTotals[date] === "number" ? dateTotals[date] : 0;
				const net = total - previous;
				data.daily[date] = { net, chapters: {} };
				if (net > 0) data.lifetimeWritten += net;
				previous = total;
			}
			data.current = previous;
			if (data.lifetimeWritten < data.current) data.lifetimeWritten = data.current;
			await writeBookFile(app, bookFolderName, data);
		}
		await deleteBackstagePath(app, legacyPath);
	});

	// After historical nets are in place, align `current` to live manuscripts.
	for (const folder of getLibraryBookFolders(app)) {
		const path = bookWordCountFilePath(folder.name);
		if (app.vault.getAbstractFileByPath(path) instanceof TFile) {
			await recomputeBookCurrent(app, folder.name);
		}
	}
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
	app: App,
	bookFolderName: string,
	chapterFilename: string,
): Promise<number> {
	const file = app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, chapterFilename));
	if (!(file instanceof TFile)) return 0;
	return countWords(await app.vault.cachedRead(file));
}
