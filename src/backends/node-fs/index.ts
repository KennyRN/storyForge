/**
 * NodeFsBackend: the Backend over a real folder, for tests and the developer command-line check
 * now, and as the reference for the Rust backend in Brief 4. Node-only (imports node:fs).
 *
 * - Writes are atomic: a temp file beside the target (dot-prefixed, so scans ignore it), fsync, rename.
 * - Rewriting an existing CRLF file with LF-only text keeps CRLF ("line endings are kept as found");
 *   new files get the text exactly as given.
 * - No delete. `retire` moves into `<root>/.trash/`, giving the incoming entry a unique name rather
 *   than ever overwriting what is there.
 * - Symlinks are neither followed nor listed; a mutating call whose real parent lies outside the
 *   root is refused.
 */
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { randomBytes } from "node:crypto";
import { BackendError, type Backend, type BackendErrorCode, type ScanEntry, type Stat } from "../../core/backend/types";
import { resolvePath } from "../../core/pathRules";

const TRASH = ".trash";

function toBackendError(err: unknown, path: string): BackendError {
	if (err instanceof BackendError) return err;
	const code = (err as NodeJS.ErrnoException)?.code;
	const map: Record<string, BackendErrorCode> = {
		ENOENT: "ENOENT",
		EEXIST: "EEXIST",
		ENOTDIR: "ENOTDIR",
		EISDIR: "EISDIR",
		EACCES: "EACCES",
		EPERM: "EACCES",
		ENOTEMPTY: "EEXIST",
	};
	return new BackendError(map[code ?? ""] ?? "UNKNOWN", `${(err as Error)?.message ?? String(err)}`, path);
}

export class NodeFsBackend implements Backend {
	private realRoot: Promise<string>;
	/** Test hook: runs between the comparison and the last identity check of writeTextIfUnchanged. */
	afterCompareHook?: (absTarget: string) => Promise<void> | void;

	constructor(public readonly root: string) {
		this.realRoot = fs.realpath(root);
	}

	// ------------------------------------------------------------------------------ paths

	private rel(path: string): string {
		const resolved = resolvePath(path);
		if (resolved === null) throw new BackendError("EACCES", `not a safe project path: "${path}"`, path);
		return resolved;
	}

	private abs(rel: string): string {
		return nodePath.join(this.root, ...rel.split("/").filter(Boolean));
	}

	/** Refuses a mutating target whose real parent directory is outside the root (symlink escape). */
	private async assertInside(rel: string): Promise<void> {
		const realRoot = await this.realRoot;
		let dir = nodePath.dirname(this.abs(rel));
		for (;;) {
			try {
				const real = await fs.realpath(dir);
				const within = nodePath.relative(realRoot, real);
				if (within.startsWith("..") || nodePath.isAbsolute(within)) {
					throw new BackendError("EACCES", `"${rel}" resolves outside the project`, rel);
				}
				return;
			} catch (err) {
				if (err instanceof BackendError) throw err;
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw toBackendError(err, rel);
				const parent = nodePath.dirname(dir);
				if (parent === dir) return;
				dir = parent;
			}
		}
	}

	// ------------------------------------------------------------------------------ reads

	async *scan(dir?: string): AsyncIterable<ScanEntry> {
		const start = dir ? this.rel(dir) : "";
		const walk = async function* (self: NodeFsBackend, rel: string): AsyncIterable<ScanEntry> {
			let names: import("node:fs").Dirent[];
			try {
				names = await fs.readdir(self.abs(rel), { withFileTypes: true });
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") return;
				throw toBackendError(err, rel);
			}
			names.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
			for (const d of names) {
				if (d.isSymbolicLink()) continue;
				const childRel = rel ? `${rel}/${d.name}` : d.name;
				let st;
				try {
					st = await fs.lstat(self.abs(childRel));
				} catch {
					continue;
				}
				if (d.isDirectory()) {
					yield { path: childRel, kind: "folder", size: 0, mtimeMs: st.mtimeMs };
					yield* walk(self, childRel);
				} else if (d.isFile()) {
					yield { path: childRel, kind: "file", size: st.size, mtimeMs: st.mtimeMs };
				}
			}
		};
		yield* walk(this, start);
	}

