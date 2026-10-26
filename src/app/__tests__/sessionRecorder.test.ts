import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeFsBackend } from "../../backends/node-fs";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { ManualScheduler, settle } from "../../../test/helpers/scheduler";
import { Project } from "../../core/project";
import { ProseWriter } from "../../core/proseWriter";
import { readSessions } from "../../core/sessionFiles";
import { CHECKPOINT_MS, SessionRecorder } from "../sessionRecorder";

afterEach(cleanupFixtures);

const T0 = Date.UTC(2026, 5, 10, 9, 0, 0);
const MIN = 60_000;
const CH = "_story-library/aaa/ch-a1.md";
const words = (n: number) => Array.from({ length: n }, () => "w").join(" ");

class FakeMachine {
	data = new Map<string, string>();
	sets = 0;
	failWrites = false;
	async get(name: string) {
		return this.data.get(name) ?? null;
	}
	async set(name: string, text: string) {
		this.sets += 1;
		if (this.failWrites) throw new Error("disk full");
		this.data.set(name, text);
	}
}

async function setup(opts: { idleMin?: number } = {}) {
	const root = copyFixture("series");
	const project = await Project.open(new NodeFsBackend(root));
	const scheduler = new ManualScheduler();
	const clock = () => T0 + scheduler.now;
	const writer = new ProseWriter(project, { scheduler, now: () => new Date(clock()) });
	const machine = new FakeMachine();
	const failures: Error[] = [];
	const progress: string[] = [];
	let idle = opts.idleMin ?? 3;
	const make = () =>
		new SessionRecorder({
			project,
			writer,
			machine,
			storeName: "session/x",
			computer: async () => "k7x2q9ab",
			idleMs: () => idle * MIN,
			timers: scheduler,
			now: clock,
			offsetMinutes: () => 0,
			dayOf: (ms) => new Date(ms).toISOString().slice(0, 10),
			onProgress: () => void progress.push("p"),
			onFailure: (e) => void failures.push(e),
		});
	const recorder = make();
	recorder.start();
	const advance = async (ms: number) => {
		scheduler.advance(ms);
		await settle();
	};
	return { root, project, scheduler, writer, machine, recorder, failures, progress, advance, make, setIdle: (m: number) => (idle = m) };
}

/** Types into the chapter a little at a time, like an author. */
async function typeFor(ctx: Awaited<ReturnType<typeof setup>>, minutes: number, session?: Awaited<ReturnType<ProseWriter["open"]>>) {
	const s = session ?? (await ctx.writer.open(CH));
	for (let i = 0; i < minutes; i++) {
		s.setBody(`${s.body} ${words(10)}`);
		await ctx.advance(MIN);
	}
	return s;
}

