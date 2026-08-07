/**
 * Pure logic for codex-focus's continuous read-and-write mode (hand-off brief §2). The rendering
 * and IntersectionObserver plumbing live in view/ContinuousReadThrough.ts; this module holds only
 * the decisions that can be tested without a DOM.
 */

/** One chapter's live visibility, as fed by the position IntersectionObserver — 0 when the
 * chapter isn't currently intersecting the viewport at all. */
export interface ChapterVisibility {
	filename: string;
	ratio: number;
}

/**
 * Continuous mode's self-gate (hand-off brief §2.1): offered only once there's more than one
 * placed chapter to traverse — nothing to read continuously otherwise. Same discipline as the
 * `[+]` tile and the (future) idea inbox: a categorical gate, not a tuned number.
 */
export function canEnterContinuousMode(placedCount: number): boolean {
	return placedCount > 1;
}

/**
 * Picks whichever chapter is most visible right now, for the live position indicator and for
 * "whichever chapter they scrolled to" on exit (hand-off brief §2.3–2.4). Ties keep whichever
 * chapter was seen first (document order, since visibilities is built in spine order), which in
 * practice means the earlier of two equally-visible chapters — a reasonable, stable default.
 * Returns null only when nothing is visible yet (e.g. the instant before the first
 * IntersectionObserver callback fires).
 */
export function pickCurrentChapter(visibilities: ChapterVisibility[]): string | null {
	let best: ChapterVisibility | null = null;
	for (const v of visibilities) {
		if (v.ratio <= 0) continue;
		if (!best || v.ratio > best.ratio) best = v;
	}
	return best?.filename ?? null;
}

/**
 * Where to land on entry (hand-off brief §2.4): the reader's current chapter if it's still on the
 * placed spine, otherwise the first placed chapter. Returns null only when there are no placed
 * chapters at all (callers must already have checked `canEnterContinuousMode`).
 */
export function resolveEntryChapter(ordered: string[], activeChapterFilename: string | null): string | null {
	if (ordered.length === 0) return null;
	if (activeChapterFilename && ordered.includes(activeChapterFilename)) return activeChapterFilename;
	return ordered[0];
}
