import { App, TFile, TFolder } from "obsidian";
import { CODEX_ROOT, codexFilePath } from "./paths";
import { partitionCodexNotes, findUnknownScopedNotes, type CodexNote } from "./codexPartition";
import { modifyBackstageFrontmatter } from "./writeGuard";
import {
	codexBasename,
	collectReferencedPaths,
	countFilesInFolder,
	findContainer,
	insertIntoContainer,
	isDescendantFolder,
	isFolderKey,
	mintFolderId,
	removeFromContainer,
	resolveCodexTree,
	type CodexFolderEntry,
	type CodexFolders,
	type CodexTreeFile,
	type CodexTreeFolder,
	type CodexTreeItem,
} from "./codexTree";

export { partitionCodexNotes, findUnknownScopedNotes, type CodexNote };
export { isDescendantFolder, countFilesInFolder, type CodexFolders, type CodexFolderEntry };
export type { CodexTreeFile, CodexTreeFolder, CodexTreeItem };

export type CodexViewMode = "codex" | "codexHidden";

export interface CodexFrontmatterShape {
	folders: CodexFolders;
	order: string[];
	archive: string[];
}

export interface ArchivedCodexItem {
	key: string;
	type: "file" | "folder";
	name: string;
	/** Only set for folder entries — count of real files nested anywhere within it. */
	childCount?: number;
}

const DEFAULT_CODEX_CONTENT = `---\nfolders:\norder:\narchive:\n---\n`;

function parseFolders(raw: unknown): CodexFolders {
	if (!raw || typeof raw !== "object") return {};
	const result: CodexFolders = {};
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		const name = typeof entry.name === "string" ? entry.name : id;
		const order = Array.isArray(entry.order) ? entry.order.filter((v): v is string => typeof v === "string") : [];
		result[id] = { name, order };
	}
	return result;
}

function parseStringArray(raw: unknown): string[] {
	return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

export function readCodexFrontmatter(app: App): CodexFrontmatterShape {
	const file = app.vault.getAbstractFileByPath(codexFilePath());
	if (!file) return { folders: {}, order: [], archive: [] };
	const cache = app.metadataCache.getCache(codexFilePath());
	const fm = cache?.frontmatter;
	return {
		folders: parseFolders(fm?.folders),
		order: parseStringArray(fm?.order),
		archive: parseStringArray(fm?.archive),
	};
}

/** Flat, single-pass scan — Codex notes always live directly under `Codex/` now (folders are virtual). Archived paths (direct or nested inside an archived folder) are excluded. */
export function collectCodexNotes(app: App): CodexNote[] {
	const root = app.vault.getAbstractFileByPath(CODEX_ROOT);
	if (!(root instanceof TFolder)) return [];
	const { folders, archive } = readCodexFrontmatter(app);
	const archivedPaths = collectReferencedPaths(folders, archive);

	const notes: CodexNote[] = [];
	for (const child of root.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		if (archivedPaths.has(child.path)) continue;
		const fm = app.metadataCache.getCache(child.path)?.frontmatter;
		const raw = fm?.book;
		const bookIds = Array.isArray(raw)
			? raw.filter((v): v is string => typeof v === "string")
			: typeof raw === "string"
				? [raw]
				: [];
		notes.push({ path: child.path, bookIds });
	}
	return notes;
}

export function buildCodexTree(app: App, visiblePaths: ReadonlySet<string>): CodexTreeFolder | null {
	const root = app.vault.getAbstractFileByPath(CODEX_ROOT);
	if (!(root instanceof TFolder)) return null;
	const { folders, order } = readCodexFrontmatter(app);
	const realPaths = new Set(
		root.children.filter((c): c is TFile => c instanceof TFile && c.extension === "md").map((c) => c.path),
	);
	return resolveCodexTree(folders, order, realPaths, visiblePaths);
}

export function getCodexView(app: App, currentBookId: string | null, mode: CodexViewMode): CodexTreeFolder | null {
	if (mode === "codexHidden") return null;
	const notes = collectCodexNotes(app);
	const { codex } = partitionCodexNotes(notes, currentBookId);
	return buildCodexTree(app, new Set(codex.map((n) => n.path)));
}

function uniqueChildPath(app: App, parentPath: string, baseName: string, extension = ""): string {
	let candidate = `${parentPath}/${baseName}${extension}`;
	if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	let n = 2;
	while (app.vault.getAbstractFileByPath(`${parentPath}/${baseName} ${n}${extension}`)) n++;
	return `${parentPath}/${baseName} ${n}${extension}`;
}

/** Mints a new virtual folder and registers it into `parentFolderId`'s order (or the root's, if null). Returns the new folder id. */
export async function createCodexFolder(app: App, parentFolderId: string | null): Promise<string> {
	let newId = "";
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		newId = mintFolderId("New Folder", folders);
		folders[newId] = { name: "New Folder", order: [] };
		insertIntoContainer(folders, order, parentFolderId, newId, Number.MAX_SAFE_INTEGER);
		fm.folders = folders;
		fm.order = order;
	});
	return newId;
}

export interface CreateCodexNoteOptions {
	/** Fixed basename (incl. ".md") for the new note. Defaults to auto "New Note.md"/"New Note N.md". */
	filename?: string;
	content?: string;
}

