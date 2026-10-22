import { BackendError, type Backend, type ScanEntry, type Stat } from "../../src/core/backend/types";

/** A tiny in-memory Backend for unit tests. Paths are exactly as given (no case folding). */
export class MemoryBackend implements Backend {
	files = new Map<string, string | Uint8Array>();
	folders = new Set<string>();
	reads: string[] = [];
	private clock = 1;

	constructor(initial: Record<string, string | Uint8Array | null> = {}) {
		for (const [path, content] of Object.entries(initial)) {
			if (content === null) this.addFolder(path);
			else this.setFile(path, content);
		}
	}

	private addFolder(path: string): void {
		const parts = path.split("/");
		for (let i = 1; i <= parts.length; i++) this.folders.add(parts.slice(0, i).join("/"));
	}

	setFile(path: string, content: string | Uint8Array): void {
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) this.folders.add(parts.slice(0, i).join("/"));
		this.files.set(path, content);
	}

	async *scan(dir?: string): AsyncIterable<ScanEntry> {
		const prefix = dir ? dir + "/" : "";
		for (const f of [...this.folders].sort()) {
			if (dir ? f.startsWith(prefix) : true) yield { path: f, kind: "folder", size: 0, mtimeMs: this.clock };
		}
		for (const [p, c] of [...this.files].sort(([a], [b]) => (a < b ? -1 : 1))) {
			if (dir ? p.startsWith(prefix) : true) yield { path: p, kind: "file", size: typeof c === "string" ? c.length : c.length, mtimeMs: this.clock };
		}
	}

	async stat(path: string): Promise<Stat | null> {
		if (this.files.has(path)) {
			const c = this.files.get(path) as string | Uint8Array;
			return { kind: "file", size: c.length, mtimeMs: this.clock };
		}
		if (this.folders.has(path)) return { kind: "folder", size: 0, mtimeMs: this.clock };
		return null;
	}

	async readText(path: string): Promise<string> {
		this.reads.push(path);
		const c = this.files.get(path);
		if (c === undefined) throw new BackendError("ENOENT", `no such file: ${path}`, path);
		return typeof c === "string" ? c : new TextDecoder().decode(c);
	}

	async readBinary(path: string): Promise<Uint8Array> {
		const c = this.files.get(path);
		if (c === undefined) throw new BackendError("ENOENT", `no such file: ${path}`, path);
		return typeof c === "string" ? new TextEncoder().encode(c) : c;
	}

	async writeText(path: string, text: string): Promise<void> {
		this.clock++;
		this.setFile(path, text);
	}
	async writeBinary(path: string, data: Uint8Array): Promise<void> {
		this.clock++;
		this.setFile(path, data);
	}
	async createFile(path: string, content: string | Uint8Array): Promise<void> {
		if (this.files.has(path) || this.folders.has(path)) throw new BackendError("EEXIST", `exists: ${path}`, path);
		this.clock++;
		this.setFile(path, content);
	}
	async createFolder(path: string): Promise<void> {
		this.addFolder(path);
	}
	async rename(from: string, to: string): Promise<void> {
		if (this.files.has(to) || this.folders.has(to)) throw new BackendError("EEXIST", `exists: ${to}`, to);
		if (this.files.has(from)) {
			const c = this.files.get(from) as string | Uint8Array;
			this.files.delete(from);
			this.setFile(to, c);
			return;
		}
		if (!this.folders.has(from)) throw new BackendError("ENOENT", `no such path: ${from}`, from);
		for (const f of [...this.folders]) if (f === from || f.startsWith(from + "/")) {
			this.folders.delete(f);
			this.addFolder(to + f.slice(from.length));
		}
		for (const [p, c] of [...this.files]) if (p.startsWith(from + "/")) {
			this.files.delete(p);
			this.setFile(to + p.slice(from.length), c);
		}
	}
	async retire(path: string): Promise<string> {
		let target = ".trash/" + path;
		let n = 2;
		while (this.files.has(target)) target = `.trash/${path} (${n++})`;
		await this.rename(path, target);
		return target;
	}
}
