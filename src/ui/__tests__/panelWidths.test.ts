import { describe, expect, it } from "vitest";
import { convertUnit, displayWidths, fromPx, isNarrowed, rangeIn, toPx, type PanelWidths } from "../panelWidths";

const base: PanelWidths = { story: 288, library: 288, lore: 400, unit: "px", linked: false };

describe("panel widths", () => {
	it("round-trips pixels through percent with no drift at any window width", () => {
		for (let win = 800; win <= 2560; win += 7) {
			for (const px of [200, 288, 333, 400, 640]) {
				expect(toPx(fromPx(px, "percent", win), "percent", win)).toBeCloseTo(px, -0.5);
				const w = convertUnit(convertUnit({ ...base, story: px }, "percent", win), "px", win);
				expect(Math.abs(w.story - px)).toBeLessThanOrEqual(Math.ceil(win / 2000));
			}
		}
	});
	it("converting units keeps the drawn width where it was", () => {
		for (const win of [1280, 1440, 1920]) {
			const before = displayWidths(base, "storytelling", false, win);
			const after = displayWidths(convertUnit(base, "percent", win), "storytelling", false, win);
			expect(Math.abs(after.left - before.left)).toBeLessThanOrEqual(1);
			expect(Math.abs(after.lore - before.lore)).toBeLessThanOrEqual(1);
		}
	});
	it("draws the set widths when the window is big enough", () => {
		expect(displayWidths(base, "storytelling", false, 1440)).toEqual({ left: 288, lore: 400 });
	});
	it("narrows the context panel first when unlinked, then the left", () => {
		expect(displayWidths(base, "storytelling", false, 940)).toEqual({ left: 288, lore: 292 });
		expect(displayWidths(base, "storytelling", false, 800)).toEqual({ left: 200, lore: 280 });
	});
	it("narrows both equally when linked", () => {
		const w = { ...base, story: 400, library: 400, lore: 400, linked: true };
		const d = displayWidths(w, "storytelling", false, 1000);
		expect(d.left).toBe(d.lore);
		expect(d.left + d.lore + 360).toBeLessThanOrEqual(1000);
	});
	it("never goes below the workspace minimum when it can help it, and never changes what is stored", () => {
		const frozen = JSON.stringify(base);
		displayWidths(base, "storytelling", false, 900);
		expect(JSON.stringify(base)).toBe(frozen);
		expect(isNarrowed(base, "storytelling", false, 900)).toBe(true);
		expect(isNarrowed(base, "storytelling", false, 1600)).toBe(false);
	});
	it("ignores a hidden context panel and uses the shown side's left width", () => {
		const w = { ...base, library: 500 };
		expect(displayWidths(w, "storyforge", true, 1440)).toEqual({ left: 500, lore: 0 });
	});
	it("bounds percent fields by the pixel limits at the window width", () => {
		const r = rangeIn("lore", false, "percent", 1440);
		expect(toPx(r.min, "percent", 1440)).toBeGreaterThanOrEqual(280);
		expect(toPx(r.max, "percent", 1440)).toBeLessThanOrEqual(640);
		expect(rangeIn("story", true, "px", 1440)).toEqual({ min: 280, max: 640 });
	});
});
