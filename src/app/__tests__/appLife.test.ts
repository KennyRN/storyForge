import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FakeHost, ManualTimers } from "../../../test/helpers/fakeHost";
import { cleanupFixtures, copyFixture, diffSnapshots, snapshot } from "../../../test/helpers/fixtures";
import { available } from "../../../test/helpers/rustBridge";
import { settle } from "../../../test/helpers/scheduler";
import { readBookFrontmatter } from "../../core/book";
import { AppController, newestBackupTime } from "../appLife";
import { PROJECT_SETTINGS_PATH } from "../settings";

const hosts: FakeHost[] = [];
const apps: AppController[] = [];
const dirs: string[] = [];
afterEach(async () => {
	for (const a of apps.splice(0)) await a.teardown().catch(() => undefined); // releases the one-project latch
	for (const h of hosts.splice(0)) h.close();
	cleanupFixtures();
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function track(app: AppController): AppController {
	apps.push(app);
	return app;
}
function makeHost() {
	const h = new FakeHost();
	hosts.push(h);
	return h;
}
const tmp = () => {
	const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sf-life-")));
	dirs.push(d);
	return d;
};
const A = "_story-library/aaa";

describe("newestBackupTime", () => {
	it("reads the date (and time) from backup names", () => {
		expect(newestBackupTime([])).toBe(0);
		expect(newestBackupTime(["20261020 - p.zip", "20261022 - p.zip", "20261021-235959 - p.zip", "notes.txt", "20261022-101112 - p - full.zip"])).toBe(new Date(2026, 9, 22, 10, 11, 12).getTime());
		expect(newestBackupTime(["20261022 - p.zip"])).toBe(new Date(2026, 9, 22).getTime());
		expect(newestBackupTime(["x - 20261022.zip"])).toBe(0);
	});
});

(available() ? describe : describe.skip)("the app's life, over the real Rust file-system code", () => {
	async function opened(fixture = "series", prepare?: (root: string) => void, extra?: (h: FakeHost) => void) {
		const root = copyFixture(fixture);
		prepare?.(root);
		const host = makeHost();
		extra?.(host);
		host.nextPick = { root };
		const app = track(new AppController(host));
		await app.start();
		const outcome = await app.openDialog("open");
		if (outcome.kind !== "opened") throw new Error(`not opened: ${outcome.kind}`);
		return { root, host, app, running: outcome.running };
	}

	it("opens a project: one scan, settings with their sources, the watcher started, timings recorded", async () => {
		const { host, running, root } = await opened();
		expect(host.calls.filter((c) => c === "scan")).toHaveLength(1);
		expect(host.calls).toContain("watch_start");
		expect(running.settings.sources.autoFocus).toBe("data.json");
		expect(running.timings.entries).toBeGreaterThan(30);
		expect(running.timings.scanMs).toBeGreaterThanOrEqual(0);
		expect(running.timings.scanPayloadChars).toBeGreaterThan(1000);
		expect(host.recent).toEqual([root]);
		expect(running.opened.project.exists(`${A}/ch-a1.md`)).toBe(true);
	});

	it("opening twice leaves the folder byte-identical", async () => {
		const root = copyFixture("series");
		const run = async () => {
			const host = makeHost();
			host.nextPick = { root };
			const app = track(new AppController(host));
			await app.start();
			await app.openDialog("open");
			await app.teardown();
		};
		await run();
		const settled = snapshot(root);
		await run();
		await run();
		expect(diffSnapshots(settled, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
	});

	it("a newer project opens read-only: no watcher, no backups, nothing written, and the editor refuses", async () => {
		const root = copyFixture("series");
		fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), "---\nformat-version: 9\nautomatic-backup: true\n---\n");
		const before = snapshot(root);
		const host = makeHost();
		host.nextPick = { root, readOnly: true };
		const app = track(new AppController(host));
		await app.start();
		const outcome = await app.openDialog("open");
		if (outcome.kind !== "opened") throw new Error("not opened");
		expect(outcome.running.readOnlyReason).toMatch(/newer storyForge/);
		expect(host.calls).not.toContain("watch_start");
		await expect(app.openFile(`${A}/ch-a1.md`)).rejects.toThrow(/read-only/);
		expect(await app.maybeAutomaticBackup("open")).toBeNull();
		await expect(app.manualBackup("full")).rejects.toThrow(/newer storyForge/);
		await app.teardown();
		expect(diffSnapshots(before, snapshot(root))).toEqual({ added: [], removed: [], changed: [] });
		expect(host.machine.size).toBe(1); // only the snapshot, which lives outside the project
	});

	it("the automatic backup runs at open when it is on and due, and not again the same day", async () => {
		const prepare = (root: string) => fs.writeFileSync(path.join(root, PROJECT_SETTINGS_PATH), "---\nformat-version: 1\nautomatic-backup: true\nautomatic-backup-frequency: daily\n---\n");
		const first = await opened("series", prepare);
		await first.app.backupSettled();
		const zips = () => fs.readdirSync(path.join(first.root, "_sf-backup")).filter((f) => f.endsWith(".zip"));
		expect(zips()).toHaveLength(1);
		expect(zips()[0]).toMatch(/^20261023 - /);
		await first.app.teardown();
		// Reopened the same day: the newest zip's date says it is not due.
		first.host.nextPick = { root: first.root };
		const again = await first.app.openDialog("open");
		expect(again.kind).toBe("opened");
		await first.app.backupSettled();
		expect(zips()).toHaveLength(1);
		// A day later it is due again.
		first.host.clock = new Date(2026, 9, 24, 10, 0, 1);
		const r = await first.app.maybeAutomaticBackup("interval");
		expect(r?.path).toMatch(/^_sf-backup\/20261024 - /);
		expect(zips()).toHaveLength(2);
	});

	it("the schedule is checked every 30 minutes while a project is open, and not when automatic backups are off", async () => {
		const timers = new ManualTimers();
		const off = await opened("series", undefined, (h) => (h.timers = timers));
		expect(timers.intervals.size).toBe(1);
		expect(await off.app.maybeAutomaticBackup("interval")).toBeNull();
		await off.app.teardown();
		expect(timers.intervals.size).toBe(0);
	});

	it("manual backups: the normal scope and the full one", async () => {
		const { app, root } = await opened();
		const scope = await app.manualBackup("scope");
		const full = await app.manualBackup("full");
		expect(scope.path).toMatch(/^_sf-backup\/20261023-100000 - /);
		expect(full.path).toMatch(/ - full\.zip$/);
		expect(fs.existsSync(path.join(root, scope.path))).toBe(true);
		expect(fs.existsSync(path.join(root, full.path))).toBe(true);
	});

	it("closing with unsaved text in several sessions saves or recovers all of it, saves the snapshot, and then lets Rust quit", async () => {
		const { app, host, root } = await opened();
		const a = await app.openFile(`${A}/ch-a1.md`);
		const b = await app.openFile(`${A}/ch-a3.md`);
		const c = await app.openFile("Codex/Sam.md");
		a.setBody("Typed into chapter one.");
		b.setBody("Typed into chapter three, which changes elsewhere.");
		c.setBody("Typed into Sam.");
		fs.writeFileSync(path.join(root, `${A}/ch-a3.md`), "Elsewhere.\n");
		const report = await app.shutdownAndQuit();
		expect(report.saves.map((s) => s.kind).sort()).toEqual(["conflict", "saved", "saved"]);
		expect(fs.readFileSync(path.join(root, `${A}/ch-a1.md`), "utf8")).toBe("Typed into chapter one.\n");
		expect(fs.readFileSync(path.join(root, "Codex/Sam.md"), "utf8")).toMatch(/Typed into Sam\.\n$/);
		const recovered = fs.readdirSync(path.join(root, "_sf-backup/recovery/aaa"));
		expect(recovered).toHaveLength(1);
		expect(fs.readFileSync(path.join(root, "_sf-backup/recovery/aaa", recovered[0]), "utf8")).toBe("Typed into chapter three, which changes elsewhere.");
		expect(report.snapshot).toBe("saved");
		expect([...host.machine.keys()].some((k) => k.startsWith("snapshots/"))).toBe(true);
		expect(host.calls.slice(-3)).toEqual(["watch_stop", "close_project", "quit_ready"]);
		expect(host.quit).toBe(true);
	});

	it("if flushing outlasts the limit, the unsaved text is written to recovery files instead, exactly", async () => {
		const timers = new ManualTimers();
		const { app, running, root } = await opened("series", undefined, (h) => (h.timers = timers));
		const s = await app.openFile(`${A}/ch-a1.md`);
		const note = await app.openFile("Codex/Sam.md");
		s.setBody("Precious chapter words.");
		note.setBody("Precious note words.");
		running.opened.writer.closeAll = () => new Promise(() => undefined); // the disk has hung
		const done = app.teardown();
		await settle();
		timers.fireTimeouts();
		const report = await done;
		expect(report.forcedRecoveries.map((r) => r.path).sort()).toEqual([`${A}/ch-a1.md`, "Codex/Sam.md"].sort());
		for (const r of report.forcedRecoveries) {
			expect(r.error).toBeUndefined();
			const text = fs.readFileSync(path.join(root, r.recoveryPath as string), "utf8");
			expect(text).toBe(r.path.endsWith("ch-a1.md") ? "Precious chapter words." : "Precious note words.");
		}
	});

	it("a link rewrite in progress always finishes before the app closes", async () => {
		const { app } = await opened();
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const rewrite = app.runRewrite(async () => {
			await gate;
			order.push("rewrite finished");
		});
		const closing = app.teardown().then(() => order.push("closed"));
		await settle();
		expect(order).toEqual([]); // still waiting, however long it takes
		release();
		await rewrite;
		await closing;
		expect(order).toEqual(["rewrite finished", "closed"]);
	});

	it("a backup in progress is abandoned cleanly: no partial zip, no temp file", async () => {
		const { app, running, root } = await opened();
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const realScan = running.opened.project.fs.scan.bind(running.opened.project.fs);
		running.opened.project.fs.scan = (dir?: string) =>
			(async function* () {
				await gate;
				yield* realScan(dir);
			})();
		const backup = app.manualBackup("full").catch((e: Error) => e);
		await settle();
		const closing = app.teardown();
		release();
		await closing;
		expect(await backup).toMatchObject({ name: "BackupAbandonedError" });
		const dir = path.join(root, "_sf-backup");
		expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
	});

	it("applies watcher batches: a rename made in Obsidian is matched", async () => {
		const { app, host, root, running } = await opened();
		const seen: string[] = [];
		app.onBatch = (_b, r) => void seen.push(JSON.stringify(r.reconciliation?.matched.map((m) => m.to)));
		fs.renameSync(path.join(root, `${A}/ch-a2.md`), path.join(root, `${A}/Second.md`));
		host.emit("watch-batch", { paths: [`${A}/ch-a2.md`, `${A}/Second.md`], rescan: false });
		await app.settled();
		expect(seen).toEqual([JSON.stringify([`${A}/Second.md`])]);
		expect(readBookFrontmatter(running.opened.project, "aaa")!.chapterOrder).toEqual(["ch-a1.md", "Second.md", "ch-a5.md"]);
	});

	it("a rescan request compares the whole folder", async () => {
		const { app, root, running } = await opened();
		fs.renameSync(path.join(root, "Codex/Sam.md"), path.join(root, "Codex/Samuel.md"));
		await app.rescan();
		expect(running.opened.project.exists("Codex/Samuel.md")).toBe(true);
		expect(running.opened.project.exists("Codex/Sam.md")).toBe(false);
	});

	it("opening another project saves the first first; cancelling the picker keeps the first open", async () => {
		const { app, host, root, running } = await opened();
		const s = await app.openFile(`${A}/ch-a3.md`);
		s.setBody("Unsaved in the first project.");
		const second = copyFixture("series");
		host.nextPick = { root: second };
		const outcome = await app.openDialog("open");
		expect(outcome.kind).toBe("opened");
		expect(fs.readFileSync(path.join(root, `${A}/ch-a3.md`), "utf8")).toBe("Unsaved in the first project.\n");
		expect(app.running?.root).toBe(second);
		// cancel: the second stays open (and its text is safe)
		host.nextPick = null;
		const cancelled = await app.openDialog("open");
		expect(cancelled.kind).toBe("opened");
		expect(app.running?.root).toBe(second);
		void running;
	});

	it("an empty folder is not opened as a project, and is never seeded by opening", async () => {
		const root = tmp();
		const host = makeHost();
		host.nextPick = { root };
		const app = track(new AppController(host));
		await app.start();
		const outcome = await app.openDialog("open");
		expect(outcome.kind).toBe("not-a-project");
		expect(fs.readdirSync(root)).toEqual([]);
	});

	it("creating a project from an empty folder creates the first-run layout and opens it", async () => {
		const root = tmp();
		const host = makeHost();
		host.nextPick = { root };
		const app = track(new AppController(host));
		await app.start();
		const outcome = await app.openDialog("create", { seriesTitle: "My Series" });
		if (outcome.kind !== "opened") throw new Error(outcome.kind);
		expect(fs.existsSync(path.join(root, "_story-library/series.md"))).toBe(true);
		expect(outcome.running.opened.project.frontmatter("_story-library/series.md")).toMatchObject({ "series-title": "My Series" });
	});

	it("opening an iCloud placeholder downloads that one file, then opens it", async () => {
		const { app, host, root } = await opened("series", (r) => {
			fs.rmSync(path.join(r, `${A}/ch-a2.md`));
			fs.writeFileSync(path.join(r, `${A}/.ch-a2.md.icloud`), "stub");
		});
		expect(app.running?.opened.project.isPlaceholder(`${A}/ch-a2.md`)).toBe(true);
		const downloads: string[] = [];
		host.overrides.set("download_placeholder", (args) => {
			const p = (args as { path: string }).path;
			downloads.push(p);
			fs.rmSync(path.join(root, `${A}/.ch-a2.md.icloud`));
			fs.writeFileSync(path.join(root, p), "Opening line of a second chapter, downloaded.\n\nIt ends.\n");
			return true;
		});
		const session = await app.openFile(`${A}/ch-a2.md`);
		expect(downloads).toEqual([`${A}/ch-a2.md`]);
		expect(session.body).toContain("downloaded");
		expect(app.running?.opened.project.isPlaceholder(`${A}/ch-a2.md`)).toBe(false);
	});

	it("if the download fails, the file stays unavailable and the author is told", async () => {
		const { app, host, root } = await opened("series", (r) => {
			fs.rmSync(path.join(r, `${A}/ch-a2.md`));
			fs.writeFileSync(path.join(r, `${A}/.ch-a2.md.icloud`), "stub");
		});
		host.overrides.set("download_placeholder", () => false);
		await expect(app.openFile(`${A}/ch-a2.md`)).rejects.toThrow(/stored in iCloud and could not be downloaded/);
		expect(fs.existsSync(path.join(root, `${A}/.ch-a2.md.icloud`))).toBe(true);
		expect(fs.existsSync(path.join(root, `${A}/ch-a2.md`))).toBe(false);
	});
});
