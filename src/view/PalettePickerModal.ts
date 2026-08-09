import { App, Modal } from "obsidian";
import {
	PaletteColor,
	PaletteName,
	resolvePaletteColors,
	resolvePaletteVariant,
} from "../colorPalettes";

/** Appends a "Theme default" choice after every palette colour, for callers with an override concept. */
export interface PalettePickerThemeDefaultOption {
	isActive: boolean;
	onSelect: () => void | Promise<void>;
}

/**
 * Lists every colour in the given palette/variant (official name + swatch, top to bottom).
 * Clicking a row picks that colour and closes the modal. When `themeDefault` is supplied, a
 * "Theme default" row is appended at the very bottom, after every palette colour — replacing the
 * older pattern of a separate "Theme default" toggle next to the swatch (see bindColorSwatchButton).
 */
export class PalettePickerModal extends Modal {
	constructor(
		app: App,
		private paletteName: PaletteName,
		private variantName: string,
		private customPaletteColors: PaletteColor[],
		private onPick: (hex: string) => void | Promise<void>,
		private themeDefault?: PalettePickerThemeDefaultOption,
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

		if (this.themeDefault) {
			const themeDefault = this.themeDefault;
			const row = list.createDiv({ cls: "sf-row sf-palette-row sf-palette-theme-default" });
			if (themeDefault.isActive) row.addClass("is-selected");
			row.createDiv({ cls: "sf-palette-swatch is-theme-default" });
			row.createSpan({ cls: "sf-palette-name", text: "Theme default" });
			row.addEventListener("click", () => {
				void themeDefault.onSelect();
				this.close();
			});
		}
	}
}
