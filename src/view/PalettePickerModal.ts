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

/** Prepends a "Muted" choice above every palette colour, for callers with a muted override. */
export interface PalettePickerMutedOption {
	isActive: boolean;
	onSelect: () => void | Promise<void>;
}

/** Prepends a labelled colour choice at the very top of the list, separated by a small gap. */
export interface PalettePickerLeadingOption {
	isActive: boolean;
	label: string;
	swatchHex: string;
	onSelect: () => void | Promise<void>;
}

/** The live theme's `--text-muted`, for swatches that need to show the real muted colour. */
export function resolveThemeMutedColor(): string {
	const value = getComputedStyle(document.body).getPropertyValue("--text-muted").trim();
	return value || "#999999";
}

/** Turns a CSS colour (`#rgb`, `#rrggbb`, `rgb()`, theme vars already computed, …) into `#rrggbb`. */
export function cssColorToHex(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
	if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
		const [r, g, b] = trimmed.slice(1);
		return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
	}
	const probe = document.createElement("span");
	document.body.appendChild(probe);
	probe.style.color = trimmed;
	const computed = getComputedStyle(probe).color;
	probe.remove();
	const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(computed);
	if (!match) return null;
	return `#${[match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

/** The live theme's `--background-primary` as `#rrggbb`, for plot-thread text defaults. */
export function resolveThemeBackgroundColor(): string {
	const value = getComputedStyle(document.body).getPropertyValue("--background-primary").trim();
	return cssColorToHex(value) ?? "#ffffff";
}

/**
 * Lists every colour in the given palette/variant (official name + swatch, top to bottom).
 * Clicking a row picks that colour and closes the modal. When `leading` is supplied, that row is
 * prepended at the very top (separated by a small gap). When `muted` is supplied, a "Muted" row
 * is prepended above the palette colours (and also gets the gap when `leading` is absent). When
 * `themeDefault` is supplied, a "Theme default" row is appended at the very bottom — replacing
 * the older pattern of a separate "Theme default" toggle next to the swatch (see bindColorSwatchButton).
 */
export class PalettePickerModal extends Modal {
	constructor(
		app: App,
		private paletteName: PaletteName,
		private variantName: string,
		private customPaletteColors: PaletteColor[],
		private onPick: (hex: string) => void | Promise<void>,
		private themeDefault?: PalettePickerThemeDefaultOption,
		private muted?: PalettePickerMutedOption,
		private leading?: PalettePickerLeadingOption,
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

		if (this.leading) {
			const leading = this.leading;
			const row = list.createDiv({ cls: "sf-row sf-palette-row sf-palette-leading" });
			if (leading.isActive) row.addClass("is-selected");
			const swatch = row.createDiv({ cls: "sf-palette-swatch" });
			swatch.setCssStyles({ backgroundColor: leading.swatchHex });
			row.createSpan({ cls: "sf-palette-name", text: leading.label });
			row.addEventListener("click", () => {
				void leading.onSelect();
				this.close();
			});
		}

		if (this.muted) {
			const muted = this.muted;
			const mutedColor = resolveThemeMutedColor();
			const row = list.createDiv({
				cls: this.leading ? "sf-row sf-palette-row sf-palette-muted" : "sf-row sf-palette-row sf-palette-muted sf-palette-leading",
			});
			if (muted.isActive) row.addClass("is-selected");
			const swatch = row.createDiv({ cls: "sf-palette-swatch" });
			swatch.setCssStyles({ backgroundColor: mutedColor });
			row.createSpan({ cls: "sf-palette-name", text: "Muted" });
			row.addEventListener("click", () => {
				void muted.onSelect();
				this.close();
			});
		}

		for (const color of colors) {
			const row = list.createDiv({ cls: "sf-row sf-palette-row" });
			const swatch = row.createDiv({ cls: "sf-palette-swatch" });
			swatch.setCssStyles({ backgroundColor: color.hex });
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
