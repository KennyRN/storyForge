/**
 * The prose writer: the single path by which the author's typing reaches a chapter or Codex note
 * (docs/safety-core.md §3; decision 19). It is the only module that calls `proseWrite`
 * (test/architecture.test.ts).
 *
 * An editor opens a **session** for one file. The session holds the raw text last known to be on
 * disk, the body as the author has it, and whether there are unsaved changes; it exposes the body
 * only. Saves are 2 s after the last change, or on a flush; all work on one file (saves and outside
 * changes) runs one at a time. A save writes only if the disk still holds the last-known text,
 * otherwise the disk wins and the author's body goes to a recovery file. Never merge, never
 * overwrite.
 */
import { ForbiddenWriteError } from "./backend/guard";
import { BackendError } from "./backend/types";
import { readBookFrontmatter } from "./book";
import { updateChapterFingerprint } from "./chapterSidecar";
import { isCodexNoteArchived } from "./codex";
import { extractFingerprint } from "./fingerprint";
import { sha256Text } from "./hash";
import { recordChapterEdit } from "./history";
import { foldKey } from "./pathRules";
import { bookFolderNameFromChapterPath, chapterFilenameFromPath, isCodexNotePath, isLibraryChapterPath } from "./paths";
import { type ProseShape, decideDiskChange, minimalReplacement, parseProseFile, serialiseProseFile } from "./proseFile";
import type { Project } from "./project";
import { recoverChapterText, recoverCodexText } from "./recovery";

export const SAVE_DELAY_MS = 2000;

/** Why a file can't be opened for, or saved from, the prose writer. */
export class ProseRefused extends Error {
	constructor(
		public readonly path: string,
		public readonly reason: string,
	) {
		super(`storyForge won't edit "${path}": ${reason}`);
		this.name = "ProseRefused";
	}
}

export type BackupOutcome = { ok: true; path?: string } | { ok: false; error: Error };

export type ProseKind = "chapter" | "codex";

export type SaveResult =
	| { kind: "unchanged"; path: string }
	/** `normalizedLineEndings`: the file had mixed line endings and was written in its first style (as in 0.17.1). The interface can mention it once. */
	| { kind: "saved"; path: string; backup?: BackupOutcome; hookErrors?: Error[]; normalizedLineEndings?: boolean }
	/** The disk had changed: it won, the author's body is in `recoveryPath`, the session reloaded. */
	| { kind: "conflict"; path: string; recoveryPath: string; backup?: BackupOutcome; hookErrors?: Error[] }
	/** The write was refused (guard, archived, out of scope): the body is in `recoveryPath`. */
	| { kind: "refused"; path: string; reason: string; recoveryPath: string; backup?: BackupOutcome }
	/** A disk error. `recoveryPath` is set when this was a flush. Otherwise the next save retries. */
	| { kind: "error"; path: string; error: Error; recoveryPath?: string; backup?: BackupOutcome }
	/** The text could not be saved and could not be recovered either. It stays in the session. */
	| { kind: "recovery-failed"; path: string; error: Error; recoveryError: Error; backup?: BackupOutcome };

/** Sent to the editor when a session's text is replaced from disk. */
export interface ReloadEvent {
	path: string;
	cause: "outside-change" | "conflict";
	/** The body now in the session (the disk's). */
	body: string;
	/** The single edit turning the body the editor held into `body`, or null if they are equal. */
	edit: { from: number; to: number; insert: string } | null;
	/** Where the author's unsaved text went, if there was any. */
	recoveryPath?: string;
}

export type DiskChangeResult =
	| { kind: "ignored" }
	| { kind: "reloaded"; hookErrors?: Error[] }
	| { kind: "recovered-and-reloaded"; recoveryPath: string; hookErrors?: Error[] }
	| { kind: "recovery-failed"; error: Error }
	/** No session was open for the file: the index was refreshed and subscribers ran, or nothing changed. */
	| { kind: "no-session"; changed: boolean; hookErrors?: Error[] };

