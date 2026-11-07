import { el } from "./dom";

export interface SelectRow {
	key: string;
	text: string;
	/** The current choice: a highlighted row (rule 1). */
	active?: boolean;
	/** Drawn muted (an unplaced novel, say). */
	muted?: boolean;
	/** A separator before this row. */
	separatorBefore?: boolean;
	dataset?: Record<string, string>;
}

export interface SelectListOptions {
	/** The closed selector's text, and a small quiet note beside it. */
	title: string;
	note?: string | null;
	/** The closed selector is muted (what it names is not in the list). */
	outside?: boolean;
	/** The accessible names of the button and of the list. */
	label: string;
	listLabel: string;
	rows: SelectRow[];
	/** Extra last items (the chapter list's "add the next chapter"): <li> contents, already given the row class. */
	footer?: HTMLElement[];
	/** A row was chosen: the list is closed first. */
	onChoose(key: string): void;
}

/** Everything the caller owns about a selector that it may redraw around: whether its list is open. Shared so a caller's own redraw keeps it. */
export interface SelectState {
	expanded: boolean;
}

/**
 * The selector of the navigator's chapter list (decisions 97 and 106), shared with the novel tab's novel selector (Brief 19 §1.4): a closed button with no
 * chevron and a raised fill on hover and while open, and a list joined to it as one piece with one shadow, the current row highlighted (rule 1), the others
 * muted, arrow keys, Home and End, Return (a button's own), Escape (back to the button) and a click outside, which only closes it. It redraws only itself
 * (a caller's redraw around it, such as a field being typed in, is never forced by opening it).
 */
export function mountSelectList(
	host: HTMLElement,
	options: () => SelectListOptions,
	state: SelectState,
	hooks: { modifier?: string; /** An extra class on the closed selector's text (the storytelling side's novel name keeps `sf-nav-novel`). */ titleClass?: string; /** Called whenever the list opens or closes (the navigator makes the rest of its panel inert while it is open). */ onToggled?: (expanded: boolean) => void } = {},
): { render(): void; dispose(): void } {
	let offOutside: (() => void) | null = null;
	let refocus = false;
	let enterList = false; // an arrow key on the button opens the list and moves into it
	const close = (focus: boolean): void => {
		if (!state.expanded) return;
		state.expanded = false;
		refocus = focus;
		render();
		hooks.onToggled?.(false);
	};
	let focusRow = (): void => undefined;
	const render = (): void => {
		offOutside?.();
		offOutside = null;
		const o = options();
		const current = el(
			"button",
			{
				class: `sf-select-current${o.outside ? " is-outside" : ""}`,
				attrs: { type: "button", "aria-expanded": String(state.expanded), "aria-haspopup": "true", "aria-label": o.label },
				on: {
					keydown: (e: KeyboardEvent) => {
						if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
						e.preventDefault();
						enterList = true;
						if (state.expanded) return void focusRow();
						state.expanded = true;
						render();
						hooks.onToggled?.(true);
					},
					click: () => {
						state.expanded = !state.expanded;
						refocus = true;
						render();
						hooks.onToggled?.(state.expanded);
					},
				},
			},
			el("span", { class: `sf-select-current-title${hooks.titleClass ? ` ${hooks.titleClass}` : ""}`, text: o.title }),
			o.note ? el("span", { class: "sf-nav-note", text: o.note }) : null,
		);
		const list = el("ul", { class: "sf-select-list sf-scroll", attrs: { role: "list", "aria-label": o.listLabel } });
		for (const r of o.rows) {
			if (r.separatorBefore) list.append(el("li", { class: "sf-select-separator", attrs: { role: "separator" } }));
			list.append(
				el(
					"li",
					{},
					el("button", {
						class: `sf-select-row${r.active ? " is-active" : ""}${r.muted ? " is-muted" : ""}`,
						dataset: r.dataset ?? { key: r.key },
						attrs: { type: "button", ...(r.active ? { "aria-current": "true" } : {}) },
						text: r.text,
						on: { click: () => (close(false), o.onChoose(r.key)) },
					}),
				),
			);
		}
		for (const f of o.footer ?? []) list.append(el("li", {}, f));
		list.addEventListener("keydown", (e) => {
			const items = Array.from(list.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
			const at = items.indexOf(document.activeElement as HTMLButtonElement);
			const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
			if (to === null) return;
			e.preventDefault();
			items[Math.max(0, Math.min(items.length - 1, to))]?.focus();
		});
		const select = el("div", { class: `sf-select${hooks.modifier ? ` ${hooks.modifier}` : ""}` }, current, state.expanded ? list : null);
		host.replaceChildren(select);
		if (state.expanded) {
			list.style.top = `${current.offsetTop + current.offsetHeight}px`;
			const away = (e: Event): void => {
				if (!(e.target instanceof Node) || !select.contains(e.target)) close(false);
			};
			const key = (e: KeyboardEvent): void => {
				if (e.key === "Escape") (e.stopPropagation(), close(true));
			};
			document.addEventListener("pointerdown", away, true);
			select.addEventListener("keydown", key);
			offOutside = () => (document.removeEventListener("pointerdown", away, true), select.removeEventListener("keydown", key));
		}
		focusRow = () => (list.querySelector<HTMLElement>(".sf-select-row.is-active") ?? list.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
		if (enterList && state.expanded) {
			enterList = false;
			refocus = false;
			focusRow();
		} else if (refocus) {
			refocus = false;
			current.focus(); // the redraw replaced the button the keyboard was on
		}
	};
	render();
	return { render, dispose: () => offOutside?.() };
}
