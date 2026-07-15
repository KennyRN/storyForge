import { App, Modal, setIcon } from "obsidian";
import { CODEX_TYPES, setCodexEntryType } from "../codex";

/** Lists every assignable Codex entry type. Clicking one tags the entry and closes the modal. */
export class CodexSetTypeModal extends Modal {
	constructor(
		app: App,
		private path: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-codex-type-picker-modal");
		contentEl.createEl("h2", { text: "Set as..." });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		for (const option of CODEX_TYPES) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			setIcon(row.createSpan({ cls: "sf-icon" }), option.icon);
			row.createSpan({ text: option.label });
			row.addEventListener("click", () => {
				void setCodexEntryType(this.app, this.path, option.type);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
