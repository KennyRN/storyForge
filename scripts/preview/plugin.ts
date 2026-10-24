/**
 * The browser preview's development server (docs/interface.md §8). DEVELOPMENT ONLY: it is a Vite plugin
 * loaded by vite.preview.config.ts, listens on 127.0.0.1 only, and is not part of the app bundle or any
 * release build. It gives the page the same commands the Tauri window has, answered by the real Rust
 * file code (sf-bridge) over a temporary copy of a synthetic fixture, with the window-only commands
 * (the picker, the watcher, quitting) scripted as in the tests' FakeHost.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { FakeHost } from "../../test/helpers/fakeHost";
import { available, buildBridge } from "../../test/helpers/rustBridge";

const repo = fileURLToPath(new URL("../..", import.meta.url));

export type PickMode = "project" | "cancel" | "empty";
export interface ResetOptions {
	/** A folder under test/fixtures: "series" (default) or "empty". */
	fixture?: string;
	/** Put the copy in the recent list. Default true. */
	recent?: boolean;
	/** The next folder picker returns the copy (read-only if asked), an empty folder, or cancels. */
	pick?: PickMode;
	readOnly?: boolean;
}

function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (c) => (data += c));
		req.on("end", () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch (e) {
				reject(e);
			}
		});
	});
}

function send(res: ServerResponse, status: number, body: unknown): void {
	res.statusCode = status;
	res.setHeader("content-type", "application/json");
	res.end(JSON.stringify(body ?? null));
}

export function previewHostPlugin(): Plugin {
	const host = new FakeHost();
	const base = mkdtempSync(path.join(os.tmpdir(), "sf-preview-"));
	let counter = 0;
	let projectRoot: string | null = null;
	let pickMode: PickMode = "cancel";
	let pickReadOnly = false;
	const copies: string[] = [];

	const freshCopy = (fixture: string): string => {
		const dest = path.join(base, `${fixture}-${++counter}`, "storyForge test vault");
		mkdirSync(path.dirname(dest), { recursive: true });
		cpSync(path.join(repo, "test/fixtures", fixture), dest, { recursive: true });
		copies.push(dest);
		return dest;
	};

	const reset = (o: ResetOptions = {}): { root: string } => {
		host.close();
		host.machine.clear();
		host.current = null;
		host.quit = false;
		const root = freshCopy(o.fixture ?? "series");
		projectRoot = root;
		host.recent = o.recent === false ? [] : [root];
		pickMode = o.pick ?? "project";
		pickReadOnly = o.readOnly ?? false;
		return { root };
	};

	const armPick = (): void => {
		if (pickMode === "cancel") host.nextPick = null;
		else if (pickMode === "empty") host.nextPick = { root: freshCopy("empty"), readOnly: false };
		else if (projectRoot) host.nextPick = { root: projectRoot, readOnly: pickReadOnly };
	};

	return {
		name: "storyforge-preview-host",
		apply: "serve",
		configureServer(server) {
			if (!available() && !buildBridge()) throw new Error("The preview needs the Rust bridge: install Rust and run `cargo build -p storyforge-fs --bin sf-bridge` in src-tauri.");
			reset({ pick: "cancel" });
			server.httpServer?.on("close", () => {
				host.close();
				rmSync(base, { recursive: true, force: true });
			});
			server.middlewares.use(async (req, res, next) => {
				const url = req.url ?? "";
				if (req.method !== "POST" || !(url.startsWith("/__host/") || url.startsWith("/__preview/"))) return next();
				try {
					const body = (await readBody(req)) as Record<string, unknown>;
					switch (url) {
						case "/__host/invoke": {
							const cmd = String(body.cmd);
							if (cmd === "pick_project") armPick();
							try {
								return send(res, 200, { ok: await host.invoke(cmd, body.payload as Record<string, unknown> | undefined) });
							} catch (e) {
								return send(res, 200, { err: e instanceof Error ? { code: "UNKNOWN", message: e.message } : e });
							}
						}
						case "/__preview/reset":
							return send(res, 200, reset(body as ResetOptions));
						case "/__preview/pick":
							pickMode = (body.mode as PickMode) ?? "project";
							return send(res, 200, null);
						case "/__preview/touch": {
							const root = host.current?.root ?? projectRoot;
							if (!root) throw new Error("no project");
							const target = path.join(root, String(body.path));
							mkdirSync(path.dirname(target), { recursive: true });
							writeFileSync(target, String(body.text));
							return send(res, 200, null);
						}
						case "/__preview/rename": {
							const root = host.current?.root ?? projectRoot;
							if (!root) throw new Error("no project");
							const to = path.join(root, String(body.to));
							mkdirSync(path.dirname(to), { recursive: true });
							renameSync(path.join(root, String(body.from)), to);
							return send(res, 200, null);
						}
						case "/__preview/read": {
							const root = host.current?.root ?? projectRoot;
							if (!root) throw new Error("no project");
							return send(res, 200, readFileSync(path.join(root, String(body.path)), "utf8"));
						}
						case "/__preview/root":
							return send(res, 200, host.current?.root ?? projectRoot);
						default:
							return send(res, 404, { err: "unknown preview endpoint" });
					}
				} catch (e) {
					send(res, 500, { err: String(e) });
				}
			});
		},
	};
}
