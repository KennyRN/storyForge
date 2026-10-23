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
}

export type BackendErrorCode = "ENOENT" | "EEXIST" | "ENOTDIR" | "EISDIR" | "EACCES" | "UNKNOWN";

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
	writeText(path: string, text: string): Promise<void>;
	writeBinary(path: string, data: Uint8Array): Promise<void>;
	/** Fails with EEXIST if `path` exists. Creates missing parents. */
	createFile(path: string, content: string | Uint8Array): Promise<void>;
	/** `mkdir -p`: idempotent. */
	createFolder(path: string): Promise<void>;
	/** Fails with EEXIST if `to` exists. Creates missing parents of `to`. */
	rename(from: string, to: string): Promise<void>;
	/** Moves `path` into `.trash/` inside the project, never overwriting what is already there. Returns the new path. */
	retire(path: string): Promise<string>;
}
