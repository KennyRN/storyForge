import { seriesPaneHidden } from "../../app/settings";
import { el, fill } from "../kit/dom";
import { navIcon, type NavIconName } from "../kit/navIcons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel, ForgeTab } from "../model";
import { mountArchiveTab } from "./archiveTab";
import { mountCodexTree } from "./codexTree";
import { mountNovelTab } from "./novelTab";
import { mountSeriesTab } from "./seriesTab";

const TABS: { id: ForgeTab; label: string; icon: NavIconName }[] = [
	// Left to right (round five, replacing decision 106's order): archive, codex, series, novel; the storytelling flip follows them.
	{ id: "archive", label: "archive", icon: "archive" },
	{ id: "codex", label: "codex", icon: "codex" },
	{ id: "series", label: "series", icon: "series" },
	{ id: "novel", label: "novel", icon: "novel" },
];

/** The storyForge face's left panel: four tabs (archive, codex, series, novel, left to right) and the storytelling flip, as Kenny's 32 px icons across the top line, spread evenly. The selected tab shows in the accent colour (grey0 at rest, the text colour on hover); there is no ink bar. The tab's pane is below. */
export function mountStoryForgeFace(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-face", "sf-face--storyforge");
	const rail = el("div", { class: "sf-rail", attrs: { role: "tablist", "aria-orientation": "horizontal", "aria-label": "Library" } });
	const pane = el("div", { class: "sf-forge-tab", attrs: { role: "tabpanel" } });
	fill(host, el("div", { class: "sf-forge" }, rail, pane));
	let disposePane: (() => void) | null = null;
	let shown: ForgeTab | null = null;

	/** The tabs shown: "Hide series pane" (for a standalone book) leaves the series tab out. */
	const tabs = (): typeof TABS => ((model.running && seriesPaneHidden(model.running.settings.values)) ? TABS.filter((t) => t.id !== "series") : TABS);

	const select = (tab: ForgeTab, focus = false): void => {
		const overviewTab = tab === "series" || tab === "novel";
		if (tab === model.nav.forgeTab && shown === tab) {
			if (overviewTab) model.setCentreView("overview");
			return;
		}
		model.nav.forgeTab = tab;
		if (overviewTab) model.nav.centreView = "overview";
		model.touch("nav");
		drawRail(focus);
		drawPane();
	};

	const drawRail = (focus = false): void => {
		fill(rail);
		const list = tabs();
		if (!list.some((t) => t.id === model.nav.forgeTab)) model.nav.forgeTab = "novel";
		for (const [i, t] of list.entries()) {
			const active = model.nav.forgeTab === t.id;
			const tab = el(
				"button",
				{
					class: `sf-tab${active ? " is-active" : ""}`,
					dataset: { tab: t.id },
					attrs: { type: "button", role: "tab", "aria-selected": String(active), "aria-label": t.label, tabindex: active ? "0" : "-1", "aria-controls": "sf-forge-pane" },
					on: {
						click: () => select(t.id),
						keydown: (e) => {
							const next = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
							if (!next) return;
							e.preventDefault();
							select(list[(i + next + list.length) % list.length].id, true);
						},
					},
				},
				navIcon(t.icon, "32px"),
			);
			attachTooltip(tab, t.label);
			rail.append(tab);
			if (active && focus) queueMicrotask(() => tab.focus());
		}
		// The storytelling flip: a button, not a tab (it flips the side, as ⌘\ does). It is never the selected one.
		const flip = el("button", { class: "sf-tab sf-tab--flip", attrs: { type: "button", "aria-label": "storytelling" }, on: { click: () => model.flipFace() } }, navIcon("storytelling", "32px"));
		attachTooltip(flip, "storytelling");
		rail.append(flip);
	};

	const drawPane = (): void => {
		const tab = model.nav.forgeTab;
		if (tab === shown) return;
		shown = tab;
		disposePane?.();
		fill(pane);
		pane.id = "sf-forge-pane";
		pane.setAttribute("aria-label", TABS.find((t) => t.id === tab)!.label);
		const body = el("div", { class: "sf-forge-host" });
		pane.append(body);
		disposePane = tab === "codex" ? mountCodexTree(body, model, { header: true, opensIn: "workspace" }) : tab === "series" ? mountSeriesTab(body, model) : tab === "novel" ? mountNovelTab(body, model) : mountArchiveTab(body, model);
	};

	drawRail();
	drawPane();
	// The tab can also change from outside (choosing a novel in the series tab shows it on the novel tab).
	let railKey = tabs().map((t) => t.id).join();
	const offSync = model.subscribe(["face", "settings"], () => {
		if (!host.isConnected) return;
		const key = tabs().map((t) => t.id).join();
		if (key !== railKey) {
			railKey = key;
			drawRail();
			drawPane();
			return;
		}
		if (shown === model.nav.forgeTab) return;
		drawRail();
		drawPane();
	});
	return () => {
		offSync();
		disposePane?.();
	};
}
