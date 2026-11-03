import { el } from "./dom";

export interface MenuItem {
	label?: string;
	onSelect?: () => void | Promise<void>;
	disabled?: boolean;
	separator?: boolean;
}

/** The next enabled, non-separator index from `from` in direction `dir`, wrapping; -1 if there is none. */
export function nextEnabledIndex(items: readonly MenuItem[], from: number, dir: 1 | -1): number {
	const n = items.length;
	for (let step = 1; step <= n; step++) {
		const i = (((from + dir * step) % n) + n) % n;
		const item = items[i];
		if (!item.separator && !item.disabled) return i;
	}
	return -1;
}

let open: { close: () => void } | null = null;

/** A context menu or small picker drawn in the page. Arrow keys move, Enter selects, Escape closes; focus returns to where it was. */
export function showMenu(items: MenuItem[], at: { x: number; y: number }, options: { className?: string; label?: string } = {}): void {
	open?.close();
	const returnTo = document.activeElement as HTMLElement | null;
	const rows: (HTMLElement | null)[] = [];
	const menu = el("div", { class: `sf-menu${options.className ? ` ${options.className}` : ""}`, attrs: { role: "menu", tabindex: "-1", ...(options.label ? { "aria-label": options.label } : {}) } });
	let current = -1;

	const focusRow = (i: number): void => {
		if (i < 0) return;
		current = i;
		rows[i]?.focus();
	};
	const close = (): void => {
		menu.remove();
		document.removeEventListener("pointerdown", onOutside, true);
		window.removeEventListener("blur", close);
		open = null;
		returnTo?.focus?.();
	};
	const choose = (item: MenuItem): void => {
		if (item.disabled) return;
		close();
		void item.onSelect?.();
	};
	const onOutside = (e: Event): void => {
		if (!menu.contains(e.target as Node)) close();
	};

	for (const item of items) {
		if (item.separator) {
			menu.append(el("div", { class: "sf-menu-separator", attrs: { role: "separator" } }));
			rows.push(null);
			continue;
		}
		const row = el("button", { class: "sf-menu-item", text: item.label ?? "", attrs: { role: "menuitem", type: "button", tabindex: "-1" }, on: { click: () => choose(item) } });
		if (item.disabled) row.setAttribute("aria-disabled", "true");
		menu.append(row);
		rows.push(row);
	}

	menu.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown") focusRow(nextEnabledIndex(items, current, 1));
		else if (e.key === "ArrowUp") focusRow(nextEnabledIndex(items, current === -1 ? 0 : current, -1));
		else if (e.key === "Home") focusRow(nextEnabledIndex(items, -1, 1));
		else if (e.key === "End") focusRow(nextEnabledIndex(items, 0, -1));
		else if (e.key === "Enter" && current >= 0) choose(items[current]);
		else if (e.key === "Escape" || e.key === "Tab") close();
		else return;
		e.preventDefault();
		e.stopPropagation();
	});

	document.body.append(menu);
	const r = menu.getBoundingClientRect();
	menu.style.left = `${Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4))}px`;
	menu.style.top = `${Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4))}px`;
	document.addEventListener("pointerdown", onOutside, true);
	window.addEventListener("blur", close);
	open = { close };
	focusRow(nextEnabledIndex(items, -1, 1));
}

/** Opens a menu at a mouse event, or below an element for the keyboard. */
export function menuPoint(source: MouseEvent | HTMLElement): { x: number; y: number } {
	if (source instanceof MouseEvent) return { x: source.clientX, y: source.clientY };
	const r = source.getBoundingClientRect();
	return { x: r.left, y: r.bottom };
}
