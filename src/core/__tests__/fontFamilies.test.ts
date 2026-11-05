import { describe, expect, it } from "vitest";
import { FAMILY_INFO, FONT_FAMILIES, isFontFamily, nearestWeight } from "../fontFamilies";

describe("the font families", () => {
	it("offers eight (Sofia Sans in three widths, in Inter's place), each with Arial after it for what it lacks", () => {
		expect(FONT_FAMILIES).toHaveLength(8);
		for (const f of FONT_FAMILIES) expect(FAMILY_INFO[f].css).toMatch(new RegExp(`^"${f}", Arial,`));
	});
	it("Courier Prime has regular and bold only; only Fraunces has Softness and Wonk", () => {
		expect(FAMILY_INFO["Courier Prime"].weights).toEqual([400, 700]);
		expect(FONT_FAMILIES.filter((f) => FAMILY_INFO[f].softWonk)).toEqual(["Fraunces"]);
	});
	it("weight ranges are the files' own", () => {
		expect(FAMILY_INFO["Atkinson Hyperlegible Next"].weights).toEqual([200, 300, 400, 500, 600, 700, 800]);
		expect(FAMILY_INFO["Sofia Sans"].weights[0]).toBe(100);
		expect(FAMILY_INFO["Sofia Sans Condensed"].weights.at(-1)).toBe(1000);
		expect(FAMILY_INFO["SN Pro"].weights.at(-1)).toBe(900);
	});
	it("keeps the weight if the new font has it, else the nearest (the lighter on a tie)", () => {
		expect(nearestWeight("Sofia Sans", 600)).toBe(600);
		expect(nearestWeight("Atkinson Hyperlegible Next", 900)).toBe(800);
		expect(nearestWeight("Atkinson Hyperlegible Next", 100)).toBe(200);
		expect(nearestWeight("Courier Prime", 600)).toBe(700);
		expect(nearestWeight("Courier Prime", 550)).toBe(400);
		expect(nearestWeight("Courier Prime", 500)).toBe(400);
	});
	it("knows a family when it sees one", () => {
		expect(isFontFamily("Fraunces")).toBe(true);
		expect(isFontFamily("Comic Sans")).toBe(false);
		expect(isFontFamily(3)).toBe(false);
	});
});
