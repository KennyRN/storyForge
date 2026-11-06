import { isNarrowed, rangeIn, type Panel } from "../panelWidths";
import { el } from "../kit/dom";
import { navIcon } from "../kit/navIcons";
import { panelIcon } from "../kit/panelIcons";
import { WIDTH_VIEWS, type AppModel, type WidthView } from "../model";

/**
 * The settings group for panel widths (Fix 5, decisions 76 and 77; round five: one set per view). These are this computer's, for this project: they live in
 * machine settings, not `project.md`, so the page says so and shows no "where it comes from" word. Each set is the side panels' widths (the left panel and the
 * context panel, never the central workspace); the Codex and Archive tabs keep the older pair and have no set here.
 * A figure is committed on Return or when it loses focus, refused with its range if outside the limits, and put back by Escape.
 */
export function widthsSettings(model: AppModel): HTMLElement {
	const root = el("div", { class: "sf-widths-settings" });
	const win = (): number => (window.innerWidth > 0 ? window.innerWidth : 1440);

	const draw = (): void => {
		const unitNow = model.nav.widthUnit;
		const unitWord = unitNow === "px" ? "px" : "%";
		const note = el("p", { class: "sf-muted", text: "These stay on this computer, for this project. Unlike the rest of this dialog, they don't travel with the story. Each row is the widths of the left panel and the right panel only, never the central workspace." });

		const linked = el("input", { attrs: { type: "checkbox", "aria-label": "Keep panels the same width" } });
		linked.checked = model.nav.widthsLinked;
		linked.addEventListener("change", () => (model.setWidthsLinked(linked.checked), draw()));

		const unit = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": "Measure panel widths in" } }, el("option", { text: "Percent of the window", attrs: { value: "percent" } }), el("option", { text: "Pixels", attrs: { value: "px" } }));
		unit.value = unitNow;
		unit.addEventListener("change", () => (model.setWidthUnit(unit.value === "px" ? "px" : "percent"), draw()));

		/** One width field: it has no text label (its column's icon marks it), so it keeps a full name for the screen reader and as a tooltip. */
		const figure = (name: string, view: WidthView, panel: Panel | "shared", stored: number): HTMLElement => {
			const w = model.panelWidths(view);
			const range = rangeIn(panel === "shared" ? "story" : panel, w.linked, w.unit, win());
			const rangeText = `${range.min}–${range.max} ${unitWord}`;
			const step = w.unit === "px" ? "1" : "0.1";
			const input = el("input", { class: "sf-field sf-setting-control sf-width-field", attrs: { type: "number", min: String(range.min), max: String(range.max), step, "aria-label": name, title: `${name} (${w.unit === "px" ? "pixels" : "percent of the window"})` } });
			input.value = String(stored);
			const hint = el("span", { class: "sf-muted sf-width-hint", text: rangeText });
			input.addEventListener("keydown", (e) => {
				if (e.key === "Escape") {
					input.value = String(stored);
					input.removeAttribute("aria-invalid");
					hint.textContent = rangeText;
					e.stopPropagation(); // put the figure back without closing the dialog
				}
			});
			input.addEventListener("change", () => {
				const result = model.commitTypedWidth(view, panel === "lore" ? "lore" : panel === "shared" ? "shared" : "left", Number(input.value.trim() === "" ? NaN : input.value), win());
				if (result.ok) return draw();
				input.setAttribute("aria-invalid", "true");
				hint.textContent = `Not allowed: use ${rangeText}`;
			});
			return el("div", { class: "sf-width-cell" }, input, hint);
		};

		/** A view's row: its icon and a plain word (body text, not a header), the left panel's width, the right panel's and the width options. */
		const row = (view: WidthView): HTMLElement => {
			const w = model.panelWidths(view);
			const name = el("th", { class: "sf-width-view", attrs: { scope: "row" } }, el("span", { class: "sf-width-view-inner" }, navIcon(view, "32px"), el("span", { class: "sf-width-view-label", text: view })));
			// The same-width switch is the storytelling row's alone; with it on, one figure covers both panels.
			const left = w.linked ? figure(`${view}, left and right panel width`, view, "shared", w.story) : figure(`${view}, left panel width`, view, "story", w.story);
			const right = w.linked ? null : figure(`${view}, right panel width`, view, "lore", w.lore);
			const options = view === "storytelling" ? el("label", { class: "sf-width-linked" }, linked, el("span", { text: "Keep panels the same width" })) : null;
			return el("tr", { class: "sf-width-row", dataset: { view } }, name, el("td", {}, left), el("td", {}, ...(right ? [right] : [])), el("td", {}, ...(options ? [options] : [])));
		};
		const table = el(
			"table",
			{ class: "sf-width-table", attrs: { "aria-label": "Side panel widths" } },
			el("thead", {}, el("tr", {}, el("th", { attrs: { "aria-label": "region" } }), el("th", { class: "sf-width-colhead", attrs: { "aria-label": "left panel width", title: "left panel width" } }, panelIcon("left")), el("th", { class: "sf-width-colhead", attrs: { "aria-label": "right panel width", title: "right panel width" } }, panelIcon("right")), el("th", { attrs: { "aria-label": "width options" } }))),
			el("tbody", {}, ...WIDTH_VIEWS.map(row)),
		);
		const narrow = isNarrowed(model.panelWidths(), "storytelling", model.nav.loreHidden, win()) ? [el("p", { class: "sf-muted", text: "The panels are narrower than this in the current window." })] : [];

		root.replaceChildren(
			note,
			el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Measure widths in" }), unit),
			table,
			...narrow,
		);
	};
	draw();
	return root;
}
