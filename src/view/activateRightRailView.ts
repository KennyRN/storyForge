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
	let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
	if (!leaf) {
		leaf = workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: viewType, active: true });
	}
	if (!leaf) return null;

	const split = workspace.rightSplit;
	if (typeof split.expand === "function") split.expand();
	if (afterReveal) await afterReveal(leaf);
	await workspace.revealLeaf(leaf);
	return leaf;
}
