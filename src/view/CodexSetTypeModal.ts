import { App, Modal, Notice, setIcon } from "obsidian";
import { CODEX_TYPES, setCodexEntryType, type CodexTypeOption } from "../codex";
import { addTagDefinition, deleteTagDefinition, PROTECTED_CODEX_TYPE_IDS, resolveIconAlias } from "../tagRegistry";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_MINUS_SQUARE, ICON_PLUS_SQUARE, ICON_TAG } from "../icons";
import { confirmDelete } from "./confirmDeleteModal";

/**
 * Lists every assignable Codex entry type in a fixed-size, scrollable pane (same treatment as
 * TagPickerModal). Codex types are single-select — unlike chapter/novel tags — so clicking a row
 * assigns it and closes immediately; there's no separate "Done" step. Each row's icon reveals a
 * [-] delete on hover. A "+ new codex type" row at the bottom defines a brand-new type inline
 * (via IconPickerModal) and immediately assigns it too, same as clicking an existing row.
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
		// indented directly beneath their parent, same grouping as TagRegistryModal's Codex types
		// tab, so a specific nested type is just as pickable here as any top-level one.
		const topLevel = CODEX_TYPES.filter((t) => !t.parentId);
		for (const option of topLevel) {
			this.renderTypeRow(list, option);
			if (!PROTECTED_CODEX_TYPE_IDS.has(option.type)) continue;
			const children = CODEX_TYPES.filter((t) => t.parentId === option.type);
			if (children.length === 0) continue;
			const childrenEl = list.createDiv({ cls: "sf-tag-registry-children" });
			for (const child of children) this.renderTypeRow(childrenEl, child);
		}

		this.renderAddRow(scroll);
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

		// Only visible on row hover/focus — deletes the type definition from the registry, not
		// just this assignment; the raw type id survives on anything already tagged with it
		// (same non-destructive delete as TagRegistryModal/TagPickerModal). Person/Place are
		// protected — no delete affordance at all, since too much of the app assumes they exist
		// (still renameable/re-iconable via TagRegistryModal). Their children are never protected.
		if (PROTECTED_CODEX_TYPE_IDS.has(option.type)) return;
		const deleteBtn = row.createSpan({
			cls: "sf-icon-action sf-tag-picker-row-delete",
			attr: { "aria-label": `Delete ${option.label}`, title: `Delete ${option.label}`, tabindex: "0" },
		});
		setIcon(deleteBtn, ICON_MINUS_SQUARE);
		const requestDelete = () => void this.handleDelete(option.type, option.label);
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			requestDelete();
		});
		makeAccessibleActivatable(deleteBtn, requestDelete);
	}

	private async handleDelete(type: string, label: string): Promise<void> {
		const confirmed = await confirmDelete(this.app, label);
		if (!confirmed) return;
		try {
			await deleteTagDefinition(this.app, "codexTypes", type);
			this.render();
		} catch (err) {
			new Notice(`storyForge: could not delete "${label}" — ${(err as Error).message}`);
		}
	}

	private renderAddRow(contentEl: HTMLElement): void {
		const addRow = contentEl.createDiv({ cls: "sf-row sf-tag-registry-add-row" });
		// ICON_TAG is a generic placeholder glyph shown before a real icon is picked — not itself a
		// catalog alias, so it's rendered directly rather than through resolveIconAlias.
		let pendingIconAlias = "";

		const iconBtn = addRow.createSpan({
			cls: "sf-tag-registry-icon-btn",
			attr: { "aria-label": "Choose icon", tabindex: "0" },
		});
		setIcon(iconBtn, ICON_TAG);
		const openIconPicker = () => {
			void import("./IconPickerModal").then(({ IconPickerModal }) => {
				new IconPickerModal(this.app, "codexTypes", (alias) => {
					pendingIconAlias = alias;
					iconBtn.empty();
					setIcon(iconBtn, resolveIconAlias("codexTypes", alias));
				}).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		const input = addRow.createEl("input", { type: "text", cls: "sf-modal-input", attr: { placeholder: "+ new codex type" } });
		const commitAdd = () => {
			const label = input.value.trim();
			if (!label) return;
			void addTagDefinition(this.app, "codexTypes", label, pendingIconAlias).then((newId) => {
				void setCodexEntryType(this.app, this.path, newId);
				this.close();
			});
		};
		const addBtn = addRow.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": "Add type", title: "Add type", tabindex: "0" },
		});
		setIcon(addBtn, ICON_PLUS_SQUARE);
		addBtn.addEventListener("click", commitAdd);
		makeAccessibleActivatable(addBtn, commitAdd);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commitAdd();
			}
		});
	}
}
