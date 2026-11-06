/**
 * The type styles (Brief 18, decision 123): every piece of text in the app is drawn by one named style, and the author can change a style's
 * font, weight and size in Settings ▸ Appearance. Two base fonts (Interface and Writing) are what the styles follow unless one names its own.
 * Pure data and small functions; the drawing is `ui/appearance.ts`, the sizes' ranges are docs/type-styles.md §4.
 */
import { FAMILY_INFO, isFontFamily, nearestWeight, type FontFamily } from "./fontFamilies";

export type BaseFont = "interface" | "writing";
export const BASE_FONTS: readonly BaseFont[] = ["interface", "writing"];
/** The value a style's font holds when it follows its base font. */
export const FOLLOW = "base";
export type StyleFont = FontFamily | typeof FOLLOW;

export interface TypeStyle {
	id: string;
	name: string;
	/** Which base font it follows until it names its own. */
	base: BaseFont;
	weight: number;
	/** Pixels. */
	size: number;
	/** The author can change the size and weight (the bar name is fixed: the font only). */
	fixed?: boolean;
	range: readonly [number, number];
	/** Where it is used, for the Settings sample. */
	sample: string;
}

/** The Interface styles, then the Writing styles. The Navigator's four parts (`APPEARANCE_PARTS`) are styles too, with their own stored keys and ranges (decisions 79 to 84). */
export const TYPE_STYLES = [
	{ id: "display", name: "Display", base: "interface", weight: 600, size: 28, range: [20, 40], sample: "Welcome to storyForge" },
	{ id: "title", name: "Title", base: "interface", weight: 600, size: 20, range: [16, 28], sample: "The Lantern Cycle" },
	{ id: "heading", name: "Dialog heading", base: "interface", weight: 600, size: 15, range: [13, 22], sample: "Settings" },
	{ id: "smallHeading", name: "Small heading", base: "interface", weight: 600, size: 12, range: [11, 18], sample: "Placed" },
	{ id: "body", name: "Body", base: "interface", weight: 400, size: 13, range: [11, 16], sample: "Chapter 1: The Storm" },
	{ id: "bodyBold", name: "Body bold", base: "interface", weight: 600, size: 13, range: [11, 16], sample: "Book 1: The Harbour Wakes" },
	{ id: "hint", name: "Hint", base: "interface", weight: 400, size: 12, range: [11, 14], sample: "Nothing here yet" },
	{ id: "barName", name: "Bar name", base: "interface", weight: 700, size: 19, fixed: true, range: [19, 19], sample: "The Storm" },
	{ id: "prose", name: "Prose", base: "writing", weight: 400, size: 20, range: [14, 32], sample: "The harbour woke slowly." },
	{ id: "reading", name: "Reading", base: "writing", weight: 400, size: 15, range: [12, 22], sample: "The harbour woke slowly." },
	{ id: "fields", name: "Fields", base: "writing", weight: 400, size: 14, range: [11, 20], sample: "A plot note, a synopsis, a description." },
] as const satisfies readonly TypeStyle[];
export type TypeStyleId = (typeof TYPE_STYLES)[number]["id"];
export const INTERFACE_STYLES = TYPE_STYLES.filter((s) => s.base === "interface");
export const WRITING_STYLES = TYPE_STYLES.filter((s) => s.base === "writing");

/** The base fonts' defaults: SN Pro for both until the author chooses (decision 123); a stored value that no longer exists draws the default. */
export const BASE_DEFAULTS: Record<BaseFont, FontFamily> = { interface: "SN Pro", writing: "SN Pro" };

export const styleOf = (id: string): TypeStyle => TYPE_STYLES.find((s) => s.id === id) as TypeStyle;
export const isStyleFont = (v: unknown): v is StyleFont => v === FOLLOW || isFontFamily(v);
export const isStyleSize = (id: TypeStyleId, v: unknown): boolean => {
	const [lo, hi] = styleOf(id).range;
	return typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
};

/** The family a style draws: its own, else its base font's. */
export function resolvedFont(own: StyleFont, base: FontFamily): FontFamily {
	return own === FOLLOW ? base : own;
}
/** The weight the resolved family really has, nearest the chosen one. */
export const styleWeight = (family: FontFamily, weight: number): number => nearestWeight(family, weight);
export const familyCss = (family: FontFamily): string => FAMILY_INFO[family].css;
