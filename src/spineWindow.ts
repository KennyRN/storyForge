/**
 * Three vertically-stacked slots (top/middle/bottom) over the placed spine (hand-off brief §5.2).
 * Idea/unplaced chapters are off-spine and never appear here — `ordered` must already be the
 * placed-only list (book.ts's getBookChapters()'s `ordered` result).
 *
 * The window doesn't recentre on every step. While there's no previous chapter, the current
 * chapter stays pinned in the top slot (rather than leaving an empty slot above it) and the
 * window fills downward with whatever chapters follow — so the first and second placed chapters
 * show the identical three-chapter window, just with the highlight on a different slot; the
 * window only starts sliding once a chapter has a real previous *and* the shift is needed for
 * that chapter to be visible. At the tail end, the slot immediately after the last placed chapter
 * is the "create" tile (forward-only continuing chapter) rather than a gap.
 */
export type NavigatorSlotKind = "chapter" | "create" | "empty";

export interface NavigatorSlot<T> {
	kind: NavigatorSlotKind;
	/** Present only when kind === "chapter". */
	file: T | null;
	isCurrent: boolean;
}

export interface SpineWindow<T> {
	/** [top, middle, bottom]. */
	slots: [NavigatorSlot<T>, NavigatorSlot<T>, NavigatorSlot<T>];
}

const EMPTY_SLOT: NavigatorSlot<never> = { kind: "empty", file: null, isCurrent: false };
const CREATE_SLOT: NavigatorSlot<never> = { kind: "create", file: null, isCurrent: false };

/**
 * Windows `ordered` around `currentKey`. If `currentKey` isn't on the spine (e.g. an idea chapter
 * is open, or nothing is open yet) it defaults to the first placed chapter. `ordered` must be
 * non-empty — callers handle the "no placed chapters at all" case themselves (there is no
 * previous/current chapter to window around).
 */
export function computeSpineWindow<T>(ordered: T[], currentKey: string | null, keyOf: (item: T) => string): SpineWindow<T> {
	const foundIndex = currentKey === null ? -1 : ordered.findIndex((item) => keyOf(item) === currentKey);
	const currentIndex = foundIndex === -1 ? 0 : foundIndex;
	const hasPrevious = currentIndex > 0;
	const startIndex = hasPrevious ? currentIndex - 1 : currentIndex;
	const lastIndex = ordered.length - 1;

	const slots = [0, 1, 2].map((offset): NavigatorSlot<T> => {
		const index = startIndex + offset;
		const file = index >= 0 && index < ordered.length ? ordered[index] : undefined;
		if (file !== undefined) {
			return { kind: "chapter", file, isCurrent: index === currentIndex };
		}
		// No chapter at this position — it's the "create" tile only immediately after the last
		// placed chapter; any other gap (a spine with fewer than three chapters) is genuinely empty.
		return index - 1 === lastIndex ? CREATE_SLOT : EMPTY_SLOT;
	}) as [NavigatorSlot<T>, NavigatorSlot<T>, NavigatorSlot<T>];

	return { slots };
}
