/**
 * GuardedBackend: the only file-system handle the data layer ever gets. Every mutating call goes
 * through the write guard first, then through a per-path queue (the guarantee `enqueueBackstageWrite`
 * gave in 0.17.1), then to the raw backend. There is no delete (docs/project-handle.md §4).
 */
import { foldKey, resolvePath } from "../pathRules";
import type { Backend, ScanEntry, Stat } from "./types";
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
		return this.locked([path], () => this.raw.createFile(path, content));
	}

	createFolder(path: string): Promise<void> {
		assertAllowed({ op: "create-folder", path });
		return this.locked([path], () => this.raw.createFolder(path));
	}

	rename(from: string, to: string): Promise<void> {
		assertAllowed({ op: "rename", from, to });
		return this.locked([from, to], () => this.raw.rename(from, to));
	}

	/** Moves a backstage file into `.trash/` (never overwriting). Returns its new path. */
	retire(path: string): Promise<string> {
		assertAllowed({ op: "retire", path });
		return this.locked([path], () => this.raw.retire(path));
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
				await this.raw.writeText(path, text);
			},
			createFile: async (content) => {
				assertAllowed({ op: "create-file", path });
				await this.raw.createFile(path, content);
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