/** The "chapter changed" seam: runs after every successful chapter save and every reload from an outside change. */
export interface ChapterChange {
	path: string;
	bookFolderName: string;
	filename: string;
	/** The file's whole text now. */
	text: string;
	cause: "save" | "outside-change";
}
export type ChapterChangeListener = (change: ChapterChange) => void | Promise<void>;

export interface Scheduler {
	setTimeout(fn: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface ProseWriterOptions {
	/** Runs before the first save of the session. Resolves even if the backup fails (the outcome is reported). */
	sessionBackup?: () => Promise<BackupOutcome>;
	scheduler?: Scheduler;
	now?: () => Date;
	saveDelayMs?: number;
	/** Register the built-in subscribers (fingerprint sidecar, word-count history). Default true. */
	builtinSubscribers?: boolean;
	/** Nothing may be written into the project: every file is refused. */
	readOnly?: boolean;
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export class ProseSession {
	/** @internal */ lastKnown: string;
	/** @internal */ shape: ProseShape;
	/** @internal */ savedBody: string;
	/** @internal */ current: string;
	/** @internal */ timer: unknown = undefined;
	/** @internal */ inFlight: string | null = null;
	/** @internal */ recovered: { body: string; path: string } | null = null;
	/** @internal */ listeners = new Set<(e: ReloadEvent) => void>();
	/** @internal */ closed = false;
	/** @internal False when rebuilding the file from its parts would not give back exactly the bytes read (mixed line endings). */
	lossless = true;

	constructor(
		private readonly writer: ProseWriter,
		readonly path: string,
		readonly kind: ProseKind,
		text: string,
	) {
		this.lastKnown = text;
		const parsed = parseProseFile(text);
		this.shape = parsed.shape;
		this.savedBody = parsed.body;
		this.current = parsed.body;
		this.lossless = serialiseProseFile(parsed.shape, parsed.body) === text;
	}

	/** The body as the author has it (line breaks are "\n"). The frontmatter is never exposed. */
	get body(): string {
		return this.current;
	}
	get dirty(): boolean {
		return this.current !== this.savedBody;
	}

	/** The author changed the body. Starts (or restarts) the save delay. */
	setBody(body: string): void {
		if (this.closed) throw new ProseRefused(this.path, "the session is closed");
		this.current = body;
		this.writer.noteEdited(this);
	}

	/** Called when the editor's text is replaced from disk. Returns an unsubscribe function. */
	onReload(listener: (e: ReloadEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Saves now, if there is anything to save. */
	save(): Promise<SaveResult> {
		return this.writer.saveSession(this, false);
	}

	/** Flushes (saving or recovering), then closes the session. */
	close(): Promise<SaveResult> {
		return this.writer.closeSession(this);
	}
}

export class ProseWriter {
	private readonly sessions = new Map<string, ProseSession>();
	private readonly opening = new Map<string, Promise<ProseSession>>();
	private readonly chains = new Map<string, Promise<unknown>>();
	private readonly subscribers: ChapterChangeListener[] = [];
	private backupAttempt: Promise<BackupOutcome> | null = null;
	private backupReported = false;
	private readonly scheduler: Scheduler;
	private readonly now: () => Date;
	private readonly delay: number;

	constructor(
		private readonly project: Project,
		private readonly options: ProseWriterOptions = {},
	) {
		this.scheduler = options.scheduler ?? {
			setTimeout: (fn, ms) => setTimeout(fn, ms),
			clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
		};
		this.now = options.now ?? (() => new Date());
		this.delay = options.saveDelayMs ?? SAVE_DELAY_MS;
		if (options.builtinSubscribers !== false) {
			this.subscribers.push(async (c) => {
				await updateChapterFingerprint(project, c.bookFolderName, c.filename, extractFingerprint(c.text));
				await recordChapterEdit(project, c.bookFolderName, c.filename, project.wordCount(c.path), this.now());
			});
		}
	}

	/** Adds a subscriber to the "chapter changed" seam. Returns an unsubscribe function. */
	onChapterChanged(listener: ChapterChangeListener): () => void {
		this.subscribers.push(listener);
		return () => {
			const i = this.subscribers.indexOf(listener);
			if (i >= 0) this.subscribers.splice(i, 1);
		};
	}

	// ----------------------------------------------------------------------------- sessions

	/** The open session for `path`, if any. */
	session(path: string): ProseSession | undefined {
		return this.sessions.get(this.key(path));
	}

	openSessions(): ProseSession[] {
		return [...this.sessions.values()];
	}

	/** Opens a session, or returns the one already open for the file (one file, one session). */
	async open(path: string): Promise<ProseSession> {
		const key = this.key(path);
		const existing = this.sessions.get(key);
		if (existing) return existing;
		const pending = this.opening.get(key);
		if (pending) return pending;
		const run = this.openNew(path, key).finally(() => this.opening.delete(key));
		this.opening.set(key, run);
		return run;
	}

	private async openNew(path: string, key: string): Promise<ProseSession> {
		const entry = this.project.entry(path);
		const kind = this.refusal(entry?.path ?? path);
		if (typeof kind === "string") throw new ProseRefused(path, kind);
		const text = await this.project.readText(entry!.path);
		const session = new ProseSession(this, entry!.path, kind.kind, text);
		this.sessions.set(key, session);
		return session;
	}

	private key(path: string): string {
		return foldKey(this.project.entry(path)?.path ?? path);
	}

	/**
	 * Null-safe scope check: returns a reason string, or the file's kind when the prose writer may
	 * edit it. Archived chapters and Codex notes, `notes/`, and anything else are refused.
	 */
	private refusal(path: string): string | { kind: ProseKind } {
		if (this.options.readOnly) return "the project is open read-only (it was made by a newer storyForge)";
		if (this.project.isPlaceholder(path)) return "the file is stored in iCloud and has not been downloaded yet";
		const entry = this.project.entry(path);
		if (!entry || entry.kind !== "file") return "the file doesn't exist";
		const p = entry.path;
		if (entry.collision) return "another file has the same name apart from capitalisation";
		if (isLibraryChapterPath(p)) {
			const book = bookFolderNameFromChapterPath(p) as string;
			const filename = chapterFilenameFromPath(p) as string;
			let archived: boolean;
			try {
				archived = readBookFrontmatter(this.project, book)?.archive.includes(filename) ?? false;
			} catch {
				return "its book's details can't be read, so it can't be checked whether the chapter is archived";
			}
			return archived ? "the chapter is archived (archived chapters are read-only until un-archived)" : { kind: "chapter" };
		}
		if (isCodexNotePath(p)) {
			let archived: boolean;
			try {
				archived = isCodexNoteArchived(this.project, p);
			} catch {
				return "the Codex details can't be read, so it can't be checked whether the note is archived";
			}
			return archived ? "the Codex note is archived (archived notes are read-only until un-archived)" : { kind: "codex" };
		}
		return "only chapters and Codex notes are edited here";
	}

	// ------------------------------------------------------------------------------ saving

	/** @internal */
	noteEdited(session: ProseSession): void {
		this.cancelTimer(session);
		session.timer = this.scheduler.setTimeout(() => {
			session.timer = undefined;
			void this.saveSession(session, false);
		}, this.delay);
	}

	private cancelTimer(session: ProseSession): void {
		if (session.timer !== undefined) this.scheduler.clearTimeout(session.timer);
		session.timer = undefined;
	}

	/**
	 * Saves every session with unsaved text now, and resolves once all of it is on disk or in a
	 * recovery file. Anything that can't be saved here is recovered rather than retried: a flush is
	 * the last chance before the editor goes away.
	 */
	async flushAll(): Promise<SaveResult[]> {
		const dirty = [...this.sessions.values()].filter((s) => s.dirty);
		for (const s of dirty) this.cancelTimer(s);
		return Promise.all(dirty.map((s) => this.saveSession(s, true)));
	}

	/** @internal */
	async closeSession(session: ProseSession): Promise<SaveResult> {
		this.cancelTimer(session);
		const result = await this.saveSession(session, true);
		session.closed = true;
		session.listeners.clear();
		const key = this.key(session.path);
		if (this.sessions.get(key) === session) this.sessions.delete(key);
		return result;
	}

	/** Closes every session after flushing them. Anything unsaved has been saved or recovered. */
	async closeAll(): Promise<SaveResult[]> {
		const results = await Promise.all([...this.sessions.values()].map((s) => this.closeSession(s)));
		return results;
	}

	/** @internal */
	saveSession(session: ProseSession, flush: boolean): Promise<SaveResult> {
		this.cancelTimer(session);
		return this.enqueue(session.path, () => this.save(session, flush));
	}

	private enqueue<T>(path: string, task: () => Promise<T>): Promise<T> {
		const key = foldKey(path);
		const prev = this.chains.get(key) ?? Promise.resolve();
		const run = prev.then(task, task);
		const settled = run.then(
			() => undefined,
			() => undefined,
		);
		this.chains.set(key, settled);
		void settled.then(() => {
			if (this.chains.get(key) === settled) this.chains.delete(key);
		});
		return run;
	}

	private async ensureBackup(): Promise<BackupOutcome | undefined> {
		const make = this.options.sessionBackup;
		if (!make) return undefined;
		if (!this.backupAttempt) {
			this.backupAttempt = make().catch((e): BackupOutcome => ({ ok: false, error: asError(e) }));
		}
		const outcome = await this.backupAttempt;
		if (this.backupReported) return undefined;
		this.backupReported = true;
		return outcome;
	}

	private async recover(session: ProseSession, body: string): Promise<{ ok: true; path: string } | { ok: false; error: Error }> {
		if (session.recovered && session.recovered.body === body) return { ok: true, path: session.recovered.path };
		const name = session.path.slice(session.path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
		const result =
			session.kind === "chapter"
				? await recoverChapterText(this.project, bookFolderNameFromChapterPath(session.path) as string, name, body, this.now())
				: await recoverCodexText(this.project, name, body, this.now());
		if (result.ok) session.recovered = { body, path: result.path };
		return result;
	}

	private async save(session: ProseSession, flush: boolean): Promise<SaveResult> {
		const path = session.path;
		if (!session.dirty) return { kind: "unchanged", path };
		const body = session.current;

		// Out of scope since the session opened (archived, deleted, ...): recover, don't write.
		const scope = this.refusal(path);
		if (typeof scope === "string") return this.refused(session, body, scope);

		const backup = await this.ensureBackup();
		const next = serialiseProseFile(session.shape, body);
		session.inFlight = next;
		try {
			const outcome = await this.project.fs.proseWrite(path, session.lastKnown, next);
			if (outcome === "conflict") {
				const disk = await this.project.readText(path);
				const rec = await this.recover(session, body);
				if (!rec.ok) return { kind: "recovery-failed", path, error: new Error("the file changed outside storyForge"), recoveryError: rec.error, backup };
				const hookErrors = await this.reload(session, disk, "conflict", rec.path);
				return { kind: "conflict", path, recoveryPath: rec.path, backup, ...(hookErrors.length ? { hookErrors } : {}) };
			}
			const normalised = !session.lossless;
			session.lossless = true;
			session.lastKnown = next;
			session.savedBody = body;
			session.recovered = null;
			await this.project.refresh(path);
			if (session.dirty) this.noteEdited(session); // typed while saving
			const hookErrors = await this.runSubscribers(session, next, "save");
			return { kind: "saved", path, backup, ...(hookErrors.length ? { hookErrors } : {}), ...(normalised ? { normalizedLineEndings: true } : {}) };
		} catch (err) {
			const error = asError(err);
			if (error instanceof ForbiddenWriteError) return this.refused(session, body, error.reason, backup);
			if (error instanceof BackendError && error.code === "ENOENT") return this.refused(session, body, "the file no longer exists", backup);
			if (!flush) return { kind: "error", path, error, backup };
			const rec = await this.recover(session, body);
			if (!rec.ok) return { kind: "recovery-failed", path, error, recoveryError: rec.error, backup };
			return { kind: "error", path, error, recoveryPath: rec.path, backup };
		} finally {
			session.inFlight = null;
		}
	}

	private async refused(session: ProseSession, body: string, reason: string, backup?: BackupOutcome): Promise<SaveResult> {
		const rec = await this.recover(session, body);
		if (!rec.ok) return { kind: "recovery-failed", path: session.path, error: new Error(reason), recoveryError: rec.error, backup };
		return { kind: "refused", path: session.path, reason, recoveryPath: rec.path, backup };
	}

	// ------------------------------------------------------------------ changes made outside

	/**
	 * "This file's text on disk is now `diskText`." Called by the watcher and by reconciliation.
	 * Ports 0.17.1's decision: the writer's own echo or no change is ignored; no unsaved changes
	 * reloads; unsaved changes are recovered, then reloaded. If recovery fails nothing is reloaded.
	 */
	onDiskChanged(path: string, diskText: string): Promise<DiskChangeResult> {
		const session = this.session(path);
		const canonical = this.project.entry(path)?.path ?? path;
		return this.enqueue(canonical, async (): Promise<DiskChangeResult> => {
			if (!session || session.closed) return this.changedWithoutSession(canonical, diskText);
			const action = decideDiskChange({ disk: diskText, knownDisk: session.lastKnown, inFlight: session.inFlight, dirty: session.dirty });
			if (action === "ignore") return { kind: "ignored" };
			if (action === "recover-then-reload") {
				const rec = await this.recover(session, session.current);
				if (!rec.ok) return { kind: "recovery-failed", error: rec.error };
				this.cancelTimer(session);
				const hookErrors = await this.reload(session, diskText, "outside-change", rec.path);
				return { kind: "recovered-and-reloaded", recoveryPath: rec.path, ...(hookErrors.length ? { hookErrors } : {}) };
			}
			this.cancelTimer(session);
			const hookErrors = await this.reload(session, diskText, "outside-change");
			return { kind: "reloaded", ...(hookErrors.length ? { hookErrors } : {}) };
		});
	}

	private async changedWithoutSession(path: string, diskText: string): Promise<DiskChangeResult> {
		const entry = this.project.entry(path);
		if (!entry || entry.kind !== "file") return { kind: "no-session", changed: false };
		const kind = isLibraryChapterPath(entry.path) ? "chapter" : isCodexNotePath(entry.path) ? "codex" : null;
		if (!kind) return { kind: "no-session", changed: false };
		if (entry.hash === sha256Text(diskText)) return { kind: "no-session", changed: false };
		await this.project.refresh(entry.path);
		const hookErrors = kind === "chapter" ? await this.runChapterSubscribers(entry.path, diskText, "outside-change") : [];
		return { kind: "no-session", changed: true, ...(hookErrors.length ? { hookErrors } : {}) };
	}

	private async reload(session: ProseSession, disk: string, cause: ReloadEvent["cause"], recoveryPath?: string): Promise<Error[]> {
		const before = session.current;
		const parsed = parseProseFile(disk);
		session.lastKnown = disk;
		session.lossless = serialiseProseFile(parsed.shape, parsed.body) === disk;
		session.shape = parsed.shape;
		session.savedBody = parsed.body;
		session.current = parsed.body;
		await this.project.refresh(session.path);
		const event: ReloadEvent = { path: session.path, cause, body: parsed.body, edit: minimalReplacement(before, parsed.body), ...(recoveryPath ? { recoveryPath } : {}) };
		for (const l of [...session.listeners]) {
			try {
				l(event);
			} catch {
				/* an editor's listener failing must not stop the reload */
			}
		}
		return this.runSubscribers(session, disk, "outside-change");
	}

	// --------------------------------------------------------------------------------- hook

	private runSubscribers(session: ProseSession, text: string, cause: ChapterChange["cause"]): Promise<Error[]> {
		return session.kind === "chapter" ? this.runChapterSubscribers(session.path, text, cause) : Promise.resolve([]);
	}

	private async runChapterSubscribers(path: string, text: string, cause: ChapterChange["cause"]): Promise<Error[]> {
		const change: ChapterChange = {
			path,
			bookFolderName: bookFolderNameFromChapterPath(path) as string,
			filename: chapterFilenameFromPath(path) as string,
			text,
			cause,
		};
		const errors: Error[] = [];
		for (const subscriber of [...this.subscribers]) {
			try {
				await subscriber(change);
			} catch (err) {
				errors.push(asError(err));
			}
		}
		return errors;
	}
}
