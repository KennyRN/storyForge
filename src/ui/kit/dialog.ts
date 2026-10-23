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
}

export interface OpenDialog {
	element: HTMLElement;
	close: () => void;
	/** Rebuilds the button row, for a dialog that changes step. */
	setButtons: (buttons: DialogButton[]) => void;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A modal dialog: focus is trapped, Escape cancels, and focus returns to the opener. */
export function openDialog(options: DialogOptions): OpenDialog {
	const returnTo = document.activeElement as HTMLElement | null;
	const titleId = `sf-dialog-title-${Math.random().toString(36).slice(2)}`;
	const buttons = el("div", { class: "sf-dialog-buttons" });
	const panel = el(
		"div",
		{ class: "sf-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId } },
		el("h2", { class: "sf-dialog-title", text: options.title, attrs: { id: titleId } }),
		el("div", { class: "sf-dialog-body sf-scroll" }, options.body),
		buttons,
	);
	const overlay = el("div", { class: "sf-dialog-overlay" }, panel);
	let closed = false;

	const close = (): void => {
		if (closed) return;
		closed = true;
		overlay.remove();
		options.onClose?.();
		returnTo?.focus?.();
	};
	const setButtons = (list: DialogButton[]): void => {
		fill(
			buttons,
			...list.map((b) =>
				button({
					label: b.label,
					kind: b.kind,
					disabled: b.disabled,
					onClick: () => {
						void (async () => {
							const keep = await b.onClick?.();
							if (keep !== false) close();
						})();
					},
				}),
			),
		);
	};
	setButtons(options.buttons);

	overlay.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			close();
		} else if (e.key === "Tab") {
			const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	});

	document.body.append(overlay);
	(panel.querySelector<HTMLElement>(".sf-dialog-body input, .sf-dialog-body select, .sf-dialog-body textarea") ?? panel.querySelector<HTMLElement>(".sf-button--primary") ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus();
	return { element: panel, close, setButtons };
}
