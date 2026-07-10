import { Menu } from "obsidian";

export interface ExtraMenuItem {
	title: string;
	onClick: () => void | Promise<void>;
}

export interface InlineRenameOptions {
	/** The row element to bind the right-click handler to. */
	row: HTMLElement;
	/** The text span currently showing the row's display title; swapped for an <input> during editing. */
	label: HTMLElement;
	/** The raw, stored title to seed the input with — not any display-only transform (e.g. "#" numbering) applied to `label`. */
	getCurrentTitle: () => string;
	/** Persists the new title — whatever that means to the caller (a metadata field for books/chapters, an actual file rename for Codex notes). */
	onCommit: (newTitle: string) => Promise<void>;
	/** Optional extra items to include in the right-click menu, after Rename. */
	extraMenuItems?: ExtraMenuItem[];
}

/** Attaches a right-click context menu to `row` with a "Rename" action (and optional extra items) — purely a row/label swap plus a caller-supplied `onCommit`, agnostic to what renaming actually does underneath. */
export function attachInlineRename(options: InlineRenameOptions): void {
	const { row, label, getCurrentTitle, onCommit, extraMenuItems } = options;

	row.addEventListener("contextmenu", (event: MouseEvent) => {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Rename").onClick(() => beginEdit()));
		if (extraMenuItems) {
			menu.addSeparator();
			for (const extra of extraMenuItems) {
				menu.addItem((item) => item.setTitle(extra.title).onClick(() => void extra.onClick()));
			}
		}
		menu.showAtMouseEvent(event);
	});

	function beginEdit(): void {
		if (!label.isConnected) return;
		const currentTitle = getCurrentTitle();
		const input = document.createElement("input");
		input.type = "text";
		input.className = "sf-rename-input";
		input.value = currentTitle;
		label.replaceWith(input);
		input.focus();
		input.select();

		let settled = false;
		const finish = (commit: boolean) => {
			if (settled) return;
			settled = true;
			input.replaceWith(label);
			if (commit) {
				const value = input.value.trim();
				if (value && value !== currentTitle) void onCommit(value);
			}
		};

		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				input.blur();
			} else if (event.key === "Escape") {
				event.preventDefault();
				finish(false);
			}
		});
		input.addEventListener("blur", () => finish(true));
		input.addEventListener("pointerdown", (event) => event.stopPropagation());
		input.addEventListener("click", (event) => event.stopPropagation());
	}
}
