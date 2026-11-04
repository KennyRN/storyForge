import { describe, expect, it } from "vitest";
import { computeDataBarState, frameWidthPercent, roundToSignificantFigures, significantFigures } from "../overviews/bars";

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
	it("draws no words as a sliver, in a frame when there is a target", () => {
		expect(computeDataBarState(0, 1500)).toMatchObject({ kind: "sliver", framed: true });
		expect(computeDataBarState(0, null)).toMatchObject({ kind: "sliver", framed: false });
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
	it("sizes every frame by the longest overrun (Brief 15 §1.2)", () => {
		expect(frameWidthPercent([700, 1000, 1400], 1500)).toBe(100); // none over: the row
		expect(frameWidthPercent([1200, 1500, 3150], 1500)).toBeCloseTo(100 / 2.1, 6); // 80, 100, 210%
		expect(frameWidthPercent([1200, 1500, 1725], 1500)).toBeCloseTo(100 / 1.15, 6);
		expect(frameWidthPercent([4500], 1500)).toBeCloseTo(100 / 3, 6); // no minimum
		expect(frameWidthPercent([4500], null)).toBe(100);
		expect(frameWidthPercent([], 1500)).toBe(100);
	});
});
