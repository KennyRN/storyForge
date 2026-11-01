/**
 * The families the author can choose for the storytelling side's four parts (decision 79), with what each file really has
 * (docs/navigator.md §1, read from the files with fontTools). Pure data and two small functions.
 */
export const FONT_FAMILIES = ["SN Pro", "Aleo", "Atkinson Hyperlegible Next", "Courier Prime", "Fraunces", "Inter"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];

export interface FamilyInfo {
	/** The weights the family can draw, in its own steps (a variable axis in hundreds, or the static files'). */
	weights: readonly number[];
	/** Fraunces only: the Softness (0–100) and Wonk (0–1) axes. */
	softWonk: boolean;
	/** The `font-family` value: the family, then Arial for the characters it lacks (decision 57), then the system sans-serif. */
	css: string;
}

const hundreds = (from: number, to: number): number[] => Array.from({ length: (to - from) / 100 + 1 }, (_, i) => from + i * 100);
const FALLBACK = 'Arial, -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif';

export const FAMILY_INFO: Record<FontFamily, FamilyInfo> = {
	"SN Pro": { weights: hundreds(200, 900), softWonk: false, css: `"SN Pro", ${FALLBACK}` },
	Aleo: { weights: hundreds(100, 900), softWonk: false, css: `"Aleo", ${FALLBACK}` },
	"Atkinson Hyperlegible Next": { weights: hundreds(200, 800), softWonk: false, css: `"Atkinson Hyperlegible Next", ${FALLBACK}` },
	"Courier Prime": { weights: [400, 700], softWonk: false, css: `"Courier Prime", ${FALLBACK}` },
	Fraunces: { weights: hundreds(100, 900), softWonk: true, css: `"Fraunces", ${FALLBACK}` },
	Inter: { weights: hundreds(100, 900), softWonk: false, css: `"Inter", ${FALLBACK}` },
};

export function isFontFamily(v: unknown): v is FontFamily {
	return typeof v === "string" && (FONT_FAMILIES as readonly string[]).includes(v);
}

/** The weight the family has nearest to `weight` (the lighter on a tie): changing font keeps the weight where it can. */
export function nearestWeight(family: FontFamily, weight: number): number {
	let best = FAMILY_INFO[family].weights[0];
	for (const w of FAMILY_INFO[family].weights) if (Math.abs(w - weight) < Math.abs(best - weight)) best = w;
	return best;
}
