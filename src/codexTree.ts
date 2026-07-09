import { mintId } from "./slug";

export interface CodexFolderEntry {
	name: string;
	order: string[];
}

/** Flat map of virtual folder id -> entry. Folders never nest structurally here — nesting exists only via cross-references inside `order` arrays. */
export type CodexFolders = Record<string, CodexFolderEntry>;

export interface CodexTreeFile {
	type: "file";
	name: string;
	path: string;
}

export interface CodexTreeFolder {
	type: "folder";
	id: string;
	name: string;
	children: CodexTreeItem[];
}

export type CodexTreeItem = CodexTreeFile | CodexTreeFolder;

/** An `order`/`archive` entry is a folder iff it's a key in `folders` — folder ids never contain "/" or end in ".md", real file paths always do, so no prefix scheme is needed. */
export function isFolderKey(folders: CodexFolders, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(folders, key);
}

export function mintFolderId(name: string, folders: CodexFolders): string {
	return mintId(name, Object.keys(folders));
}

export function codexBasename(path: string): string {
	const slash = path.lastIndexOf("/");
	const filename = slash === -1 ? path : path.slice(slash + 1);
	return filename.replace(/\.md$/i, "");
}

/** Recursively collects every file-path leaf referenced anywhere under `order` (root or nested folders). */
export function collectReferencedPaths(folders: CodexFolders, order: string[]): Set<string> {
	const result = new Set<string>();
	const walk = (entries: string[]) => {
		for (const key of entries) {
			if (isFolderKey(folders, key)) {
				walk(folders[key].order);
			} else {
				result.add(key);
			}
		}
	};
	walk(order);
	return result;
}

export function countFilesInFolder(folders: CodexFolders, folderId: string): number {
	const entry = folders[folderId];
	if (!entry) return 0;
	return collectReferencedPaths(folders, entry.order).size;
}

/**
 * Builds the renderable Codex tree from stored virtual structure, reconciled against
 * which real files currently exist (`realPaths`) and which are visible in the current
 * book scope (`visiblePaths`, always a subset of `realPaths`).
 *
 * Declutter parity with the old real-folder walk: a folder with real referenced content
 * somewhere in its subtree but none of it currently visible is hidden entirely; a folder
 * that's genuinely empty (no real content anywhere) stays as an organisational placeholder.
 *
 * Unplaced files (real, visible, referenced nowhere in the stored tree) are appended as
 * flat file nodes at the end of the root's children — never persisted, computed fresh here.
 * Orphaned order entries (referencing a deleted file or folder id) are silently skipped,
 * never rendered, but the caller's stored arrays are left untouched (never auto-stripped).
 */
export function resolveCodexTree(
	folders: CodexFolders,
	rootOrder: string[],
	realPaths: ReadonlySet<string>,
	visiblePaths: ReadonlySet<string>,
): CodexTreeFolder {
	function buildChildren(order: string[]): CodexTreeItem[] {
		const children: CodexTreeItem[] = [];
		for (const key of order) {
			if (isFolderKey(folders, key)) {
				const entry = folders[key];
				const childItems = buildChildren(entry.order);
				const hasRealContent = [...collectReferencedPaths(folders, entry.order)].some((p) => realPaths.has(p));
				if (childItems.length === 0 && hasRealContent) continue;
				children.push({ type: "folder", id: key, name: entry.name, children: childItems });
			} else if (visiblePaths.has(key)) {
				children.push({ type: "file", name: codexBasename(key), path: key });
			}
		}
		return children;
	}

	const rootChildren = buildChildren(rootOrder);
	const referenced = collectReferencedPaths(folders, rootOrder);
	for (const path of realPaths) {
		if (visiblePaths.has(path) && !referenced.has(path)) {
			rootChildren.push({ type: "file", name: codexBasename(path), path });
		}
	}

	return { type: "folder", id: "", name: "Codex", children: rootChildren };
}

/** Locates whichever order array (root, or some folder's) currently contains `key`. Folders are stored flatly, so this never needs to recurse. */
export function findContainer(
	folders: CodexFolders,
	rootOrder: string[],
	key: string,
): { order: string[]; folderId: string | null } | null {
	if (rootOrder.includes(key)) return { order: rootOrder, folderId: null };
	for (const [id, entry] of Object.entries(folders)) {
		if (entry.order.includes(key)) return { order: entry.order, folderId: id };
	}
	return null;
}

/** No-op if `key` isn't found anywhere (e.g. archiving an already-unplaced file). */
export function removeFromContainer(folders: CodexFolders, rootOrder: string[], key: string): void {
	const container = findContainer(folders, rootOrder, key);
	if (!container) return;
	const idx = container.order.indexOf(key);
	if (idx !== -1) container.order.splice(idx, 1);
}

export function insertIntoContainer(
	folders: CodexFolders,
	rootOrder: string[],
	parentId: string | null,
	key: string,
	index: number,
): void {
	const target = (parentId !== null ? folders[parentId]?.order : undefined) ?? rootOrder;
	const clampedIndex = Math.max(0, Math.min(index, target.length));
	target.splice(clampedIndex, 0, key);
}

/** True if `candidateId` is `ancestorId` itself or found anywhere within its subtree — the drag/reparent cycle guard. */
export function isDescendantFolder(folders: CodexFolders, ancestorId: string, candidateId: string): boolean {
	if (ancestorId === candidateId) return true;
	const entry = folders[ancestorId];
	if (!entry) return false;
	for (const key of entry.order) {
		if (isFolderKey(folders, key) && isDescendantFolder(folders, key, candidateId)) return true;
	}
	return false;
}
