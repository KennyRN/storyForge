/**
 * TauriBackend: the Backend over the app's Rust commands. The window never touches the disk; every
 * call here is one narrow command (docs/tauri-shell.md §3). `invoke` is Tauri's `invoke` in the app
 * and a bridge to the same Rust code in the tests, so one contract suite checks both backends.
 */
import { ForbiddenWriteError } from "../../core/backend/guard";
import {
	BackendError,
	type Backend,
	type BackendErrorCode,
	type CompareIntent,
	type CreateIntent,
	type RenameIntent,
	type ScanEntry,
	type Stat,
	type WriteIntent,
	type TempLeftover,
} from "../../core/backend/types";

export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

/** The project was made by a newer storyForge: nothing may be written into it. */
export class ReadOnlyProjectError extends Error {
	constructor(
		public readonly path: string | undefined,
		message = "This project was made by a newer storyForge and is open read-only.",
	) {
		super(message);
		this.name = "ReadOnlyProjectError";
	}
}

interface RustError {
	code?: string;
	message?: string;
	path?: string | null;
}

const CODES = new Set<string>(["ENOENT", "EEXIST", "ENOTDIR", "EISDIR", "EACCES", "ECHANGED", "UNKNOWN"]);

export function fromRustError(err: unknown): Error {
	if (err instanceof Error) return err;
	const e = (typeof err === "object" && err !== null ? err : { message: String(err) }) as RustError;
	const message = e.message ?? "unknown error";
	const path = e.path ?? undefined;
	if (e.code === "FORBIDDEN") return new ForbiddenWriteError(path ?? "", message);
	if (e.code === "READONLY") return new ReadOnlyProjectError(path);
	return new BackendError((CODES.has(e.code ?? "") ? e.code : "UNKNOWN") as BackendErrorCode, message, path);
}

export function toBase64(data: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
	return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

interface RustScanEntry {
	path: string;
	kind: "file" | "folder";
	size: number;
	mtimeMs: number;
	placeholder?: boolean;
	text?: string;
}

export interface TauriBackendOptions {
	/** A writer outside the app wrote into the swapped-out file after it was verified; its bytes are at `recoveryPath`. */
	onLateWriteRecovery?: (path: string, recoveryPath: string) => void;
}

export class TauriBackend implements Backend {
	constructor(
		private readonly invoke: Invoke,
		private readonly options: TauriBackendOptions = {},
	) {}

	private async call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
		try {
			return (await this.invoke(cmd, { args })) as T;
		} catch (err) {
			throw fromRustError(err);
		}
	}

	// ----------------------------------------------------------------------------- reads

	/** One bulk call: every entry, with the text of markdown under storyForge's folders (docs/tauri-shell.md §3). */
	async *scan(dir?: string): AsyncIterable<ScanEntry> {
		const entries = await this.call<RustScanEntry[]>("scan", dir ? { dir } : {});
		for (const e of entries) yield { path: e.path, kind: e.kind, size: e.size, mtimeMs: e.mtimeMs, ...(e.text !== undefined ? { text: e.text } : {}), ...(e.placeholder ? { placeholder: true } : {}) };
	}

	async stat(path: string): Promise<Stat | null> {
		return this.call<Stat | null>("stat", { path });
	}
	readText(path: string): Promise<string> {
		return this.call<string>("read_text", { path });
	}
	async readBinary(path: string): Promise<Uint8Array> {
		return fromBase64(await this.call<string>("read_binary", { path }));
	}
	/** A read-only look at a file outside storyForge's own folders (the plugin's `data.json`, links in other notes). */
	readOutside(path: string): Promise<string> {
		return this.call<string>("read_outside", { path });
	}

	// ---------------------------------------------------------------------------- writes

	async writeText(path: string, text: string, intent?: WriteIntent): Promise<void> {
		await this.call("write_text", { path, text, op: intent?.op ?? "write-file", ...(intent?.op === "frontmatter-edit" && intent.keys ? { keys: [...intent.keys] } : {}) });
	}
	async writeBinary(path: string, data: Uint8Array): Promise<void> {
		await this.call("write_binary", { path, data: toBase64(data) });
	}
	async createFile(path: string, content: string | Uint8Array, intent?: CreateIntent): Promise<void> {
		await this.call("create_file", { path, op: intent?.op ?? "create-file", ...(typeof content === "string" ? { text: content } : { data: toBase64(content) }) });
	}
	async createFolder(path: string): Promise<void> {
		await this.call("create_folder", { path });
	}
	async rename(from: string, to: string, intent?: RenameIntent): Promise<void> {
		await this.call("rename", { from, to, op: intent?.op ?? "rename" });
	}
	retire(path: string): Promise<string> {
		return this.call<string>("retire", { path });
	}
	listTempLeftovers(): Promise<TempLeftover[]> {
		return this.call<TempLeftover[]>("list_temp_leftovers", {});
	}
	async removeTemp(path: string, expected?: { size: number; mtimeMs: number }): Promise<void> {
		await this.call("remove_temp", { path, ...(expected ? { size: expected.size, mtimeMs: expected.mtimeMs } : {}) });
	}
	async writeTextIfUnchanged(path: string, expected: string, text: string, intent?: CompareIntent): Promise<"written" | "conflict"> {
		const r = await this.call<{ outcome: "written" | "conflict"; lateWriteRecovery?: string }>("compare_write", { op: intent?.op ?? "prose-write", path, expected, text });
		if (r.lateWriteRecovery) this.options.onLateWriteRecovery?.(path, r.lateWriteRecovery);
		return r.outcome;
	}
}

/** Machine settings (window, recent projects, snapshots, where you were) through `machine_get` / `machine_set`. */
export class TauriMachineStore {
	constructor(private readonly invoke: Invoke) {}
	async get(name: string): Promise<string | null> {
		try {
			return (await this.invoke("machine_get", { name })) as string | null;
		} catch (err) {
			throw fromRustError(err);
		}
	}
	async set(name: string, text: string): Promise<void> {
		try {
			await this.invoke("machine_set", { name, text });
		} catch (err) {
			throw fromRustError(err);
		}
	}
}
