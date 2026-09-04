import { App, Modal, setIcon } from "obsidian";
import { CODEX_ICON_CATALOG, TAG_ICON_CATALOG, type IconCatalogEntry } from "../iconRegistry";
import { type TagListKind } from "../tagRegistry";
import { makeAccessibleActivatable } from "./a11y";

export type IconPickerSource = TagListKind | readonly IconCatalogEntry[];

function catalogFor(source: IconPickerSource): readonly IconCatalogEntry[] {
	if (typeof source !== "string") return source;
	return source === "codexTypes" || source === "ideaTypes" ? CODEX_ICON_CATALOG : TAG_ICON_CATALOG;
}

/**
 * Icon-only grid of every icon in the given catalog (Codex types draw from
 * CODEX_ICON_CATALOG; chapter/novel tags share TAG_ICON_CATALOG; vault `#tag`s pass
 * VAULT_TAG_ICON_CATALOG). No header, no labels — the catalogs are small and visual enough to
 * scan by shape alone; each entry's `label` is still used for aria-label/title (hover tooltip)
 * so it's available on demand without cluttering the grid. These catalogs are programmer-curated
 * only — there is no end-user "add an icon" flow; growing one means adding an entry in
 * src/iconRegistry.ts (plus a matching custom icon in src/icons.ts). Clicking a cell picks that
 * icon's alias and closes the modal.
 */
export class IconPickerModal extends Modal {
	constructor(
		app: App,
		private source: IconPickerSource,
		private onPick: (alias: string) => void | Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		// The class must go on modalEl (the actual floating dialog), not just contentEl — sizing
		// only contentEl leaves the dialog at Obsidian's default width and the narrower grid
		// floating inside it with a lot of dead space. See styles.css's `.modal.sf-icon-picker-modal`
		// rule (same two-selector pattern HideUiModal/ProtectionsModal/TextStyleModal/UiFormattingModal use).
		this.modalEl.addClass("sf-icon-picker-modal");
		const { contentEl } = this;
		contentEl.addClass("sf-icon-picker-modal");

		const catalog = catalogFor(this.source);
		const grid = contentEl.createDiv({ cls: "sf-icon-picker-grid" });
		for (const entry of catalog) {
			// Deliberately not role="button" — this is a hover-highlighted icon grid, not a set of
			// buttons; tabindex alone keeps it keyboard-reachable without the theme's button chrome.
			const cell = grid.createDiv({
				cls: "sf-icon-picker-cell",
				attr: { "aria-label": entry.label, title: entry.label, tabindex: "0" },
			});
			setIcon(cell, entry.iconId);
			const pick = () => {
				void this.onPick(entry.alias);
				this.close();
			};
			cell.addEventListener("click", pick);
			makeAccessibleActivatable(cell, pick);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
