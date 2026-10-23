import { showMenu, menuPoint, type MenuItem } from "./menu";
import { el } from "./dom";

export interface ExtraMenuItem {
	title: string;
	onClick: () => void | Promise<void>;
}

export interface InlineRenameOptions {
	/** The row; right-click, F2, or Enter on the focused row start the rename. */
	row: HTMLElement;
	/** The text span showing the title; swapped for an input while editing. */
	label: HTMLElement;
	/** The raw, stored title to seed the input with (not a display-only transform such as `#` numbering). */
	getCurrentTitle: () => string;
	/** Persists the new title: a metadata field for books and chapters, an actual file rename for Codex notes. */
	onCommit: (newTitle: string) => Promise<void>;
	/** An explanation of why a typed name is refused, or null if it is fine. Shown under the input as it is typed; a refused name is not committed. */
	validate?: (name: string) => string | null;
	extraMenuItems?: ExtraMenuItem[];
	/** An extra element (a pencil button, say) that also starts editing. */
	trigger?: HTMLElement;
	/** Starts a richer rename than a title field (the Codex rename dialog) instead of the inline input. */
	onRenameClick?: () => void;
	renameLabel?: string;
	/** Also start on double-click of the label. Default true. */
	doubleClick?: boolean;
}

/** A "Rename" context-menu entry and keyboard routes on a row, swapping the label for an input. Agnostic to what renaming does underneath. */
export function attachInlineRename(options: InlineRenameOptions): void {
	const { row, label, getCurrentTitle, onCommit, validate, extraMenuItems, trigger, onRenameClick, renameLabel } = options;
	const start = onRenameClick ?? beginEdit;

	row.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		const items: MenuItem[] = [{ label: renameLabel ?? "Rename", onSelect: () => start() }];
		if (extraMenuItems?.length) {
			items.push({ separator: true });
			for (const extra of extraMenuItems) items.push({ label: extra.title, onSelect: extra.onClick });
		}
		showMenu(items, menuPoint(e));
	});
	row.addEventListener("keydown", (e) => {
		if (e.target !== row) return; // typing in the input is the input's business
		if (e.key === "F2") {
			e.preventDefault();
			start();
		}
	});
	if (options.doubleClick !== false) label.addEventListener("dblclick", () => start());
	trigger?.addEventListener("click", (e) => {
		e.stopPropagation();
		start();
	});

	function beginEdit(): void {
		if (!label.isConnected || !label.parentElement) return;
		const parent = label.parentElement;
		const current = getCurrentTitle();
		const input = el("input", { class: "sf-rename-input", attrs: { type: "text", "aria-label": "Name" } });
		const problem = el("div", { class: "sf-rename-problem", attrs: { role: "alert" } });
		input.value = current;
		label.replaceWith(input);
		input.after(problem);
		input.focus();
		input.select();

		let settled = false;
		const finish = (commit: boolean): void => {
			if (settled) return;
			settled = true;
			problem.remove();
			input.replaceWith(label);
			row.focus?.();
			const value = input.value.trim();
			if (commit && value && value !== current && !validate?.(value)) void onCommit(value);
		};
		const check = (): string | null => {
			const message = validate?.(input.value.trim()) ?? null;
			problem.textContent = message ?? "";
			input.toggleAttribute("aria-invalid", message !== null);
			return message;
		};
		input.addEventListener("input", check);
		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				e.preventDefault();
				if (!check()) finish(true);
			} else if (e.key === "Escape") {
				e.preventDefault();
				finish(false);
			}
		});
		input.addEventListener("blur", () => finish(!check()));
		input.addEventListener("pointerdown", (e) => e.stopPropagation());
		input.addEventListener("click", (e) => e.stopPropagation());
	}
}
