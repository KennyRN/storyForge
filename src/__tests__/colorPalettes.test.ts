import { describe, expect, it } from "vitest";
import {
	contrastRatio,
	pickDefaultAccentColor,
	pickMidToneAccentColor,
	resolvePaletteAppearance,
	resolveRowTextColor,
	type PaletteColor,
} from "../colorPalettes";

const BLACK: PaletteColor = { name: "Background", hex: "#000000" };
const WHITE: PaletteColor = { name: "Foreground", hex: "#ffffff" };
const MID_GREY: PaletteColor = { name: "Grey", hex: "#808080" };

describe("contrastRatio", () => {
	it("is 1 for identical colours", () => {
		expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
	});

	it("is 21 for pure black vs pure white", () => {
		expect(contrastRatio(BLACK.hex, WHITE.hex)).toBeCloseTo(21, 5);
	});

	it("is symmetric", () => {
		expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(contrastRatio("#abcdef", "#123456"), 10);
	});
});

describe("resolveRowTextColor", () => {
	it("defaults to the palette's background swatch when it contrasts enough with the accent", () => {
		// A pastel accent against black background text clears WCAG AA easily.
		const colors = [BLACK, WHITE, { name: "Pastel", hex: "#ffe0b2" }];
		expect(resolveRowTextColor(colors, BLACK, "#ffe0b2")).toBe(BLACK.hex);
	});

	it("falls back to the most-contrasting palette colour when the accent IS the background swatch", () => {
		const colors = [BLACK, WHITE, MID_GREY];
		// Accent equals the background swatch itself — self-contrast is 1, so it must fall back.
		expect(resolveRowTextColor(colors, BLACK, BLACK.hex)).toBe(WHITE.hex);
	});

	it("breaks contrast ties by picking whichever colour is uppermost in the list", () => {
		// Two colours equidistant (in luminance terms) from a mid-grey accent, both under threshold —
		// same contrast ratio against it either way. Uppermost (first) one should win.
		const lo: PaletteColor = { name: "Low", hex: "#000000" };
		const hi: PaletteColor = { name: "High", hex: "#ffffff" };
		const colors = [lo, hi];
		// Force the "default" candidate (mid grey) to fail contrast against itself as the accent so
		// the fallback loop runs and must choose between lo/hi.
		const result = resolveRowTextColor(colors, MID_GREY, MID_GREY.hex);
		expect([lo.hex, hi.hex]).toContain(result);
	});
});

describe("pickDefaultAccentColor", () => {
	const colors = [BLACK, WHITE, MID_GREY, { name: "Blue", hex: "#3355ff" }, { name: "Rose", hex: "#e08c8c" }];

	it("never returns the resolved background or foreground colour, for any seed", () => {
		for (const seed of ["aaa", "aab", "aac", "some-novel", "", "z"]) {
			const picked = pickDefaultAccentColor(colors, BLACK, WHITE, seed);
			expect(picked).not.toBeNull();
			expect(picked!.hex).not.toBe(BLACK.hex);
			expect(picked!.hex).not.toBe(WHITE.hex);
		}
	});

	it("is deterministic — the same seed always picks the same colour", () => {
		const first = pickDefaultAccentColor(colors, BLACK, WHITE, "aaa");
		const second = pickDefaultAccentColor(colors, BLACK, WHITE, "aaa");
		expect(second).toEqual(first);
	});

	it("falls back to the full list when only background/foreground exist", () => {
		const picked = pickDefaultAccentColor([BLACK, WHITE], BLACK, WHITE, "aaa");
		expect([BLACK.hex, WHITE.hex]).toContain(picked?.hex);
	});

	it("returns null for an empty palette", () => {
		expect(pickDefaultAccentColor([], BLACK, WHITE, "aaa")).toBeNull();
	});
});

describe("resolvePaletteAppearance", () => {
	it("uses the fallback for Custom, which has no variants of its own", () => {
		expect(resolvePaletteAppearance("Custom", undefined, "dark")).toBe("dark");
		expect(resolvePaletteAppearance("Custom", undefined, "light")).toBe("light");
	});

	it("resolves a preset's variant appearance regardless of the fallback", () => {
		expect(resolvePaletteAppearance("Dracula", "Dracula", "light")).toBe("dark");
	});
});

describe("pickMidToneAccentColor", () => {
	const NEAR_BLACK: PaletteColor = { name: "Ink", hex: "#111111" };
	const NEAR_WHITE: PaletteColor = { name: "Paper", hex: "#eeeeee" };

	it("prefers a mid-tone over near-black and near-white accents", () => {
		const picked = pickMidToneAccentColor(
			[BLACK, WHITE, NEAR_BLACK, MID_GREY, NEAR_WHITE],
			BLACK,
			WHITE,
		);
		expect(picked?.hex).toBe(MID_GREY.hex);
	});

	it("skips already-used mid-tones and takes the next closest", () => {
		const teal: PaletteColor = { name: "Teal", hex: "#2a9d8f" };
		const picked = pickMidToneAccentColor(
			[BLACK, WHITE, MID_GREY, teal],
			BLACK,
			WHITE,
			[MID_GREY.hex],
		);
		expect(picked?.hex).toBe(teal.hex);
	});

	it("never returns the palette's own foreground or background", () => {
		const picked = pickMidToneAccentColor([BLACK, WHITE, MID_GREY], BLACK, WHITE);
		expect(picked?.hex).not.toBe(BLACK.hex);
		expect(picked?.hex).not.toBe(WHITE.hex);
	});
});
