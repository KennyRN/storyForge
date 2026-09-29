import { describe, expect, it } from "vitest";
import { computeNovelLengthBarLayout } from "../view/novelLengthBar";

describe("computeNovelLengthBarLayout", () => {
	it("scales to the planned length when it is above the total written", () => {
		const layout = computeNovelLengthBarLayout([1000, 2000], 5000);
		expect(layout.scale).toBe(5000);
		expect(layout.segments).toEqual([
			{ chapterIndex: 0, leftPercent: 0, widthPercent: 20 },
			{ chapterIndex: 1, leftPercent: 20, widthPercent: 40 },
		]);
		// One boundary divider (between the two chapters) plus one trailing divider at 60% —
		// under target, so writing stops short of the bar's own end.
		expect(layout.dividerPercents).toEqual([20, 60]);
	});

	it("scales to the total written when it overruns the planned length", () => {
		const layout = computeNovelLengthBarLayout([4000, 4000], 5000);
		expect(layout.scale).toBe(8000);
		expect(layout.segments).toEqual([
			{ chapterIndex: 0, leftPercent: 0, widthPercent: 50 },
			{ chapterIndex: 1, leftPercent: 50, widthPercent: 50 },
		]);
		// Fills the bar exactly — only the boundary divider, no trailing one.
		expect(layout.dividerPercents).toEqual([50]);
	});

	it("draws no trailing divider when the total written exactly equals the planned length", () => {
		const layout = computeNovelLengthBarLayout([2500, 2500], 5000);
		expect(layout.scale).toBe(5000);
		expect(layout.dividerPercents).toEqual([50]);
	});

	it("fills the bar exactly with no trailing divider when there is no planned length", () => {
		const layout = computeNovelLengthBarLayout([1000, 3000], null);
		expect(layout.scale).toBe(4000);
		expect(layout.segments).toEqual([
			{ chapterIndex: 0, leftPercent: 0, widthPercent: 25 },
			{ chapterIndex: 1, leftPercent: 25, widthPercent: 75 },
		]);
		expect(layout.dividerPercents).toEqual([25]);
	});

	it("skips a zero-word chapter at the start, producing no segment or extra divider", () => {
		const layout = computeNovelLengthBarLayout([0, 1000, 1000], 4000);
		expect(layout.segments.map((s) => s.chapterIndex)).toEqual([1, 2]);
		expect(layout.segments[0].leftPercent).toBe(0);
		expect(layout.dividerPercents).toEqual([25, 50]);
	});

	it("skips a zero-word chapter in the middle without doubling the divider between its neighbours", () => {
		const layout = computeNovelLengthBarLayout([1000, 0, 1000], 4000);
		expect(layout.segments.map((s) => s.chapterIndex)).toEqual([0, 2]);
		expect(layout.segments).toEqual([
			{ chapterIndex: 0, leftPercent: 0, widthPercent: 25 },
			{ chapterIndex: 2, leftPercent: 25, widthPercent: 25 },
		]);
		expect(layout.dividerPercents).toEqual([25, 50]);
	});

	it("skips a zero-word chapter at the end", () => {
		const layout = computeNovelLengthBarLayout([1000, 1000, 0], 4000);
		expect(layout.segments.map((s) => s.chapterIndex)).toEqual([0, 1]);
		expect(layout.dividerPercents).toEqual([25, 50]);
	});

	it("handles a single chapter with no leading divider", () => {
		const layout = computeNovelLengthBarLayout([1000], 4000);
		expect(layout.segments).toEqual([{ chapterIndex: 0, leftPercent: 0, widthPercent: 25 }]);
		expect(layout.dividerPercents).toEqual([25]);
	});

	it("sums many chapters' segment widths to the filled percentage without drift", () => {
		const wordCounts = Array.from({ length: 37 }, (_, i) => 100 + i * 7);
		const total = wordCounts.reduce((sum, n) => sum + n, 0);
		const layout = computeNovelLengthBarLayout(wordCounts, total * 2);
		const summedWidth = layout.segments.reduce((sum, s) => sum + s.widthPercent, 0);
		const filledPercent = (total / (total * 2)) * 100;
		expect(summedWidth).toBeCloseTo(filledPercent, 9);
		expect(layout.segments).toHaveLength(wordCounts.length);
	});

	it("renders an empty bar with a planned length but no written words, without dividing by zero", () => {
		const layout = computeNovelLengthBarLayout([0, 0, 0], 5000);
		expect(layout).toEqual({ scale: 5000, segments: [], dividerPercents: [] });
	});

	it("renders an empty bar with no planned length and no written words, without dividing by zero", () => {
		const layout = computeNovelLengthBarLayout([0, 0], null);
		expect(layout).toEqual({ scale: 0, segments: [], dividerPercents: [] });
	});

	it("renders an empty bar for a book with no placed chapters at all", () => {
		const layout = computeNovelLengthBarLayout([], null);
		expect(layout).toEqual({ scale: 0, segments: [], dividerPercents: [] });
	});
});
