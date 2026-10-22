/**
 * Resolves which chapter of the placed spine is "current" for the project pane's chapter selector
 * (both its normal chapter-picker state and continuous mode's live position indicator). `ordered`
 * must already be the placed-only list (book.ts's getBookChapters()'s `ordered` result) — idea/
 * unplaced chapters are off-spine and never appear here.
 *
 * If `currentKey` isn't on the spine (e.g. an idea chapter is open, or nothing is open yet) this
 * falls back to the first placed chapter — same fallback the three-slot sliding window this
 * replaced used to have. `ordered` must be non-empty — callers handle the "no placed chapters at
 * all" case themselves (there is no current chapter to resolve).
 */
export function resolveCurrentChapterIndex<T>(ordered: T[], currentKey: string | null, keyOf: (item: T) => string): number {
	const foundIndex = currentKey === null ? -1 : ordered.findIndex((item) => keyOf(item) === currentKey);
	return foundIndex === -1 ? 0 : foundIndex;
}

/**
 * Where to land when a book is entered: the current chapter if it's still on the placed spine,
 * otherwise the first placed chapter. Returns null only when there are no placed chapters at all.
 */
export function resolveEntryChapter(ordered: string[], activeChapterFilename: string | null): string | null {
	if (ordered.length === 0) return null;
	if (activeChapterFilename && ordered.includes(activeChapterFilename)) return activeChapterFilename;
	return ordered[0];
}
