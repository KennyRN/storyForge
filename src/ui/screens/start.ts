import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { openNewProject } from "./newProject";
export { openNewProject };

const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1) || p;
const parentOf = (p: string): string => p.slice(0, Math.max(0, p.lastIndexOf("/")));

/** Shown when no project is open: Open Project, New Project and the recent projects. Nothing else. */
export function renderStart(host: HTMLElement, model: AppModel): void {
	const recentList = el("ul", { class: "sf-start-recent", attrs: { "aria-label": "Recent projects" } });
	fill(
		host,
		el(
			"main",
			{ class: "sf-start" },
			el("h1", { class: "sf-start-title", text: "storyForge" }),
			el(
				"div",
				{ class: "sf-start-actions" },
				button({ label: "Open Project…", kind: "primary", onClick: () => void model.openProject("open") }),
				button({ label: "New Project…", onClick: () => openNewProject(model) }),
			),
			recentList,
		),
	);
	void model.controller.recent().then((recent) => {
		fill(
			recentList,
			...recent.map((path, i) =>
				el(
					"li",
					{},
					el(
						"button",
						{ class: "sf-start-recent-item", attrs: { type: "button", "data-recent": String(i) }, on: { click: () => void model.openRecent(i) } },
						el("span", { class: "sf-start-recent-name", text: baseName(path) }),
						el("span", { class: "sf-muted sf-start-recent-path", text: parentOf(path) }),
					),
				),
			),
		);
	});
}
