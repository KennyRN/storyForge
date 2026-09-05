import { App, Modal, setIcon } from "obsidian";
import { ICON_CHECK_SQUARE, ICON_MULTIPLY_SQUARE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { makeReorderable } from "./dragReorder";

export interface CodexPickerEntry {
	path: string;
	name: string;
}

export type CodexEntryPickerSingleOptions = {
	mode?: "single";
	title: string;
	emptyMessage: string;
	entries: CodexPickerEntry[];
	hasValue?: boolean;
	onPick: (entry: CodexPickerEntry) => void | Promise<void>;
	onClear?: () => void | Promise<void>;
};

export type CodexEntryPickerMultiOptions = {
	mode: "multi";
	label: string;
	emptyMessage: string;
	entries: CodexPickerEntry[];
	initiallySelected: CodexPickerEntry[];
	onAccept: (selected: CodexPickerEntry[]) => void | Promise<void>;
};

export type CodexEntryPickerOptions = CodexEntryPickerSingleOptions | CodexEntryPickerMultiOptions;

/**
 * Lists Codex entries of a given type, scoped to the current book.
 *
 * Single mode (Default PoV): clicking a row picks it and closes; when a value is already set,
 * an extra "Clear" row fires onClear instead. Omit `hasValue` / `onClear` to hide Clear
 * (e.g. linking an unknown name as an alias).
 *
 * Multi mode (chapter PoV / Location): selected names sit above a divider with a drag handle
 * over each name; clicking a name in the list below appends it; the modal stays open until
 * accept or cancel.
 */
export class CodexEntryPickerModal extends Modal {
	private selected: CodexPickerEntry[] = [];
	private accepted = false;

	constructor(
		app: App,
		private opts: CodexEntryPickerOptions,
	) {
		super(app);
		if (opts.mode === "multi") {
			this.selected = opts.initiallySelected.map((entry) => ({ ...entry }));
		}
	}

	onOpen(): void {
		if (this.opts.mode === "multi") {
			this.modalEl.addClass("sf-codex-entry-picker-modal");
			this.titleEl.remove();
			this.renderMulti();
		} else {
			this.renderSingle();
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderSingle(): void {
		const opts = this.opts as CodexEntryPickerSingleOptions;
		const { contentEl } = this;
		contentEl.addClass("sf-codex-entry-picker-modal");
		contentEl.createEl("h2", { text: opts.title });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });

		if (opts.hasValue && opts.onClear) {
			const onClear = opts.onClear;
			const clearRow = list.createDiv({ cls: "sf-row sf-palette-row sf-picker-clear-row" });
			clearRow.createSpan({ text: "— Clear —" });
			clearRow.addEventListener("click", () => {
				void onClear();
				this.close();
			});
		}

		if (opts.entries.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: opts.emptyMessage });
			return;
		}
		for (const entry of opts.entries) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			row.createSpan({ text: entry.name });
			row.addEventListener("click", () => {
				void opts.onPick(entry);
				this.close();
			});
		}
	}

	private renderMulti(): void {
		const opts = this.opts as CodexEntryPickerMultiOptions;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-codex-entry-picker-modal");
		contentEl.addClass("sf-codex-entry-picker-modal--multi");

		this.renderSelection(contentEl, opts);
		contentEl.createDiv({ cls: "sf-codex-entry-picker-divider" });
		this.renderCandidateList(contentEl, opts);
		this.renderFooter(contentEl, opts);
	}

	private renderSelection(parent: HTMLElement, opts: CodexEntryPickerMultiOptions): void {
		const header = parent.createDiv({ cls: "sf-codex-entry-picker-selection" });
		header.createSpan({ cls: "sf-codex-entry-picker-label", text: opts.label });

		const zone = header.createDiv({ cls: "sf-codex-entry-picker-chips" });

		for (const entry of this.selected) {
			const chip = zone.createDiv({
				cls: "sf-codex-entry-picker-chip",
				attr: { "data-key": entry.path },
			});
			const handle = chip.createSpan({ cls: "sf-drag-handle" });
			setIcon(handle, "grip-horizontal");
			const name = chip.createSpan({
				cls: "sf-codex-entry-picker-chip-name",
				text: entry.name,
			});
			const remove = () => {
				this.selected = this.selected.filter((item) => item.path !== entry.path);
				this.renderMulti();
			};
			name.addEventListener("click", (e) => {
				e.stopPropagation();
				remove();
			});
			makeAccessibleActivatable(name, remove);
		}

		if (this.selected.length > 1) {
			makeReorderable(
				[{ key: "selected", container: zone }],
				".sf-codex-entry-picker-chip",
				".sf-drag-handle",
				(zoneRowKeys) => {
					const keys = zoneRowKeys.selected ?? [];
					this.selected = keys
						.map((key) => this.selected.find((item) => item.path === key))
						.filter((item): item is CodexPickerEntry => item != null);
				},
				"horizontal",
			);
		}
	}

	private renderCandidateList(parent: HTMLElement, opts: CodexEntryPickerMultiOptions): void {
		const selectedPaths = new Set(this.selected.map((item) => item.path));
		const available = opts.entries.filter((entry) => !selectedPaths.has(entry.path));
		const list = parent.createDiv({ cls: "sf-palette-list sf-codex-entry-picker-list" });

		if (opts.entries.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: opts.emptyMessage });
			return;
		}
		if (available.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: "All entries are already selected." });
			return;
		}
		for (const entry of available) {
			const row = list.createDiv({
				cls: "sf-row sf-palette-row",
				attr: { role: "button", tabindex: "0" },
			});
			row.createSpan({ text: entry.name });
			const pick = () => {
				this.selected.push({ ...entry });
				this.renderMulti();
			};
			row.addEventListener("click", pick);
			makeAccessibleActivatable(row, pick);
		}
	}

	private renderFooter(parent: HTMLElement, opts: CodexEntryPickerMultiOptions): void {
		const footer = parent.createDiv({ cls: "sf-codex-entry-picker-footer" });
		this.renderHoverIcon(footer, ICON_CHECK_SQUARE, "accept", () => {
			if (this.accepted) return;
			this.accepted = true;
			void opts.onAccept(this.selected.map((item) => ({ ...item })));
			this.close();
		});
		this.renderHoverIcon(footer, ICON_MULTIPLY_SQUARE, "cancel", () => this.close());
	}

	private renderHoverIcon(parent: HTMLElement, icon: string, label: string, onClick: () => void): void {
		const iconEl = parent.createSpan({
			cls: "sf-types-tags-hover-icon",
			attr: { role: "button", "aria-label": label },
		});
		setIcon(iconEl, icon);
		iconEl.addEventListener("click", onClick);
		makeAccessibleActivatable(iconEl, onClick);
	}
}
