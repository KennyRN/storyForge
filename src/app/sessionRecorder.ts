/**
 * The writing-session recorder (docs/sessions.md §3, §6 and §8): one per open project. It listens to the author's
 * edits, keeps a `SessionTracker`, ends the session at its last edit when the idle limit passes (judged against the
 * clock, never a countdown), checkpoints the session in progress to the app's data folder (never the project), writes
 * the session file when a session ends, and finishes an unfinished session at the next open.
 *
 * Typing never waits on any of this: an edit is handled synchronously in O(1) and everything else runs in its own
 * task. A failure is reported once, quietly, and writing carries on.
 */
import { readBookFrontmatter } from "../core/book";
import { bookFolderNameFromChapterPath, chapterFilenameFromPath } from "../core/paths";
import type { Project } from "../core/project";
import type { AuthorEdit, ProseWriter } from "../core/proseWriter";
import { appendSession } from "../core/sessionFiles";
import { type Checkpoint, type SessionRecord, SessionTracker, localOffsetMinutes } from "../core/sessions";
import type { MachineStore } from "./settings";

/** A checkpoint is written at most this often while a session runs. */
export const CHECKPOINT_MS = 5000;

export interface RecorderTimers {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface RecorderOptions {
	project: Project;
	writer: ProseWriter;
	machine: MachineStore;
	/** The machine-settings name of this project's in-progress record (`session/<sha256 of the path>`). */
	storeName: string;
	computer: () => Promise<string>;
	/** The idle limit for the next session to start, in milliseconds. */
	idleMs: () => number;
	timers: RecorderTimers;
	/** The clock, in milliseconds. */
	now: () => number;
	offsetMinutes?: (ms: number) => number;
	dayOf?: (ms: number) => string;
	/** Called when ending a session starts and ends, so the close path can count it as progress (decision 33). */
	onProgress?: () => void;
	/** Called once per recorder when recording fails; typing is unaffected. */
	onFailure?: (err: Error) => void;
	/** Called when a session starts or ends (the live readout listens). */
	onChange?: () => void;
	/** Subscribes `check` to the window becoming active again or the Mac waking; returns an unsubscribe. */
	watchActive?: (check: () => void) => () => void;
}

interface Blob {
	v: 1;
	cp: Checkpoint | null;
	unsent: SessionRecord[];
}

export class SessionRecorder {
	private tracker: SessionTracker | null = null;
	private idleTimer: unknown;
	private checkpointTimer: unknown;
	private lastCheckpointAt = 0;
	private reloadOffs = new Map<string, () => void>();
	private unsent: SessionRecord[] = [];
	private off: (() => void) | null = null;
	private offActive: (() => void) | null = null;
	private reported = false;
	private chain: Promise<unknown> = Promise.resolve();
	private disposed = false;

	constructor(private readonly o: RecorderOptions) {}

	/** Starts listening to the author's edits. */
	start(): void {
		this.off = this.o.writer.onAuthorEdit((e) => this.onEdit(e));
		this.offActive = this.o.watchActive?.(() => this.checkIdle()) ?? null;
	}

	get running(): boolean {
		return this.tracker?.running ?? false;
	}

	/** The current session, for the live readout: when it started, when it was last edited, and the words so far. Null between sessions. Only reports. */
	live(): { startMs: number; lastEditMs: number; net: number } | null {
		const t = this.tracker;
		return t?.running ? { startMs: t.start, lastEditMs: t.lastEdit, net: t.net() } : null;
	}

	// ------------------------------------------------------------------------------------------ edits

	private onEdit(e: AuthorEdit): void {
		if (this.disposed || e.kind !== "chapter") return;
		const at = e.at;
		if (this.tracker?.idleExpired(at)) {
			this.endNow();
			void this.persist();
		}
		if (!this.tracker) {
			this.tracker = new SessionTracker({ idleMs: this.o.idleMs(), ...(this.o.dayOf ? { dayOf: this.o.dayOf } : {}), offsetMinutes: this.o.offsetMinutes ?? localOffsetMinutes });
			this.o.onChange?.();
		}
		this.tracker.edit({ at, chapter: this.chapterOf(e.path), before: e.before, after: e.after, origin: e.origin });
		if (!this.reloadOffs.has(e.path)) {
			this.reloadOffs.set(
				e.path,
				e.session.onReload((r) => this.tracker?.reload(chapterRef(e.path).path, r.body)),
			);
		}
		this.armIdle();
		this.armCheckpoint();
	}

	private chapterOf(path: string): { path: string; id?: string } {
		const ref = chapterRef(path);
		try {
			const book = bookFolderNameFromChapterPath(path);
			const file = chapterFilenameFromPath(path);
			const id = book && file ? readBookFrontmatter(this.o.project, book)?.chapters[file]?.chapterId : undefined;
			return id ? { ...ref, id } : ref;
		} catch {
			return ref;
		}
	}

	// ----------------------------------------------------------------------------------------- the clock

	private armIdle(): void {
		if (this.idleTimer !== undefined) this.o.timers.clearTimeout(this.idleTimer);
		const t = this.tracker;
		if (!t) return;
		const wait = Math.max(0, t.lastEdit + this.o.idleMs() - this.o.now());
		this.idleTimer = this.o.timers.setTimeout(() => this.checkIdle(), wait + 50);
	}

