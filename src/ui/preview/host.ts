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
	read(path: string): Promise<string>;
	root(): Promise<string | null>;
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
		read: (path) => post("/__preview/read", { path }) as Promise<string>,
		root: () => post("/__preview/root", {}) as Promise<string | null>,
	};
	return {
		api,
		async invoke(cmd, payload) {
			// Commands about the window itself are answered here, not by the file code.
			if (cmd === "reveal_in_finder") {
				api.revealed.push(String((payload as { args?: { path?: string } } | undefined)?.args?.path ?? ""));
				return null;
			}
			if (cmd === "set_menu_state") {
				api.menuStates.push((payload as { args?: { enabled?: Record<string, boolean> } } | undefined)?.args?.enabled ?? {});
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
