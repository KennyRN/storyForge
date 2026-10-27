import { registerFocusedField } from "../commitOnClose";
import { el } from "../kit/dom";
import { FieldState, type FieldHooks } from "./fieldState";

/**
 * A text area for a field of the author's own words that lives in the project's files (a plot note, the
 * synopsis, the description). Nothing is written while typing: the text is committed when the field loses
 * focus, and on every close route through `commitFocusedFields`; a commit the close has to cut off is
 * rescued into a recovery file. The commit is compare-then-write against what the field last saw on disk
 * (taken at focus); a conflict or refusal leaves the author's text in a recovery file and says so
 * (docs/story-shape.md §5). The state machine is `FieldState`.
 */
export type FieldSpec = Omit<FieldHooks, "getText" | "setText"> & { readOnly: boolean };

export interface TextField {
	element: HTMLTextAreaElement;
	/** Shows a value from disk, unless the author is in the middle of typing. */
	show(value: string): void;
}

export function textField(spec: FieldSpec): TextField {
	const ta = el("textarea", { class: "sf-note-field", attrs: { "aria-label": spec.label, rows: "1", spellcheck: "true" } });
	ta.readOnly = spec.readOnly;
	const grow = (): void => {
		ta.style.height = "auto";
		ta.style.height = `${ta.scrollHeight}px`;
	};
	const state = new FieldState({
		...spec,
		getText: () => ta.value,
		setText: (text) => {
			ta.value = text;
			grow();
		},
	});
	let unregister: (() => void) | null = null;

	ta.addEventListener("focus", () => {
		unregister ??= registerFocusedField({ flush: () => state.flush(), rescue: () => state.rescue() });
		state.focused();
	});
	ta.addEventListener("input", () => {
		state.edited();
		grow();
	});
	ta.addEventListener("blur", () => {
		void state.flush().then(() => {
			unregister?.();
			unregister = null;
		});
	});

	return {
		element: ta,
		show(value) {
			if (state.showFromDisk(value, document.activeElement === ta)) requestAnimationFrame(grow);
		},
	};
}
