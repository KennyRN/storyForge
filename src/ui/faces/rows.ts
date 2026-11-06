import { splitTitleSubtitle } from "../../core/titleNumbering";
import { makeReorderable, type DragZone } from "../../view/dragReorder";
import { isDragInProgress } from "../../view/dragLock";
import { el } from "../kit/dom";
import { icon } from "../kit/icons";
import type { AppModel } from "../model";

export { isDragInProgress };

/** A list row with its drag handle: `data-key` is what the reorder reports back. */
export function listRow(key: string, selected = false): HTMLElement {
	const handle = el("span", { class: "sf-drag-handle", attrs: { role: "button", tabindex: "0", "aria-label": "Drag to reorder, or use the arrow keys" } }, icon("grip", 14));
	return el("div", { class: `sf-row${selected ? " is-selected" : ""}`, dataset: { key }, attrs: { tabindex: "-1" } }, handle);
}

/** A row's title, with a `//` subtitle on its own line. Returns the span to rename. */
export function rowTitle(row: HTMLElement, display: string, brackets = false): HTMLElement {
	const { title, subtitle } = splitTitleSubtitle(display);
	const label = el("span", { class: "sf-row-text", text: title });
	row.append(el("div", { class: "sf-row-title-wrap" }, el("div", { class: "sf-row-title-line" }, label), subtitle ? el("div", { class: "sf-row-subtitle", text: brackets ? `(${subtitle})` : subtitle }) : null));
	return label;
}

/** A section header that folds its list (Placed Chapters, Unplaced Chapters, Unplaced Novels), with an optional "new" button beside the fold control (not inside it). */
export function zoneHeader(label: string, hidden: boolean, onToggle: () => void, create?: { name: string; onCreate: () => void; disabled?: boolean; reason?: string }, options: { chevron?: boolean; foldable?: boolean } = {}): HTMLElement {
	// Round five (the novel tab): no chevron; the Placed header is a plain heading (it can't be collapsed); the Unplaced header stays a button, with its expanded state.
	const fold =
		options.foldable === false
			? el("h3", { class: "sf-zone-label", text: label })
			: el("button", { class: "sf-zone-fold", attrs: { type: "button", "aria-expanded": String(!hidden) }, on: { click: onToggle } }, ...(options.chevron === false ? [] : [icon(hidden ? "chevron-right" : "chevron-down", 14)]), el("span", { class: "sf-zone-label", text: label }));
	const header = el("div", { class: `sf-zone-header${hidden ? " is-folded" : ""}` }, fold);
	if (create && !hidden) {
		const add = el("button", { class: "sf-button sf-button--icon sf-zone-add", attrs: { type: "button", "aria-label": create.name, title: create.disabled ? (create.reason ?? create.name) : create.name }, on: { click: () => create.onCreate() } }, icon("plus", 14));
		add.disabled = !!create.disabled;
		header.append(add);
	}
	return header;
}

/** Drag-to-place across zones, with a write on drop and a redraw if it fails. */
export function reorderable(model: AppModel, zones: DragZone[], write: (keys: Record<string, string[]>) => Promise<void>, redraw: () => void): void {
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (keys) => {
		void (async () => {
			try {
				await write(keys);
				model.touch("library");
			} catch (e) {
				model.notices.notify({ kind: "error", text: `Could not save the new order: ${(e as Error)?.message ?? String(e)}` });
				redraw();
			}
		})();
	});
}

export const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
