import type { Plugin, WorkspaceLeaf } from "obsidian";

/** Opens (or focuses) a right-rail ItemView by type, expanding the right split. */
export async function activateRightRailView(
	plugin: Plugin,
	viewType: string,
	onReady?: (leaf: WorkspaceLeaf) => void,
): Promise<void> {
	const { workspace } = plugin.app;
	let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
	if (!leaf) {
		leaf = workspace.getRightLeaf(false);
		await leaf?.setViewState({ type: viewType, active: true });
	}
	if (!leaf) return;
	const split = workspace.rightSplit;
	if (typeof split.expand === "function") split.expand();
	onReady?.(leaf);
	await workspace.revealLeaf(leaf);
}
