/**
 * Drives the real Rust file-system code (`sf-bridge`, built from src-tauri/fs) from the TypeScript
 * tests, so the backend contract suite runs against the code the app runs. `available()` is false
 * where there is no Rust toolchain (the suite is then skipped).
 */
import { type ChildProcessWithoutNullStreams, execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Invoke } from "../../src/backends/tauri";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const bridgePath = path.join(repo, "src-tauri/target/debug/sf-bridge");

export function cargoPath(): string | null {
	for (const candidate of [path.join(os.homedir(), ".cargo/bin/cargo"), "/usr/local/bin/cargo", "/opt/homebrew/bin/cargo"]) if (existsSync(candidate)) return candidate;
	try {
		return execFileSync("which", ["cargo"], { encoding: "utf8" }).trim() || null;
	} catch {
		return null;
	}
}

export function available(): boolean {
	return existsSync(bridgePath);
}

export function buildBridge(): boolean {
	const cargo = cargoPath();
	if (!cargo) return false;
	execFileSync(cargo, ["build", "-p", "storyforge-fs", "--bin", "sf-bridge", "--quiet"], { cwd: path.join(repo, "src-tauri"), stdio: "inherit", env: { ...process.env, PATH: `${path.dirname(cargo)}:${process.env.PATH ?? ""}` } });
	return existsSync(bridgePath);
}

export class RustBridge {
	private child: ChildProcessWithoutNullStreams;
	private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
	private opened: { resolve: () => void; reject: (e: unknown) => void } | null = null;
	private buffer = "";
	private nextId = 1;

	private constructor() {
		this.child = spawn(bridgePath, [], { stdio: ["pipe", "pipe", "pipe"] });
		this.child.stdout.setEncoding("utf8");
		this.child.stdout.on("data", (chunk: string) => {
			this.buffer += chunk;
			let nl: number;
			while ((nl = this.buffer.indexOf("\n")) >= 0) {
				const line = this.buffer.slice(0, nl);
				this.buffer = this.buffer.slice(nl + 1);
				if (line.trim()) this.onLine(JSON.parse(line));
			}
		});
	}

	private onLine(msg: { id?: number; ok?: unknown; err?: unknown }): void {
		if (msg.id === undefined) {
			const o = this.opened;
			this.opened = null;
			if (msg.err) o?.reject(msg.err);
			else o?.resolve();
			return;
		}
		const p = this.pending.get(msg.id);
		if (!p) return;
		this.pending.delete(msg.id);
		if (msg.err !== undefined) p.reject(msg.err);
		else p.resolve(msg.ok);
	}

	static async open(root: string, readOnly = false): Promise<RustBridge> {
		const bridge = new RustBridge();
		await new Promise<void>((resolve, reject) => {
			bridge.opened = { resolve, reject };
			bridge.child.stdin.write(JSON.stringify({ open: root, readOnly }) + "\n");
		});
		return bridge;
	}

	/** The preview's stand-in for `peek_recent`: the summary of a folder by its path (no project needed), from the very code the app runs. */
	static peekRoot(root: string): Promise<unknown> {
		const bridge = new RustBridge();
		return new Promise((resolve, reject) => {
			const id = bridge.nextId++;
			bridge.pending.set(id, {
				resolve: (v) => (bridge.close(), resolve(v)),
				reject: (e) => (bridge.close(), reject(e)),
			});
			bridge.child.stdin.write(JSON.stringify({ id, peekRoot: root }) + "\n");
		});
	}

	/** Shaped like Tauri's `invoke`: `(command, { args })`. */
	readonly invoke: Invoke = (cmd, payload) =>
		new Promise((resolve, reject) => {
			const id = this.nextId++;
			this.pending.set(id, { resolve, reject });
			this.child.stdin.write(JSON.stringify({ id, cmd, args: (payload as { args?: unknown } | undefined)?.args ?? {} }) + "\n");
		});

	close(): void {
		this.child.stdin.end();
		this.child.kill();
	}
}
