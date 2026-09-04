import { App, Modal, Notice, setIcon } from "obsidian";
import { VAULT_TAG_ICON_CATALOG } from "../iconRegistry";
import { ICON_CHECK_SQUARE, ICON_TAG } from "../icons";
import {
	collectNotesTagIds,
	listVaultTagRows,
	reorderVaultTags,
	resolveVaultTagIconAlias,
	setVaultTagDisplay,
	setVaultTagIcon,
	setVaultTagNotesDisplay,
	type VaultTagRow,
	type VaultTagsShape,
} from "../vaultTags";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";

/**
 * Vault `#tag` manager — every tag currently in the vault (Codex) or on `notes/*.md` (Notebook),
 * with a drag handle, icon picker, read-only `#name`, and a display checkbox that only enables
 * after an icon is picked. Displayed tags become filter icons on the matching rail.
 */
export class VaultTagModal extends Modal {
	constructor(
		app: App,
		private onChange: () => void,
		private tagScope: "codex" | "notes" = "codex",
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.remove();
		try {
			this.render();
		} catch (err) {
			new Notice(`storyForge: could not open ${this.tagScope === "notes" ? "notebook" : "vault"} tags — ${(err as Error).message}`);
			this.close();
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(fresh?: VaultTagsShape): void {
		this.modalEl.addClass("sf-vault-tag-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-vault-tag-modal");

		const scroll = contentEl.createDiv({ cls: "sf-text-style-tab-body-wrapper" });
		const body = scroll.createDiv({ cls: "sf-text-style-tab-body" });

		const header = body.createDiv({
			cls: "sf-row sf-vault-tag-row sf-vault-tag-header",
			attr: { "aria-hidden": "true" },
		});
		const headerHandle = header.createSpan({ cls: "sf-drag-handle" });
		setIcon(headerHandle, "grip-vertical");
		const headerIcon = header.createSpan({ cls: "sf-tag-registry-icon-btn" });
		setIcon(headerIcon, ICON_TAG);
		header.createSpan({ cls: "sf-vault-tag-name", text: "#example" });
		const headerTick = header.createSpan({ cls: "sf-vault-tag-display" });
		setIcon(headerTick.createSpan({ cls: "sf-vault-tag-header-tick" }), ICON_CHECK_SQUARE);

		const rows = listVaultTagRows(
			this.app,
			fresh,
			this.tagScope === "notes" ? collectNotesTagIds(this.app) : undefined,
		);
		const rowsEl = body.createDiv({ cls: "sf-modal-book-list sf-tag-registry-list" });
		if (rows.length === 0) {
			rowsEl.createDiv({
				cls: "sf-empty sf-empty-inline",
				text:
					this.tagScope === "notes"
						? "No tags on notebook notes yet. Add a #tag to a note and it will show up here."
						: "No tags in this vault yet. Add a #tag to a note and it will show up here.",
			});
			return;
		}
		for (const row of rows) this.renderRow(rowsEl, row);

		const zones: DragZone[] = [{ key: "order", container: rowsEl }];
		makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
			void this.handleReorder((zoneRowKeys.order ?? []).filter(Boolean));
		});
	}

	private renderRow(rowsEl: HTMLElement, row: VaultTagRow): void {
		const el = rowsEl.createDiv({ cls: "sf-row sf-vault-tag-row" });
		el.dataset.key = row.id;
		const handle = el.createSpan({ cls: "sf-drag-handle" });
		setIcon(handle, "grip-vertical");

		const iconBtn = el.createSpan({
			cls: "sf-tag-registry-icon-btn",
			attr: { "aria-label": row.iconAlias ? "Change icon" : "Choose icon", tabindex: "0" },
		});
		setIcon(iconBtn, row.iconAlias ? resolveVaultTagIconAlias(row.iconAlias) : ICON_TAG);
		const openIconPicker = () => {
			void import("./IconPickerModal").then(({ IconPickerModal }) => {
				new IconPickerModal(this.app, VAULT_TAG_ICON_CATALOG, (alias) => this.handleSetIcon(row.id, alias)).open();
			});
		};
		iconBtn.addEventListener("click", openIconPicker);
		makeAccessibleActivatable(iconBtn, openIconPicker);

		el.createSpan({ cls: "sf-vault-tag-name", text: `#${row.id}` });

		const canDisplay = Boolean(row.iconAlias);
		const tooltip =
			this.tagScope === "notes"
				? canDisplay
					? "display filtering icon in notebook"
					: "select a tag icon"
				: canDisplay
					? "display filtering icon in codex"
					: "select a tag icon";
		const displayWrap = el.createSpan({
			cls: `sf-vault-tag-display${canDisplay ? "" : " is-disabled"}`,
			attr: { title: tooltip },
		});
		const checkbox = displayWrap.createEl("input", {
			type: "checkbox",
			attr: { "aria-label": tooltip },
		});
		checkbox.checked = this.tagScope === "notes" ? row.notesDisplay : row.display;
		checkbox.disabled = !canDisplay;
		checkbox.addEventListener("change", () => {
			if (!row.iconAlias) {
				checkbox.checked = false;
				return;
			}
			void this.handleSetDisplay(row.id, checkbox.checked);
		});
	}

	private async handleReorder(newIdOrder: string[]): Promise<void> {
		try {
			const fresh = await reorderVaultTags(this.app, newIdOrder);
			this.onChange();
			this.render(fresh);
		} catch (err) {
			new Notice(`storyForge: could not reorder vault tags — ${(err as Error).message}`);
		}
	}

	private async handleSetIcon(id: string, alias: string): Promise<void> {
		try {
			const fresh = await setVaultTagIcon(this.app, id, alias);
			this.onChange();
			this.render(fresh);
		} catch (err) {
			new Notice(`storyForge: could not set the icon — ${(err as Error).message}`);
		}
	}

	private async handleSetDisplay(id: string, display: boolean): Promise<void> {
		try {
			const fresh =
				this.tagScope === "notes"
					? await setVaultTagNotesDisplay(this.app, id, display)
					: await setVaultTagDisplay(this.app, id, display);
			this.onChange();
			this.render(fresh);
		} catch (err) {
			new Notice(`storyForge: could not update display — ${(err as Error).message}`);
		}
	}
}
