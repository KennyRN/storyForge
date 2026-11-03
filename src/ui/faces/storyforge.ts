import { el, fill } from "../kit/dom";
import { navIcon, type NavIconName } from "../kit/navIcons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel, ForgeTab } from "../model";
import { mountArchiveTab } from "./archiveTab";
import { mountCodexTree } from "./codexTree";
import { mountNovelTab } from "./novelTab";
import { mountSeriesTab } from "./seriesTab";

const TABS: { id: ForgeTab; label: string; icon: NavIconName }[] = [
	// From the window's outer edge inwards: archive outermost, then novel, series and codex; the storytelling flip follows them.
	{ id: "archive", label: "archive", icon: "archive" },
	{ id: "novel", label: "novel", icon: "novel" },
	{ id: "series", label: "series", icon: "series" },
	{ id: "codex", label: "codex", icon: "codex" },
];

/** The storyForge face's left panel: four tabs (archive, novel, series, codex, from the outer edge) and the storytelling flip, as Kenny's 24 px icons across the top line, spread evenly, with an ink bar under the selected tab (never under the flip), and the tab's pane below. */
export function mountStoryForgeFace(host: HTMLElement, model: AppModel): () => void {
	host.classList.add("sf-face", "sf-face--storyforge");
	const rail = el("div", { class: "sf-rail", attrs: { role: "tablist", "aria-orientation": "horizontal", "aria-label": "Library" } });
	const pane = el("div", { class: "sf-forge-tab", attrs: { role: "tabpanel" } });
	fill(host, el("div", { class: "sf-forge" }, rail, pane));
	let disposePane: (() => void) | null = null;
	let shown: ForgeTab | null = null;

	/** The tabs shown: "Hide series pane" (for a standalone book) leaves the series tab out. */
	const tabs = (): typeof TABS => (model.running?.settings.values.hideSeriesPane ? TABS.filter((t) => t.id !== "series") : TABS);

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

	// The ink bar under the selected icon: it slides along when the selection moves (the row is rebuilt on every change, so the bar is kept).
	const bar = el("div", { class: "sf-tabbar-ink", attrs: { "aria-hidden": "true" } });
	let inked = false;
	const placeInk = (): void => {
		const at = rail.querySelector<HTMLElement>(".sf-tab.is-active svg");
		if (!at) return void bar.classList.add("is-off");
		const r = at.getBoundingClientRect();
		const box = rail.getBoundingClientRect();
		bar.classList.remove("is-off");
		bar.style.width = `${r.width}px`;
		bar.style.top = `${r.bottom - box.top + 6}px`; // 6px below the icon's bottom edge
		if (!inked) bar.classList.add("is-instant");
		bar.style.transform = `translateX(${r.left - box.left}px)`;
		if (!inked) (void bar.offsetWidth, bar.classList.remove("is-instant"));
		inked = true;
	};
	const ro = new ResizeObserver(() => bar.classList.contains("is-off") || placeInk());
	ro.observe(rail);

	const drawRail = (focus = false): void => {
		for (const old of rail.querySelectorAll(".sf-tab")) old.remove(); // the bar stays in the document, so its slide isn't cut off
		if (!bar.isConnected) rail.append(bar);
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
				navIcon(t.icon, "24px"),
			);
			attachTooltip(tab, t.label);
			rail.append(tab);
			if (active && focus) queueMicrotask(() => tab.focus());
		}
		// The storytelling flip: a button, not a tab (it flips the side, as ⌘\ does), so the ink bar is never under it.
		const flip = el("button", { class: "sf-tab sf-tab--flip", attrs: { type: "button", "aria-label": "storytelling" }, on: { click: () => model.flipFace() } }, navIcon("storytelling", "24px"));
		attachTooltip(flip, "storytelling");
		rail.append(flip);
		placeInk();
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
		ro.disconnect();
	};
}
