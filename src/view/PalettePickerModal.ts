import { App, Modal } from "obsidian";
import {
	PaletteColor,
	PaletteName,
	resolvePaletteColors,
	resolvePaletteVariant,
} from "../colorPalettes";

/**
 * Lists every colour in the given palette/variant (official name + swatch, top to bottom).
 * Clicking a row picks that colour and closes the modal.
 */
export class PalettePickerModal extends Modal {
	constructor(
		app: App,
		private paletteName: PaletteName,
		private variantName: string,
		private customPaletteColors: PaletteColor[],
		private onPick: (hex: string) => void | Promise<void>,
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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-palette-picker-modal");

		const resolved = resolvePaletteVariant(this.paletteName, this.variantName);
		const title =
			this.paletteName === "Custom"
				? "Custom"
				: resolved
					? `${this.paletteName} — ${resolved.name}`
					: this.paletteName;
		contentEl.createEl("h2", { text: title });

		const colors = resolvePaletteColors(this.paletteName, this.variantName, this.customPaletteColors);
		const list = contentEl.createDiv({ cls: "sf-palette-list" });
		for (const color of colors) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			const swatch = row.createDiv({ cls: "sf-palette-swatch" });
			swatch.style.backgroundColor = color.hex;
			row.createSpan({ cls: "sf-palette-name", text: color.name });
			row.createSpan({ cls: "sf-palette-hex", text: color.hex.toUpperCase() });
			row.addEventListener("click", () => {
				void this.onPick(color.hex);
				this.close();
			});
		}
	}
}
