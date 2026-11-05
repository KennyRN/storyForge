/**
 * A stand-in for the Tauri host, for testing the app's life cycle: the file-system commands run the
 * real Rust code (through sf-bridge); the commands that need a window (the picker, the watcher, quitting)
 * are scripted.
 */
import type { Host, Timers } from "../../src/app/appLife";
import type { Invoke } from "../../src/backends/tauri";
import { RustBridge } from "./rustBridge";

export class FakeHost implements Host {
	bridge: RustBridge | null = null;
	/** Bridges of projects already closed: in Rust a command already running holds its project, so they finish. */
	private retired: RustBridge[] = [];
	machine = new Map<string, string>();
	recent: string[] = [];
	calls: string[] = [];
	handlers = new Map<string, ((payload: unknown) => void)[]>();
	/** What the next folder picker returns (null = the user cancelled). */
	nextPick: { root: string; readOnly?: boolean } | null = null;
	/** Scripted overrides: a command name to a function. */
	overrides = new Map<string, (args: unknown) => unknown>();
	current: { root: string; readOnly: boolean } | null = null;
	/** What `peek_recent` last listed for each recent entry, as Rust keeps it: so `peek_recent_book` can refuse a list that changed. */
	/** The labels the window last gave the Open Recent menu. */
	recentNames: [string, string][] = [];
	private peeked = new Map<number, { root: string; folders: string[] }>();
	quit = false;
	/** How many times the window reported close progress. */
	progress = 0;
	clock = new Date(2026, 9, 23, 10, 0, 0);
	timers?: Timers;

	now = () => this.clock;

	async attach(root: string, readOnly = false): Promise<void> {
		if (this.bridge) this.retired.push(this.bridge);
		this.bridge = await RustBridge.open(root, readOnly);
		this.current = { root, readOnly };
	}

	close(): void {
		this.bridge?.close();
		for (const b of this.retired.splice(0)) b.close();
		this.bridge = null;
	}

	readonly invoke: Invoke = async (cmd, payload) => {
		this.calls.push(cmd);
		const args = (payload as { args?: unknown } | undefined)?.args;
		const override = this.overrides.get(cmd);
		if (override) return override(args ?? payload);
		switch (cmd) {
			case "pick_project": {
				const pick = this.nextPick;
				this.nextPick = null;
				if (!pick) return null;
				await this.attach(pick.root, pick.readOnly ?? false);
				return { root: pick.root, readOnly: pick.readOnly ?? false };
			}
			case "open_recent": {
				const root = this.recent[(payload as { index: number }).index];
				await this.attach(root);
				return { root, readOnly: false };
			}
			case "remember_project": {
				// As Rust does: the project held open goes first on the list, once, at most ten.
				if (!this.current) throw { code: "UNKNOWN", message: "no project is open" };
				const root = this.current.root;
				this.recent = [root, ...this.recent.filter((r) => r !== root)].slice(0, 10);
				this.peeked.clear();
				return null;
			}
			case "peek_recent": {
				const index = (payload as { index: number }).index;
				const root = this.recent[index];
				if (root === undefined) throw { code: "ENOENT", message: "no such recent project" };
				const out = (await RustBridge.peekRoot(root)) as { bookFolders: string[] };
				this.peeked.set(index, { root, folders: out.bookFolders });
				return out;
			}
			case "peek_recent_book": {
				const { index, position } = payload as { index: number; position: number };
				const root = this.recent[index];
				if (root === undefined) throw { code: "ENOENT", message: "no such recent project" };
				const listed = this.peeked.get(index);
				if (!listed || listed.root !== root) throw { code: "CHANGED", message: "the recent list changed; look again" };
				const bridge = await RustBridge.open(root, true);
				try {
					return await bridge.invoke("peek_book", { args: { position, expected: listed.folders } });
				} finally {
					bridge.close();
				}
			}
			case "forget_recent": {
				const index = (payload as { index: number }).index;
				if (index < 0 || index >= this.recent.length) throw { code: "ENOENT", message: "no such recent project" };
				this.recent = this.recent.filter((_, i) => i !== index);
				this.peeked.clear();
				return null;
			}
			case "clear_recent":
				this.recent = [];
				this.peeked.clear();
				return null;
			case "set_recent_names":
				this.recentNames = (payload as { entries: [string, string][] }).entries;
				return null;
			case "recent_projects":
				return this.recent;
			case "project_info":
				return this.current;
			case "close_project":
				if (this.bridge) this.retired.push(this.bridge);
				this.bridge = null;
				this.current = null;
				return null;
			case "watch_start":
			case "watch_stop":
				return null;
			case "close_progress":
				this.progress += 1;
				return null;
			case "quit_ready":
				this.quit = true;
				return null;
			case "machine_get":
				return this.machine.get((payload as { name: string }).name) ?? null;
			case "machine_set": {
				const p = payload as { name: string; text: string };
				this.machine.set(p.name, p.text);
				return null;
			}
			default:
				if (!this.bridge) throw { code: "UNKNOWN", message: "no project is open" };
				return this.bridge.invoke(cmd, payload);
		}
	};

	async listen(event: string, handler: (payload: unknown) => void): Promise<() => void> {
		this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
		return () => this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== handler));
	}

	emit(event: string, payload?: unknown): void {
		for (const h of this.handlers.get(event) ?? []) h(payload);
	}
}

/** Timers a test fires by hand. */
export class ManualTimers implements Timers {
	private next = 1;
	timeouts = new Map<number, () => void>();
	intervals = new Map<number, () => void>();
	setInterval(fn: () => void): unknown {
		const id = this.next++;
		this.intervals.set(id, fn);
		return id;
	}
	clearInterval(h: unknown): void {
		this.intervals.delete(h as number);
	}
	setTimeout(fn: () => void): unknown {
		const id = this.next++;
		this.timeouts.set(id, fn);
		return id;
	}
	clearTimeout(h: unknown): void {
		this.timeouts.delete(h as number);
	}
	fireTimeouts(): void {
		for (const [id, fn] of [...this.timeouts]) {
			this.timeouts.delete(id);
			fn();
		}
	}
	fireIntervals(): void {
		for (const fn of this.intervals.values()) fn();
	}
}
