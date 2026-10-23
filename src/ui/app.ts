import { AppController, type Host } from "../app/appLife";
import { mountNotices } from "./kit/notices";
import { el, fill } from "./kit/dom";
import { AppModel } from "./model";
import { renderStart } from "./screens/start";

/** Builds the interface into `root` over a host (Tauri's, or the browser preview's). */
export async function startApp(host: Host, root: HTMLElement): Promise<AppModel> {
	const controller = new AppController(host);
	const model = new AppModel(controller);
	const stage = el("div", { class: "sf-stage" });
	const notices = el("div");
	fill(root, stage, notices);
	mountNotices(notices, model.notices);

	const draw = (): void => {
		const running = model.running;
		if (!running) renderStart(stage, model);
		else fill(stage, el("main", { class: "sf-placeholder" }, el("h1", { text: running.root.slice(running.root.lastIndexOf("/") + 1) }), el("p", { class: "sf-muted", text: "The project is open." })));
	};
	model.subscribe("project", draw);
	await controller.start();
	draw();
	return model;
}
