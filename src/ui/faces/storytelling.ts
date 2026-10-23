import { el, fill } from "../kit/dom";
import type { AppModel } from "../model";
import { mountCodexTree } from "./codexTree";
import { mountNavigator } from "./navigator";
import { mountStats } from "./stats";

/** The storytelling face's left panel: the navigator, the Codex and the stats. */
export function mountStorytellingFace(host: HTMLElement, model: AppModel): () => void {
	const navigator = el("section", { attrs: { "aria-label": "Navigator" } });
	const codex = el("section", { attrs: { "aria-label": "Codex" } });
	const stats = el("section", { attrs: { "aria-label": "Stats" } });
	fill(host, navigator, codex, stats);
	host.classList.add("sf-face", "sf-face--storytelling");
	const offs = [mountNavigator(navigator, model), mountCodexTree(codex, model, { header: true }), mountStats(stats, model)];
	return () => offs.forEach((off) => off());
}
