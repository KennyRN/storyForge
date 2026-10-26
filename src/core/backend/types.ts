/**
 * The backend interface: everything the project handle needs from a file system, asynchronous and
 * deliberately without a delete (docs/project-handle.md §4). Paths are project-relative with "/".
 * Implementations: `src/backends/node-fs` (Node) now, a Tauri/Rust one in Brief 4.
 */
export type EntryKind = "file" | "folder";

export interface Stat {
	kind: EntryKind;
	size: number;
	mtimeMs: number;
}

export interface ScanEntry extends Stat {
	/** Project-relative path in the on-disk spelling. */
	path: string;
	/**
	 * The text of a markdown file under storyForge's folders, when the backend returns it with the
	 * scan (the Tauri backend does, so opening a project is one call, not one per file). The index uses it
	 * instead of reading the file again.
	 */
	text?: string;
	/** An iCloud placeholder (`.Name.md.icloud`): present, not downloaded. */
	placeholder?: boolean;
}

/**
 * What the caller means to do, passed along with the call so a backend that has its own guard (the
 * Rust one) can check the same rule the TypeScript guard just did. The node-fs backend ignores them.
 */
export type WriteIntent = { op: "write-file" } | { op: "frontmatter-edit"; keys?: readonly string[] };
export type CreateIntent = { op: "create-file" | "backup-create" | "recovery-create" };
export type RenameIntent = { op: "rename" | "codex-rename" };
export type CompareIntent = { op: "prose-write" | "link-rewrite" };

export type BackendErrorCode = "ENOENT" | "EEXIST" | "ENOTDIR" | "EISDIR" | "EACCES" | "ECHANGED" | "UNKNOWN";

export class BackendError extends Error {
	constructor(
		public readonly code: BackendErrorCode,
		message: string,
		public readonly path?: string,
	) {
		super(message);
		this.name = "BackendError";
	}
}

export interface Backend {
	/** Recursive listing under `dir` (default: the whole project), hidden entries included. */
	scan(dir?: string): AsyncIterable<ScanEntry>;
	stat(path: string): Promise<Stat | null>;
	/** UTF-8 text; a leading BOM is kept (callers that care read it from the text). */
	readText(path: string): Promise<string>;
	readBinary(path: string): Promise<Uint8Array>;
	/** Atomic: a crash leaves the old file or the new file, never a mixture. Creates missing parents. */
	writeText(path: string, text: string, intent?: WriteIntent): Promise<void>;
	writeBinary(path: string, data: Uint8Array): Promise<void>;
	/**
	 * Compare-then-write: replaces the existing file's text with `text` (exactly as given) only if it
	 * still holds `expected`. The comparison and the replacement must not be separable by another
	 * writer going through this backend; implementations narrow the window against outside writers
	 * as far as the platform allows (docs/safety-core.md §10). A missing file rejects with ENOENT.
	 */
	writeTextIfUnchanged(path: string, expected: string, text: string, intent?: CompareIntent): Promise<"written" | "conflict">;
	/** Fails with EEXIST if `path` exists. Creates missing parents. */
	createFile(path: string, content: string | Uint8Array, intent?: CreateIntent): Promise<void>;
	/** `mkdir -p`: idempotent. */
	createFolder(path: string): Promise<void>;
	/** Fails with EEXIST if `to` exists. Creates missing parents of `to`. */
	rename(from: string, to: string, intent?: RenameIntent): Promise<void>;
	/** Moves `path` into `.trash/` inside the project, never overwriting what is already there. Returns the new path. */
	retire(path: string): Promise<string>;
	/**
	 * The app's own leftover temporary files (`.<target>.<hex id>.tmp`) inside storyForge's folders and `_sf-backup/`,
	 * and nothing else: no general listing of hidden files. Read-only. Never follows a link out of the project.
	 */
	listTempLeftovers(): Promise<TempLeftover[]>;
	/**
	 * Removes one leftover temporary file (the guard's `temp-remove`). With `expected`, only if its size and
	 * modification time are still what they were when it was listed; otherwise rejects with `ECHANGED`.
	 */
	removeTemp(path: string, expected?: { size: number; mtimeMs: number }): Promise<void>;
}

export interface TempLeftover {
	path: string;
	size: number;
	mtimeMs: number;
}
