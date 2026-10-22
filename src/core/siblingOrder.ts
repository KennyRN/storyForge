// Pure helpers for drag-reordering a sibling group inside a flat ranking.

/** Places `newSiblingOrder` as a contiguous block in `pageOrder`, keeping keys that aren't in that sibling set. */
export function applySiblingReorder(pageOrder: readonly string[], newSiblingOrder: readonly string[]): string[] {
	const siblingSet = new Set(newSiblingOrder);
	const firstIdx = pageOrder.findIndex((key) => siblingSet.has(key));
	if (firstIdx === -1) return [...pageOrder, ...newSiblingOrder];
	const before = pageOrder.slice(0, firstIdx).filter((key) => !siblingSet.has(key));
	const after = pageOrder.slice(firstIdx).filter((key) => !siblingSet.has(key));
	return [...before, ...newSiblingOrder, ...after];
}

export function siblingOrderAfterMove(siblings: readonly string[], draggedKey: string, beforeKey: string | null): string[] {
	if (beforeKey === draggedKey) return [...siblings];
	const without = siblings.filter((key) => key !== draggedKey);
	if (beforeKey === null) return [...without, draggedKey];
	const index = without.indexOf(beforeKey);
	if (index === -1) return [...without, draggedKey];
	return [...without.slice(0, index), draggedKey, ...without.slice(index)];
}
