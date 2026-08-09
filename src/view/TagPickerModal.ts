import { App, Modal, Notice, setIcon } from "obsidian";
import { addTagDefinition, deleteTagDefinition, readTagRegistry, resolveIconAlias, type TagListKind } from "../tagRegistry";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_CHECK_SQUARE, ICON_MINUS_SQUARE, ICON_PLUS_SQUARE, ICON_TAG } from "../icons";
import { confirmDelete } from "./confirmDeleteModal";

/**
 * Multi-select picker over one of the three tag/type lists — toggling a row doesn't close the
 * modal, since more than one tag can apply at once; "Done" commits the final set. A "+ new tag"
 * row lets you define a brand-new tag inline (via IconPickerModal) without leaving this flow.
 * Fixed-size dialog (see `.modal.sf-tag-picker-modal`) — the tag list + add row scroll internally
 * instead of resizing the window as entries are added/removed.
 *
 * `allowManage` (default true) toggles the add row and each row's delete affordance off — for a
 * pure "pick from the existing list" use (e.g. BottomPanel.ts's Codex type filter), where letting
 * the filter popup also edit the registry would be a stray, easy-to-hit way to lose a type
 * definition. Selecting/deselecting rows still works identically either way.
 */
export class TagPickerModal extends Modal {
	private selected: Set<string>;

	constructor(
		app: App,
		private list: TagListKind,
		initiallySelected: string[],
		private onChange: (nextIds: string[]) => void | Promise<void>,
		private allowManage: boolean = true,
	) {
		super(app);
		this.selected = new Set(initiallySelected);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.modalEl.addClass("sf-tag-picker-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-tag-picker-modal");

		const scroll = contentEl.createDiv({ cls: "sf-tag-picker-scroll" });
		const { [this.list]: entries } = readTagRegistry(this.app);
		const list = scroll.createDiv({ cls: "sf-palette-list" });
		if (entries.length === 0) {
			list.createDiv({
				cls: "sf-empty sf-empty-inline",
				text: this.allowManage ? "No tags defined yet — add one below." : "Nothing to select yet.",
			});
		}
		for (const entry of entries) {
			const row = list.createDiv({
				cls: `sf-row sf-palette-row sf-tag-picker-row${this.selected.has(entry.id) ? " is-selected" : ""}`,
				attr: { role: "button", tabindex: "0" },
			});
			setIcon(row.createSpan({ cls: "sf-icon" }), resolveIconAlias(this.list, entry.iconAlias));
			row.createSpan({ cls: "sf-tag-picker-label", text: entry.label });
			setIcon(row.createSpan({ cls: "sf-tag-picker-check" }), "check");
			const toggle = () => {
				if (this.selected.has(entry.id)) this.selected.delete(entry.id);
				else this.selected.add(entry.id);
				this.render();
			};
			row.addEventListener("click", toggle);
			makeAccessibleActivatable(row, toggle);

			if (this.allowManage) {
				// Only visible on row hover/focus (see styles.css) — deleting here removes the
				// definition from the registry, not just this selection; the raw id survives on
				// anything already tagged with it (same non-destructive delete as TagRegistryModal).
				const deleteBtn = row.createSpan({
					cls: "sf-icon-action sf-tag-picker-row-delete",
					attr: { "aria-label": `Delete ${entry.label}`, title: `Delete ${entry.label}`, tabindex: "0" },
				});
				setIcon(deleteBtn, ICON_MINUS_SQUARE);
				const requestDelete = () => void this.handleDelete(entry.id, entry.label);
				deleteBtn.addEventListener("click", (e) => {
					e.stopPropagation();
					requestDelete();
				});
				makeAccessibleActivatable(deleteBtn, requestDelete);
			}
		}

		if (this.allowManage) this.renderAddRow(scroll);

		const footer = contentEl.createDiv({ cls: "sf-tag-picker-footer" });
		const doneBtn = footer.createSpan({
			cls: "sf-icon-action sf-tag-picker-done-btn",
			attr: { "aria-label": "Done", title: "Done", tabindex: "0" },
		});
		setIcon(doneBtn, ICON_CHECK_SQUARE);
		const finish = () => {
			void this.onChange(Array.from(this.selected));
			this.close();
		};
		doneBtn.addEventListener("click", finish);
		makeAccessibleActivatable(doneBtn, finish);
	}

	private async handleDelete(id: string, label: string): Promise<void> {
		const confirmed = await confirmDelete(this.app, label);
		if (!confirmed) return;
		try {
			this.selected.delete(id);
			await deleteTagDefinition(this.app, this.list, id);
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
				new IconPickerModal(this.app, this.list, (alias) => {
					pendingIconAlias = alias;
					iconBtn.empty();
					setIcon(iconBtn, resolveIconAlias(this.list, alias));
				}).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		const input = addRow.createEl("input", { type: "text", cls: "sf-modal-input", attr: { placeholder: "+ new tag" } });
		const commitAdd = () => {
			const label = input.value.trim();
			if (!label) return;
			void addTagDefinition(this.app, this.list, label, pendingIconAlias).then((newId) => {
				this.selected.add(newId);
				this.render();
			});
		};
		// Invisible — matches the width of the tag rows' checkmark slot, so the "+" below lands in
		// the same column as the "[-]" delete icon those rows reveal on hover.
		addRow.createSpan({ cls: "sf-tag-picker-check-spacer" });
		const addBtn = addRow.createSpan({
			cls: "sf-icon-action",
			attr: { "aria-label": "Add tag", title: "Add tag", tabindex: "0" },
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
