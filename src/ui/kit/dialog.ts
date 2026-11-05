import { el, fill } from "./dom";
import { button } from "./button";

export interface DialogButton {
	label: string;
	kind?: "default" | "primary" | "quiet";
	/** Return false to keep the dialog open (a validation failure, say). */
	onClick?: () => boolean | void | Promise<boolean | void>;
	disabled?: boolean;
}

export interface DialogOptions {
	title: string;
	body: HTMLElement;
	buttons: DialogButton[];
	/** Called when the dialog goes away by any route (Escape, a button, `close()`). */
	onClose?: () => void;
	/** One copy: opening a dialog whose key is already open brings that one forward instead (Fix 8, decision 119). */
	key?: string;
	/** Where focus starts. Default: the first text box, else the primary button. Never a confirming or destructive button by choice. */
	focus?: (panel: HTMLElement) => HTMLElement | null | undefined;
}

export interface OpenDialog {
	element: HTMLElement;
	close: () => void;
	/** Rebuilds the button row, for a dialog that changes step. */
	setButtons: (buttons: DialogButton[]) => void;
}

const FOCUSABLE = 'button, input, select, textarea, [tabindex]';

interface Entry {
	overlay: HTMLElement;
	panel: HTMLElement;
	key?: string;
	handle: OpenDialog;
	buttons: () => DialogButton[];
	/** The route Escape takes: Cancel, else Done. Resolves to nothing when no route is safe right now. */
	escape: () => void;
}
const stack: Entry[] = [];

/** What a control is, not which element it is: it survives a redraw that replaces the element. */
function identity(node: Element): string {
	const h = node as HTMLElement;
	const name = h.dataset.focusKey ?? h.getAttribute("aria-label") ?? (node instanceof HTMLButtonElement ? h.textContent?.trim() : "") ?? "";
	return `${node.tagName}|${node.getAttribute("role") ?? ""}|${(node as HTMLInputElement).type ?? ""}|${name}`;
}

function tabStops(panel: HTMLElement): HTMLElement[] {
	const all = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => {
		if ((n as HTMLButtonElement).disabled || n.getAttribute("tabindex") === "-1" || n.hidden || n.closest("[hidden],[inert]")) return false;
		return n.getClientRects().length > 0;
	});
	// A radio group is one stop: the chosen one (or the first when none is).
	return all.filter((n) => {
		if (!(n instanceof HTMLInputElement) || n.type !== "radio" || !n.name) return true;
		const group = all.filter((m) => m instanceof HTMLInputElement && m.type === "radio" && m.name === n.name);
		return n === (group.find((m) => (m as HTMLInputElement).checked) ?? group[0]);
	});
}

/** Where focus goes when the opener is gone: the chapter editor on the storytelling side, the left panel's list on the library side. */
function fallbackTarget(): HTMLElement | null {
	const left = document.querySelector<HTMLElement>(".sf-left");
	if (left?.dataset.face === "storyforge") return left.querySelector<HTMLElement>('[tabindex="0"], button:not([tabindex="-1"])');
	return document.querySelector<HTMLElement>(".sf-slot--centre .cm-content") ?? left?.querySelector<HTMLElement>('[tabindex="0"], button') ?? null;
}

/** If a dialog with this key is open, brings it forward and says so, so the caller builds nothing. */
export function bringForward(key: string): boolean {
	const existing = stack.find((d) => d.key === key);
	if (!existing) return false;
	(tabStops(existing.panel)[0] ?? existing.panel).focus();
	return true;
}

let installed = false;
function install(): void {
	if (installed) return;
	installed = true;
	document.addEventListener("keydown", (e) => {
		const top = stack[stack.length - 1];
		if (!top) return;
		if (e.key === "Escape") {
			if (e.defaultPrevented) return; // a menu or an inline edit inside the dialog took it
			e.preventDefault();
			e.stopPropagation();
			top.escape();
		}
	});
}

/**
 * A modal dialog (Fix 8, decision 119): focus goes in, stays in (Tab and Option-Tab cycle and wrap; the page behind is `inert`), Escape
 * closes the topmost one by its Cancel (else Done) route, one copy per key, and focus returns to the opener when it closes.
 */
