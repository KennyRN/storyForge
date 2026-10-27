import type { CodexRef } from "../../core/book";
import { foldKey } from "../../core/pathRules";
import { el, fill } from "./dom";
import { openDialog } from "./dialog";

export interface CodexPickerOptions {
	title: string;
	/** The Codex entries that can be chosen (already limited to the right type). */
	entries: { path: string; name: string }[];
	/** What is chosen now, in order. Entries that are no longer in the Codex stay in the list, marked missing, until the author unticks them. */
	selected: CodexRef[];
	/** Choose one entry (the default PoV) or several. */
	multi: boolean;
	/** Shown when there is nothing to choose from. */
	emptyText: string;
	/** Whether a path still names a note. */
	exists: (path: string) => boolean;
	onApply: (chosen: CodexRef[]) => void;
}

/** A dialog with a filterable checklist of Codex entries. Applying hands back the chosen references in order; closing any other way discards. */
export function openCodexPicker(options: CodexPickerOptions): void {
	let chosen: CodexRef[] = options.selected.map((r) => ({ ...r }));
	const isChosen = (path: string): boolean => chosen.some((r) => foldKey(r.path) === foldKey(path));
	const rows: { path: string; name: string; missing: boolean }[] = [
		...options.entries.map((e) => ({ ...e, missing: false })),
		...options.selected.filter((r) => !options.entries.some((e) => foldKey(e.path) === foldKey(r.path))).map((r) => ({ path: r.path, name: r.name, missing: !options.exists(r.path) })),
	];
	const filter = el("input", { class: "sf-picker-filter", attrs: { type: "search", "aria-label": "Filter the list", placeholder: "Filter" } });
	const list = el("div", { class: "sf-picker-list", attrs: { role: "group", "aria-label": options.title } });

	const draw = (): void => {
		const needle = filter.value.trim().toLowerCase();
		const shown = rows.filter((r) => !needle || r.name.toLowerCase().includes(needle));
		if (rows.length === 0) return fill(list, el("p", { class: "sf-muted", text: options.emptyText }));
		fill(
			list,
			...shown.map((r) => {
				const box = el("input", { attrs: { type: options.multi ? "checkbox" : "radio", name: "sf-picker" } });
				box.checked = isChosen(r.path);
				box.addEventListener("change", () => {
					if (!options.multi) chosen = [];
					if (box.checked) chosen = [...chosen.filter((c) => foldKey(c.path) !== foldKey(r.path)), { path: r.path, name: r.name }];
					else chosen = chosen.filter((c) => foldKey(c.path) !== foldKey(r.path));
					if (!options.multi) draw();
				});
				return el("label", { class: `sf-picker-row${r.missing ? " is-missing" : ""}` }, box, el("span", { text: r.missing ? `${r.name} (missing)` : r.name }));
			}),
		);
	};
	filter.addEventListener("input", draw);
	draw();
	const dialog = openDialog({
		title: options.title,
		body: el("div", { class: "sf-picker" }, rows.length ? filter : null, list),
		buttons: [{ label: "Cancel", kind: "quiet" }, { label: "Choose", kind: "primary", onClick: () => options.onApply(chosen), disabled: rows.length === 0 }],
	});
	void dialog;
}
