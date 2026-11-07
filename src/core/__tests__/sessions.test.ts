import { describe, expect, it } from "vitest";
import { averagePace, classify, excludedByDay, lengthMinutes, paceWpm, storytellingDaily, storytellingTodayAndWeek, DEFAULT_SESSION_SETTINGS } from "../sessionFigures";
import { SessionTracker, isoWithOffset, londonOffsetMinutes, parseInstant, UNRELIABLE_PASTE_WORDS } from "../sessions";

const MIN = 60_000;
const T0 = Date.UTC(2026, 5, 10, 9, 0, 0); // a June morning
const words = (n: number, w = "word") => Array.from({ length: n }, () => w).join(" ");
const CH = { path: "aaa/ch-a1.md", id: "c-a1k3" };
const tracker = (idleMin = 3) => new SessionTracker({ idleMs: idleMin * MIN, dayOf: (ms) => new Date(ms).toISOString().slice(0, 10), offsetMinutes: () => 0 });
const london = () => new SessionTracker({ idleMs: 3 * MIN, offsetMinutes: londonOffsetMinutes });

/** A tiny author: holds a chapter's text and makes edits to it. */
function author(t: SessionTracker, chapter: { path: string; id?: string } = CH, text = "") {
	let body = text;
	return {
		get body() {
			return body;
		},
		do(at: number, next: string, origin?: Parameters<SessionTracker["edit"]>[0]["origin"]) {
			const ended = t.edit({ at, chapter, before: body, after: next, ...(origin ? { origin } : {}) });
			body = next;
			return ended;
		},
		type(at: number, add: string) {
			return this.do(at, body ? `${body} ${add}` : add, "type");
		},
	};
}

describe("when a session starts and ends", () => {
	it("starts at the first edit and ends at the last edit, not when the limit ran out", () => {
		const t = tracker();
		const a = author(t);
		a.type(T0, words(10));
		a.type(T0 + 2 * MIN, words(10));
		expect(t.running).toBe(true);
		const r = t.finish()!;
		expect(r.start).toBe("2026-06-10T09:00:00+00:00");
		expect(r.end).toBe("2026-06-10T09:02:00+00:00");
		expect(r.net).toBe(20);
		expect(t.running).toBe(false);
	});

	it("each edit restarts the idle limit from its full length", () => {
		const t = tracker();
		const a = author(t);
		a.type(T0, "a");
		// 2:50, then 2:50 again: each gap is under the limit though the whole is far more than it
		expect(a.type(T0 + 170_000, "b")).toBeNull();
		expect(a.type(T0 + 340_000, "c")).toBeNull();
		expect(t.idleExpired(T0 + 340_000 + 179_000)).toBe(false);
		expect(t.idleExpired(T0 + 340_000 + 180_000)).toBe(true);
	});

	it("a pause past the limit splits the session, ending the first at its last edit", () => {
		const t = tracker();
		const a = author(t);
		a.type(T0, words(5));
		a.type(T0 + MIN, words(5));
		const ended = a.type(T0 + 10 * MIN, words(5));
		expect(ended).not.toBeNull();
		expect(ended!.end).toBe("2026-06-10T09:01:00+00:00");
		expect(ended!.net).toBe(10);
		const second = t.finish()!;
		expect(second.start).toBe("2026-06-10T09:10:00+00:00");
		expect(second.net).toBe(5);
	});

	it("sleep is a jump in the clock: the session is over when the clock says so, whatever a timer did", () => {
		const t = tracker();
		author(t).type(T0, "x");
		expect(t.idleExpired(T0 + 8 * 3600_000)).toBe(true);
		expect(t.finish()!.end).toBe("2026-06-10T09:00:00+00:00");
	});

	it("one session covers every chapter written in", () => {
		const t = tracker();
		const a = author(t);
		const b = author(t, { path: "bbb/ch-b1.md" });
		a.type(T0, words(7));
		b.type(T0 + MIN, words(4));
		const r = t.finish()!;
		expect(r.net).toBe(11);
		expect(r.chapters.map((c) => [c.path, c.net])).toEqual([["aaa/ch-a1.md", 7], ["bbb/ch-b1.md", 4]]);
		expect(r.chapters[0].id).toBe("c-a1k3");
	});

	it("the idle limit is fixed when the session starts", () => {
		const t = tracker(1);
		author(t).type(T0, "x");
		expect(t.idleExpired(T0 + MIN)).toBe(true);
	});
});

