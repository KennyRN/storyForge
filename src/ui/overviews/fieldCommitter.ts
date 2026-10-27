import type { FieldResult } from "../../core/fieldWriter";
import { registerFocusedField } from "../commitOnClose";
import { el } from "../kit/dom";
import type { NoticeInput } from "../kit/notices";

/**
 * A text area for a field of the author's own words that lives in the project's files (a plot note,
 * later the synopsis and description). Nothing is written while typing: the text is committed when
 * the field loses focus, and on every close route through `commitFocusedFields`. The commit is
 * compare-then-write against what the field last saw on disk (taken at focus); a conflict or refusal
 * leaves the author's text in a recovery file and says so (docs/story-shape.md §5).
 */
export interface FieldSpec {
	label: string;
	readOnly: boolean;
	/** The value on disk now. */
	read: () => Promise<string>;
	/** Writes `next` if the disk still holds `expected`. */
	commit: (expected: string, next: string) => Promise<FieldResult>;
	notify: (notice: NoticeInput) => void;
	/** Called after a successful write, with the value as stored. */
	written?: (stored: string) => void;
}

export interface TextField {
	element: HTMLTextAreaElement;
	/** Shows a value from disk, unless the author is in the middle of typing. */
	show(value: string): void;
}

const stored = (text: string): string => (text.trim() === "" ? "" : text.trimEnd());

export function textField(spec: FieldSpec): TextField {
	const ta = el("textarea", { class: "sf-note-field", attrs: { "aria-label": spec.label, rows: "1", spellcheck: "true" } });
	ta.readOnly = spec.readOnly;
	let seen = "";
	let dirty = false;
	let pending: Promise<void> = Promise.resolve();

	const grow = (): void => {
		ta.style.height = "auto";
		ta.style.height = `${ta.scrollHeight}px`;
	};

	const flush = (): Promise<void> => {
		pending = pending.then(async () => {
			if (!dirty) return;
			dirty = false;
			const next = ta.value;
			const result = await spec.commit(seen, next).catch((error: Error): FieldResult => ({ status: "refused", error, recovery: { ok: false, error } }));
			if (result.status === "written") {
				seen = stored(next);
				spec.written?.(seen);
			} else if (result.status === "conflict" || result.status === "refused") {
				const where = result.recovery.ok ? `Your text is saved in ${result.recovery.path}.` : "Your text could not be saved to a recovery file; it is still in the field.";
				if (result.status === "conflict") {
					ta.value = result.current;
					seen = result.current;
					grow();
				}
				spec.notify({
					text: result.status === "conflict" ? `${spec.label} changed on disk while you were editing it, so your text was not saved over it. ${where}` : `${spec.label} could not be saved. ${where}`,
					sticky: true,
					pinned: !result.recovery.ok,
				});
			}
		});
		return pending;
	};
	let unregister: (() => void) | null = null;

	ta.addEventListener("focus", () => {
		unregister ??= registerFocusedField({ flush });
		void spec.read().then((v) => {
			if (!dirty) seen = v;
		});
	});
	ta.addEventListener("input", () => {
		dirty = true;
		grow();
	});
	ta.addEventListener("blur", () => {
		void flush().then(() => {
			unregister?.();
			unregister = null;
		});
	});

	return {
		element: ta,
		show(value) {
			if (document.activeElement === ta || dirty) return;
			seen = value;
			ta.value = value;
			requestAnimationFrame(grow);
			grow();
		},
	};
}
