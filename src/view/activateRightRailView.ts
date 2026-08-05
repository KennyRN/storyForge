import type { Plugin, WorkspaceLeaf } from "obsidian";

/**
 * Shared right-rail leaf activation for storyForge and hosted xForge siblings.
 * Ensures a leaf of `viewType` exists on the right, expands the right split, then reveals it.
 */
export async function activateRightRailView(
	plugin: Plugin,
	viewType: string,
	afterReveal?: (leaf: WorkspaceLeaf) => void | Promise<void>,
): Promise<WorkspaceLeaf | null> {
	const { workspace } = plugin.app;
	// Drop extras first — getRightLeaf(false) always inserts a new tab.
	const existing = workspace.getLeavesOfType(viewType);
	for (let i = 1; i < existing.length; i++) existing[i].detach();

	const leaf = await workspace.ensureSideLeaf(viewType, "right", {
		active: true,
		reveal: false,
		split: false,
	});
	if (!leaf) return null;

	const split = workspace.rightSplit;
	if (typeof split.expand === "function") split.expand();
	if (afterReveal) await afterReveal(leaf);
	await workspace.revealLeaf(leaf);
	return leaf;
}
