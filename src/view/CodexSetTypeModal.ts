import { App, Modal, setIcon } from "obsidian";
import { CODEX_TYPES, setCodexEntryType, type CodexTypeOption } from "../codex";
import { PROTECTED_CODEX_TYPE_IDS } from "../tagRegistry";

/**
 * Lists every assignable Codex entry type in a fixed-size, scrollable pane (same treatment as
 * the removed TagPickerModal). Codex types are single-select, so clicking a row assigns it and
 * closes immediately; there's no separate "Done" step. Types are only assigned here: defining or
 * deleting a type is no longer offered (the registry editors were removed).
 *
 * Note: this has its own `.sf-codex-set-type-modal` class rather than reusing the
 * `.sf-codex-type-picker-modal` class CodexLoreTypeModal/CodexEntryPickerModal share, so this
 * modal's fixed sizing doesn't bleed into theirs.
 */
export class CodexSetTypeModal extends Modal {
	constructor(
		app: App,
		private path: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.modalEl.addClass("sf-codex-set-type-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-codex-set-type-modal");
		contentEl.createEl("h2", { text: "Set as..." });

		const scroll = contentEl.createDiv({ cls: "sf-tag-picker-scroll" });
		const list = scroll.createDiv({ cls: "sf-palette-list" });
		// Nested types (person/place children — see codex.ts's CodexTypeOption.parentId) render
		// indented directly beneath their parent, same grouping as the old registry editor,
		// so a specific nested type is just as pickable here as any top-level one.
		const topLevel = CODEX_TYPES.filter((t) => !t.parentId);
		for (const option of topLevel) {
			this.renderTypeRow(list, option);
			if (!PROTECTED_CODEX_TYPE_IDS.has(option.type)) continue;
			const children = CODEX_TYPES.filter((t) => t.parentId === option.type);
			if (children.length === 0) continue;
			const childrenEl = list.createDiv({ cls: "sf-tag-registry-children" });
			for (const child of children) this.renderTypeRow(childrenEl, child);
		}
	}

	private renderTypeRow(container: HTMLElement, option: CodexTypeOption): void {
		const row = container.createDiv({ cls: "sf-row sf-palette-row sf-tag-picker-row" });
		setIcon(row.createSpan({ cls: "sf-icon" }), option.icon);
		row.createSpan({ cls: "sf-tag-picker-label", text: option.label });
		const pick = () => {
			void setCodexEntryType(this.app, this.path, option.type);
			this.close();
		};
		row.addEventListener("click", pick);
	}
}
