import { App, Modal, setIcon } from "obsidian";
import { CODEX_TYPES } from "../codex";

/** Picks a Codex type for a new stub; resolves with the type id or null if cancelled. */
export class CodexStubTypeModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private onPick: (type: string | null) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-codex-type-picker-modal");
		contentEl.createEl("h2", { text: "Create as..." });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		for (const option of CODEX_TYPES) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			setIcon(row.createSpan({ cls: "sf-icon" }), option.icon);
			row.createSpan({ text: option.label });
			row.addEventListener("click", () => {
				this.resolved = true;
				this.close();
				this.onPick(option.type);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.resolved) this.onPick(null);
	}
}
