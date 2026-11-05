import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { mountProjectCards } from "./projectCards";
import { openNewProject } from "./newProject";
export { openNewProject };

/**
 * Shown when no project is open: Open Project… and New Project… (they stay in place) and the recent projects as cards (Brief 16). Nothing
 * else. Returns what to call when the screen goes.
 */
export function renderStart(host: HTMLElement, model: AppModel): () => void {
	const scroller = el("div", { class: "sf-start-scroll sf-scroll" });
	fill(
		host,
		el(
			"main",
			{ class: "sf-start" },
			el("div", { class: "sf-start-head" }, el("h1", { class: "sf-start-title", text: "storyForge" }), el("div", { class: "sf-start-actions" }, button({ label: "Open Project…", kind: "primary", onClick: () => void model.openProject("open") }), button({ label: "New Project…", onClick: () => openNewProject(model) }))),
			scroller,
		),
	);
	return mountProjectCards(scroller, model);
}
