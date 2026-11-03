import { codexTypeIcon, getCodexTypes } from "../../core/codex";
import { customIcon } from "../kit/customIcon";
import { el } from "../kit/dom";
import { icon } from "../kit/icons";
import type { AppModel } from "../model";
import { clearFilter, toggleType, toggleUntyped, type TypeFilter } from "./codexFilter";

/**
 * The filter's popover (decision 107): "Show all", then "Untyped", then each type of the registry with its icon and a tick. It is
 * drawn on the raised surface with the Codex-shaped rows of the chapter list and the Navigate menu, in the page's body so nothing
 * clips it. Ticking applies at once and the popover stays open; Escape or a click outside closes it. Keys are the Navigate menu's.
 */
export function openFilterPopover(options: { model: AppModel; anchor: HTMLElement; filter: TypeFilter; label: string; onChange: () => void; onClose: () => void }): () => void {
	const { model, anchor, filter } = options;
	const rows: HTMLButtonElement[] = [];
	const ticks: [HTMLElement, () => boolean][] = [];

	const row = (label: string, opts: { checked?: () => boolean; onClick: () => void; icon?: SVGElement | null; indent?: boolean }): HTMLButtonElement => {
		const isCheck = !!opts.checked;
		const b = el(
			"button",
			{ class: "sf-filter-row", attrs: { type: "button", role: isCheck ? "menuitemcheckbox" : "menuitem", tabindex: "-1", ...(isCheck ? { "aria-checked": "false" } : {}) } },
			el("span", { class: `sf-filter-mark${opts.indent ? " is-nested" : ""}` }, opts.icon ?? null),
			el("span", { class: "sf-filter-name", text: label }),
			isCheck ? el("span", { class: "sf-filter-tick" }, icon("check", 14)) : null,
		);
		b.addEventListener("click", () => {
			opts.onClick();
			options.onChange();
			refresh();
		});
		if (opts.checked) ticks.push([b, opts.checked]);
		rows.push(b);
		return b;
	};
	const refresh = (): void => {
		for (const [b, checked] of ticks) b.setAttribute("aria-checked", String(checked()));
	};

	const popover = el(
		"div",
		{ class: "sf-filter-popover", attrs: { role: "menu", "aria-label": options.label } },
		row("Show all", { onClick: () => clearFilter(filter) }),
		row("Untyped", { checked: () => filter.untyped, onClick: () => toggleUntyped(filter) }),
		...getCodexTypes().map((t) => row(t.label, { checked: () => filter.types.has(t.type), onClick: () => toggleType(filter, t.type), icon: codexTypeIcon(t.type) ? customIcon(codexTypeIcon(t.type)!) : null, indent: !!t.parentId })),
	);
	refresh();
	document.body.append(popover);
	// Beside the filter button, level with it, and kept inside the window.
	const a = anchor.getBoundingClientRect();
	const box = popover.getBoundingClientRect();
	popover.style.left = `${Math.max(8, Math.min(a.right + 6, window.innerWidth - box.width - 8))}px`;
	popover.style.top = `${Math.max(8, Math.min(a.top, window.innerHeight - box.height - 8))}px`;
	anchor.setAttribute("aria-expanded", "true");

	let closed = false;
	const close = (focus: boolean): void => {
		if (closed) return;
		closed = true;
		popover.remove();
		document.removeEventListener("pointerdown", away, true);
		off();
		anchor.setAttribute("aria-expanded", "false");
		options.onClose();
		if (focus) anchor.focus();
	};
	const away = (e: Event): void => {
		if (e.target instanceof Node && !popover.contains(e.target) && !anchor.contains(e.target)) close(false);
	};
	popover.addEventListener("keydown", (e) => {
		const at = rows.indexOf(document.activeElement as HTMLButtonElement);
		if (e.key === "Escape") (e.stopPropagation(), close(true));
		else if (e.key === "Tab") close(false);
		else if (e.key === "ArrowDown") rows[(at + 1) % rows.length]?.focus();
		else if (e.key === "ArrowUp") rows[(at <= 0 ? rows.length : at) - 1]?.focus();
		else if (e.key === "Home") rows[0]?.focus();
		else if (e.key === "End") rows[rows.length - 1]?.focus();
		else return;
		e.preventDefault();
	});
	document.addEventListener("pointerdown", away, true);
	const off = model.subscribe(["face", "project"], () => close(false));
	rows[0]?.focus();
	return () => close(false);
}
