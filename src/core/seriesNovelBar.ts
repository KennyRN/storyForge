/**
 * Pure layout maths for the Series overview's per-novel databars (SeriesOverviewView.ts's placed
 * novel cards) — deliberately DOM-free so it can be unit tested without a live Obsidian
 * environment, the same way novelLengthBar.ts is. A simpler sibling of renderDataBar() in
 * NovelPanel.ts: no target marker, no overflow treatment, and planned novel length never enters
 * into it — each bar is only ever scaled against the longest placed novel in the series.
 */

export interface SeriesNovelBarEntry {
	/** 0-100 — this novel's total against the longest placed novel's. 0 for a novel with no words, which has no fill at all (decision 153). */
	fillPercent: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/**
 * One entry per total, in the same order. The scale is the largest total; when every total is 0
 * the scale is 0 and every entry is empty — the division is skipped entirely in that case,
 * never performed against zero.
 */
export function computeSeriesNovelBarLayout(totals: number[]): SeriesNovelBarEntry[] {
	const scale = Math.max(0, ...totals);
	return totals.map((total) => ({ fillPercent: total > 0 && scale > 0 ? clamp((total / scale) * 100, 0, 100) : 0 }));
}
