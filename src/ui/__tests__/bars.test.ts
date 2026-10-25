import { describe, expect, it } from "vitest";
import { computeDataBarState, roundToSignificantFigures, significantFigures } from "../overviews/bars";

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
	it("draws no words as a sliver, without a marker", () => {
		expect(computeDataBarState(0, 1500).kind).toBe("sliver");
	});
	it("draws no target as plain fill", () => {
		expect(computeDataBarState(800, null).kind).toBe("fill");
		expect(computeDataBarState(800, 0).kind).toBe("fill");
	});
	it("draws a chapter at its target, at the target's precision, as plain fill", () => {
		expect(computeDataBarState(1493, 1500).kind).toBe("fill");
		expect(computeDataBarState(1507, 1500).kind).toBe("fill");
	});
	it("draws under the target with the marker where the plan sits", () => {
		const s = computeDataBarState(750, 1500);
		expect(s).toMatchObject({ kind: "under", fillPercent: 50, targetPercent: 100 });
	});
	it("draws over the target as blue to the target, then orange to the words", () => {
		const s = computeDataBarState(3000, 1500);
		expect(s).toMatchObject({ kind: "over", fillPercent: 50, targetPercent: 50, overPercent: 100 });
	});
	it("scales against a longer chapter", () => {
		expect(computeDataBarState(750, 1500, 3000)).toMatchObject({ fillPercent: 25, targetPercent: 50 });
	});
});
