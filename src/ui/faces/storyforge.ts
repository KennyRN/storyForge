import { disposeInkSliders, inkSlider } from "../kit/ink";
import { el, fill } from "../kit/dom";
import { icon, type IconName } from "../kit/icons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel, ForgeTab } from "../model";
import { mountArchiveTab } from "./archiveTab";
import { mountCodexTree } from "./codexTree";
import { mountNovelTab } from "./novelTab";
import { mountSeriesTab } from "./seriesTab";

const TABS: { id: ForgeTab; label: string; icon: IconName }[] = [
	{ id: "codex", label: "codex", icon: "globe" },
	{ id: "series", label: "series", icon: "library" },
	{ id: "novel", label: "novel", icon: "book" },
	{ id: "archive", label: "archive", icon: "archive" },
];

/** The storyForge face's left panel: four tabs (codex, series, novel, archive) down an icon rail with the ink indicator, and the tab's pane beside it. */
export function mountStoryForgeFace(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-face", "sf-face--storyforge");
	const rail = el("div", { class: "sf-rail", attrs: { role: "tablist", "aria-orientation": "vertical", "aria-label": "Library" } });
	const pane = el("div", { class: "sf-forge-tab", attrs: { role: "tabpanel" } });
	fill(host, el("div", { class: "sf-forge" }, rail, pane));
	const ink = inkSlider("forge-rail");
	let disposePane: (() => void) | null = null;
	let shown: ForgeTab | null = null;

	const select = (tab: ForgeTab, focus = false): void => {
		if (tab === model.nav.forgeTab && shown === tab) return;
		ink.capture();
		model.nav.forgeTab = tab;
		drawRail(focus);
		drawPane();
	};

	const drawRail = (focus = false): void => {
		fill(rail);
		for (const [i, t] of TABS.entries()) {
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
							const next = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
							if (!next) return;
							e.preventDefault();
							select(TABS[(i + next + TABS.length) % TABS.length].id, true);
						},
					},
				},
				icon(t.icon, 18),
			);
			attachTooltip(tab, t.label);
			rail.append(tab);
			if (active && focus) queueMicrotask(() => tab.focus());
		}
		ink.mount({ container: rail, buttons: ".sf-tab", variant: "rail" });
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
		disposePane = tab === "codex" ? mountCodexTree(body, model, { header: true }) : tab === "series" ? mountSeriesTab(body, model) : tab === "novel" ? mountNovelTab(body, model) : mountArchiveTab(body, model);
	};

	drawRail();
	drawPane();
	// The tab can also change from outside (choosing a novel in the series tab shows it on the novel tab).
	const offSync = model.subscribe("face", () => {
		if (!host.isConnected || shown === model.nav.forgeTab) return;
		ink.capture();
		drawRail();
		drawPane();
	});
	return () => {
		offSync();
		disposePane?.();
		disposeInkSliders(["forge-rail"]);
	};
}
