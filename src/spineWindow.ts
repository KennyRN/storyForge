/**
 * Pure three-chapter window over the placed spine (hand-off brief §5.2). Idea/unplaced chapters
 * are off-spine and never appear here — `ordered` must already be the placed-only list (book.ts's
 * getBookChapters()'s `ordered` result), never the unplaced one.
 */
export interface SpineWindow<T> {
	previous: T | null;
	current: T | null;
	next: T | null;
	/** No previous slot — the current chapter is the first placed one (or the spine is empty). */
	atStart: boolean;
	/** No next slot — the current chapter is the last placed one, so `[+]` replaces it there. */
	atEnd: boolean;
}

/**
 * Windows `ordered` around `currentKey`. If `currentKey` isn't on the spine (e.g. an idea chapter
 * is open, or nothing is open yet) it defaults to the first placed chapter, rather than showing an
 * empty window while chapters exist. An empty spine yields an all-null window with both boundary
 * flags set, rather than throwing.
 */
export function computeSpineWindow<T>(ordered: T[], currentKey: string | null, keyOf: (item: T) => string): SpineWindow<T> {
	if (ordered.length === 0) {
		return { previous: null, current: null, next: null, atStart: true, atEnd: true };
	}
	const foundIndex = currentKey === null ? -1 : ordered.findIndex((item) => keyOf(item) === currentKey);
	const index = foundIndex === -1 ? 0 : foundIndex;
	return {
		previous: index > 0 ? ordered[index - 1] : null,
		current: ordered[index],
		next: index < ordered.length - 1 ? ordered[index + 1] : null,
		atStart: index === 0,
		atEnd: index === ordered.length - 1,
	};
}
