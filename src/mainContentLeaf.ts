/**
 * Picks the one center-pane tab storyForge navigation reuses.
 *
 * `workspace.getLeaf(false)` returns the active leaf, which is often a sidebar
 * (storyTelling is the default left landing; Story Context is activated on the
 * right at startup). Opening a chapter into that leaf replaces the panel instead
 * of showing the file in the central editor.
 */

export interface MainContentLeaf {
	getRoot(): unknown;
}

export interface MainContentWorkspace<T extends MainContentLeaf = MainContentLeaf> {
	rootSplit: unknown;
	getLeafById(id: string): T | null;
	getMostRecentLeaf(root?: unknown): T | null;
	getLeaf(newLeaf?: boolean | string): T;
}

export function isRootSplitLeaf(workspace: { rootSplit: unknown }, leaf: MainContentLeaf): boolean {
	return leaf.getRoot() === workspace.rootSplit;
}

/** Tracked leaf only if it still exists *and* is still in the main editor split. */
export function existingMainContentLeaf<T extends MainContentLeaf>(
	workspace: MainContentWorkspace<T>,
	trackedId: string | null,
): T | null {
	if (!trackedId) return null;
	const existing = workspace.getLeafById(trackedId);
	if (!existing || !isRootSplitLeaf(workspace, existing)) return null;
	return existing;
}

/**
 * Reuse the tracked center tab when it is still valid; otherwise the most recent
 * root-split leaf; otherwise create a new tab in the root split (`getLeaf("tab")`).
 */
export function resolveMainContentLeaf<T extends MainContentLeaf>(
	workspace: MainContentWorkspace<T>,
	trackedId: string | null,
): T {
	const existing = existingMainContentLeaf(workspace, trackedId);
	if (existing) return existing;

	const recent = workspace.getMostRecentLeaf(workspace.rootSplit);
	if (recent && isRootSplitLeaf(workspace, recent)) return recent;

	return workspace.getLeaf("tab");
}
