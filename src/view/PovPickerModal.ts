import { App, Modal } from "obsidian";

export interface PovPickerEntry {
	path: string;
	name: string;
}

/** Lists every "person"-typed Codex entry visible to the current book. Clicking one picks it and closes the modal. */
export class PovPickerModal extends Modal {
	constructor(
		app: App,
		private entries: PovPickerEntry[],
		private onPick: (entry: PovPickerEntry) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-pov-picker-modal");
		contentEl.createEl("h2", { text: "Set PoV" });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		if (this.entries.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: "No person entries in the Codex yet." });
			return;
		}
		for (const entry of this.entries) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			row.createSpan({ text: entry.name });
			row.addEventListener("click", () => {
				this.onPick(entry);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
