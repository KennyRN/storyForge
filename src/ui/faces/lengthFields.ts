import { registerFocusedField } from "../commitOnClose";
import { el } from "../kit/dom";

export const grouped = (n: number): string => Math.round(n).toLocaleString("en-US");

/**
 * A label and its value (Tweaks 1 part 2, §3.3): every such row uses the one gap `--label-gap`. `options.content` replaces the value's text with
 * styled pieces (the context panel's PoV and Location names, some muted); `options.name` gives the button a longer accessible name.
 */
export function metaRow(label: string, value: string, options: { title?: string; disabled?: boolean; onClick?: (anchor: HTMLElement) => void; content?: Node[]; name?: string; dataRow?: string }): HTMLElement {
	const row = el("div", { class: "sf-meta-row" }, el("span", { class: "sf-meta-label", text: label }));
	if (options.dataRow) row.dataset.row = options.dataRow;
	if (options.onClick) {
		const b = el("button", { class: "sf-meta-value", attrs: { type: "button", title: options.title ?? "", ...(options.name ? { "aria-label": options.name } : {}) }, ...(options.content ? {} : { text: value }) });
		if (options.content) b.append(...options.content);
		b.disabled = !!options.disabled;
		b.addEventListener("click", () => options.onClick!(b));
		row.append(b);
	} else row.append(el("span", { class: "sf-meta-value sf-meta-value--plain", text: value }));
	return row;
}

/** An inline number field: Enter saves (empty clears), Escape cancels. Digits are grouped as you type. */
export function numberEditor(label: string, value: number | null, commit: (n: number | null) => void | Promise<void>, cancel: () => void): HTMLElement {
	const input = el("input", { class: "sf-field sf-meta-input", attrs: { type: "text", inputmode: "numeric", "aria-label": label.replace(/:$/, "") } });
	input.value = value === null ? "" : grouped(value);
	let done = false;
	let pending: Promise<void> = Promise.resolve();
	// While the field is open the close commits it too, and waits for the write.
	const unregister = registerFocusedField({
		flush: async () => {
			if (input.isConnected) finish(true);
			await pending;
		},
	});
	const finish = (save: boolean): void => {
		if (done) return;
		done = true;
		unregister();
		if (!save) return cancel();
		const digits = input.value.replace(/[^\d]/g, "");
		pending = Promise.resolve(commit(digits === "" ? null : Number(digits))).catch(() => undefined);
	};
	input.addEventListener("input", () => {
		const digits = input.value.replace(/[^\d]/g, "");
		input.value = digits === "" ? "" : grouped(Number(digits));
	});
	input.addEventListener("keydown", (e) => {
		if (e.key === "Enter") finish(true);
		else if (e.key === "Escape") finish(false);
	});
	input.addEventListener("blur", () => finish(true));
	queueMicrotask(() => (input.focus(), input.select()));
	return el("div", { class: "sf-meta-row" }, el("span", { class: "sf-meta-label", text: label }), input);
}


/** One planned-length row, shared by the novel tab and the novel overview: a value that turns into a number field on click. */
export function lengthRow(opts: {
	which: "novel" | "chapter";
	label: string;
	value: number | null;
	shown: string;
	readOnly: unknown;
	editing: boolean;
	startEditing: () => void;
	stopEditing: () => void;
	save: (n: number | null) => void | Promise<void>;
}): HTMLElement {
	return opts.editing
		? numberEditor(opts.label, opts.value, (n) => { opts.stopEditing(); return opts.save(n); }, opts.stopEditing)
		: metaRow(opts.label, opts.shown, { title: `Set the planned ${opts.which} length`, disabled: !!opts.readOnly, onClick: opts.startEditing });
}
