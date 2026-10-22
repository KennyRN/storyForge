/**
 * Pure placement decision for chapter creation (hand-off brief §3 "Placement contract" / §5.3).
 * A chapter is placed purely by having its filename in chapter-order; this function decides
 * where (or whether) a freshly created chapter's filename lands in that order. It never touches
 * the vault — callers write the result via writeBookChapterOrder.
 */
export type ChapterPlacement =
	| { type: "after"; anchor: string }
	| { type: "append" }
	| { type: "unplaced" };

/**
 * Returns the next chapter-order array for `filename` given `placement`:
 * - "after": inserts immediately following `anchor`; falls back to "append" if the anchor isn't
 *   found in `currentOrder` (e.g. the anchor was itself unplaced, or has since been archived).
 * - "append": adds at the end.
 * - "unplaced": leaves `currentOrder` untouched — an idea chapter simply isn't added to the spine.
 */
export function computeChapterOrderAfterCreation(
	currentOrder: string[],
	filename: string,
	placement: ChapterPlacement,
): string[] {
	if (placement.type === "unplaced") return currentOrder;
	if (placement.type === "append") return [...currentOrder, filename];
	const anchorIndex = currentOrder.indexOf(placement.anchor);
	if (anchorIndex === -1) return [...currentOrder, filename];
	return [...currentOrder.slice(0, anchorIndex + 1), filename, ...currentOrder.slice(anchorIndex + 1)];
}