describe("what counts", () => {
	it("counts the author's words net: deleting takes words off", () => {
		const t = tracker();
		const a = author(t, CH, words(20));
		a.do(T0, words(5), "delete");
		expect(t.finish()!.net).toBe(-15);
	});

	it("a reload from disk never counts, whether it adds or removes words", () => {
		const t = tracker();
		const a = author(t, CH, words(10));
		a.type(T0, words(5));
		t.reload(CH.path, `${a.body} ${words(100)}`); // an outside edit adds 100
		a.do(T0 + MIN, `${a.body} ${words(100)} ${words(2)}`, "type"); // the author carries on from the reloaded text
		expect(t.net()).toBe(5 + 2);
		t.reload(CH.path, words(3)); // an outside edit removes nearly everything
		expect(t.finish()!.net).toBe(5 + 2);
	});

	it("a reload in a chapter the session hasn't touched is ignored", () => {
		const t = tracker();
		author(t).type(T0, words(3));
		t.reload("zzz/other.md", words(50));
		expect(t.finish()!.chapters).toHaveLength(1);
	});

	it("uses the app's one word counter, comments included", () => {
		const t = tracker();
		const a = author(t, CH, "one two");
		a.do(T0, "one two <!-- a hidden comment of seven words here --> three", "type");
		expect(t.finish()!.net).toBe(1);
	});
});

describe("the three kinds", () => {
	it("a large paste or drop marks a session unreliable; a small one doesn't", () => {
		for (const origin of ["paste", "drop"] as const) {
			const big = tracker();
			author(big, CH, "start").do(T0, `start ${words(UNRELIABLE_PASTE_WORDS + 1)}`, origin);
			expect(big.finish()!.unreliable).toBe(true);
			const edge = tracker();
			author(edge, CH, "start").do(T0, `start ${words(UNRELIABLE_PASTE_WORDS)}`, origin);
			expect(edge.finish()!.unreliable).toBe(false);
		}
	});

	it("undo, redo, cut, typing and an input with no origin never mark a session, however many words", () => {
		for (const origin of ["undo", "redo", "cut", "type", "other", undefined] as const) {
			const t = tracker();
			author(t, CH, "start").do(T0, `start ${words(500)}`, origin);
			expect(t.finish()!.unreliable).toBe(false);
		}
	});

	it("a paste is judged by the words it adds, not the words it carries", () => {
		const t = tracker();
		author(t, CH, words(50)).do(T0, words(55), "paste"); // replaced 50 with 55: adds 5
		expect(t.finish()!.unreliable).toBe(false);
	});

	/** A stored record of a given net and length, as the files hold them. */
	const rec = (net: number, minutes: number, extra: Partial<{ unreliable: boolean }> = {}) => ({
		id: "x",
		start: "2026-06-10T09:00:00+00:00",
		end: isoWithOffset(T0 + minutes * MIN, 0),
		day: "2026-06-10",
		net,
		chapters: [{ path: "aaa/ch-a1.md", net }],
		unreliable: false,
		recovered: false,
		...extra,
	});

	it("net zero or less is editing; below the threshold is editing only when the setting is on", () => {
		expect(classify(rec(-5, 10), DEFAULT_SESSION_SETTINGS).editing).toBe(true);
		expect(classify(rec(0, 10), DEFAULT_SESSION_SETTINGS).editing).toBe(true);
		const slow = rec(20, 10); // 2 words a minute
		expect(classify(slow, DEFAULT_SESSION_SETTINGS).editing).toBe(false);
		expect(classify(slow, { ...DEFAULT_SESSION_SETTINGS, editingWpm: 5 }).editing).toBe(true);
		expect(classify(slow, { ...DEFAULT_SESSION_SETTINGS, editingWpm: 2 }).editing).toBe(false);
	});

	it("a short session isn't listed but its words still count in the figures", () => {
		const r = rec(40, 2);
		const k = classify(r, DEFAULT_SESSION_SETTINGS);
		expect(k.short).toBe(true);
		expect(k.listed).toBe(false);
		expect(k.inFigures).toBe(true);
		expect(k.inAverage).toBe(false);
	});

	it("changing a setting reclassifies without changing the record", () => {
		const r = rec(40, 2);
		const before = JSON.stringify(r);
		expect(classify(r, DEFAULT_SESSION_SETTINGS).listed).toBe(false);
		expect(classify(r, { ...DEFAULT_SESSION_SETTINGS, minShownMinutes: 1 }).listed).toBe(true);
		expect(JSON.stringify(r)).toBe(before);
	});

	it("an unreliable session is listed, out of the figures and out of the averages", () => {
		const k = classify(rec(100, 10, { unreliable: true }), DEFAULT_SESSION_SETTINGS);
		expect(k).toMatchObject({ listed: true, inFigures: false, inAverage: false });
	});

	it("pace is net words per minute, with no pace for a session of no length", () => {
		expect(paceWpm(rec(100, 10))).toBe(10);
		const t = tracker();
		author(t).type(T0, words(5));
		expect(paceWpm(t.finish()!)).toBeNull();
	});

	it("the average pace is total words over total minutes, over qualifying sessions only", () => {
		const records = [rec(100, 10), rec(300, 30), rec(500, 20, { unreliable: true }), rec(-20, 10), rec(40, 2)];
		expect(averagePace(records, DEFAULT_SESSION_SETTINGS)).toEqual({ wpm: 10, sessions: 2 });
	});
});

