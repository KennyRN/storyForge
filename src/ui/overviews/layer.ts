import { fill } from "../kit/dom";
import type { AppModel } from "../model";
import { mountNovelOverview } from "./novelOverview";
import { mountSeriesOverview } from "./seriesOverview";

/**
 * The layer over the workspace on the storyForge face: the series overview, and (later) the novel overview.
 * The editor stays mounted underneath, so unsaved text, the caret, undo history and the save timer live on;
 * while the layer covers it the editor is inert (no focus, hidden from assistive technology).
 */
export function mountOverviewLayer(layer: HTMLElement, centre: HTMLElement, model: AppModel): () => void {
	let shown: "series" | "novel" | null = null;
	let disposeBody: (() => void) | null = null;

	const draw = (): void => {
		const overviewShown = model.centreCovered && !model.libraryTabHasLayer;
		const want = overviewShown ? (model.nav.forgeTab === "series" ? "series" : "novel") : null;
		layer.hidden = want === null;
		centre.toggleAttribute("inert", model.centreCovered);
		if (want === shown) return;
		shown = want;
		disposeBody?.();
		disposeBody = null;
		fill(layer);
		if (want) layer.setAttribute("aria-label", want === "series" ? "Series overview" : "Novel overview");
		if (want === "series") disposeBody = mountSeriesOverview(layer, model);
		else if (want === "novel") disposeBody = mountNovelOverview(layer, model);
	};
	draw();
	const off = model.subscribe(["nav", "face", "project"], draw);
	return () => {
		off();
		disposeBody?.();
	};
}

/**
 * The workspace of the library side's Codex and Archive tabs: a covering layer, like the overviews, holding that tab's own editor
 * slot (the selected entry) or nothing. Nothing is closed or reopened by showing or hiding it: the editors stay mounted, only
 * hidden, and the chapter's editor stays open and inert underneath while it shows.
 */
export function mountLibraryLayer(layer: HTMLElement, hosts: Record<"codex" | "archive", HTMLElement>, model: AppModel): () => void {
	const draw = (): void => {
		const on = model.nav.face === "storyforge" && model.libraryTabHasLayer;
		layer.hidden = !on;
		for (const tab of ["codex", "archive"] as const) {
			const show = on && model.nav.forgeTab === tab;
			hosts[tab].hidden = !show;
			hosts[tab].toggleAttribute("inert", !show);
		}
	};
	draw();
	return model.subscribe(["nav", "face", "project"], draw);
}