describe("the session recorder", () => {
	it("records a session: it starts at the first edit and ends at the last, not when the limit ran out", async () => {
		const ctx = await setup();
		const s = await typeFor(ctx, 6);
		expect(ctx.recorder.running).toBe(true);
		const lastEdit = T0 + 5 * MIN;
		await ctx.advance(10 * MIN); // the idle limit passes
		expect(ctx.recorder.running).toBe(false);
		const read = readSessions(ctx.project);
		expect(read.sessions).toHaveLength(1);
		const r = read.sessions[0];
		expect(r.start).toBe(new Date(T0).toISOString().replace(".000Z", "+00:00"));
		expect(r.end).toBe(new Date(lastEdit).toISOString().replace(".000Z", "+00:00"));
		expect(r.net).toBe(60);
		expect(r.chapters).toEqual([{ path: "aaa/ch-a1.md", id: "c-a1k3", net: 60 }]);
		expect(r.recovered).toBe(false);
		void s;
	});

	it("writes nothing to the project while a session runs: only the app's data folder is touched", async () => {
		const ctx = await setup();
		await ctx.writer.open(CH);
		const before = snapshot(ctx.root);
		const s = await typeFor(ctx, 4);
		s.setBody(`${s.body} extra`);
		const diff = diffSnapshots(before, snapshot(ctx.root));
		expect(diff.added.filter((p) => p.includes("sessions"))).toEqual([]); // nothing in sessions/ until the session ends
		expect(ctx.machine.data.get("session/x")).toContain('"cp"');
	});

	it("nothing at all is written to the project on a keystroke: before the first save the folder is byte-identical", async () => {
		const ctx = await setup();
		const s = await ctx.writer.open(CH);
		const before = snapshot(ctx.root);
		for (let i = 0; i < 100; i++) {
			s.setBody(`${s.body} k${i}`);
			await ctx.advance(10); // a hundred keystrokes inside the save delay
		}
		const diff = diffSnapshots(before, snapshot(ctx.root));
		expect([diff.added, diff.changed, diff.removed]).toEqual([[], [], []]);
		expect(ctx.recorder.running).toBe(true);
	});

	it("the word-count history is byte-identical with and without session tracking", async () => {
		const wc = "_backstage/storyforge/aaa/wordcount.md";
		const run = async (track: boolean) => {
			const ctx = await setup();
			if (!track) ctx.recorder.dispose();
			const s = await ctx.writer.open(CH);
			for (let i = 0; i < 5; i++) {
				s.setBody(`${s.body} typed words number ${i}`);
				await ctx.advance(3000);
			}
			if (track) await ctx.recorder.end();
			return fs.readFileSync(path.join(ctx.root, wc), "utf8");
		};
		expect(await run(true)).toBe(await run(false));
	});

	it("a Codex note never starts or extends a session", async () => {
		const ctx = await setup();
		const note = await ctx.writer.open("Codex/Jane.md");
		note.setBody("a long note edit ".repeat(20));
		await ctx.advance(MIN);
		expect(ctx.recorder.running).toBe(false);
		await ctx.recorder.end();
		expect(readSessions(ctx.project).sessions).toEqual([]);
	});

	it("checkpoints the session in progress at most every few seconds, never on a keystroke", async () => {
		const ctx = await setup();
		const s = await ctx.writer.open(CH);
		for (let i = 0; i < 40; i++) {
			s.setBody(`${s.body} k`);
			await ctx.advance(100); // 40 keystrokes in 4 seconds
		}
		await settle();
		expect(ctx.machine.sets).toBeLessThanOrEqual(2);
		await ctx.advance(CHECKPOINT_MS);
		expect(ctx.machine.sets).toBeLessThanOrEqual(3);
	});

	it("ending on close writes the session, clears the in-progress record, and counts as progress", async () => {
		const ctx = await setup();
		await typeFor(ctx, 3);
		await ctx.recorder.end();
		expect(readSessions(ctx.project).sessions).toHaveLength(1);
		expect(ctx.machine.data.get("session/x")).toBe("");
		expect(ctx.progress.length).toBe(2); // before and after
		ctx.recorder.dispose();
	});

	it("a crash is recovered at the next open: finished at the last checkpoint, marked recovered, then gone", async () => {
		const ctx = await setup();
		await typeFor(ctx, 3);
		await ctx.advance(CHECKPOINT_MS);
		expect(readSessions(ctx.project).sessions).toEqual([]); // still in progress
		// the app dies here: a new run, a new recorder, the same data folder
		const next = ctx.make();
		expect(await next.recoverFromCrash()).toBe(1);
		const [r] = readSessions(ctx.project).sessions;
		expect(r.recovered).toBe(true);
		expect(r.net).toBe(30);
		expect(ctx.machine.data.get("session/x")).toBe("");
		expect(await ctx.make().recoverFromCrash()).toBe(0);
		expect(readSessions(ctx.project).sessions).toHaveLength(1);
	});

	it("an unwritable session file is reported once and quietly, typing carries on, and the record is kept for the next open", async () => {
		const ctx = await setup();
		await typeFor(ctx, 2);
		const spy = vi.spyOn(ctx.project, "modifyFrontmatter").mockRejectedValue(new Error("no space"));
		await ctx.recorder.end();
		await ctx.recorder.end();
		expect(ctx.failures).toHaveLength(1);
		const blob = JSON.parse(ctx.machine.data.get("session/x") ?? "{}");
		expect(blob.unsent).toHaveLength(1);
		spy.mockRestore();
		expect(await ctx.make().recoverFromCrash()).toBe(1);
		expect(readSessions(ctx.project).sessions).toHaveLength(1);
	});

	it("a failing data folder is reported once and doesn't stop recording", async () => {
		const ctx = await setup();
		ctx.machine.failWrites = true;
		const s = await typeFor(ctx, 8);
		expect(ctx.failures.length).toBe(1);
		s.setBody(`${s.body} still typing`);
		expect(ctx.recorder.running).toBe(true);
	});

	it("a reload from disk never counts as writing", async () => {
		const ctx = await setup();
		const s = await typeFor(ctx, 2);
		fs.writeFileSync(path.join(ctx.root, CH), `---\nchapter-order: x\n---\n${s.body} ${words(200)}\n`);
		await ctx.project.refresh(CH);
		await ctx.writer.onDiskChanged(CH, fs.readFileSync(path.join(ctx.root, CH), "utf8"));
		await ctx.recorder.end();
		expect(readSessions(ctx.project).sessions[0].net).toBe(20);
	});

	it("waking from sleep: a clock that jumped past the limit ends the session at its last edit when the window is checked", async () => {
		const ctx = await setup();
		await typeFor(ctx, 2);
		const jumped = ctx.scheduler.now; // sleep: the clock moves, the (frozen) timer does not fire
		(ctx.scheduler as unknown as { timers: Map<number, unknown> }).timers.clear();
		ctx.scheduler.now = jumped + 6 * 3600_000;
		ctx.recorder.checkIdle();
		await settle();
		expect(ctx.recorder.running).toBe(false);
		const r = readSessions(ctx.project).sessions[0];
		expect(r.end).toBe(new Date(T0 + MIN).toISOString().replace(".000Z", "+00:00"));
	});

	it("changing the idle limit affects the next session only", async () => {
		const ctx = await setup({ idleMin: 3 });
		await typeFor(ctx, 1);
		ctx.setIdle(1); // a running session keeps its own limit
		await ctx.advance(2 * MIN);
		expect(ctx.recorder.running).toBe(true);
		await ctx.advance(2 * MIN);
		expect(ctx.recorder.running).toBe(false);
		const s = await ctx.writer.open(CH);
		s.setBody(`${s.body} next`);
		await ctx.advance(MIN + 5000); // the new limit: one minute
		expect(ctx.recorder.running).toBe(false);
	});

	it("an edit after a pause the timer never noticed ends the old session at its last edit and starts a new one", async () => {
		const ctx = await setup();
		const s = await typeFor(ctx, 2);
		(ctx.scheduler as unknown as { timers: Map<number, unknown> }).timers.clear();
		ctx.scheduler.now += 30 * MIN;
		s.setBody(`${s.body} after the break`);
		await settle();
		await ctx.recorder.end();
		const sessions = readSessions(ctx.project).sessions;
		expect(sessions).toHaveLength(2);
		expect(sessions[0].end).toBe(new Date(T0 + MIN).toISOString().replace(".000Z", "+00:00"));
	});
});
