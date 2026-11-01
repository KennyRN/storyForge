import { isNarrowed, rangeIn, type Panel } from "../panelWidths";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

/**
 * The settings group for panel widths (Fix 5, decisions 76 and 77). These are this Mac's, for this project: they live in
 * machine settings, not `project.md`, so the group says so and shows no "where it comes from" word.
 * A figure is committed on Return or when it loses focus, refused with its range if outside the limits, and put back by Escape.
 */
export function widthsSettings(model: AppModel): HTMLElement {
	const root = el("div", { class: "sf-widths-settings" });
	const win = (): number => (window.innerWidth > 0 ? window.innerWidth : 1440);

	const draw = (): void => {
		const w = model.panelWidths();
		const unitWord = w.unit === "px" ? "px" : "%";
		const note = el("p", { class: "sf-muted", text: "These stay on this Mac, for this project. Unlike the rest of this dialog, they don't travel with the story." });

		const linked = el("input", { attrs: { type: "checkbox", "aria-label": "Keep the panels the same width" } });
		linked.checked = w.linked;
		linked.addEventListener("change", () => (model.setWidthsLinked(linked.checked), draw()));

		const unit = el("select", { class: "sf-field sf-setting-control", attrs: { "aria-label": "Measure panel widths in" } }, el("option", { text: "Percent of the window", attrs: { value: "percent" } }), el("option", { text: "Pixels", attrs: { value: "px" } }));
		unit.value = w.unit;
		unit.addEventListener("change", () => (model.setWidthUnit(unit.value === "px" ? "px" : "percent"), draw()));

		const figure = (label: string, panel: Panel, shared: boolean, stored: number): HTMLElement => {
			const range = rangeIn(panel, w.linked, w.unit, win());
			const rangeText = `${range.min}–${range.max} ${unitWord}`;
			const step = w.unit === "px" ? "1" : "0.1";
			const input = el("input", { class: "sf-field sf-setting-control", attrs: { type: "number", min: String(range.min), max: String(range.max), step, "aria-label": `${label} (${w.unit === "px" ? "pixels" : "percent of the window"})` } });
			input.value = String(stored);
			const hint = el("span", { class: "sf-muted sf-setting-source", text: rangeText });
			input.addEventListener("keydown", (e) => {
				if (e.key === "Escape") {
					input.value = String(stored);
					input.removeAttribute("aria-invalid");
					hint.textContent = rangeText;
					e.stopPropagation(); // put the figure back without closing the dialog
				}
			});
			input.addEventListener("change", () => {
				const result = model.commitTypedWidth(shared ? "shared" : panel, Number(input.value.trim() === "" ? NaN : input.value), win());
				if (result.ok) return draw();
				input.setAttribute("aria-invalid", "true");
				hint.textContent = `Not allowed: use ${rangeText}`;
			});
			return el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: label }), input, hint);
		};

		const faceLeft = model.nav.face === "storytelling" ? w.story : w.library;
		const figures = w.linked
			? [figure("Width of all three panels", "story", true, faceLeft)]
			: [figure("Left panel, storytelling side", "story", false, w.story), figure("Left panel, library side", "library", false, w.library), figure("Context panel", "lore", false, w.lore)];
		const narrow = isNarrowed(w, model.nav.face, model.nav.loreHidden, win()) ? [el("p", { class: "sf-muted", text: "The panels are narrower than this in the current window." })] : [];

		root.replaceChildren(
			note,
			el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Keep the panels the same width" }), linked),
			el("label", { class: "sf-setting-row" }, el("span", { class: "sf-setting-label", text: "Measure widths in" }), unit),
			...figures,
			...narrow,
		);
	};
	draw();
	return root;
}
