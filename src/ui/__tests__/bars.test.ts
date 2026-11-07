import { describe, expect, it } from "vitest";
import { computeDataBarState, chapterScale, MAX_SCALE, roundToSignificantFigures, significantFigures } from "../overviews/bars";

describe("data bar state", () => {
	it("counts a target's significant figures", () => {
		expect(significantFigures(1500)).toBe(2);
		expect(significantFigures(2000)).toBe(1);
		expect(significantFigures(1234)).toBe(4);
	});
	it("rounds to them", () => {
		expect(roundToSignificantFigures(1493, 2)).toBe(1500);
		expect(roundToSignificantFigures(1449, 2)).toBe(1400);
	});
	it("draws no words as nothing (no sliver, decision 153), keeping the rail when there is a target", () => {
		expect(computeDataBarState(0, 1500)).toMatchObject({ kind: "empty", fillPercent: 0, ratio: 0, framed: true });
		expect(computeDataBarState(0, null)).toMatchObject({ kind: "empty", fillPercent: 0, framed: false });
	});
	it("draws no target as a plain fill against the scale, with no frame", () => {
		expect(computeDataBarState(800, null)).toMatchObject({ kind: "fill", framed: false, fillPercent: 100 });
		expect(computeDataBarState(800, 0).framed).toBe(false);
		expect(computeDataBarState(400, null, 800)).toMatchObject({ fillPercent: 50 });
	});
	it("draws a chapter at its target, at the target's precision, as meeting the frame's inner edge", () => {
		expect(computeDataBarState(1493, 1500)).toMatchObject({ kind: "fill", ratio: 1, framed: true });
		expect(computeDataBarState(1507, 1500)).toMatchObject({ kind: "fill", ratio: 1 });
	});
	it("draws under the target as a share of the frame", () => {
		expect(computeDataBarState(750, 1500)).toMatchObject({ kind: "under", ratio: 0.5, framed: true });
	});
	it("draws over the target as more than the frame", () => {
		expect(computeDataBarState(3000, 1500)).toMatchObject({ kind: "over", ratio: 2 });
	});
	it("scales every frame by the longest overrun, to a third of the row at the most (Brief 15 §1.2, Fix 11 decision 154)", () => {
		expect(chapterScale([700, 1000, 1400], 1500)).toBe(1); // none over: the row
		expect(chapterScale([1200, 1500, 3150], 1500)).toBeCloseTo(2.1, 6); // 80, 100, 210%
		expect(chapterScale([1200, 1500, 1725], 1500)).toBeCloseTo(1.15, 6);
		expect(chapterScale([4500], 1500)).toBe(3); // exactly 300%: a third of the row
		expect(chapterScale([45000], 1500)).toBe(MAX_SCALE); // the floor: never below a third
		expect(chapterScale([756, 42, 10, 0], 25)).toBe(MAX_SCALE);
		expect(chapterScale([4500], null)).toBe(1);
		expect(chapterScale([], 1500)).toBe(1);
	});
	it("a chapter past three times its target is cut; up to three times it is not", () => {
		expect(computeDataBarState(4500, 1500)).toMatchObject({ kind: "over", cut: false });
		expect(computeDataBarState(4501, 1500)).toMatchObject({ cut: true });
		expect(computeDataBarState(756, 25)).toMatchObject({ cut: true });
		expect(computeDataBarState(0, 25).cut).toBe(false);
		expect(computeDataBarState(750, 1500).cut).toBe(false);
	});
});
