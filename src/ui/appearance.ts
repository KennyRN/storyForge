import { APPEARANCE_BASE_PX, APPEARANCE_PARTS, appearanceKey, type AppearancePart, type ProjectSettings } from "../app/settings";
import { FAMILY_INFO, nearestWeight } from "../core/fontFamilies";

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
	for (const part of APPEARANCE_PARTS) {
		const font = settings?.[appearanceKey(part, "Font")];
		const names = ["family", "weight", "size", "var"].map((n) => `--ap-${part}-${n}`);
		if (!settings || !font) {
			for (const n of names) root.style.removeProperty(n);
			continue;
		}
		const weight = nearestWeight(font, settings[appearanceKey(part, "Weight")]);
		root.style.setProperty(names[0], FAMILY_INFO[font].css);
		root.style.setProperty(names[1], String(weight));
		root.style.setProperty(names[2], px(settings[appearanceKey(part, "Size")]));
		root.style.setProperty(names[3], variationFor(font, settings[appearanceKey(part, "Soft")]));
	}
}

/** The same look as inline style, for a sample line in settings (the real titles are hidden behind the modal). */
export function sampleStyle(part: AppearancePart, settings: ProjectSettings): string {
	const font = settings[appearanceKey(part, "Font")];
	const weight = nearestWeight(font, settings[appearanceKey(part, "Weight")]);
	return `font-family: ${FAMILY_INFO[font].css}; font-weight: ${weight}; font-size: ${px(settings[appearanceKey(part, "Size")])}; font-variation-settings: ${variationFor(font, settings[appearanceKey(part, "Soft")])};`;
}
