/**
 * Pure layout math for the Novel overview page's novel length bar (NovelPanel.ts's
 * renderNovelPanel, wide layout only) — deliberately DOM-free so it can be unit tested without a
 * live Obsidian environment. See renderDataBar() in NovelPanel.ts for the sibling per-chapter data
 * bar this mirrors the "plain positioned divs, inline left/width percentages" approach from.
 */

export interface NovelLengthBarSegment {
	/** Index into the ordered placed-chapter list this segment represents. */
	chapterIndex: number;
	leftPercent: number;
	widthPercent: number;
}

export interface NovelLengthBarLayout {
	/** 0 when there is nothing to scale against (no planned length and no written words) — an
	 * empty bar, never used as a divisor in that case. */
	scale: number;
	/** One entry per chapter with more than 0 words, in ordered (novel.md) order. */
	segments: NovelLengthBarSegment[];
	/** 0-100 percent positions, one per boundary between two adjacent drawn segments plus one
	 * trailing divider marking where writing stops — omitted when the segments already fill the
	 * bar exactly (overrun, or no planned length). */
	dividerPercents: number[];
}

/**
 * The bar's full width represents whichever is larger: the planned novel length or the total
 * words actually written across placed chapters (an unset planned length counts as zero) — so
 * under target the unfilled remainder is plain background, and on overrun (or with no planned
 * length at all) the chapters fill the bar exactly, with no marker or overrun treatment.
 *
 * Each drawn segment's left/width is a fresh division against the running word total, not a sum
 * of already-computed percentages, so segment widths add up to the filled percentage without
 * compounding floating-point drift across many chapters. Zero-word chapters are skipped before
 * any division runs and produce neither a segment nor a divider, wherever they fall in the list.
 */
export function computeNovelLengthBarLayout(
	wordCounts: number[],
	plannedLength: number | null,
): NovelLengthBarLayout {
	const totalWritten = wordCounts.reduce((sum, n) => sum + n, 0);
	const scale = Math.max(plannedLength ?? 0, totalWritten);
	if (scale <= 0) return { scale: 0, segments: [], dividerPercents: [] };

	const segments: NovelLengthBarSegment[] = [];
	const dividerPercents: number[] = [];
	let cumulativeWords = 0;
	for (let i = 0; i < wordCounts.length; i++) {
		const words = wordCounts[i];
		if (words <= 0) continue;
		const leftPercent = (cumulativeWords / scale) * 100;
		// A divider marks the boundary with the *previous* drawn segment — the first drawn segment
		// never gets a leading one, whatever came before it in the chapter list.
		if (segments.length > 0) dividerPercents.push(leftPercent);
		segments.push({ chapterIndex: i, leftPercent, widthPercent: (words / scale) * 100 });
		cumulativeWords += words;
	}
	// Overrun and "no planned length" both force scale === totalWritten, so filledPercent is
	// exactly 100 there — the trailing divider (marking where writing stops) is only meaningful,
	// and only drawn, in the strict under-target case.
	const filledPercent = (cumulativeWords / scale) * 100;
	if (segments.length > 0 && filledPercent < 100) dividerPercents.push(filledPercent);
	return { scale, segments, dividerPercents };
}
