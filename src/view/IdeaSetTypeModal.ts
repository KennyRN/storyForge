import { App, Modal, Notice, setIcon } from "obsidian";
import { IDEA_TYPES, setNotesEntryType, type IdeaTypeOption } from "../notes";
import { addTagDefinition, deleteTagDefinition, resolveIconAlias } from "../tagRegistry";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_MINUS_SQUARE, ICON_PLUS_SQUARE, ICON_TAG } from "../icons";
import { confirmDelete } from "./confirmDeleteModal";

/** Same shape as CodexSetTypeModal, for Notebook types — no nesting or protected ids. */
export class IdeaSetTypeModal extends Modal {
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
		for (const option of IDEA_TYPES) this.renderTypeRow(list, option);
		this.renderAddRow(scroll);
	}

	private renderTypeRow(container: HTMLElement, option: IdeaTypeOption): void {
		const row = container.createDiv({ cls: "sf-row sf-palette-row sf-tag-picker-row" });
		setIcon(row.createSpan({ cls: "sf-icon" }), option.icon);
		row.createSpan({ cls: "sf-tag-picker-label", text: option.label });
		const pick = () => {
			void setNotesEntryType(this.app, this.path, option.type);
			this.close();
		};
		row.addEventListener("click", pick);

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
			await deleteTagDefinition(this.app, "ideaTypes", type);
			this.render();
		} catch (err) {
			new Notice(`storyForge: could not delete "${label}" — ${(err as Error).message}`);
		}
	}

	private renderAddRow(contentEl: HTMLElement): void {
		const addRow = contentEl.createDiv({ cls: "sf-row sf-tag-registry-add-row" });
		let pendingIconAlias = "";

		const iconBtn = addRow.createSpan({
			cls: "sf-tag-registry-icon-btn",
			attr: { "aria-label": "Choose icon", tabindex: "0" },
		});
		setIcon(iconBtn, ICON_TAG);
		const openIconPicker = () => {
			void import("./IconPickerModal").then(({ IconPickerModal }) => {
				new IconPickerModal(this.app, "ideaTypes", (alias) => {
					pendingIconAlias = alias;
					iconBtn.empty();
					setIcon(iconBtn, resolveIconAlias("ideaTypes", alias));
				}).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		const input = addRow.createEl("input", { type: "text", cls: "sf-modal-input", attr: { placeholder: "+ new notebook type" } });
		const commitAdd = () => {
			const label = input.value.trim();
			if (!label) return;
			void addTagDefinition(this.app, "ideaTypes", label, pendingIconAlias).then(({ id }) => {
				void setNotesEntryType(this.app, this.path, id);
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
