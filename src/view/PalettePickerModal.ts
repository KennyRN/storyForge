import { App, Modal } from "obsidian";
import { PaletteColor, PaletteMode, PaletteName, resolvePaletteColors } from "../colorPalettes";

/**
 * Lists every colour in the given palette/mode (official name + swatch, top to bottom,
 * canonical ANSI order). Clicking a row picks that colour and closes the modal.
 */
export class PalettePickerModal extends Modal {
	constructor(
		app: App,
		private paletteName: PaletteName,
		private mode: PaletteMode,
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

		const title =
			this.paletteName === "Custom"
				? "Custom"
				: `${this.paletteName} — ${this.mode === "light" ? "Light" : "Dark"}`;
		contentEl.createEl("h2", { text: title });

		const colors = resolvePaletteColors(this.paletteName, this.mode, this.customPaletteColors);
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