	/**
	 * Ends the session if the idle limit has passed, judged against the clock. Called by the idle timer and when the
	 * window becomes active or the Mac wakes, so a timer that sleep delayed or froze changes nothing.
	 */
	checkIdle(): void {
		const t = this.tracker;
		if (!t) return;
		if (t.idleExpired(this.o.now())) {
			this.endNow();
			void this.persist();
		} else this.armIdle();
	}

	// ------------------------------------------------------------------------------------- checkpoints

	private armCheckpoint(): void {
		const since = this.o.now() - this.lastCheckpointAt;
		if (since >= CHECKPOINT_MS) {
			this.checkpoint();
		} else if (this.checkpointTimer === undefined) {
			this.checkpointTimer = this.o.timers.setTimeout(() => {
				this.checkpointTimer = undefined;
				this.checkpoint();
			}, CHECKPOINT_MS - since);
		}
	}

	private checkpoint(): void {
		this.lastCheckpointAt = this.o.now();
		const cp = this.tracker?.checkpoint() ?? null;
		if (!cp) return;
		this.queue(() => this.writeBlob({ v: 1, cp, unsent: this.unsent }));
	}

	private async writeBlob(blob: Blob): Promise<void> {
		const empty = !blob.cp && blob.unsent.length === 0;
		await this.o.machine.set(this.o.storeName, empty ? "" : JSON.stringify(blob));
	}

	// ----------------------------------------------------------------------------------------- ending

	/** Finishes the running session (at its last edit) into the unsent list. Synchronous. */
	private endNow(): void {
		const t = this.tracker;
		this.tracker = null;
		if (this.idleTimer !== undefined) this.o.timers.clearTimeout(this.idleTimer);
		if (this.checkpointTimer !== undefined) this.o.timers.clearTimeout(this.checkpointTimer);
		this.idleTimer = this.checkpointTimer = undefined;
		for (const off of this.reloadOffs.values()) off();
		this.reloadOffs.clear();
		const record = t?.finish() ?? null;
		if (record) this.unsent.push(record);
		this.o.onChange?.();
	}

	/**
	 * Ends the session, writes it to its session file, and clears the in-progress record. If the file can't be
	 * written the record stays (with any others unwritten), to be finished at the next open. Resolves once done.
	 */
	async end(): Promise<void> {
		this.o.onProgress?.();
		this.endNow();
		await this.persist();
		this.o.onProgress?.();
	}

	private persist(): Promise<void> {
		return this.queue(async () => {
			const blobKeepsCheckpoint = this.tracker?.checkpoint() ?? null;
			let failed: Error | null = null;
			const computer = await this.o.computer().catch((e) => ((failed = asError(e)), null));
			if (computer) {
				for (const record of [...this.unsent]) {
					try {
						await appendSession(this.o.project, record, computer);
						this.unsent = this.unsent.filter((r) => r !== record);
					} catch (err) {
						failed = asError(err);
						break;
					}
				}
			}
			try {
				await this.writeBlob({ v: 1, cp: blobKeepsCheckpoint, unsent: this.unsent });
			} catch (err) {
				failed ??= asError(err);
			}
			if (failed) this.fail(failed);
		});
	}

	// ------------------------------------------------------------------------------------------ opening

	/**
	 * At open: finishes whatever a crash, force-quit or power cut left, at its last checkpointed edit, marked
	 * recovered. The only write opening makes for sessions. Anything that can't be written is kept for next time.
	 */
	async recoverFromCrash(): Promise<number> {
		let blob: Blob | null = null;
		try {
			const text = await this.o.machine.get(this.o.storeName);
			if (text) blob = JSON.parse(text) as Blob;
		} catch (err) {
			this.fail(asError(err));
			return 0;
		}
		if (!blob || blob.v !== 1) return 0;
		const records = [...(Array.isArray(blob.unsent) ? blob.unsent : [])];
		if (blob.cp) records.push(SessionTracker.recover(blob.cp, { ...(this.o.dayOf ? { dayOf: this.o.dayOf } : {}), offsetMinutes: this.o.offsetMinutes ?? localOffsetMinutes }));
		this.unsent = records;
		await this.persist();
		return records.length - this.unsent.length;
	}

	// ------------------------------------------------------------------------------------------ misc

	private queue<T>(task: () => Promise<T>): Promise<T> {
		const next = this.chain.then(task, task);
		this.chain = next.catch(() => undefined);
		return next.catch((err) => {
			this.fail(asError(err));
			return undefined as T;
		});
	}

	private fail(err: Error): void {
		if (this.reported) return;
		this.reported = true;
		this.o.onFailure?.(err);
	}

	/** Stops listening and drops the timers. Does not write: call `end()` first. */
	dispose(): void {
		this.disposed = true;
		this.off?.();
		this.off = null;
		this.offActive?.();
		this.offActive = null;
		if (this.idleTimer !== undefined) this.o.timers.clearTimeout(this.idleTimer);
		if (this.checkpointTimer !== undefined) this.o.timers.clearTimeout(this.checkpointTimer);
		for (const off of this.reloadOffs.values()) off();
		this.reloadOffs.clear();
	}
}

/** `_story-library/aaa/ch-a1.md` as a session file names it: `aaa/ch-a1.md`. */
export function chapterRef(path: string): { path: string } {
	return { path: path.replace(/^_story-library\//, "") };
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
