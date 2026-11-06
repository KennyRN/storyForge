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
		const note = el("p", { class: "sf-muted", text: "These stay on this computer, for this project. Unlike the rest of this dialog, they don't travel with the story. Each group is the widths of the left panel and the right panel only, never the central workspace." });

		const linked = el("input", { attrs: { type: "checkbox", "aria-label": "Keep the panels the same width" } });
		linked.checked = model.nav.widthsLinked;
		linked.addEventListener("change", () => (model.setWidthsLinked(linked.checked), draw()));
		// Inside the storytelling group: it applies to the storytelling widths only.
		const linkedRow = el("label", { class: "sf-setting-row sf-width-linked" }, el("span", { class: "sf-setting-label", text: "Keep the panels the same width" }), linked);

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

		/** A view's group: its icon and a plain word (ordinary text, not a header or a button), then the two columns. */
		const set = (view: WidthView): HTMLElement => {
			const w = model.panelWidths(view);
			const label = el("div", { class: "sf-width-view" }, navIcon(view, "32px"), el("span", { class: "sf-width-view-label", text: view }));
			const head = (...icons: SVGElement[]): HTMLElement => el("div", { class: "sf-width-colhead" }, ...icons);
			// Linked (the storytelling set only): one figure for both panels, marked by both icons.
			const body = w.linked
				? [head(panelIcon("left"), panelIcon("right")), figure(`${view}, left and right panel width`, view, "shared", w.story)]
				: [head(panelIcon("left")), head(panelIcon("right")), figure(`${view}, left panel width`, view, "story", w.story), figure(`${view}, right panel width`, view, "lore", w.lore)];
			return el("div", { class: "sf-width-set", attrs: { role: "group", "aria-label": view } }, label, ...(view === "storytelling" ? [linkedRow] : []), el("div", { class: `sf-width-grid${w.linked ? " is-linked" : ""}` }, ...body));
		};
		const narrow = isNarrowed(model.panelWidths(), "storytelling", model.nav.loreHidden, win()) ? [el("p", { class: "sf-muted", text: "The panels are narrower than this in the current window." })] : [];

		root.replaceChildren(
			note,
			el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Measure widths in" }), unit),
			...WIDTH_VIEWS.map(set),
			...narrow,
		);
	};
	draw();
	return root;
}
