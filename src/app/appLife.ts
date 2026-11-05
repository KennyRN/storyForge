/**
 * App life (docs/tauri-shell.md §8): opening and creating a project, the watcher, the backup
 * schedule, iCloud downloads, and closing without losing a word. The host (Tauri, or a fake in the
 * tests) supplies `invoke`, events and timers; everything else is the tested core.
 */
import type { PeekBook, PeekResult } from "../core/projectCard";
import { TauriBackend, TauriMachineStore, type Invoke } from "../backends/tauri";
import { BackupAbandonedError, type BackupResult, type BackupService, isBackupDue } from "../core/backup";
import { readFrontmatter } from "../core/frontmatter";
import { type OpenedProject, NotAProjectError, createProject, openProject, type CreateProjectOptions } from "../core/openProject";
import { BACKUPS_FOLDER } from "../core/paths";
import { icloudPlaceholderTarget } from "../core/pathRules";
import type { ProseSession } from "../core/proseWriter";
import { recoverChapterText, recoverCodexText } from "../core/recovery";
import { bookFolderNameFromChapterPath } from "../core/paths";
import { MachineSnapshotStore } from "./machineSnapshots";
import { type Batch, type BatchResult, applyBatch } from "./applyBatch";
import {
	type LoadedSettings,
	type MachineProjectState,
	PROJECT_SETTINGS_PATH,
	SUPPORTED_FORMAT,
	loadMachineProjectState,
	loadSettings,
	refreshSettings,
	saveMachineProjectState,
} from "./settings";
import { sha256Text } from "../core/hash";
import { SessionRecorder } from "./sessionRecorder";

/** Flushing open editors at close waits at most this long; after it, whatever is unsaved goes to recovery. */
export const CLOSE_LIMIT_MS = 5000;
/** The automatic backup is checked at open and then this often, as 0.17.1 did. */
export const BACKUP_CHECK_MS = 30 * 60 * 1000;

export interface Timers {
	setInterval(fn: () => void, ms: number): unknown;
	clearInterval(handle: unknown): void;
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

/** Something the close finishes before it flushes the editors: `commit` it, and if that outlasts the limit, `rescue` what it was writing. */
export interface CloseCommit {
	commit(): Promise<void>;
	rescue?(): Promise<void>;
}

/** Which cover: the series', or a book's by its folder name. Never a path. */
export type CoverTarget = { kind: "series" } | { kind: "book"; code: string };

export interface Host {
	invoke: Invoke;
	/** Subscribes to an app event; resolves to an unsubscribe function. */
	listen(event: string, handler: (payload: unknown) => void): Promise<() => void>;
	timers?: Timers;
	now?: () => Date;
	/** How long after the author stops typing a chapter is saved. The diagnostic window lengthens it so the close-with-unsaved-text check is easy to do by hand. */
	saveDelayMs?: number;
}

interface PickedProject {
	root: string;
	readOnly: boolean;
}

export interface OpenTimings {
	/** Milliseconds from the picker's answer to the project being ready. */
	totalMs: number;
	/** Milliseconds for the one bulk scan call. */
	scanMs: number;
	entries: number;
	/** The size of the scan's reply (text and paths), in characters. */
	scanPayloadChars: number;
}

export interface Running {
	root: string;
	opened: OpenedProject;
	backend: TauriBackend;
	settings: LoadedSettings;
	machineState: MachineProjectState;
	timings: OpenTimings;
	/** Why nothing may be written, if so. */
	readOnlyReason?: string;
	/** The deleted-settings notice has been given and the file hasn't come back. */
	settingsAbsentTold?: boolean;
	/** Records writing sessions; absent in a read-only project, which records nothing. */
	sessions?: SessionRecorder;
}

export type OpenOutcome = { kind: "opened"; running: Running } | { kind: "cancelled" } | { kind: "not-a-project"; root: string; message: string };

export interface ShutdownReport {
	/** Unsaved text saved or recovered by the normal flush. */
	saves: { path: string; kind: string }[];
	/** The flush ran out of time: these sessions' text was written to recovery files instead. */
	forcedRecoveries: { path: string; recoveryPath?: string; error?: string }[];
	/** A link rewrite that was still running when the app was asked to close, and was allowed to finish. */
	rewriteFinished: boolean;
	backupAbandoned: boolean;
	snapshot: "saved" | "failed" | "skipped";
}

/** Date of the newest backup zip in `_sf-backup/`, from its name (`yyyymmdd - ...` or `yyyymmdd-hhmmss - ...`); 0 if none. */
export function newestBackupTime(names: readonly string[]): number {
	let newest = 0;
	for (const name of names) {
		const m = /^(\d{4})(\d{2})(\d{2})(?:-(\d{2})(\d{2})(\d{2}))? - .*\.zip$/i.exec(name);
		if (!m) continue;
		const t = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0).getTime();
		if (t > newest) newest = t;
	}
	return newest;
}