export async function createCodexNote(
	app: App,
	parentFolderId: string | null,
	options: CreateCodexNoteOptions = {},
): Promise<TFile> {
	if (!app.vault.getAbstractFileByPath(CODEX_ROOT)) await app.vault.createFolder(CODEX_ROOT);
	const path = options.filename ? `${CODEX_ROOT}/${options.filename}` : uniqueChildPath(app, CODEX_ROOT, "New Note", ".md");
	const file = await app.vault.create(path, options.content ?? "");
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		insertIntoContainer(folders, order, parentFolderId, path, Number.MAX_SAFE_INTEGER);
		fm.folders = folders;
		fm.order = order;
	});
	return file;
}

/** Renames the real file (link-safe — updates wikilinks vault-wide) so it stays in sync with wherever it's referenced; `codex.md` itself is rekeyed by the vault-rename reconciliation handler, not here. */
export async function renameCodexNoteFile(app: App, file: TFile, newBasename: string): Promise<void> {
	const trimmed = newBasename.trim();
	if (!trimmed || trimmed === file.basename) return;
	let candidate = `${CODEX_ROOT}/${trimmed}.md`;
	if (candidate !== file.path && app.vault.getAbstractFileByPath(candidate)) {
		let n = 2;
		while (app.vault.getAbstractFileByPath(`${CODEX_ROOT}/${trimmed} ${n}.md`)) n++;
		candidate = `${CODEX_ROOT}/${trimmed} ${n}.md`;
	}
	await app.fileManager.renameFile(file, candidate);
}

/** Pure metadata rename — virtual folders have no real file, so there's nothing to rename on disk. */
export async function renameCodexFolder(app: App, folderId: string, newName: string): Promise<void> {
	const trimmed = newName.trim();
	if (!trimmed) return;
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		if (!folders[folderId]) return;
		folders[folderId] = { ...folders[folderId], name: trimmed };
		fm.folders = folders;
	});
}

/** Archives a file or an entire folder (as a unit — a folder's own nested `order` is left completely intact, only its key moves into `archive`). */
export async function archiveCodexItem(app: App, key: string): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		removeFromContainer(folders, order, key);
		if (!archive.includes(key)) archive.push(key);
		fm.folders = folders;
		fm.order = order;
		fm.archive = archive;
	});
}

/** Restores a file or folder to the Codex root — a restored folder's previous nested contents come back intact since its `order` was never touched while archived. */
export async function unarchiveCodexItem(app: App, key: string): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive).filter((k) => k !== key);
		if (!order.includes(key)) order.push(key);
		fm.order = order;
		fm.archive = archive;
	});
}

/** "Remove Folder and Keep Items": deletes the folder's own entry and splices its direct children into its former position in its former parent (or root) — not recursive, nested subfolders keep their own identity. */
export async function removeCodexFolder(app: App, folderId: string): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const entry = folders[folderId];
		if (!entry) return;
		const container = findContainer(folders, order, folderId);
		delete folders[folderId];
		if (container) {
			const idx = container.order.indexOf(folderId);
			if (idx !== -1) container.order.splice(idx, 1, ...entry.order);
		}
		fm.folders = folders;
		fm.order = order;
	});
}

export function getArchivedCodexItems(app: App): ArchivedCodexItem[] {
	const { folders, archive } = readCodexFrontmatter(app);
	return archive.map((key) => {
		if (isFolderKey(folders, key)) {
			return { key, type: "folder" as const, name: folders[key].name, childCount: countFilesInFolder(folders, key) };
		}
		const file = app.vault.getAbstractFileByPath(key);
		const name = file instanceof TFile ? file.basename : codexBasename(key);
		return { key, type: "file" as const, name };
	});
}

/**
 * Rekeys every reference to `oldPath` (root order, any folder's order, archive) to `newPath`,
 * or strips it entirely if `newPath` is null (no longer a trackable flat Codex note — moved
 * out of `Codex/` or into a nested real subfolder). Called by the vault-rename reconciliation
 * handler, so this fires for renames done via Obsidian's native file explorer too, not just
 * this plugin's own rename UI.
 */
export async function rekeyCodexNotePath(app: App, oldPath: string, newPath: string | null): Promise<void> {
	if (!app.vault.getAbstractFileByPath(codexFilePath())) return;
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		const rekey = (arr: string[]): string[] =>
			newPath ? arr.map((k) => (k === oldPath ? newPath : k)) : arr.filter((k) => k !== oldPath);
		for (const id of Object.keys(folders)) {
			folders[id] = { ...folders[id], order: rekey(folders[id].order) };
		}
		fm.folders = folders;
		fm.order = rekey(order);
		fm.archive = rekey(archive);
	});
}

/**
 * Persists a drag-drop move: removes `key` from wherever it currently sits and inserts it
 * into `targetParentId`'s order (root if null), immediately before `beforeKey` — or at the
 * end if `beforeKey` is null or no longer found. `beforeKey` is looked up *after* removal, so
 * this is correct even when reordering within the same container (no index-shift arithmetic
 * needed). Folders carry their own `order` untouched — only the key itself re-parents.
 */
export async function moveCodexItem(
	app: App,
	key: string,
	type: "file" | "folder",
	targetParentId: string | null,
	beforeKey: string | null,
): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		if (type === "folder" && targetParentId !== null && isDescendantFolder(folders, key, targetParentId)) {
			return;
		}
		removeFromContainer(folders, order, key);
		const targetArr = targetParentId !== null ? (folders[targetParentId]?.order ?? order) : order;
		const idx = beforeKey ? targetArr.indexOf(beforeKey) : -1;
		targetArr.splice(idx === -1 ? targetArr.length : idx, 0, key);
		fm.folders = folders;
		fm.order = order;
	});
}
