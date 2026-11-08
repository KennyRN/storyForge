import { fromPx, isNarrowed, rangeIn, toPx, type Panel } from "../panelWidths";
import { settingLabel } from "./settingNames";
import { el } from "../kit/dom";
import { navIcon } from "../kit/navIcons";
import { panelIcon } from "../kit/panelIcons";
import { WIDTH_VIEWS, type AppModel, type WidthView } from "../model";

/**
 * The settings page for sidebar widths (Fix 5, decisions 76 and 77; round five: one set per view; Brief 19: sliders in percent, the same-width switch on the
 * storytelling, Codex and Archive rows). These are this computer's, for this project: machine settings, not `project.md`. Each set is the side panels' widths (the
 * left panel and the context panel, never the central workspace). A slider's limits are its own range, so there is no range text and nothing to refuse; its value is
 * given to the screen reader. Widths are percentages of the window. A width still stored in pixels (before the percentage was the only unit) is shown as its
 * percentage at the window's size now and is converted, all of them together, the first time a slider is used: nothing is written until then.
 */
export function widthsSettings(model: AppModel): HTMLElement {
	const root = el("div", { class: "sf-widths-settings" });
	const win = (): number => (window.innerWidth > 0 ? window.innerWidth : 1440);
	/** Views that offer the same-width switch. */
	const SWITCH: readonly WidthView[] = ["storytelling", "codex", "archive"];

	const draw = (): void => {
		const note = el("p", { class: "sf-muted", text: "These stay on this computer. Unlike the rest of this dialog, they don't travel with the story." });

		/** One width slider: no text label (its column's icon marks it), so it keeps a full name for the screen reader and as a tooltip. */
		const figure = (name: string, view: WidthView, panel: Panel | "shared", stored: number): HTMLElement => {
			const w = model.panelWidths(view);
			const full = rangeIn(panel === "shared" ? "story" : panel, w.linked, "percent", win());
			const range = { min: Math.ceil(full.min * 2) / 2, max: Math.floor(full.max * 2) / 2 }; // on the slider's half-percent steps, still inside the limits
			const shown = w.unit === "px" ? fromPx(toPx(stored, "px", win()), "percent", win()) : stored;
			const input = el("input", { class: "sf-slider sf-setting-control sf-width-slider", attrs: { type: "range", min: String(range.min), max: String(range.max), step: "0.5", "aria-label": name, title: name, "aria-valuetext": `${shown} percent of the window` } });
			input.value = String(Math.min(range.max, Math.max(range.min, shown)));
			input.addEventListener("keydown", (e) => e.key === "Escape" && e.stopPropagation()); // a key on the slider never closes the dialog from here
			input.addEventListener("input", () => input.setAttribute("aria-valuetext", `${input.value} percent of the window`));
			input.addEventListener("change", () => {
				if (model.nav.widthUnit === "px") model.setWidthUnit("percent"); // the first use: every stored figure becomes its percentage at this window, once
				const result = model.commitTypedWidth(view, panel === "lore" ? "lore" : panel === "shared" ? "shared" : "left", Number(input.value), win());
				draw();
				return result;
			});
			return el("div", { class: "sf-width-cell" }, input);
		};

		/** A view's row: its icon and a plain word (body text, not a header), the left panel's width, the right panel's and the width options. */
		const row = (view: WidthView): HTMLElement => {
			const w = model.panelWidths(view);
			const name = el("th", { class: "sf-width-view", attrs: { scope: "row" } }, el("span", { class: "sf-width-view-inner" }, navIcon(view, "32px"), el("span", { class: "sf-width-view-label", text: view })));
			// With the switch on, one figure covers both panels.
			const left = w.linked ? figure(`${view}, left and right panel width`, view, "shared", w.story) : figure(`${view}, left panel width`, view, "story", w.story);
			const right = w.linked ? null : figure(`${view}, right panel width`, view, "lore", w.lore);
			let options: HTMLElement | null = null;
			if (SWITCH.includes(view)) {
				const linked = el("input", { attrs: { type: "checkbox", "aria-label": view === "storytelling" ? settingLabel("Keep panels the same width") : settingLabel(`Keep panels the same width (${view})`) } });
				linked.checked = w.linked;
				linked.addEventListener("change", () => (model.setWidthsLinked(linked.checked, view), draw()));
				options = el("label", { class: "sf-width-linked" }, linked, el("span", { text: settingLabel("Keep panels the same width") }));
			}
			return el("tr", { class: "sf-width-row", dataset: { view } }, name, el("td", {}, left), el("td", {}, ...(right ? [right] : [])), el("td", {}, ...(options ? [options] : [])));
		};
		const table = el(
			"table",
			{ class: "sf-width-table", attrs: { "aria-label": settingLabel("Side panel widths") } },
			el("thead", {}, el("tr", {}, el("th", { attrs: { "aria-label": "region" } }), el("th", { class: "sf-width-colhead", attrs: { "aria-label": "left panel width", title: "left panel width" } }, panelIcon("left")), el("th", { class: "sf-width-colhead", attrs: { "aria-label": "right panel width", title: "right panel width" } }, panelIcon("right")), el("th", { attrs: { "aria-label": "width options" } }))),
			el("tbody", {}, ...WIDTH_VIEWS.map(row)),
		);
		const narrow = isNarrowed(model.panelWidths(), "storytelling", model.nav.loreHidden, win()) ? [el("p", { class: "sf-muted", text: "The panels are narrower than this in the current window." })] : [];

		root.replaceChildren(note, table, ...narrow);
	};
	draw();
	return root;
}
