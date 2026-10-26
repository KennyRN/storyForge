/**
 * GuardedBackend: the only file-system handle the data layer ever gets. Every mutating call goes
 * through the write guard first, then through a per-path queue (the guarantee `enqueueBackstageWrite`
 * gave in 0.17.1), then to the raw backend. There is no delete (docs/project-handle.md §4).
 */
import { foldKey, resolvePath } from "../pathRules";
import type { Backend, ScanEntry, Stat, TempLeftover } from "./types";
import { assertAllowed, type GuardOp } from "./guard";

/** Read-modify-write inside one lock; every write in it still passes the guard. */
export interface Transaction {
	stat(): Promise<Stat | null>;
	readText(): Promise<string>;
	writeText(text: string, intent?: { op: "frontmatter-edit"; keys?: readonly string[] }): Promise<void>;
	createFile(content: string | Uint8Array): Promise<void>;
}

export class GuardedBackend {
	private queues = new Map<string, Promise<void>>();

	constructor(private readonly raw: Backend) {}

	// ----------------------------------------------------------------- reads (unrestricted)

	scan(dir?: string): AsyncIterable<ScanEntry> {
		return this.raw.scan(dir);
	}
	stat(path: string): Promise<Stat | null> {
		return this.raw.stat(path);
	}
	readText(path: string): Promise<string> {
		return this.raw.readText(path);
	}
	readBinary(path: string): Promise<Uint8Array> {
		return this.raw.readBinary(path);
	}

	// ------------------------------------------------------------------------- mutations

	/** Overwrites or creates a file. Chapters and Codex notes are refused by the guard. */
	writeText(path: string, text: string): Promise<void> {
		return this.transaction(path, (tx) => tx.writeText(text));
	}

	writeBinary(path: string, data: Uint8Array): Promise<void> {
		assertAllowed({ op: "write-binary", path });
		return this.locked([path], () => this.raw.writeBinary(path, data));
	}

	/** Creates a new file; fails (EEXIST) if it exists. The only way a chapter or Codex file comes to exist. */
	createFile(path: string, content: string | Uint8Array): Promise<void> {
		assertAllowed({ op: "create-file", path });
		return this.locked([path], () => this.raw.createFile(path, content, { op: "create-file" }));
	}

	createFolder(path: string): Promise<void> {
		assertAllowed({ op: "create-folder", path });
		return this.locked([path], () => this.raw.createFolder(path));
	}

	rename(from: string, to: string): Promise<void> {
		assertAllowed({ op: "rename", from, to });
		return this.locked([from, to], () => this.raw.rename(from, to, { op: "rename" }));
	}

	/** Moves a backstage file into `.trash/` (never overwriting). Returns its new path. */
	retire(path: string): Promise<string> {
		assertAllowed({ op: "retire", path });
		return this.locked([path], () => this.raw.retire(path));
	}

	/** The app's own leftover temp files, by name only (a read). */
	listTempLeftovers(): Promise<TempLeftover[]> {
		return this.raw.listTempLeftovers();
	}

	/** Removes one leftover temp file. Only `tempTidy.ts` calls this (test/architecture.test.ts). */
	removeTemp(path: string, expected?: { size: number; mtimeMs: number }): Promise<void> {
		assertAllowed({ op: "temp-remove", path });
		return this.locked([path], () => this.raw.removeTemp(path, expected));
	}

	// -------------------------------------------- the narrow, caller-restricted operations
	// (test/architecture.test.ts: only the named module may call each of these.)

	/** Compare-then-write of a chapter or Codex note body. Only `proseWriter.ts` calls this. */
	proseWrite(path: string, expected: string, text: string): Promise<"written" | "conflict"> {
		assertAllowed({ op: "prose-write", path });
		return this.locked([path], () => this.raw.writeTextIfUnchanged(path, expected, text, { op: "prose-write" }));
	}

	/** Compare-then-write of a markdown file's links. Only `linkRewriter.ts` calls this. */
	linkRewrite(path: string, expected: string, text: string): Promise<"written" | "conflict"> {
		assertAllowed({ op: "link-rewrite", path });
		return this.locked([path], () => this.raw.writeTextIfUnchanged(path, expected, text, { op: "link-rewrite" }));
	}

	/** Renames a Codex note file. Only `linkRewriter.ts` calls this. */
	codexRename(from: string, to: string): Promise<void> {
		assertAllowed({ op: "codex-rename", from, to });
		return this.locked([from, to], () => this.raw.rename(from, to, { op: "codex-rename" }));
	}

	/** Creates a backup zip; fails (EEXIST) if the name is taken. Only `backup.ts` calls this. */
	createBackup(path: string, data: Uint8Array): Promise<void> {
		assertAllowed({ op: "backup-create", path });
		return this.locked([path], () => this.raw.createFile(path, data, { op: "backup-create" }));
	}

	/** Creates a recovery file; fails (EEXIST) if the name is taken. Only `recovery.ts` calls this. */
	createRecovery(path: string, text: string | Uint8Array): Promise<void> {
		assertAllowed({ op: "recovery-create", path });
		return this.locked([path], () => this.raw.createFile(path, text, { op: "recovery-create" }));
	}

	/**
	 * Runs `fn` with exclusive access to `path`. Reads and writes made through `tx` are the only ones
	 * allowed inside; writes are checked against the guard at the moment they are made.
	 */
	transaction<T>(path: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
		const tx: Transaction = {
			stat: () => this.raw.stat(path),
			readText: () => this.raw.readText(path),
			writeText: async (text, intent) => {
				assertAllowed(intent ? { op: "frontmatter-edit", path, keys: intent.keys } : { op: "write-file", path });
				await this.raw.writeText(path, text, intent ? { op: "frontmatter-edit", keys: intent.keys } : { op: "write-file" });
			},
			createFile: async (content) => {
				assertAllowed({ op: "create-file", path });
				await this.raw.createFile(path, content, { op: "create-file" });
			},
		};
		// Refuse an obviously forbidden path before queueing anything.
		return this.locked([path], () => fn(tx));
	}

	/** Checks an operation against the guard without performing it. */
	check(op: GuardOp): void {
		assertAllowed(op);
	}

	private locked<T>(paths: string[], task: () => Promise<T>): Promise<T> {
		const keys = [...new Set(paths.map((p) => foldKey(resolvePath(p) ?? p)))];
		const previous = Promise.all(keys.map((k) => this.queues.get(k) ?? Promise.resolve()));
		const run = previous.then(task, task);
		const settled = run.then(
			() => undefined,
			() => undefined,
		);
		for (const k of keys) this.queues.set(k, settled);
		void settled.then(() => {
			for (const k of keys) if (this.queues.get(k) === settled) this.queues.delete(k);
		});
		return run;
	}
}
