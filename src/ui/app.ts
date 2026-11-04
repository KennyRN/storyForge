import { applyAppearance } from "./appearance";
import { installInputMode } from "./kit/inputMode";
import { installScrollIndicator } from "./kit/scrollIndicator";
import { AppController, type Host } from "../app/appLife";
import { mountNotices } from "./kit/notices";
import { undoRedoFocusedField } from "./commitOnClose";
import { el, fill } from "./kit/dom";
import { AppModel } from "./model";
import { renderStart } from "./screens/start";
import { maybeShowReconciliation } from "./screens/summary";
import { handleMenu, syncMenuState } from "./menu";
import { mountShell } from "./shell";

/** Builds the interface into `root` over a host (Tauri's, or the browser preview's). */
export async function startApp(host: Host, root: HTMLElement): Promise<AppModel> {
	installScrollIndicator();
	installInputMode();
	const controller = new AppController(host);
	const model = new AppModel(controller);
	const stage = el("div", { class: "sf-stage" });
	const notices = el("div");
	fill(root, stage, notices);
	mountNotices(notices, model.notices);

	// The Codex colour is a project preference: it recolours both lists at once, and with no project open it is the default.
	const applyCodexColour = (): void => void (document.documentElement.dataset.codexColour = model.running?.settings.values.codexColour ?? "text");
	const applyDataColour = (): void => void (document.documentElement.dataset.dataColour = model.running?.settings.values.dataColour ?? "blue");
	const applyLook = (): void => (applyCodexColour(), applyDataColour(), applyAppearance(model.running?.settings.values));
	model.subscribe(["settings", "project"], applyLook);
	applyLook();

	let shown: unknown = undefined;
	let shell: { dispose(): void } | null = null;
	let offChapter: (() => void) | null = null;
	const draw = (): void => {
		const running = model.running;
		// The controller touches every topic when it applies an outside change: only a different project (or none) redraws the stage.
		if (running === shown) return;
		shown = running;
		if (!running) {
			shell?.dispose();
			shell = null;
			offChapter?.();
			offChapter = null;
			renderStart(stage, model);
			return;
		}
		shell?.dispose();
		model.initNav();
		shell = mountShell(stage, model);
		const writer = running.opened.writer;
		offChapter?.();
		offChapter = writer.onChapterChanged(() => model.touch("stats"));
		if (running.readOnlyReason) model.notices.notify({ key: "read-only", sticky: true, text: running.readOnlyReason });
		maybeShowReconciliation(model);
	};
	// Edit ▸ Undo and Redo are app menu items (the native ones would not reach CodeMirror's own history): they act on what is focused.
	await host.listen("menu", (id) => {
		if (id !== "undo" && id !== "redo") return;
		if (model.editors?.[id]()) return;
		if (undoRedoFocusedField(id)) return; // a plot note, synopsis or description: its own history
		document.execCommand(id); // a rename or settings field
	});
	model.subscribe("project", draw);
	controller.menuHandler = (id) => handleMenu(model, id);
	syncMenuState(model);
	await controller.start();
	draw();
	return model;
}