export function openDialog(options: DialogOptions): OpenDialog {
	if (options.key) {
		const existing = stack.find((d) => d.key === options.key);
		if (existing) {
			(options.focus?.(existing.panel) ?? tabStops(existing.panel)[0] ?? existing.panel).focus();
			return existing.handle;
		}
	}
	install();
	const returnTo = document.activeElement as HTMLElement | null;
	const titleId = `sf-dialog-title-${Math.random().toString(36).slice(2)}`;
	const buttons = el("div", { class: "sf-dialog-buttons" });
	const panel = el(
		"div",
		{ class: "sf-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" } },
		el("h2", { class: "sf-dialog-title", text: options.title, attrs: { id: titleId } }),
		el("div", { class: "sf-dialog-body sf-scroll" }, options.body),
		buttons,
	);
	// Tab is left to WebKit, which decides what each key reaches (plain Tab: text boxes and lists; Option-Tab: everything). The dialog only
	// keeps focus inside and wraps: a text box at each end is a stop that sends focus to the other end, and the browser's own next step
	// from there is the first (or last) control that key reaches. The wrap passes through one such stop, which draws nothing.
	const sentinel = (): HTMLInputElement => el("input", { class: "sf-dialog-sentinel", attrs: { type: "text", readonly: "", tabindex: "0", "aria-hidden": "true" } });
	const startStop = sentinel();
	const endStop = sentinel();
	let moving = false;
	const jump = (to: HTMLElement): void => {
		moving = true;
		to.focus({ preventScroll: true });
		moving = false;
	};
	startStop.addEventListener("focus", () => moving || jump(endStop));
	endStop.addEventListener("focus", () => moving || jump(startStop));
	// From a stop, the key that would leave the dialog goes to the other stop instead.
	startStop.addEventListener("keydown", (e) => e.key === "Tab" && e.shiftKey && (e.preventDefault(), jump(endStop)));
	endStop.addEventListener("keydown", (e) => e.key === "Tab" && !e.shiftKey && (e.preventDefault(), jump(startStop)));
	panel.prepend(startStop);
	panel.append(endStop);
	const overlay = el("div", { class: "sf-dialog-overlay" }, panel);
	let closed = false;
	let current: DialogButton[] = options.buttons;
	let lastStop = "";
	const inerted: HTMLElement[] = [];
	// Everything behind the dialog goes inert, except the notices (they sit above dialogs on purpose) and the way down to them.
	const shut = (parent: Element): void => {
		for (const child of Array.from(parent.children) as HTMLElement[]) {
			if (child.classList.contains("sf-notices")) continue;
			if (child.querySelector(".sf-notices")) shut(child);
			else if (!child.inert) (child.inert = true), inerted.push(child);
		}
	};
	shut(document.body);

	const close = (): void => {
		if (closed) return;
		closed = true;
		// Leave the control in use first, so a box with typed text announces its own change, once, by the same route as Done.
		const active = document.activeElement as HTMLElement | null;
		if (active && overlay.contains(active)) active.blur();
		const at = stack.findIndex((d) => d.overlay === overlay);
		if (at >= 0) stack.splice(at, 1);
		overlay.remove();
		for (const n of inerted) n.inert = false;
		options.onClose?.();
		(returnTo?.isConnected ? returnTo : fallbackTarget())?.focus?.();
	};
	const run = async (b: DialogButton): Promise<void> => {
		const keep = await b.onClick?.();
		if (keep !== false) close();
	};
	const setButtons = (list: DialogButton[]): void => {
		current = list;
		fill(buttons, ...list.map((b) => button({ label: b.label, kind: b.kind, disabled: b.disabled, onClick: () => void run(b) })));
	};
	setButtons(options.buttons);

	const handle: OpenDialog = { element: panel, close, setButtons };
	const escape = (): void => {
		const live = current.filter((b) => !b.disabled);
		if (current.length > 0 && live.length === 0) return; // e.g. a rename under way: nothing safe to do
		const cancel = live.find((b) => b.label === "Cancel");
		if (cancel) return void run(cancel);
		// Done: the only button, or the primary one when none is a Cancel. Never a button that confirms something.
		if (live.length === 1 && live[0].kind === "primary" && (live[0].label === "Done" || live[0].label === "Close" || live[0].label === "OK")) return void run(live[0]);
		close();
	};
	stack.push({ overlay, panel, key: options.key, handle, buttons: () => current, escape });

	// Focus never falls to the page body: a click focuses the control under it (WebKit leaves a pressed button unfocused), else the dialog.
	panel.addEventListener("pointerdown", (e) => {
		const t = e.target as HTMLElement;
		const control = t.closest<HTMLElement>("button, input, select, textarea, [tabindex]");
		if (control && control !== panel && !(control as HTMLButtonElement).disabled && control.tagName !== "SELECT" && !(control instanceof HTMLInputElement)) control.focus({ preventScroll: true });
		else if (!control) panel.focus({ preventScroll: true });
	});
	panel.addEventListener("focusin", (e) => {
		if (e.target !== panel) lastStop = identity(e.target as Element);
	});
	// A redraw that removes the focused control drops focus to the body (WebKit sends no focusout for a removed node, so the dialog also
	// watches its own content): put it back on the same control, found by what it is, else on the dialog.
	const keepFocusInside = (): void => {
		if (closed || stack[stack.length - 1]?.overlay !== overlay) return;
		const a = document.activeElement;
		if (a && a !== document.body && a !== document.documentElement) return;
		if (/^(INPUT\|[^|]*\|(text|number|search|)\||TEXTAREA\|)/.test(lastStop)) return; // a box in use is kept by its dialog's own redraw rule (decision 109)
		(Array.from(panel.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")).find((n) => lastStop && identity(n) === lastStop) ?? panel).focus({ preventScroll: true });
	};
	overlay.addEventListener("focusout", (e) => {
		if (!(e as FocusEvent).relatedTarget) queueMicrotask(keepFocusInside);
	});
	new MutationObserver(keepFocusInside).observe(panel, { childList: true, subtree: true });

	document.body.append(overlay);
	(options.focus?.(panel) ?? panel.querySelector<HTMLElement>(".sf-dialog-body input:not([type=checkbox]):not([type=radio]), .sf-dialog-body select, .sf-dialog-body textarea") ?? panel.querySelector<HTMLElement>(".sf-button--primary") ?? tabStops(panel)[0] ?? panel).focus();
	return handle;
}