	async stat(path: string): Promise<Stat | null> {
		const rel = this.rel(path);
		try {
			const st = await fs.lstat(this.abs(rel));
			if (st.isSymbolicLink()) return null;
			return { kind: st.isDirectory() ? "folder" : "file", size: st.isDirectory() ? 0 : st.size, mtimeMs: st.mtimeMs };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT" || (err as NodeJS.ErrnoException).code === "ENOTDIR") return null;
			throw toBackendError(err, rel);
		}
	}

	async readText(path: string): Promise<string> {
		const rel = this.rel(path);
		try {
			return await fs.readFile(this.abs(rel), "utf8");
		} catch (err) {
			throw toBackendError(err, rel);
		}
	}

	async readBinary(path: string): Promise<Uint8Array> {
		const rel = this.rel(path);
		try {
			return new Uint8Array(await fs.readFile(this.abs(rel)));
		} catch (err) {
			throw toBackendError(err, rel);
		}
	}

	// ----------------------------------------------------------------------------- writes

	private async atomicWrite(rel: string, data: string | Uint8Array): Promise<void> {
		await this.assertInside(rel);
		const target = this.abs(rel);
		await fs.mkdir(nodePath.dirname(target), { recursive: true });
		const tmp = nodePath.join(nodePath.dirname(target), `.${nodePath.basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
		let handle: fs.FileHandle | undefined;
		try {
			handle = await fs.open(tmp, "wx");
			await handle.writeFile(data);
			await handle.sync();
			await handle.close();
			handle = undefined;
			await fs.rename(tmp, target);
		} catch (err) {
			if (handle) await handle.close().catch(() => undefined);
			await fs.rm(tmp, { force: true }).catch(() => undefined);
			throw toBackendError(err, rel);
		}
	}

	async writeText(path: string, text: string): Promise<void> {
		const rel = this.rel(path);
		let out = text;
		if (!text.includes("\r\n") && text.includes("\n")) {
			// Keep CRLF if the file being replaced uses it.
			try {
				const existing = await fs.readFile(this.abs(rel), "utf8");
				const m = /\r?\n/.exec(existing);
				if (m && m[0] === "\r\n") out = text.replace(/\n/g, "\r\n");
			} catch {
				/* new file: the text is written exactly as given */
			}
		}
		await this.atomicWrite(rel, out);
	}

	/**
	 * Compare-then-write. The new text goes to a temp file first; then, with nothing else able to
	 * interleave through this backend, the target is read and compared with `expected`, and its
	 * identity (inode, size, mtime) is checked again immediately before the atomic rename. Any
	 * difference is a conflict and the temp file is removed. What remains is the gap between that last
	 * check and the rename (microseconds); see docs/safety-core.md §10.
	 */
	async writeTextIfUnchanged(path: string, expected: string, text: string): Promise<"written" | "conflict"> {
		const rel = this.rel(path);
		await this.assertInside(rel);
		const target = this.abs(rel);
		const tmp = nodePath.join(nodePath.dirname(target), `.${nodePath.basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
		let handle: fs.FileHandle | undefined;
		try {
			handle = await fs.open(tmp, "wx");
			await handle.writeFile(text);
			await handle.sync();
			await handle.close();
			handle = undefined;
			let before;
			let current: string;
			try {
				before = await fs.lstat(target);
				if (!before.isFile()) throw new BackendError("EISDIR", `"${rel}" is not a file`, rel);
				current = await fs.readFile(target, "utf8");
			} catch (err) {
				throw toBackendError(err, rel);
			}
			if (current !== expected) {
				await fs.rm(tmp, { force: true });
				return "conflict";
			}
			await this.afterCompareHook?.(target);
			const after = await fs.lstat(target).catch(() => undefined);
			if (!after || after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
				await fs.rm(tmp, { force: true });
				return "conflict";
			}
			await fs.rename(tmp, target);
			return "written";
		} catch (err) {
			if (handle) await handle.close().catch(() => undefined);
			await fs.rm(tmp, { force: true }).catch(() => undefined);
			throw toBackendError(err, rel);
		}
	}

	async writeBinary(path: string, data: Uint8Array): Promise<void> {
		await this.atomicWrite(this.rel(path), data);
	}

	async createFile(path: string, content: string | Uint8Array): Promise<void> {
		const rel = this.rel(path);
		await this.assertInside(rel);
		const target = this.abs(rel);
		await fs.mkdir(nodePath.dirname(target), { recursive: true });
		const tmp = nodePath.join(nodePath.dirname(target), `.${nodePath.basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
		try {
			await fs.writeFile(tmp, content, { flag: "wx" });
			try {
				await fs.link(tmp, target); // fails with EEXIST if the target exists: never overwrites
			} catch (err) {
				const code = (err as NodeJS.ErrnoException).code;
				if (code === "EEXIST") throw err;
				// Filesystems without hard links: fall back to an exclusive create.
				await fs.copyFile(tmp, target, constants.COPYFILE_EXCL);
			}
		} catch (err) {
			throw toBackendError(err, rel);
		} finally {
			await fs.rm(tmp, { force: true }).catch(() => undefined);
		}
	}

	async createFolder(path: string): Promise<void> {
		const rel = this.rel(path);
		await this.assertInside(rel);
		try {
			await fs.mkdir(this.abs(rel), { recursive: true });
		} catch (err) {
			throw toBackendError(err, rel);
		}
	}

	async rename(from: string, to: string): Promise<void> {
		const relFrom = this.rel(from);
		const relTo = this.rel(to);
		await this.assertInside(relTo);
		const src = this.abs(relFrom);
		const dst = this.abs(relTo);
		let srcStat;
		try {
			srcStat = await fs.lstat(src);
		} catch (err) {
			throw toBackendError(err, relFrom);
		}
		await fs.mkdir(nodePath.dirname(dst), { recursive: true });
		let dstStat;
		try {
			dstStat = await fs.lstat(dst);
		} catch {
			dstStat = undefined;
		}
		if (dstStat) {
			const sameEntry = dstStat.ino === srcStat.ino && dstStat.dev === srcStat.dev;
			if (!sameEntry) throw new BackendError("EEXIST", `"${relTo}" already exists`, relTo);
			if (relFrom === relTo) return;
			// A case-only (or Unicode-only) rename on a case-insensitive file system: go through a temp name.
			const hop = `${src}.${randomBytes(4).toString("hex")}.hop`;
			try {
				await fs.rename(src, hop);
				await fs.rename(hop, dst);
			} catch (err) {
				throw toBackendError(err, relTo);
			}
			return;
		}
		try {
			if (srcStat.isFile()) {
				try {
					await fs.link(src, dst); // exclusive: never overwrites
					await fs.unlink(src);
					return;
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code === "EEXIST") throw err;
					/* no hard links here: fall through to a plain rename */
				}
			}
			await fs.rename(src, dst);
		} catch (err) {
			throw toBackendError(err, relTo);
		}
	}

	async retire(path: string): Promise<string> {
		const rel = this.rel(path);
		const st = await this.stat(rel);
		if (!st) throw new BackendError("ENOENT", `no such path: "${rel}"`, rel);
		const dir = parentDir(rel);
		const base = rel.slice(rel.lastIndexOf("/") + 1);
		const dot = st.kind === "file" ? base.lastIndexOf(".") : -1;
		const stem = dot > 0 ? base.slice(0, dot) : base;
		const ext = dot > 0 ? base.slice(dot) : "";
		for (let n = 1; ; n++) {
			const name = n === 1 ? base : `${stem} (${n})${ext}`;
			const candidate = [TRASH, dir, name].filter(Boolean).join("/");
			try {
				await this.rename(rel, candidate);
				return candidate;
			} catch (err) {
				if (err instanceof BackendError && err.code === "EEXIST") continue;
				throw err;
			}
		}
	}
}

function parentDir(rel: string): string {
	const i = rel.lastIndexOf("/");
	return i === -1 ? "" : rel.slice(0, i);
}
