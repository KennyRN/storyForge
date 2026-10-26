/**
 * Writing sessions (docs/sessions.md, decisions 34 and 35): the tracker. Pure logic. The clock is passed in on every
 * call, so tests control time, and nothing here touches the disk. Words are counted with the one existing counter
 * (`countWords`), lazily: a keystroke costs O(1), and a count happens only at a checkpoint, at the end, for a large
 * paste or drop, and around a reload.
 */
import { countWords } from "./wordCount";
import { todayISOInEngland } from "./historyMath";

/** Where an edit came from, as CodeMirror's user events say. An edit with no origin is treated as typing. */
export type EditOrigin = "type" | "delete" | "paste" | "drop" | "cut" | "undo" | "redo" | "other";

/** A single paste or drop that adds more than this many words makes a session unreliable. Not a setting. */
export const UNRELIABLE_PASTE_WORDS = 30;

/** A chapter as a session file names it: `<book code>/<chapter filename>`, and its stable id when it has one. */
export interface ChapterRef {
	path: string;
	id?: string;
}

export interface SessionChapter extends ChapterRef {
	/** Net words the author added to this chapter in the session. */
	net: number;
	/** Only for a session that crossed England midnight: this chapter's net divided between the days it fell on. */
	byDay?: Record<string, number>;
}

/** A finished session, as stored. Editing and short are not stored: they depend on settings. */
export interface SessionRecord {
	id: string;
	/** ISO instant with its UTC offset, to the second. */
	start: string;
	end: string;
	/** The England-local day the session started. */
	day: string;
	net: number;
	chapters: SessionChapter[];
	unreliable: boolean;
	recovered: boolean;
	/** Keys the app doesn't understand, carried through every rewrite. */
	extra?: Record<string, unknown>;
}

export interface TrackerOptions {
	/** The idle limit in milliseconds. Fixed for the session once it starts. */
	idleMs: number;
	/** Counts words; defaults to the app's one counter. */
	count?: (body: string) => number;
	/** The day an instant belongs to; defaults to the England-local rule the history uses. */
	dayOf?: (ms: number) => string;
	/** The UTC offset in minutes the Mac had at an instant; defaults to the machine's own zone. */
	offsetMinutes?: (ms: number) => number;
}

interface ChapterState {
	ref: ChapterRef;
	/** The count before the author's first edit, moved by reloads so they never count. */
	baseline: number;
	/** The latest body the author has. */
	body: string;
	counted: { body: string; words: number } | null;
	/** Net accounted to each finished day so far, and the net at the last day mark. */
	dayNets: Record<string, number>;
	mark: number;
}

/** What a checkpoint keeps of a session in progress (the app's data folder, never the project). */
export interface Checkpoint {
	v: 1;
	startMs: number;
	lastEditMs: number;
	unreliable: boolean;
	idleMs: number;
	currentDay: string;
	crossed: boolean;
	chapters: { ref: ChapterRef; net: number; dayNets: Record<string, number>; mark: number }[];
}

export const localOffsetMinutes = (ms: number): number => -new Date(ms).getTimezoneOffset();

/** The UTC offset of Europe/London at an instant (for tests, and for anyone who wants the England zone). */
export function londonOffsetMinutes(ms: number): number {
	const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", timeZoneName: "longOffset" }).formatToParts(new Date(ms));
	const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
	const m = /GMT([+-])(\d\d):(\d\d)/.exec(name);
	return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, "0");

