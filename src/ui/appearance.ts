import { APPEARANCE_BASE_PX, APPEARANCE_PARTS, DEFAULT_PROJECT_SETTINGS, appearanceKey, typeKey, type AppearancePart, type ProjectSettings } from "../app/settings";
import { FAMILY_INFO, nearestWeight, type FontFamily } from "../core/fontFamilies";
import { TYPE_STYLES, resolvedFont, type TypeStyle } from "../core/typeStyles";

/** A size in rem as pixels against the one named base (the page's own root size is 13 px, so the CSS `rem` unit isn't used). */
export const px = (rem: number): string => `${+(rem * APPEARANCE_BASE_PX).toFixed(2)}px`;

/** The font-variation-settings a family needs: Fraunces' Softness, and Wonk always off (set explicitly: the file's own default is on; the control was removed in 1.6.1), none for the rest. */
export function variationFor(family: string, soft: number): string {
	return family === "Fraunces" ? `"SOFT" ${soft}, "WONK" 0` : "normal";
}

/**
 * The storytelling side's four parts are drawn through custom properties set on the page (`--ap-<part>-family`, `-weight`,
 * `-size`, `-var`). With no project open there are none of them, and each part's own CSS applies.
 * Sizes are stored in rem and drawn against a 16 px base. The weight is always one the family really has.
 */
export function applyAppearance(settings: ProjectSettings | undefined, root: HTMLElement = document.documentElement): void {
	applyTypeStyles(settings ?? DEFAULT_PROJECT_SETTINGS, root);
	const interfaceFont = (settings ?? DEFAULT_PROJECT_SETTINGS).typeInterfaceFont;
	for (const part of APPEARANCE_PARTS) {
		const chosen = settings?.[appearanceKey(part, "Font")];
		const font: FontFamily | undefined = chosen === undefined ? undefined : resolvedFont(chosen, interfaceFont);
		const names = ["family", "weight", "size", "var"].map((n) => `--ap-${part}-${n}`);
		if (!settings || !font) {
			for (const n of names) root.style.removeProperty(n);
			continue;
		}
		const weight = nearestWeight(font, settings![appearanceKey(part, "Weight")]);
		root.style.setProperty(names[0], FAMILY_INFO[font].css);
		root.style.setProperty(names[1], String(weight));
		root.style.setProperty(names[2], px(settings![appearanceKey(part, "Size")]));
		root.style.setProperty(names[3], variationFor(font, settings![appearanceKey(part, "Soft")]));
	}
}

/**
 * The type styles (Brief 18): `--font-interface` and `--font-writing` (the two base fonts), and for every style `--ts-<style>-family|weight|size|var`.
 * A style that names no font of its own follows its base font; the weight is always one the resolved family really has. The bar name is fixed
 * (the font only). Every rule in the app takes its text from these, never from a number of its own (a static test).
 */
function applyTypeStyles(settings: ProjectSettings, root: HTMLElement): void {
	const bases = { interface: settings.typeInterfaceFont, writing: settings.typeWritingFont };
	root.style.setProperty("--font-interface", FAMILY_INFO[bases.interface].css);
	root.style.setProperty("--font-writing", FAMILY_INFO[bases.writing].css);
	for (const style of TYPE_STYLES) {
		const look = styleLook(style, settings);
		root.style.setProperty(`--ts-${kebabId(style.id)}-family`, look.family);
		root.style.setProperty(`--ts-${kebabId(style.id)}-weight`, String(look.weight));
		root.style.setProperty(`--ts-${kebabId(style.id)}-size`, look.size);
		root.style.setProperty(`--ts-${kebabId(style.id)}-var`, look.variation);
	}
}
const kebabId = (id: string): string => id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** What a style draws as: its family (CSS), weight, size and variation settings. */
export function styleLook(style: TypeStyle, settings: ProjectSettings): { name: FontFamily; family: string; weight: number; size: string; variation: string } {
	const name = resolvedFont(settings[typeKey(style.id as never, "Font")] as never, style.base === "interface" ? settings.typeInterfaceFont : settings.typeWritingFont);
	const fixed = style.fixed === true;
	return {
		name,
		family: FAMILY_INFO[name].css,
		weight: fixed ? style.weight : nearestWeight(name, settings[typeKey(style.id as never, "Weight")] as number),
		size: `${fixed ? style.size : (settings[typeKey(style.id as never, "Size")] as number)}px`,
		variation: variationFor(name, settings[typeKey(style.id as never, "Soft")] as number),
	};
}

/** The same look as inline style, for a sample line in settings (the real titles are hidden behind the modal). */
export function sampleStyle(part: AppearancePart, settings: ProjectSettings): string {
	const font = resolvedFont(settings[appearanceKey(part, "Font")], settings.typeInterfaceFont);
	const weight = nearestWeight(font, settings[appearanceKey(part, "Weight")]);
	return `font-family: ${FAMILY_INFO[font].css}; font-weight: ${weight}; font-size: ${px(settings[appearanceKey(part, "Size")])}; font-variation-settings: ${variationFor(font, settings[appearanceKey(part, "Soft")])};`;
}
