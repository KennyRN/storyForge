import { App, Modal, setIcon } from "obsidian";
import { CODEX_TYPES } from "../codex";

/** Picks a Codex type for a new lore entry; resolves with the type id or null if cancelled. */
export class CodexLoreTypeModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private onPick: (type: string | null) => void,
		/** Opportunistic NER pre-fill — shown first when it matches a Codex type. */
		private preferredType?: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("sf-codex-type-picker-modal");
		contentEl.createEl("h2", { text: "Create as..." });

		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		const ordered = [...CODEX_TYPES].sort((a, b) => {
			if (this.preferredType && a.type === this.preferredType) return -1;
			if (this.preferredType && b.type === this.preferredType) return 1;
			return 0;
		});
		for (const option of ordered) {
			const row = list.createDiv({
				cls:
					option.type === this.preferredType
						? "sf-row sf-palette-row is-preferred"
						: "sf-row sf-palette-row",
			});
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