/** `2026-10-25T01:30:12+01:00`: the wall clock at that offset, to the second. */
export function isoWithOffset(ms: number, offsetMin: number): string {
	const d = new Date(Math.floor(ms / 1000) * 1000 + offsetMin * 60_000);
	const sign = offsetMin < 0 ? "-" : "+";
	const o = Math.abs(offsetMin);
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${sign}${pad(Math.floor(o / 60))}:${pad(o % 60)}`;
}

/** The instant an offset-bearing ISO string names, in milliseconds. NaN if it isn't one. */
export function parseInstant(iso: string): number {
	return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d([+-]\d\d:\d\d|Z)$/.test(iso) ? Date.parse(iso) : NaN;
}

/** `20261025T013012+0100`: a session's id, from its start. */
export function sessionId(startIso: string): string {
	return startIso.replace(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)([+-])(\d\d):(\d\d)$/, "$1$2$3T$4$5$6$7$8$9");
}

export class SessionTracker {
	private readonly count: (body: string) => number;
	private readonly dayOfRaw: (ms: number) => string;
	private dayMemo = { minute: -1, day: "" };
	private readonly offsetMinutes: (ms: number) => number;
	private readonly idleMs: number;

	private startMs = 0;
	private lastEditMs = 0;
	private unreliable = false;
	private currentDay = "";
	private crossed = false;
	private chapters = new Map<string, ChapterState>();
	private active = false;

	constructor(options: TrackerOptions) {
		this.idleMs = options.idleMs;
		this.count = options.count ?? countWords;
		this.dayOfRaw = options.dayOf ?? ((ms) => todayISOInEngland(new Date(ms)));
		this.offsetMinutes = options.offsetMinutes ?? localOffsetMinutes;
	}

	/**
	 * The day an instant belongs to, remembered per minute: England midnight, and every change of clocks, falls on a
	 * minute boundary, so a minute never straddles two days. Keeps a keystroke from paying for a date formatter.
	 */
	private dayOf(ms: number): string {
		const minute = Math.floor(ms / 60_000);
		if (minute !== this.dayMemo.minute) this.dayMemo = { minute, day: this.dayOfRaw(ms) };
		return this.dayMemo.day;
	}

	get running(): boolean {
		return this.active;
	}
	get start(): number {
		return this.startMs;
	}
	get lastEdit(): number {
		return this.lastEditMs;
	}
	/** True when the idle limit has passed since the last edit, judged against `now` (the clock, never a countdown). */
	idleExpired(now: number): boolean {
		return this.active && now - this.lastEditMs >= this.idleMs;
	}

	/**
	 * The author changed a chapter. Returns the session this edit ended, if the idle limit had passed (a sleep, a long
	 * pause the timer hadn't noticed); the edit then starts a new one.
	 */
	edit(e: { at: number; chapter: ChapterRef; before: string; after: string; origin?: EditOrigin }): SessionRecord | null {
		let ended: SessionRecord | null = null;
		if (this.idleExpired(e.at)) ended = this.finish(false);
		const first = !this.active;
		if (first) {
			this.active = true;
			this.startMs = e.at;
			this.unreliable = false;
			this.currentDay = this.dayOf(e.at);
			this.crossed = false;
			this.chapters = new Map();
		} else if (this.dayOf(e.at) !== this.currentDay) {
			// The first edit after England midnight: take the count just before it, so each day gets its own part.
			this.closeDay(e.chapter.path, e.before);
			this.currentDay = this.dayOf(e.at);
			this.crossed = true;
		}
		let state = this.chapters.get(e.chapter.path);
		if (!state) {
			const baseline = this.count(e.before);
			state = { ref: { ...e.chapter }, baseline, body: e.before, counted: { body: e.before, words: baseline }, dayNets: {}, mark: 0 };
			this.chapters.set(e.chapter.path, state);
		}
		if (e.chapter.id && !state.ref.id) state.ref.id = e.chapter.id;
		if ((e.origin === "paste" || e.origin === "drop") && this.count(e.after) - this.wordsOf(state, e.before) > UNRELIABLE_PASTE_WORDS) this.unreliable = true;
		state.body = e.after;
		this.lastEditMs = e.at;
		return ended;
	}

	/** A reload from disk landed in a chapter. Its difference is moved into the baseline, so it never counts as writing. */
	reload(path: string, after: string): void {
		const state = this.chapters.get(path);
		if (!state || !this.active) return;
		state.baseline += this.count(after) - this.wordsOf(state, state.body);
		state.body = after;
		state.counted = null;
	}

	/** Words written so far, across every chapter touched. */
	net(): number {
		let total = 0;
		for (const c of this.chapters.values()) total += this.wordsOf(c, c.body) - c.baseline;
		return total;
	}

	/** Ends the session at its last edit. `null` when none is running. `recovered` marks one finished after a crash. */
	finish(recovered = false): SessionRecord | null {
		if (!this.active) return null;
		this.closeDay(undefined, undefined);
		const record = this.record(recovered);
		this.active = false;
		this.chapters = new Map();
		return record;
	}

	/** What to keep in the app's data folder so a crash can finish this session at its last edit. */
	checkpoint(): Checkpoint | null {
		if (!this.active) return null;
		return {
			v: 1,
			startMs: this.startMs,
			lastEditMs: this.lastEditMs,
			unreliable: this.unreliable,
			idleMs: this.idleMs,
			currentDay: this.currentDay,
			crossed: this.crossed,
			chapters: [...this.chapters.values()].map((c) => ({ ref: { ...c.ref }, net: this.wordsOf(c, c.body) - c.baseline, dayNets: { ...c.dayNets }, mark: c.mark })),
		};
	}

	private wordsOf(c: ChapterState, body: string): number {
		if (c.counted?.body === body) return c.counted.words;
		const words = this.count(body);
		c.counted = { body, words };
		return words;
	}

	/** Accounts net since the last day mark to the current day. `editedPath`/`before` stand in for that chapter's body just before an edit. */
	private closeDay(editedPath: string | undefined, before: string | undefined): void {
		for (const c of this.chapters.values()) {
			const body = c.ref.path === editedPath && before !== undefined ? before : c.body;
			const now = this.wordsOf(c, body) - c.baseline;
			c.dayNets[this.currentDay] = (c.dayNets[this.currentDay] ?? 0) + now - c.mark;
			c.mark = now;
		}
	}

	private record(recovered: boolean): SessionRecord {
		return buildRecord(
			{
				startMs: this.startMs,
				lastEditMs: this.lastEditMs,
				unreliable: this.unreliable,
				firstDay: this.dayOf(this.startMs),
				crossed: this.crossed,
				chapters: [...this.chapters.values()].map((c) => ({ ref: c.ref, dayNets: c.dayNets })),
			},
			this.offsetMinutes,
			recovered,
		);
	}

	/** Finishes a checkpoint left by a crash, at its last edit, marked recovered. */
	static recover(cp: Checkpoint, options: Pick<TrackerOptions, "dayOf" | "offsetMinutes">): SessionRecord {
		const dayOf = options.dayOf ?? ((ms: number) => todayISOInEngland(new Date(ms)));
		const chapters = cp.chapters.map((c) => {
			const dayNets = { ...c.dayNets };
			dayNets[cp.currentDay] = (dayNets[cp.currentDay] ?? 0) + c.net - c.mark;
			return { ref: c.ref, dayNets };
		});
		return buildRecord({ startMs: cp.startMs, lastEditMs: cp.lastEditMs, unreliable: cp.unreliable, firstDay: dayOf(cp.startMs), crossed: cp.crossed, chapters }, options.offsetMinutes ?? localOffsetMinutes, true);
	}
}

function buildRecord(
	s: { startMs: number; lastEditMs: number; unreliable: boolean; firstDay: string; crossed: boolean; chapters: { ref: ChapterRef; dayNets: Record<string, number> }[] },
	offsetMinutes: (ms: number) => number,
	recovered: boolean,
): SessionRecord {
	const start = isoWithOffset(s.startMs, offsetMinutes(s.startMs));
	const end = isoWithOffset(s.lastEditMs, offsetMinutes(s.lastEditMs));
	const chapters: SessionChapter[] = s.chapters.map((c) => {
		const net = Object.values(c.dayNets).reduce((a, b) => a + b, 0);
		const entry: SessionChapter = { path: c.ref.path, ...(c.ref.id ? { id: c.ref.id } : {}), net };
		if (s.crossed) entry.byDay = { ...c.dayNets };
		return entry;
	});
	return {
		id: sessionId(start),
		start,
		end,
		day: s.firstDay,
		net: chapters.reduce((a, c) => a + c.net, 0),
		chapters,
		unreliable: s.unreliable,
		recovered,
	};
}
