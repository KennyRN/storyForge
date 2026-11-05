import { archiveCodexItem } from "../core/codex";
import { libraryChapterPath } from "../core/paths";
import { archiveChapterAndTidy } from "./faces/novelTab";
import type { AppModel } from "./model";
import { openRenameCodex } from "./screens/renameCodex";
import { openNewProject } from "./screens/start";
import { openSettings } from "./screens/settings";

/** Items that need a project open. */
const NEEDS_PROJECT = ["new-chapter", "close-project", "find", "replace", "flip-face", "toggle-lore", "backup-now", "settings", "archive", "rename"];

/** Which of the app's own menu items apply now (Edit's Undo and Redo, Open and New Project, Quit are always on). */
export function menuState(model: AppModel): Record<string, boolean> {
	const running = model.running;
	const open = !!running;
	const writable = open && !running!.readOnlyReason;
	const sel = model.selection;
	const state: Record<string, boolean> = {};
	for (const id of NEEDS_PROJECT) state[id] = open;
	state["new-chapter"] = writable && !!model.nav.book;
	state["backup-now"] = writable;
	state["archive"] = writable && !!sel && (sel.kind === "chapter" || sel.kind === "codex-note" || sel.kind === "codex-folder");
	state["rename"] = writable && !!sel;
	return state;
}

/** Tells Rust which items to grey out. Called whenever what applies could have changed. */
export function syncMenuState(model: AppModel): () => void {
	let last = "";
	const send = (): void => {
		const state = menuState(model);
		const key = JSON.stringify(state);
		if (key === last) return;
		last = key;
		void model.controller.setMenuState(state).catch(() => undefined);
	};
	send();
	return model.subscribe(["project", "nav", "face", "settings"], send);
}

function renameSelection(model: AppModel): void {
	const sel = model.selection;
	if (!sel) return;
	const f2 = (selector: string): void => {
		requestAnimationFrame(() => {
			const row = document.querySelector<HTMLElement>(selector);
			if (!row) return void model.notices.notify({ text: "That item isn't showing. Open its tab and try again." });
			row.focus();
			row.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }));
		});
	};
	const esc = (s: string): string => CSS.escape(s);
	if (sel.kind === "codex-note") return openRenameCodex(model, sel.path);
	if (sel.kind === "codex-folder") {
		if (sel.path) return openRenameCodex(model, sel.path);
		return f2(`.sf-codex-folder-header[data-key="${esc(sel.id)}"]`);
	}
	if (sel.kind === "chapter") {
		model.nav.face = "storyforge";
		model.nav.forgeTab = "novel";
		model.touch("face");
		return f2(`.sf-row[data-key="${esc(sel.filename)}"]`);
	}
	model.nav.face = "storyforge";
	model.nav.forgeTab = "series";
	model.touch("face");
	f2(`.sf-row[data-key="${esc(sel.book)}"]`);
}

async function archiveSelection(model: AppModel): Promise<void> {
	const sel = model.selection;
	const running = model.running;
	if (!sel || !running) return;
	const project = running.opened.project;
	await model.guard(async () => {
		if (sel.kind === "chapter") await archiveChapterAndTidy(model, sel.book, sel.filename);
		else if (sel.kind === "codex-note" || sel.kind === "codex-folder") {
			const key = sel.kind === "codex-note" ? sel.path : sel.id;
			const shown = sel.kind === "codex-note" ? sel.path : sel.path;
			const held = shown ? model.editors?.where(shown) : null;
			if (held && held !== "centre") await model.editors?.close(held);
			await archiveCodexItem(project, key);
			model.selection = null;
			model.touch("codex", "archive", "nav");
		}
	}, "archive that");
	void libraryChapterPath;
}

let closeDiagnostics: (() => void) | undefined;

/** The menu items the window answers. Returns true for the ones that replace the controller's own handling. */
export function handleMenu(model: AppModel, id: string): boolean {
	const requireProject = (): boolean => {
		if (model.running) return true;
		model.notices.notify({ text: "Open a project first." });
		return false;
	};
	switch (id) {
		case "open-project":
			void model.openProject("open");
			return true;
		case "new-project":
			openNewProject(model);
			return true;
		case "close-project":
			if (requireProject()) void model.controller.teardown();
			return true;
		case "settings":
			if (requireProject()) openSettings(model);
			return true;
		case "new-chapter":
			void model.addNextChapter();
			return true;
		case "find":
			model.editors?.find(false);
			return true;
		case "replace":
			model.editors?.find(true);
			return true;
		case "flip-face":
			if (requireProject()) model.flipFace();
			return true;
		case "toggle-lore":
			if (requireProject()) model.toggleLoreSlot();
			return true;
		case "diagnostics":
			// Development builds only: Rust has no such item in a release, and this branch is removed from a release bundle.
			if (import.meta.env.DEV) {
				void import("../diagnostic/diagnostics").then((m) => (closeDiagnostics?.(), (closeDiagnostics = m.mountDiagnostics(model))));
			}
			return true;
		case "archive":
			void archiveSelection(model);
			return true;
		case "rename":
			renameSelection(model);
			return true;
		case "backup-now":
			void model.guard(async () => {
				const result = await model.controller.manualBackup("scope");
				model.notices.notify({ text: `Backed up ${result.fileCount} files to ${result.path}.`, actions: [{ label: "Reveal", onClick: () => void model.reveal(result.path), dismiss: false }] });
			}, "back up");
			return true;
		case "clear-recent":
			void model.clearRecent();
			return true;
		default:
			if (id.startsWith("recent:")) {
				void model.openRecent(Number(id.slice(7)));
				return true;
			}
			return false;
	}
}