describe("time", () => {
	it("a session across the end of British Summer Time (25 October 2026) has the right offsets and length", () => {
		const t = london();
		const a = author(t);
		const start = Date.UTC(2026, 9, 25, 0, 30, 0); // 01:30 BST
		for (let m = 0; m <= 50; m += 2) a.type(start + m * MIN, "w"); // an edit every two minutes, through the repeated hour
		const last = start + 50 * MIN; // 01:20 GMT, the same wall clock hour again
		const r = t.finish()!;
		expect(r.start).toBe("2026-10-25T01:30:00+01:00");
		expect(r.end).toBe("2026-10-25T01:20:00+00:00");
		expect(lengthMinutes(r)).toBe(50);
		expect(r.day).toBe("2026-10-25");
		expect(parseInstant(r.end) - parseInstant(r.start)).toBe(last - start);
	});

	it("isoWithOffset writes the wall clock at the offset, to the second", () => {
		expect(isoWithOffset(Date.UTC(2026, 9, 25, 0, 30, 12, 900), 60)).toBe("2026-10-25T01:30:12+01:00");
		expect(isoWithOffset(Date.UTC(2026, 0, 1, 0, 0, 0), -330)).toBe("2025-12-31T18:30:00-05:30");
	});

	it("a session crossing midnight belongs to the day it started and splits its net between the days", () => {
		const t = london();
		const a = author(t, CH, words(10));
		const before = Date.UTC(2026, 5, 10, 22, 50, 0); // 23:50 BST on the 10th
		a.type(before, words(30));
		for (let m = 2; m <= 8; m += 2) a.type(before + m * MIN, m === 8 ? words(10) : "");
		a.type(Date.UTC(2026, 5, 10, 22, 59, 0), ""); // 23:59
		a.type(Date.UTC(2026, 5, 10, 23, 1, 0), words(7)); // 00:01 on the 11th
		const r = t.finish()!;
		expect(r.day).toBe("2026-06-10");
		expect(r.net).toBe(47);
		expect(r.chapters[0].byDay).toEqual({ "2026-06-10": 40, "2026-06-11": 7 });
	});

	it("a session that doesn't cross midnight stores no split", () => {
		const t = london();
		author(t).type(Date.UTC(2026, 5, 10, 9, 0, 0), words(3));
		expect(t.finish()!.chapters[0].byDay).toBeUndefined();
	});
});

describe("recovery", () => {
	it("an unfinished session is finished at its last checkpointed edit and marked recovered", () => {
		const t = tracker();
		const a = author(t);
		a.type(T0, words(10));
		a.type(T0 + 2 * MIN, words(6));
		const cp = t.checkpoint()!;
		a.type(T0 + 2 * MIN + 1000, words(99)); // typed after the checkpoint, then the app died
		const r = SessionTracker.recover(JSON.parse(JSON.stringify(cp)), { dayOf: (ms) => new Date(ms).toISOString().slice(0, 10), offsetMinutes: () => 0 });
		expect(r.recovered).toBe(true);
		expect(r.end).toBe("2026-06-10T09:02:00+00:00");
		expect(r.net).toBe(16);
		expect(r.unreliable).toBe(false);
	});

	it("keeps unreliable and the day split through a checkpoint", () => {
		const t = london();
		const a = author(t, CH, "x");
		a.do(Date.UTC(2026, 5, 10, 22, 50, 0), `x ${words(40)}`, "paste");
		for (const m of [52, 54, 56, 58]) a.type(Date.UTC(2026, 5, 10, 22, m, 0), "");
		a.type(Date.UTC(2026, 5, 10, 23, 0, 0), words(3)); // 00:00 on the 11th
		const r = SessionTracker.recover(t.checkpoint()!, { offsetMinutes: londonOffsetMinutes });
		expect(r.unreliable).toBe(true);
		expect(r.chapters[0].byDay).toEqual({ "2026-06-10": 40, "2026-06-11": 3 });
	});

	it("nothing to checkpoint when no session runs", () => {
		expect(tracker().checkpoint()).toBeNull();
	});
});

