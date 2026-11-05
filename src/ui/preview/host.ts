import type { Host } from "../../app/appLife";

type Handler = (payload: unknown) => void;

export interface PreviewApi {
	/** Fires a window event as Rust would: "menu", "watch-batch", "close-requested". */
	emit(event: string, payload?: unknown): void;
	/** Paths the app asked to reveal in Finder (nothing is opened in the preview). */
	revealed: string[];
	/** Every menu-state command the app sent, newest last. */
	menuStates: Record<string, boolean>[];
	reset(options?: { fixture?: string; recent?: boolean; pick?: "project" | "cancel" | "empty"; readOnly?: boolean }): Promise<{ root: string }>;
	pick(mode: "project" | "cancel" | "empty"): Promise<void>;
	/** Writes a file in the preview's temporary copy of the project, as another editor would. */
	touch(path: string, text: string): Promise<void>;
	/** Moves a file in the preview's temporary copy, as another program would (for changes made while the app was closed). */
	rename(from: string, to: string): Promise<void>;
	/** Arms the next cover picker with an image (base64), as the native open panel would hand it over; null cancels the panel. */
	armCover(base64: string | null): Promise<void>;
	/** Reads a file of the preview's project as base64. */
	readBase64(path: string): Promise<string>;
	read(path: string): Promise<string>;
	root(): Promise<string | null>;
	/** Sets the recent list (the start screen's cards) to fresh copies of fixtures, folders that are gone, and so on; returns their paths. */
	setRecent(entries: RecentEntry[]): Promise<string[]>;
	/** The recent list and the names the window gave the Open Recent menu, as the host holds them. */
	recentState(): Promise<{ recent: string[]; names: [string, string][] }>;
}

/** One entry of the preview's recent list: a copy of a fixture (with files written or removed first), or a folder that is not there. */
export interface RecentEntry {
	fixture?: string;
	missing?: boolean;
	/** Files written into the copy before it is listed (project-relative path to text). */
	files?: Record<string, string>;
	/** Files removed from the copy. */
	remove?: string[];
	/** The folder's own name (default: the preview's usual one). */
	folder?: string;
}

async function post(url: string, body: unknown): Promise<unknown> {
	const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
	if (!res.ok) throw new Error(`preview server: ${res.status}`);
	return res.json();
}

/** The preview's host: commands go to the development server's real Rust bridge; events are local. */
export function createPreviewHost(): Host & { api: PreviewApi } {
	const handlers = new Map<string, Handler[]>();
	const api: PreviewApi = {
		emit: (event, payload) => {
			for (const h of handlers.get(event) ?? []) h(payload);
		},
		revealed: [],
		menuStates: [],
		reset: (options) => post("/__preview/reset", options) as Promise<{ root: string }>,
		pick: async (mode) => void (await post("/__preview/pick", { mode })),
		touch: async (path, text) => void (await post("/__preview/touch", { path, text })),
		rename: async (from, to) => void (await post("/__preview/rename", { from, to })),
		armCover: async (base64) => void (await post("/__preview/cover", { base64 })),
		readBase64: (path) => post("/__preview/read-base64", { path }) as Promise<string>,
		read: (path) => post("/__preview/read", { path }) as Promise<string>,
		root: () => post("/__preview/root", {}) as Promise<string | null>,
		setRecent: (entries) => post("/__preview/recent", { entries }) as Promise<string[]>,
		recentState: () => post("/__preview/recent-state", {}) as Promise<{ recent: string[]; names: [string, string][] }>,
	};
	return {
		api,
		async invoke(cmd, payload) {
			// Commands about the window itself are answered here, not by the file code.
			if (cmd === "reveal_in_finder") {
				api.revealed.push(String((payload as { path?: string } | undefined)?.path ?? ""));
				return null;
			}
			if (cmd === "set_menu_state") {
				api.menuStates.push((payload as { enabled?: Record<string, boolean> } | undefined)?.enabled ?? {});
				return null;
			}
			const reply = (await post("/__host/invoke", { cmd, payload })) as { ok?: unknown; err?: unknown };
			if (reply.err !== undefined) throw reply.err;
			return reply.ok;
		},
		async listen(event, handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			return () => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
		},
	};
}
