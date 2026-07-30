import { App, Modal, setIcon } from "obsidian";
import { CODEX_TYPES, setCodexEntryType } from "../codex";

export type CodexTypePickMode =
	| { kind: "set"; path: string }
	| { kind: "stub"; onPick: (type: string | null) => void };

/** Shared type list for "Set as…" (existing entry) and "Create as…" (new stub). */
export class CodexTypePickerModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private title: string,
		private mode: CodexTypePickMode,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-codex-type-picker-modal");
		contentEl.createEl("h2", { text: this.title });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		for (const option of CODEX_TYPES) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			setIcon(row.createSpan({ cls: "sf-icon" }), option.icon);
			row.createSpan({ text: option.label });
			row.addEventListener("click", () => {
				if (this.mode.kind === "set") {
					void setCodexEntryType(this.app, this.mode.path, option.type);
					this.close();
					return;
				}
				this.resolved = true;
				this.close();
				this.mode.onPick(option.type);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
		if (this.mode.kind === "stub" && !this.resolved) this.mode.onPick(null);
	}
}
