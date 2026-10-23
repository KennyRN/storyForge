/**
 * The session snapshot (docs/safety-core.md §6): a persisted copy of what the index knew, so that at
 * open the app can tell what the folder held last time. It lives outside the project, in a place the
 * caller supplies. It is a cache and never a source of truth: losing it can cost a rename match, it
 * can never cause a write to the project.
 */
import { sha256Text } from "./hash";
import { isCodexNotePath, isLibraryChapterPath, isNotesNotePath } from "./paths";
import type { Project } from "./project";

export const SNAPSHOT_VERSION = 1;

export interface SnapshotFile {
	path: string;
	kind: "chapter" | "codex" | "note";
	/** SHA-256 of the text after the frontmatter; absent for an empty body (never evidence). */
	hash?: string;
	/** Chapters only. */
	opening?: string;
	closing?: string;
}

export interface Snapshot {
	version: typeof SNAPSHOT_VERSION;
	/** The project folder's absolute path when this was taken. */
	root: string;
	savedAt: string;
	files: SnapshotFile[];
}

export type SnapshotLoad =
	| { status: "ok"; snapshot: Snapshot }
	| { status: "missing" }
	| { status: "unreadable"; reason: string };

export interface SnapshotStore {
	load(projectRoot: string): Promise<SnapshotLoad>;
	/** Atomic: a crash leaves the old snapshot or the new one. */
	save(projectRoot: string, snapshot: Snapshot): Promise<void>;
}

/** The snapshot of what the index currently holds: chapters, Codex notes and notes. */
export function buildSnapshot(project: Project, root: string, now = new Date()): Snapshot {
	const files: SnapshotFile[] = [];
	for (const e of project.index.all()) {
		if (e.kind !== "file") continue;
		const kind = isLibraryChapterPath(e.path) ? "chapter" : isCodexNotePath(e.path) ? "codex" : isNotesNotePath(e.path) ? "note" : null;
		if (!kind) continue;
		const file: SnapshotFile = { path: e.path, kind };
		if (e.bodyHash) file.hash = e.bodyHash;
		if (kind === "chapter" && e.fingerprint) {
			if (e.fingerprint.opening) file.opening = e.fingerprint.opening;
			if (e.fingerprint.closing) file.closing = e.fingerprint.closing;
		}
		files.push(file);
	}
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { version: SNAPSHOT_VERSION, root, savedAt: now.toISOString(), files };
}

/** Checks a parsed JSON value; returns the snapshot, or the reason it can't be used. */
export function validateSnapshot(value: unknown, root: string): { ok: true; snapshot: Snapshot } | { ok: false; reason: string } {
	if (!value || typeof value !== "object") return { ok: false, reason: "not an object" };
	const v = value as Record<string, unknown>;
	if (v.version !== SNAPSHOT_VERSION) return { ok: false, reason: `version ${String(v.version)} is not ${SNAPSHOT_VERSION}` };
	if (v.root !== root) return { ok: false, reason: "it was taken for a different folder" };
	if (typeof v.savedAt !== "string" || !Array.isArray(v.files)) return { ok: false, reason: "missing fields" };
	for (const f of v.files) {
		const e = f as Record<string, unknown> | null;
		if (!e || typeof e.path !== "string" || (e.kind !== "chapter" && e.kind !== "codex" && e.kind !== "note")) return { ok: false, reason: "a file entry is malformed" };
		for (const key of ["hash", "opening", "closing"]) if (e[key] !== undefined && typeof e[key] !== "string") return { ok: false, reason: "a file entry is malformed" };
	}
	return { ok: true, snapshot: v as unknown as Snapshot };
}

/** A stable file-name-safe key for a project folder. */
export function snapshotKey(root: string): string {
	return sha256Text(root);
}

export interface SnapshotKeeperOptions {
	delayMs?: number;
	scheduler?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
	now?: () => Date;
}

/**
 * Writes the snapshot when asked: `touch()` after applied changes (debounced), `saveNow()` after
 * reconciliation at open, `close()` at a clean close. A failed write is reported, never thrown: the
 * snapshot is a cache.
 */
export class SnapshotKeeper {
	private timer: unknown;
	private last: Promise<{ ok: true } | { ok: false; error: Error }> = Promise.resolve({ ok: true });
	private readonly delay: number;
	private readonly scheduler: NonNullable<SnapshotKeeperOptions["scheduler"]>;

	constructor(
		private readonly project: Project,
		private readonly store: SnapshotStore,
		private readonly root: string,
		private readonly options: SnapshotKeeperOptions = {},
	) {
		this.delay = options.delayMs ?? 5000;
		this.scheduler = options.scheduler ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
	}

	touch(): void {
		if (this.timer !== undefined) this.scheduler.clearTimeout(this.timer);
		this.timer = this.scheduler.setTimeout(() => {
			this.timer = undefined;
			void this.saveNow();
		}, this.delay);
	}

	saveNow(): Promise<{ ok: true } | { ok: false; error: Error }> {
		if (this.timer !== undefined) this.scheduler.clearTimeout(this.timer);
		this.timer = undefined;
		this.last = this.last.then(async () => {
			try {
				await this.store.save(this.root, buildSnapshot(this.project, this.root, this.options.now?.()));
				return { ok: true as const };
			} catch (err) {
				return { ok: false as const, error: err instanceof Error ? err : new Error(String(err)) };
			}
		});
		return this.last;
	}

	close(): Promise<{ ok: true } | { ok: false; error: Error }> {
		return this.saveNow();
	}
}