describe("the storytelling figures", () => {
	const mk = (day: string, chapters: { path: string; net: number; byDay?: Record<string, number> }[], over: Partial<{ unreliable: boolean }> = {}) => ({
		id: day,
		start: `${day}T10:00:00+00:00`,
		end: `${day}T10:20:00+00:00`,
		day,
		net: chapters.reduce((a, c) => a + c.net, 0),
		chapters,
		unreliable: false,
		recovered: false,
		...over,
	});

	it("a day's figure leaves out its unreliable and editing sessions, and nothing else", () => {
		const day = "2026-06-10";
		const records = [mk(day, [{ path: "aaa/a.md", net: 300 }], { unreliable: true }), mk(day, [{ path: "aaa/a.md", net: -80 }]), mk(day, [{ path: "aaa/a.md", net: 120 }])];
		const excluded = excludedByDay(records, DEFAULT_SESSION_SETTINGS);
		expect(excluded).toEqual({ [day]: 220 });
		// the history says 340 (300 pasted − 80 editing + 120 written); the storytelling figure is the 120
		expect(storytellingDaily({ [day]: 340 }, excluded)[day]).toBe(120);
	});

	it("excluding an editing session can raise a day's figure", () => {
		const records = [mk("2026-06-10", [{ path: "aaa/a.md", net: -80 }])];
		expect(storytellingDaily({ "2026-06-10": -80 }, excludedByDay(records, DEFAULT_SESSION_SETTINGS))["2026-06-10"]).toBe(0);
	});

	it("is per book, and words changed outside any session stay", () => {
		const records = [mk("2026-06-10", [{ path: "aaa/a.md", net: 100 }, { path: "bbb/b.md", net: 50 }], { unreliable: true })];
		expect(excludedByDay(records, DEFAULT_SESSION_SETTINGS, "bbb")).toEqual({ "2026-06-10": 50 });
		expect(storytellingDaily({ "2026-06-10": 175 }, excludedByDay(records, DEFAULT_SESSION_SETTINGS, "bbb"))["2026-06-10"]).toBe(125); // 25 changed in Obsidian stay
	});

	it("a midnight-crossing session takes each part off its own day", () => {
		const records = [mk("2026-06-10", [{ path: "aaa/a.md", net: 47, byDay: { "2026-06-10": 40, "2026-06-11": 7 } }], { unreliable: true })];
		expect(excludedByDay(records, DEFAULT_SESSION_SETTINGS)).toEqual({ "2026-06-10": 40, "2026-06-11": 7 });
	});

	it("today and this week take the excluded words off the history's own figures", () => {
		// 10 June 2026 is a Wednesday; the week began Monday the 8th.
		const excluded = { "2026-06-08": 30, "2026-06-10": 20, "2026-06-05": 999 };
		expect(storytellingTodayAndWeek(120, 400, excluded, "2026-06-10")).toEqual({ today: 100, week: 350 });
	});

	it("leaves the page alone: nothing here takes a chapter's word count", () => {
		// The figures read only session records and the history's day nets; no function takes a body or an index.
		expect(Object.keys({ excludedByDay, storytellingDaily, storytellingTodayAndWeek })).toHaveLength(3);
	});
});

describe("what tracking costs", () => {
	it("a keystroke in a 10,000-word chapter does no word counting at all, and no date formatting", () => {
		const calls = { count: 0, day: 0 };
		const base = Array.from({ length: 10_000 }, (_, i) => `word${i % 50}`).join(" ");
		const t = new SessionTracker({
			idleMs: 3 * MIN,
			count: (b) => (calls.count++, b.split(/\s+/).length),
			dayOf: (ms) => (calls.day++, new Date(ms).toISOString().slice(0, 10)),
			offsetMinutes: () => 0,
		});
		let body = base;
		t.edit({ at: T0, chapter: CH, before: body, after: `${body}x`, origin: "type" });
		body += "x";
		const afterFirst = { ...calls };
		for (let i = 1; i <= 2000; i++) {
			t.edit({ at: T0 + i * 100, chapter: CH, before: body, after: `${body}y`, origin: "type" });
			body += "y";
		}
		expect(calls.count).toBe(afterFirst.count); // not one count in 2,000 keystrokes
		expect(calls.day).toBeLessThanOrEqual(afterFirst.day + 5); // the day is looked up once a minute, not per keystroke
		expect(t.net()).toBe(0); // "x" and "y" glued to the last word add no words; counting happens only here
	});
});
