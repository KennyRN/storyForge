import { App, Modal } from "obsidian";

export interface CodexPickerEntry {
	path: string;
	name: string;
}

/** Lists Codex entries of a given type, scoped to the current book. Clicking one picks it and closes the modal; when a value is already set, an extra "Clear" row fires onClear instead. */
export class CodexEntryPickerModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private emptyMessage: string,
		private entries: CodexPickerEntry[],
		private hasValue: boolean,
		private onPick: (entry: CodexPickerEntry) => void | Promise<void>,
		private onClear: () => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-codex-entry-picker-modal");
		contentEl.createEl("h2", { text: this.title });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });

		if (this.hasValue) {
			const clearRow = list.createDiv({ cls: "sf-row sf-palette-row sf-picker-clear-row" });
			clearRow.createSpan({ text: "— Clear —" });
			clearRow.addEventListener("click", () => {
				void this.onClear();
				this.close();
			});
		}

		if (this.entries.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: this.emptyMessage });
			return;
		}
		for (const entry of this.entries) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			row.createSpan({ text: entry.name });
			row.addEventListener("click", () => {
				void this.onPick(entry);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
