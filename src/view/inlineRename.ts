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
	/** Optional extra element (e.g. a pencil icon button) that also triggers edit mode on click. */
	trigger?: HTMLElement;
	/** When set, "Rename" (and `trigger`, if any) call this instead of swapping `label` for an
	 * inline `<input>` — used where renaming needs a richer UI than a single title field (e.g.
	 * ChapterTitleModal's title + plot-thread picker). `onCommit`/`getCurrentTitle` are unused in
	 * that case; the caller's own handler is responsible for persisting the change. */
	onRenameClick?: () => void;
	/** Overrides the menu item's own text, which otherwise reads "Rename" — e.g. the series pane's
	 * novel rows use "set details" instead, since right-clicking there opens NovelTitleModal's full
	 * set of fields rather than a bare title swap. */
	renameLabel?: string;
}

/** Attaches a right-click context menu to `row` with a "Rename" action (and optional extra items) — purely a row/label swap plus a caller-supplied `onCommit`, agnostic to what renaming actually does underneath (unless `onRenameClick` overrides that swap entirely). */
export function attachInlineRename(options: InlineRenameOptions): void {
	const { row, label, getCurrentTitle, onCommit, extraMenuItems, trigger, onRenameClick, renameLabel } = options;
	const startRename = onRenameClick ?? beginEdit;

	row.addEventListener("contextmenu", (event: MouseEvent) => {
		event.preventDefault();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle(renameLabel ?? "Rename").onClick(() => startRename()));
		if (extraMenuItems) {
			menu.addSeparator();
			for (const extra of extraMenuItems) {
				menu.addItem((item) => item.setTitle(extra.title).onClick(() => void extra.onClick()));
			}
		}
		menu.showAtMouseEvent(event);
	});

	if (trigger) {
		trigger.addEventListener("click", (event) => {
			event.stopPropagation();
			startRename();
		});
	}

	function beginEdit(): void {
		if (!label.isConnected || !label.parentElement) return;
		const currentTitle = getCurrentTitle();
		const input = label.parentElement.createEl("input", { cls: "sf-rename-input", attr: { type: "text" } });
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
