import { mintId } from "./slug";

export interface CodexFolderEntry {
	name: string;
	order: string[];
	/**
	 * Set when this folder is also a real Codex note (a "Lore Entry" — e.g. a group — that other
	 * entries, e.g. its members, can be filed inside). The folder still has its own minted id,
	 * completely separate from this path — `linkedNotePath` is the only link between the two, so
	 * nothing that assumes "folder ids never look like file paths" (see isFolderKey) breaks.
	 */
	linkedNotePath?: string;
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
	/** Set (to the same value as CodexFolderEntry.linkedNotePath) when this folder is also a real,
	 * still-existing Codex note — clicking the row itself (not the chevron) opens it, same as a
	 * plain file row. */
	path?: string;
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

/** Recursively collects every file-path leaf referenced anywhere under `order` (root or nested
 * folders) — including each folder's own `linkedNotePath`, if it has one, so a Lore Entry folder's
 * underlying note counts as "referenced" and doesn't also show up as a duplicate unplaced file. */
export function collectReferencedPaths(folders: CodexFolders, order: string[]): Set<string> {
	const result = new Set<string>();
	const walk = (entries: string[]) => {
		for (const key of entries) {
			if (isFolderKey(folders, key)) {
				const entry = folders[key];
				if (entry.linkedNotePath) result.add(entry.linkedNotePath);
				walk(entry.order);
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
 *
 * `tagFilterMode` (vault `#tag` views): omit empty organisational placeholders and folders whose
 * real content is all filtered out, but keep a Lore Entry folder when its own linked note is
 * visible even if no children match — expanding then shows nothing, matching storyTelling's
 * empty-lore-folder click behaviour.
 */
export interface ResolveCodexTreeOptions {
	tagFilterMode?: boolean;
}

export function resolveCodexTree(
	folders: CodexFolders,
	rootOrder: string[],
	realPaths: ReadonlySet<string>,
	visiblePaths: ReadonlySet<string>,
	options?: ResolveCodexTreeOptions,
): CodexTreeFolder {
	const tagFilterMode = options?.tagFilterMode === true;
	function buildChildren(order: string[]): CodexTreeItem[] {
		const children: CodexTreeItem[] = [];
		for (const key of order) {
			if (isFolderKey(folders, key)) {
				const entry = folders[key];
				const childItems = buildChildren(entry.order);
				const hasRealContent = [...collectReferencedPaths(folders, entry.order)].some((p) => realPaths.has(p));
				const linked = entry.linkedNotePath && realPaths.has(entry.linkedNotePath) ? entry.linkedNotePath : undefined;
				if (tagFilterMode) {
					const linkedVisible = Boolean(linked && visiblePaths.has(linked));
					if (childItems.length === 0 && !linkedVisible) continue;
				} else if (childItems.length === 0 && hasRealContent) {
					continue;
				}
				// A Lore Entry folder's display name always tracks its linked note's own current
				// basename (not a separately stored folder name) — one source of truth, so renaming
				// the note can never leave the folder's label stale. Falls back to the stored `name`
				// if the linked note no longer exists (degrades to a plain organisational folder).
				children.push({
					type: "folder",
					id: key,
					name: linked ? codexBasename(linked) : entry.name,
					children: childItems,
					path: linked,
				});
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

/**
 * Depth-first walk of a Codex tree into the file order the pane shows when every folder is
 * expanded: a Lore Entry folder's linked note is emitted where the folder sits, then its
 * children; unplaced files are already at the end of `tree.children`.
 */
export function flattenCodexTreeFiles(tree: CodexTreeFolder): { path: string; name: string }[] {
	const out: { path: string; name: string }[] = [];
	const seen = new Set<string>();
	const emit = (path: string, name: string) => {
		if (seen.has(path)) return;
		seen.add(path);
		out.push({ path, name });
	};
	const walk = (items: CodexTreeItem[]) => {
		for (const item of items) {
			if (item.type === "file") {
				emit(item.path, item.name);
			} else {
				if (item.path) emit(item.path, item.name);
				walk(item.children);
			}
		}
	};
	walk(tree.children);
	return out;
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