const defaultTimers: Timers = {
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const basename = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? "project";

export class AppController {
	private current: Running | null = null;
	private unlisten: (() => void)[] = [];
	private queue: Promise<unknown> = Promise.resolve();
	private activeRewrite: Promise<unknown> | null = null;
	private backupTimer: unknown;
	private pendingBackup: Promise<unknown> = Promise.resolve();
	private shuttingDown = false;
	private readonly timers: Timers;
	private readonly now: () => Date;
	readonly machine: TauriMachineStore;
	/** Called with every applied watcher batch (the diagnostic window logs them). */
	onBatch?: (batch: Batch, result: BatchResult) => void;
	/** Settings were re-read after an outside change; these keys now hold different values. */
	onSettingsChanged?: (keys: string[]) => void;
	/** A re-read found `project.md` unreadable, gone, or from a newer storyForge. Told once per occurrence. */
	onSettingsProblem?: (kind: "unreadable" | "absent" | "newer", formatVersion: number) => void;
	onBackup?: (result: BackupResult | Error, trigger: string) => void;
	onChange?: () => void;
	/** Called once per open project when writing sessions can't be recorded (writing is unaffected). */
	onSessionFailure?: (err: Error) => void;
	/** Called when a writing session starts or ends (the live readout listens). */
	onSessionChange?: () => void;

	constructor(private readonly host: Host) {
		this.timers = host.timers ?? defaultTimers;
		this.now = host.now ?? (() => new Date());
		this.machine = new TauriMachineStore(host.invoke);
	}

	get running(): Running | null {
		return this.current;
	}

	/** Hooks the app's menu, the window-close request and the watcher. Call once at start-up. */
	async start(): Promise<void> {
		this.unlisten.push(await this.host.listen("menu", (id) => void this.onMenu(String(id))));
		this.unlisten.push(await this.host.listen("close-requested", () => void this.shutdownAndQuit()));
		this.unlisten.push(await this.host.listen("watch-batch", (b) => this.enqueue(() => this.onWatchBatch(b as Batch))));
	}

	/** The interface takes the menu items it owns (New Project needs its own dialog); return true if handled. */
	menuHandler?: (id: string) => boolean;

	private async onMenu(id: string): Promise<void> {
		if (this.menuHandler?.(id)) return;
		if (id === "open-project") await this.openDialog("open");
		else if (id === "new-project") await this.openDialog("create");
	}

	recent(): Promise<string[]> {
		return this.host.invoke("recent_projects") as Promise<string[]>;
	}

	/** What a start-screen card needs about the `index`th recent project (Brief 16): read only; the window names an entry, never a path. */
	peekRecent(index: number): Promise<PeekResult> {
		return this.host.invoke("peek_recent", { index }) as Promise<PeekResult>;
	}

	/** The book at `position` in the folder list `peekRecent` returned for that entry; refused if the folder changed since. Read only. */
	peekRecentBook(index: number, position: number): Promise<PeekBook> {
		return this.host.invoke("peek_recent_book", { index, position }) as Promise<PeekBook>;
	}

	/** Removes the `index`th entry from the recent list (Remove from List). Writes only the app's own recent list, never the project. */
	async forgetRecent(index: number): Promise<void> {
		await this.host.invoke("forget_recent", { index });
	}

	/** Empties the recent list (File ▸ Open Recent ▸ Clear Menu). */
	async clearRecent(): Promise<void> {
		await this.host.invoke("clear_recent");
	}

	/** The names the cards show, for the Open Recent menu's labels: `[folder name, name]` per entry, in the list's order. Labels only. */
	async setRecentNames(entries: [string, string][]): Promise<void> {
		await this.host.invoke("set_recent_names", { entries });
	}

	/** The picker. Opening another project saves everything in the current one first. */
	async openDialog(kind: "open" | "create", create?: CreateProjectOptions): Promise<OpenOutcome> {
		const hadProject = this.current !== null;
		if (hadProject) await this.teardown();
		const picked = (await this.host.invoke("pick_project", { kind })) as PickedProject | null;
		if (!picked) {
			// Cancelled: the project that was open is the newest in the recent list, so go back to it.
			if (hadProject) return this.attach((await this.host.invoke("open_recent", { index: 0 })) as PickedProject);
			return { kind: "cancelled" };
		}
		return this.attach(picked, kind === "create" ? create : undefined);
	}

	async openRecent(index: number): Promise<OpenOutcome> {
		if (this.current) await this.teardown();
		return this.attach((await this.host.invoke("open_recent", { index })) as PickedProject);
	}

	private async attach(info: PickedProject, create?: CreateProjectOptions): Promise<OpenOutcome> {
		const started = performance.now();
		let scanMs = 0;
		let scanPayloadChars = 0;
		let entries = 0;
		const invoke: Invoke = async (cmd, args) => {
			const t = performance.now();
			const out = await this.host.invoke(cmd, args);
			if (cmd === "scan" && scanMs === 0) {
				scanMs = performance.now() - t;
				entries = Array.isArray(out) ? out.length : 0;
				scanPayloadChars = JSON.stringify(out).length;
			}
			return out;
		};
		const backend = new TauriBackend(invoke, { onLateWriteRecovery: (path, recovery) => console.warn(`storyForge: a late write into ${path} was kept at ${recovery}`) });
		try {
			if (create) await createProject(backend, info.root, create);
			// A newer project is read-only: Rust already refuses every write, and the core must not try.
			let readOnly = info.readOnly;
			try {
				const text = await backend.readText(PROJECT_SETTINGS_PATH);
				const fm = readFrontmatter(text);
				if (fm.state === "ok" && typeof fm.data["format-version"] === "number" && fm.data["format-version"] > SUPPORTED_FORMAT) readOnly = true;
				if (fm.state === "unreadable") readOnly = true;
			} catch {
				/* no project.md: format 0 */
			}
			const key = sha256Text(info.root);
			const leftoversName = `leftovers/${key}`;
			const seen = new Set<string>();
			try {
				const stored = await this.machine.get(leftoversName);
				if (stored) for (const k of JSON.parse(stored) as unknown[]) if (typeof k === "string") seen.add(k);
			} catch {
				/* nothing remembered */
			}
			const opened = await openProject(info.root, { backend, snapshotStore: new MachineSnapshotStore(this.machine), projectName: basename(info.root), now: this.now, readOnly, leftoversSeen: seen, onRewriteProgress: () => this.closeProgress(), ...(this.host.saveDelayMs ? { writer: { saveDelayMs: this.host.saveDelayMs } } : {}) });
			const settings = await loadSettings(opened.project, (p) => backend.readOutside(p));
			// Unclassifiable leftovers are reported once: remember them so a second open finds nothing to do.
			if (opened.leftovers.newlyReported.length > 0) await this.machine.set(leftoversName, JSON.stringify([...seen, ...opened.leftovers.newlyReported])).catch(() => undefined);
			const machineState = await loadMachineProjectState(this.machine, key, settings.pluginPosition);
			const running: Running = {
				root: info.root,
				opened,
				backend,
				settings,
				machineState,
				timings: { totalMs: performance.now() - started, scanMs, entries, scanPayloadChars },
				...(readOnly ? { readOnlyReason: settings.readOnlyReason ?? "This project is open read-only." } : {}),
			};
			this.current = running;
			// Only now is it a project that opened: the recent list takes it (a refused folder never gets here). Failing to record it never fails the open.
			await this.host.invoke("remember_project").catch(() => undefined);
			if (!readOnly) {
				running.sessions = this.startSessions(running, key);
				await running.sessions.recoverFromCrash().catch(() => 0);
				await this.host.invoke("watch_start");
				this.scheduleBackups(running);
			}
			this.onChange?.();
			return { kind: "opened", running };
		} catch (err) {
			if (err instanceof NotAProjectError) return { kind: "not-a-project", root: info.root, message: err.message };
			throw err;
		}
	}

	// ----------------------------------------------------------------------------- sessions

	private computerId?: Promise<string>;

	/** This Mac's random id for session file names: made once, kept in machine settings, never the Mac's name. */
	private computer(): Promise<string> {
		this.computerId ??= (async () => {
			const stored = (await this.machine.get("computer").catch(() => null))?.trim();
			if (stored && /^[a-z0-9]{8}$/.test(stored)) return stored;
			const bytes = new Uint8Array(8);
			globalThis.crypto.getRandomValues(bytes);
			const id = Array.from(bytes, (b) => (b % 36).toString(36)).join("");
			await this.machine.set("computer", id);
			return id;
		})();
		return this.computerId;
	}

	private startSessions(running: Running, key: string): SessionRecorder {
		const recorder = new SessionRecorder({
			project: running.opened.project,
			writer: running.opened.writer,
			machine: this.machine,
			storeName: `session/${key}`,
			computer: () => this.computer(),
			idleMs: () => this.sessionIdleMs(running),
			timers: this.timers,
			now: () => this.now().getTime(),
			onProgress: () => this.closeProgress(),
			onFailure: (err) => this.onSessionFailure?.(err),
			onChange: () => this.onSessionChange?.(),
			// A window that becomes active again (or a Mac that wakes) checks the idle limit against the clock.
			watchActive: (check) => {
				if (typeof document === "undefined") return () => undefined;
				document.addEventListener("visibilitychange", check);
				window.addEventListener("focus", check);
				return () => (document.removeEventListener("visibilitychange", check), window.removeEventListener("focus", check));
			},
		});
		recorder.start();
		return recorder;
	}

	/** The idle limit for the next session to start: the setting as it is now. A running session keeps its own. */
	private sessionIdleMs(running: Running): number {
		return running.settings.values.sessionIdleMinutes * 60_000;
	}

	// ----------------------------------------------------------------------------- watching

	private enqueue(task: () => Promise<void>): void {
		this.queue = this.queue.then(task, task).catch((e) => console.error("storyForge: watcher batch failed", e));
	}

	private async onWatchBatch(batch: Batch): Promise<void> {
		const running = this.current;
		if (!running || this.shuttingDown) return;
		const result = await applyBatch({ project: running.opened.project, writer: running.opened.writer }, batch);
		running.opened.snapshots?.touch();
		if (result.rescan || [...result.changed, ...result.appeared, ...result.vanished].includes(PROJECT_SETTINGS_PATH)) await this.rereadSettings(running);
		this.onBatch?.(batch, result);
		this.onChange?.();
	}

	/** `project.md` changed from outside: apply what it now says (decision 96). Reading never writes. */
	private async rereadSettings(running: Running): Promise<void> {
		try {
			const was = running.settings.frozen;
			const out = await refreshSettings(running.opened.project, running.settings, (p) => running.backend.readOutside(p));
			// Each problem is told once, when it begins (decision 99); a file that reads again says nothing.
			if (out.state === "unreadable" && was !== "unreadable") this.onSettingsProblem?.("unreadable", out.formatVersion);
			if (out.state === "newer" && was !== "newer") this.onSettingsProblem?.("newer", out.formatVersion);
			if (out.state === "absent" && !running.settingsAbsentTold) {
				running.settingsAbsentTold = true;
				this.onSettingsProblem?.("absent", out.formatVersion);
			}
			if (out.state === "ok") running.settingsAbsentTold = false;
			if (out.changed.length > 0) this.onSettingsChanged?.(out.changed);
		} catch (e) {
			console.error("storyForge: settings re-read failed", e);
		}
	}

	/** Waits for every batch received so far to be applied. */
	settled(): Promise<unknown> {
		return this.queue;
	}

	/** A full rescan, as when the watcher says it may have missed events. */
	rescan(): Promise<void> {
		return new Promise((resolve) => {
			this.enqueue(async () => {
				await this.onWatchBatch({ paths: [], rescan: true });
				resolve();
			});
		});
	}

	// ----------------------------------------------------------------------------- backups

	private scheduleBackups(running: Running): void {
		this.pendingBackup = this.maybeAutomaticBackup("open");
		this.backupTimer = this.timers.setInterval(() => void this.maybeAutomaticBackup("interval"), BACKUP_CHECK_MS);
		void running;
	}

	/** Resolves when the automatic backup started at open (if any) has finished. */
	backupSettled(): Promise<unknown> {
		return this.pendingBackup;
	}

	/** Runs the automatic backup if it is on and due. The last backup's time is the newest zip's date in `_sf-backup/`. */
	async maybeAutomaticBackup(trigger: "open" | "interval"): Promise<BackupResult | null> {
		const running = this.current;
		if (!running || running.readOnlyReason || this.shuttingDown || !running.settings.values.automaticBackup) return null;
		const names = running.opened.project.list(BACKUPS_FOLDER).filter((e) => e.kind === "file").map((e) => e.name);
		const now = this.now();
		const due = isBackupDue({ frequency: running.settings.values.automaticBackupFrequency, lastBackupAt: newestBackupTime(names), now: now.getTime(), trigger });
		if (!due.due) return null;
		try {
			const result = await running.opened.backups.runScoped("automatic", { includeTime: due.includeTime });
			this.onBackup?.(result, "automatic");
			return result;
		} catch (err) {
			if (!(err instanceof BackupAbandonedError)) this.onBackup?.(err as Error, "automatic");
			return null;
		}
	}

	/** The manual backups: the normal scope, or everything (hidden folders included). */
	async manualBackup(kind: "scope" | "full"): Promise<BackupResult> {
		const running = this.requireRunning();
		if (running.readOnlyReason) throw new Error(running.readOnlyReason);
		const svc: BackupService = running.opened.backups;
		const result = kind === "full" ? await svc.runFull() : await svc.runScoped("automatic", { includeTime: true, since: Number.POSITIVE_INFINITY });
		this.onBackup?.(result, kind);
		return result;
	}

	// ------------------------------------------------------------------------------ editing

	private requireRunning(): Running {
		if (!this.current) throw new Error("no project is open");
		return this.current;
	}

	/** Opens a chapter or Codex note for editing. An iCloud placeholder is downloaded first (one file, on demand). */
	/** Tells Rust which of the app's own menu items are enabled (it touches no files). */
	async setMenuState(enabled: Record<string, boolean>): Promise<void> {
		await this.host.invoke("set_menu_state", { enabled });
	}

	/** Chooses a cover image: Rust shows the open panel, checks the image and installs it (the old cover is retired). Resolves to the new file name, or null if the panel was cancelled. */
	async pickCover(target: CoverTarget): Promise<string | null> {
		return (await this.host.invoke("pick_cover", { target })) as string | null;
	}

	/** Reads a cover image (Rust allows only `cover.<png|jpg|gif|webp>` from the target's own folder, up to 10 MB). */
	async readCover(target: CoverTarget, filename: string): Promise<Uint8Array> {
		const b64 = (await this.host.invoke("read_cover", { args: { target, filename } })) as string;
		const raw = atob(b64);
		const bytes = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
		return bytes;
	}

	/** Shows a project file in Finder (Rust checks the path and only reveals). */
	async revealInFinder(path: string): Promise<void> {
		await this.host.invoke("reveal_in_finder", { path });
	}

	async openFile(path: string): Promise<ProseSession> {
		const running = this.requireRunning();
		if (running.opened.project.isPlaceholder(path)) {
			const ok = (await this.host.invoke("download_placeholder", { args: { path } })) as boolean;
			if (!ok) throw new Error(`"${path}" is stored in iCloud and could not be downloaded to this Mac. Try again when you are online.`);
			const dir = path.slice(0, path.lastIndexOf("/") + 1);
			const stub = `${dir}.${path.slice(path.lastIndexOf("/") + 1)}.icloud`;
			await this.enqueueAndWait(() => this.onWatchBatch({ paths: [stub, path], rescan: false }));
		}
		return running.opened.writer.open(path);
	}

	private enqueueAndWait(task: () => Promise<void>): Promise<void> {
		return new Promise((resolve, reject) => this.enqueue(() => task().then(resolve, reject)));
	}

	/**
	 * Runs a link rewrite (a Codex rename). If the app is asked to close meanwhile, the rewrite finishes
	 * first: stopping halfway would leave links half-updated.
	 */
	runRewrite<T>(task: () => Promise<T>): Promise<T> {
		const run = task();
		this.activeRewrite = run.catch(() => undefined);
		void this.activeRewrite.then(() => {
			if (this.activeRewrite) this.activeRewrite = null;
		});
		return run;
	}

	/**
	 * Registers something the close must finish before the editors are flushed (a field the author is in the
	 * middle of editing). Returns the function that removes it.
	 */
	registerCloseCommit(entry: CloseCommit): () => void {
		this.closeCommits.add(entry);
		return () => void this.closeCommits.delete(entry);
	}

	private readonly closeCommits = new Set<CloseCommit>();

	async saveMachineState(state: MachineProjectState): Promise<void> {
		const running = this.requireRunning();
		running.machineState = state;
		await saveMachineProjectState(this.machine, sha256Text(running.root), state);
	}

	// ---------------------------------------------------------------------------------- closing

	/**
	 * Tells Rust the close is making real progress, so its watchdog counts 15 s from the last one, not from the
	 * start (decision 33). Called only when a stage or a rewritten file has finished, never from a timer: a stuck
	 * close sends nothing and is cut off. Silent when no close is under way.
	 */
	closeProgress(): void {
		if (this.shuttingDown) void this.host.invoke("close_progress").catch(() => undefined);
	}

	/**
	 * Saves everything and lets go of the project. A link rewrite in progress finishes first; a backup
	 * not yet written is abandoned cleanly; open editors are flushed within `limitMs`, and anything
	 * still unsaved after that goes to a recovery file instead of holding the app open.
	 */
	async teardown(limitMs = CLOSE_LIMIT_MS): Promise<ShutdownReport> {
		const running = this.current;
		const report: ShutdownReport = { saves: [], forcedRecoveries: [], rewriteFinished: false, backupAbandoned: false, snapshot: "skipped" };
		if (!running) return report;
		this.shuttingDown = true;
		try {
			if (this.backupTimer !== undefined) this.timers.clearInterval(this.backupTimer);
			this.backupTimer = undefined;
			// Batches already received are applied; nothing new is.
			await this.queue.catch(() => undefined);
			this.closeProgress();

			if (this.activeRewrite) {
				report.rewriteFinished = true;
				await this.activeRewrite; // no time limit: half-updated links are worse than a slow quit
				this.closeProgress();
			}
			await running.opened.backups.abandon();
			report.backupAbandoned = true;
			this.closeProgress();

			// Any field the author is in the middle of editing is committed first (a plot note, a synopsis, a planned
			// length). One that can't land has already sent its text to recovery; the close carries on either way, and
			// a commit that hangs is given the same limit as the editors.
			let commitTimer: unknown;
			const commitTimeout = new Promise<"timeout">((resolve) => (commitTimer = this.timers.setTimeout(() => resolve("timeout"), limitMs)));
			const committed = await Promise.race([Promise.allSettled([...this.closeCommits].map((c) => c.commit())).then(() => "done" as const), commitTimeout]);
			this.timers.clearTimeout(commitTimer);
			// A commit that hangs is cut off, and what it was writing goes to a recovery file instead: never only in the field.
			if (committed === "timeout") await Promise.allSettled([...this.closeCommits].map((c) => c.rescue?.()));
			this.closeProgress();

			const writer = running.opened.writer;
			const dirtyBefore = writer.openSessions().filter((s) => s.dirty);
			const flush = writer.closeAll();
			let timer: unknown;
			const timeout = new Promise<"timeout">((resolve) => (timer = this.timers.setTimeout(() => resolve("timeout"), limitMs)));
			const outcome = await Promise.race([flush.then((r) => ({ results: r })), timeout]);
			this.timers.clearTimeout(timer);
			if (outcome === "timeout") {
				for (const s of dirtyBefore.filter((x) => x.dirty)) report.forcedRecoveries.push(await this.forceRecover(running, s));
			} else {
				report.saves = outcome.results.map((r) => ({ path: r.path, kind: r.kind }));
			}

			this.closeProgress();
			// A writing session ends with the close: after the editors are flushed, before the snapshot. If its file can't
			// be written the in-progress record stays and is finished at the next open.
			if (running.sessions) {
				await running.sessions.end().catch(() => undefined);
				running.sessions.dispose();
			}
			// The editors are flushed (or recovered); this saves the snapshot and releases the one-project latch.
			try {
				const closed = await running.opened.close({ flush: false });
				report.snapshot = "skipped" in closed.snapshot ? "skipped" : closed.snapshot.ok ? "saved" : "failed";
			} catch {
				report.snapshot = "failed";
			}
			await this.host.invoke("watch_stop").catch(() => undefined);
			await this.host.invoke("close_project").catch(() => undefined);
		} finally {
			this.current = null;
			this.shuttingDown = false;
			this.onChange?.();
		}
		return report;
	}

	private async forceRecover(running: Running, s: ProseSession): Promise<{ path: string; recoveryPath?: string; error?: string }> {
		const name = s.path.slice(s.path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
		const result =
			s.kind === "chapter"
				? await recoverChapterText(running.opened.project, bookFolderNameFromChapterPath(s.path) as string, name, s.body, this.now())
				: await recoverCodexText(running.opened.project, name, s.body, this.now());
		return result.ok ? { path: s.path, recoveryPath: result.path } : { path: s.path, error: result.error.message };
	}

	/** The close request: save everything, then tell Rust it may close. */
	async shutdownAndQuit(): Promise<ShutdownReport> {
		let report: ShutdownReport;
		try {
			report = await this.teardown();
		} catch (err) {
			console.error("storyForge: closing failed", err);
			report = { saves: [], forcedRecoveries: [], rewriteFinished: false, backupAbandoned: false, snapshot: "failed" };
		}
		for (const off of this.unlisten.splice(0)) off();
		await this.host.invoke("quit_ready").catch(() => undefined);
		return report;
	}
}
void icloudPlaceholderTarget;
