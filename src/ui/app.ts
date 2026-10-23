import { AppController, type Host } from "../app/appLife";
import { mountNotices } from "./kit/notices";
import { el, fill } from "./kit/dom";
import { AppModel } from "./model";
import { EditorHost } from "./editor/editorHost";
import { renderStart } from "./screens/start";

/** Builds the interface into `root` over a host (Tauri's, or the browser preview's). */
export async function startApp(host: Host, root: HTMLElement): Promise<AppModel> {
	const controller = new AppController(host);
	const model = new AppModel(controller);
	const stage = el("div", { class: "sf-stage" });
	const notices = el("div");
	fill(root, stage, notices);
	mountNotices(notices, model.notices);

	let shown: unknown = undefined;
	const draw = (): void => {
		const running = model.running;
		// The controller touches every topic when it applies an outside change: only a different project (or none) redraws the stage.
		if (running === shown) return;
		shown = running;
		if (!running) {
			renderStart(stage, model);
			return;
		}
		// The two editor slots; the shell (storytelling and storyForge faces) arrives with the faces.
		const centre = el("section", { class: "sf-slot sf-slot--centre", attrs: { "aria-label": "Chapter" } });
		const lore = el("aside", { class: "sf-slot sf-slot--lore", attrs: { "aria-label": "Lore" } });
		fill(stage, el("h1", { class: "sf-visually-hidden", text: running.root.slice(running.root.lastIndexOf("/") + 1) }), el("div", { class: "sf-frame" }, centre, lore));
		model.editors = new EditorHost(model, { centre, lore });
	};
	model.subscribe("project", draw);
	await controller.start();
	draw();
	return model;
}
