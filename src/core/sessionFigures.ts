/**
 * What sessions mean when shown (docs/sessions.md §5 and §7): the three kinds, pace, and the storytelling figures.
 * Worked out each time from the settings, never stored, so changing a setting reclassifies past sessions and no file
 * is rewritten. Nothing here reads or writes the disk.
 */
import { addDaysISO, mostRecentMondayISO, type DayNet } from "./historyMath";
import { parseInstant, type SessionRecord } from "./sessions";

export interface SessionSettings {
	/** Sessions shorter than this many minutes are recorded but not listed. 0 lists everything. */
	minShownMinutes: number;
	/** A session whose pace is below this many words per minute counts as editing. `null`: off. */
	editingWpm: number | null;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = { minShownMinutes: 5, editingWpm: null };

export const lengthMinutes = (r: SessionRecord): number => Math.max(0, (parseInstant(r.end) - parseInstant(r.start)) / 60_000);

/** Net words per minute; `null` for a session of no length. */
export function paceWpm(r: SessionRecord): number | null {
	const minutes = lengthMinutes(r);
	return minutes > 0 ? r.net / minutes : null;
}

export interface SessionKinds {
	short: boolean;
	editing: boolean;
	unreliable: boolean;
	/** Listed in the history view: not short. */
	listed: boolean;
	/** Counts in the storytelling figures: neither unreliable nor editing (a short session still counts). */
	inFigures: boolean;
	/** Counts in pace averages: none of short, editing, unreliable. */
	inAverage: boolean;
}

export function classify(r: SessionRecord, s: SessionSettings): SessionKinds {
	const short = lengthMinutes(r) < s.minShownMinutes;
	const pace = paceWpm(r);
	const editing = r.net <= 0 || (s.editingWpm !== null && pace !== null && pace < s.editingWpm);
	const unreliable = r.unreliable;
	return { short, editing, unreliable, listed: !short, inFigures: !unreliable && !editing, inAverage: !short && !editing && !unreliable };
}

/** Total net words over total minutes across the sessions that qualify, and how many that was. */
export function averagePace(records: readonly SessionRecord[], s: SessionSettings): { wpm: number | null; sessions: number } {
	let net = 0;
	let minutes = 0;
	let sessions = 0;
	for (const r of records) {
		if (!classify(r, s).inAverage) continue;
		net += r.net;
		minutes += lengthMinutes(r);
		sessions += 1;
	}
	return { wpm: minutes > 0 ? net / minutes : null, sessions };
}

/** A chapter's book: the first part of `<book code>/<filename>`. */
export const bookOfChapter = (path: string): string => path.split("/")[0] ?? "";

/**
 * Net words to take off each day's history figure: those of the unreliable and editing sessions. Restricted to one
 * book's chapters when `book` is given (the stats panel shows one book). A session that crossed midnight gives each
 * day its own part.
 */
export function excludedByDay(records: readonly SessionRecord[], s: SessionSettings, book?: string): Record<string, number> {
	const out: Record<string, number> = {};
	for (const r of records) {
		if (classify(r, s).inFigures) continue;
		for (const c of r.chapters) {
			if (book !== undefined && bookOfChapter(c.path) !== book) continue;
			if (c.byDay) for (const [day, n] of Object.entries(c.byDay)) out[day] = (out[day] ?? 0) + n;
			else out[r.day] = (out[r.day] ?? 0) + c.net;
		}
	}
	return out;
}

/** The history's per-day nets with the excluded sessions' words taken off: the storytelling figure for each day. */
export function storytellingDaily(daily: Record<string, number>, excluded: Record<string, number>): Record<string, number> {
	const out = { ...daily };
	for (const [day, n] of Object.entries(excluded)) out[day] = (out[day] ?? 0) - n;
	return out;
}

/** The history's day nets with the excluded sessions' words taken off. */
export function adjustDayNets(days: readonly DayNet[], excluded: Record<string, number>): DayNet[] {
	return days.map((d) => ({ date: d.date, net: d.net - (excluded[d.date] ?? 0) }));
}

/** Today's and this week's storytelling figures, from the history's own today and week nets. */
export function storytellingTodayAndWeek(todayNet: number, weekNet: number, excluded: Record<string, number>, todayISO: string): { today: number; week: number } {
	const monday = mostRecentMondayISO(todayISO);
	let week = weekNet;
	for (let d = monday; d <= todayISO; d = addDaysISO(d, 1)) week -= excluded[d] ?? 0;
	return { today: todayNet - (excluded[todayISO] ?? 0), week };
}
