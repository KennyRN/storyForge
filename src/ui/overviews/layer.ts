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
		const want = model.centreCovered ? (model.nav.forgeTab === "series" ? "series" : "novel") : null;
		layer.hidden = want === null;
		centre.toggleAttribute("inert", want !== null);
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
