import { App, TFile, TFolder } from "obsidian";
import { CODEX_ROOT } from "./paths";
import { partitionCodexNotes, findUnknownScopedNotes, type CodexNote } from "./codexPartition";

export { partitionCodexNotes, findUnknownScopedNotes, type CodexNote };

export type CodexViewMode = "codex" | "hidden";

export interface CodexTreeFile {
	type: "file";
	name: string;
	path: string;
}

export interface CodexTreeFolder {
	type: "folder";
	name: string;
	path: string;
	children: CodexTreeItem[];
}

export type CodexTreeItem = CodexTreeFile | CodexTreeFolder;

export function collectCodexNotes(app: App): CodexNote[] {
	const root = app.vault.getAbstractFileByPath(CODEX_ROOT);
	if (!(root instanceof TFolder)) return [];

	const notes: CodexNote[] = [];
	const walk = (folder: TFolder) => {
		for (const child of folder.children) {
			if (child instanceof TFolder) {
				walk(child);
			} else if (child instanceof TFile && child.extension === "md") {
				const fm = app.metadataCache.getCache(child.path)?.frontmatter;
				const raw = fm?.book;
				const bookIds = Array.isArray(raw)
					? raw.filter((v): v is string => typeof v === "string")
					: typeof raw === "string"
						? [raw]
						: [];
				notes.push({ path: child.path, bookIds });
			}
		}
	};
	walk(root);
	return notes;
}

/** True if this subtree contains no notes at all (not merely none visible in the current view). */
function hasAnyMarkdownFile(folder: TFolder): boolean {
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension === "md") return true;
		if (child instanceof TFolder && hasAnyMarkdownFile(child)) return true;
	}
	return false;
}

function pruneFolder(folder: TFolder, visiblePaths: ReadonlySet<string>): CodexTreeFolder | null {
	const children: CodexTreeItem[] = [];
	for (const child of folder.children) {
		if (child instanceof TFolder) {
			const pruned = pruneFolder(child, visiblePaths);
			if (pruned) children.push(pruned);
		} else if (child instanceof TFile && child.extension === "md" && visiblePaths.has(child.path)) {
			children.push({ type: "file", name: child.basename, path: child.path });
		}
	}
	// A folder with real notes that are all filtered out of this view stays hidden
	// (declutter). A folder that's genuinely empty everywhere shows through, so it
	// can serve as an organisational placeholder (e.g. an empty "Settlements" folder
	// set up ahead of having any settlements yet).
	if (children.length === 0 && hasAnyMarkdownFile(folder)) return null;
	return { type: "folder", name: folder.name, path: folder.path, children };
}

export function buildCodexTree(app: App, visiblePaths: ReadonlySet<string>): CodexTreeFolder | null {
	const root = app.vault.getAbstractFileByPath(CODEX_ROOT);
	if (!(root instanceof TFolder)) return null;
	return pruneFolder(root, visiblePaths);
}

export function getCodexView(app: App, currentBookId: string | null, mode: CodexViewMode): CodexTreeFolder | null {
	if (mode === "hidden") return null;
	const notes = collectCodexNotes(app);
	const { codex } = partitionCodexNotes(notes, currentBookId);
	return buildCodexTree(app, new Set(codex.map((n) => n.path)));
}
