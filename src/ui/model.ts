/**
 * The one object the interface reads from and acts through (docs/interface.md §1.1). It wraps the app
 * controller (open, create, watcher, backups, closing) and the notices, and tells regions which topic
 * changed so each redraws only its own subtree. Editors are never redrawn by a topic.
 */
import type { AppController, OpenOutcome, Running } from "../app/appLife";
import type { CreateProjectOptions } from "../core/openProject";
import { NoticeCenter } from "./kit/notices";

export type Topic = "project" | "library" | "codex" | "archive" | "stats" | "settings" | "face" | "notices";

const ALL: Topic[] = ["project", "library", "codex", "archive", "stats", "settings", "face"];

export class AppModel {
	readonly notices = new NoticeCenter();
	private listeners = new Map<Topic, Set<() => void>>();

	constructor(readonly controller: AppController) {
		// Everything the controller does on its own (an outside change applied, a project opened) touches all topics.
		controller.onChange = () => this.touch(...ALL);
	}

	get running(): Running | null {
		return this.controller.running;
	}

	subscribe(topics: Topic | Topic[], listener: () => void): () => void {
		const list = Array.isArray(topics) ? topics : [topics];
		for (const t of list) {
			const set = this.listeners.get(t) ?? new Set();
			set.add(listener);
			this.listeners.set(t, set);
		}
		return () => list.forEach((t) => this.listeners.get(t)?.delete(listener));
	}

	touch(...topics: Topic[]): void {
		const fire = new Set<() => void>();
		for (const t of topics) for (const l of this.listeners.get(t) ?? []) fire.add(l);
		for (const l of fire) l();
	}

	async openProject(kind: "open" | "create", create?: CreateProjectOptions): Promise<OpenOutcome | null> {
		return this.guard(() => this.controller.openDialog(kind, create), kind === "create" ? "create the project" : "open the project");
	}

	async openRecent(index: number): Promise<OpenOutcome | null> {
		return this.guard(() => this.controller.openRecent(index), "open the project");
	}

	/** Runs an action; a failure becomes a plain notice that says what could not be done. */
	async guard<T>(action: () => Promise<T>, what: string): Promise<T | null> {
		try {
			const out = await action();
			if (out && typeof out === "object" && "kind" in out && (out as { kind: string }).kind === "not-a-project") {
				this.notices.notify({ text: (out as unknown as { message: string }).message });
			}
			return out;
		} catch (e) {
			this.notices.notify({ text: `Could not ${what}: ${(e as Error)?.message ?? String(e)}` });
			return null;
		}
	}
}
