import { describe, expect, it } from "vitest";
import { computeSeriesNovelBarLayout } from "../seriesNovelBar";

describe("computeSeriesNovelBarLayout", () => {
	it("fills the longest novel to 100% and scales the others proportionally", () => {
		expect(computeSeriesNovelBarLayout([1000, 4000, 2000])).toEqual([
			{ fillPercent: 25 },
			{ fillPercent: 100 },
			{ fillPercent: 50 },
		]);
	});

	it("gives a zero-word novel no fill alongside others", () => {
		expect(computeSeriesNovelBarLayout([3000, 0, 1500])).toEqual([
			{ fillPercent: 100 },
			{ fillPercent: 0 },
			{ fillPercent: 50 },
		]);
	});

	it("gives every novel no fill when all are at zero words, without dividing by zero", () => {
		const layout = computeSeriesNovelBarLayout([0, 0, 0]);
		expect(layout).toEqual([
			{ fillPercent: 0 },
			{ fillPercent: 0 },
			{ fillPercent: 0 },
		]);
		for (const entry of layout) expect(Number.isFinite(entry.fillPercent)).toBe(true);
	});

	it("fills a single placed novel with words to 100%", () => {
		expect(computeSeriesNovelBarLayout([1234])).toEqual([{ fillPercent: 100 }]);
	});

	it("fills two novels tied for longest to 100%", () => {
		expect(computeSeriesNovelBarLayout([5000, 2500, 5000])).toEqual([
			{ fillPercent: 100 },
			{ fillPercent: 50 },
			{ fillPercent: 100 },
		]);
	});
});
