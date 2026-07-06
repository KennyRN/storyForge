import { Menu } from "obsidian";

export interface InlineRenameOptions {
	/** The row element to bind the right-click handler to. */
	row: HTMLElement;
	/** The text span currently showing the row's display title; swapped for an <input> during editing. */
	label: HTMLElement;
	/** The raw, stored title to seed the input with — not any display-only transform (e.g. "#" numbering) applied to `label`. */
	getCurrentTitle: () => string;
	/** Persists the new title. Metadata-only — never touches the filesystem. */
	onCommit: (newTitle: string) => Promise<void>;
}

/** Attaches a right-click "Rename" context menu to `row` that swaps `label` for an inline text input — metadata-only, never renames files. */
export function attachInlineRename(options: InlineRenameOptions): void {
	const { row, label, getCurrentTitle, onCommit } = options;

	row.addEventListener("contextmenu", (event: MouseEvent) => {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Rename")
				.setIcon("pencil")
				.onClick(() => beginEdit()),
		);
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
