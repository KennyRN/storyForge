import { App, TFile, TFolder, type FrontMatterCache } from "obsidian";
import { ICON_MAP_PIN, ICON_PERSON_2_FILL, ICON_PERSON_FILL } from "./icons";
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
	types: Record<string, string>;
	/** Codex-entry-path -> assigned codexTags ids (tagRegistry.ts). Independent of `types` — an
	 * entry's type is singular and drives its icon and the tree's type filter
	 * (filterVisiblePathsByType); tags are multi-valued, freeform, and not yet wired to any
	 * filtering of their own (assignable via BottomPanel.ts's "Tags..." menu item). */
	tags: Record<string, string[]>;
}

/** The raw, unsanitized on-disk shape of codex.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
export interface RawCodexFrontmatter extends FrontMatterCache {
	folders?: unknown;
	order?: unknown;
	archive?: unknown;
	types?: unknown;
	tags?: unknown;
}

export interface CodexTypeOption {
	type: string;
	label: string;
	icon: string;
}

/** Built-in Codex types. Hosted siblings add more via `registerCodexType`. */
export const BUILTIN_CODEX_TYPES: readonly CodexTypeOption[] = [
	{ type: "person", label: "Person", icon: ICON_PERSON_FILL },
	{ type: "place", label: "Place", icon: ICON_MAP_PIN },
	{ type: "populace", label: "Populace", icon: ICON_PERSON_2_FILL },
];

/**
 * Live assignable Codex entry types ("Set as..."), in menu order.
 * Seeded with builtins; mutated by `registerCodexType` for xForge siblings.
 */
export const CODEX_TYPES: CodexTypeOption[] = BUILTIN_CODEX_TYPES.map((t) => ({ ...t }));

export function getCodexTypes(): readonly CodexTypeOption[] {
	return CODEX_TYPES;
}

/**
 * Types registered by hosted sibling plugins via `registerCodexType`, tracked separately from the
 * user-persisted registry (tagRegistry.ts). This is deliberately not inferred by diffing against
 * CODEX_TYPES's current contents — a type present in CODEX_TYPES but absent from the newly
 * resolved persisted list is far more often "the user just deleted this" than "this is a sibling
 * registration", and conflating the two would resurrect a deleted type on the next codexTypes edit.
 */
const SIBLING_REGISTERED_TYPES = new Map<string, CodexTypeOption>();

/** Idempotent: updates label/icon if `type` already registered. */
export function registerCodexType(opt: CodexTypeOption): void {
	const type = opt.type.trim();
	if (!type) throw new Error("registerCodexType: type is required");
	const label = opt.label.trim() || type;
	const icon = opt.icon.trim();
	if (!icon) throw new Error("registerCodexType: icon is required");
	SIBLING_REGISTERED_TYPES.set(type, { type, label, icon });
	const existing = CODEX_TYPES.find((t) => t.type === type);
	if (existing) {
		existing.label = label;
		existing.icon = icon;
		return;
	}
	CODEX_TYPES.push({ type, label, icon });
}

export function codexTypeIcon(type: string): string | null {
	return CODEX_TYPES.find((t) => t.type === type)?.icon ?? null;
}

/**
 * Replaces CODEX_TYPES's contents with `resolved` (the persisted, user-editable registry from
 * tagRegistry.ts, already resolved to real icon ids), re-adding any type a sibling plugin
 * registered via `registerCodexType` that isn't present in `resolved` — sibling registrations are
 * never persisted, so they'd otherwise be lost on this replace. Called by tagRegistry.ts only;
 * kept here (rather than tagRegistry.ts importing and mutating CODEX_TYPES directly) so this
 * module's only import direction is outward to tagRegistry.ts, never the reverse.
 */
export function loadCodexTypesFromRegistry(resolved: readonly CodexTypeOption[]): void {
	const siblingOnly = Array.from(SIBLING_REGISTERED_TYPES.values()).filter(
		(s) => !resolved.some((r) => r.type === s.type),
	);
	CODEX_TYPES.length = 0;
	CODEX_TYPES.push(...resolved.map((t) => ({ ...t })), ...siblingOnly.map((t) => ({ ...t })));
}

export interface ArchivedCodexItem {
	key: string;
	type: "file" | "folder";
	name: string;
	/** Only set for folder entries — count of real files nested anywhere within it. */
	childCount?: number;
}

export const DEFAULT_CODEX_CONTENT = `---\nfolders:\norder:\narchive:\ntypes:\n---\n`;

function parseFolders(raw: unknown): CodexFolders {
	if (!raw || typeof raw !== "object") return {};
	const result: CodexFolders = {};
	for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		const name = typeof entry.name === "string" ? entry.name : id;
		const order = Array.isArray(entry.order) ? entry.order.filter((v): v is string => typeof v === "string") : [];
		const linkedNotePath = typeof entry.linkedNotePath === "string" ? entry.linkedNotePath : undefined;
		result[id] = linkedNotePath ? { name, order, linkedNotePath } : { name, order };
	}
	return result;
}

function parseStringArray(raw: unknown): string[] {
	return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

function parseTypes(raw: unknown): Record<string, string> {
	if (!raw || typeof raw !== "object") return {};
	const result: Record<string, string> = {};
	for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === "string") result[path] = value;
	}
	return result;
}

function parseTagsMap(raw: unknown): Record<string, string[]> {
	if (!raw || typeof raw !== "object") return {};
	const result: Record<string, string[]> = {};
	for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
		const ids = parseStringArray(value);
		if (ids.length > 0) result[path] = ids;
	}
	return result;
}

export function readCodexFrontmatter(app: App): CodexFrontmatterShape {
	const file = app.vault.getAbstractFileByPath(codexFilePath());
	if (!file) return { folders: {}, order: [], archive: [], types: {}, tags: {} };
	const cache = app.metadataCache.getCache(codexFilePath());
	const fm = cache?.frontmatter;
	return {
		folders: parseFolders(fm?.folders),
		order: parseStringArray(fm?.order),
		archive: parseStringArray(fm?.archive),
		types: parseTypes(fm?.types),
		tags: parseTagsMap(fm?.tags),
	};
}

export function getCodexEntryType(app: App, path: string): string | null {
	return readCodexFrontmatter(app).types[path] ?? null;
}

export async function setCodexEntryType(app: App, path: string, type: string): Promise<void> {
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const types = parseTypes(fm.types);
		types[path] = type;
		fm.types = types;
	});
}

/** A Codex entry's assigned codexTags ids (tagRegistry.ts) — empty if untagged. */
export function getCodexEntryTags(app: App, path: string): string[] {
	return readCodexFrontmatter(app).tags[path] ?? [];
}

/** Overwrites a Codex entry's full codexTags set. An empty array clears tags entirely (removes the entry from the map rather than storing `[]`). */
export async function writeCodexEntryTags(app: App, path: string, tagIds: string[]): Promise<void> {
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const tags = parseTagsMap(fm.tags);
		if (tagIds.length > 0) tags[path] = tagIds;
		else delete tags[path];
		fm.tags = tags;
	});
}

/**
 * Restricts `visiblePaths` to those carrying at least one of `tagIds` (OR semantics — selecting
 * several tags shows anything matching any of them, i.e. "a group of tags"). Returns `visiblePaths`
 * unchanged when `tagIds` is empty — no filter selected means show everything, same as today.
 * Folders are handled downstream by resolveCodexTree's own declutter logic (a folder with no
 * currently-visible descendant collapses out of the tree on its own).
 */
export function filterVisiblePathsByTags(
	app: App,
	visiblePaths: ReadonlySet<string>,
	tagIds: ReadonlySet<string>,
): ReadonlySet<string> {
	if (tagIds.size === 0) return visiblePaths;
	const { tags } = readCodexFrontmatter(app);
	const result = new Set<string>();
	for (const path of visiblePaths) {
		const entryTags = tags[path];
		if (entryTags?.some((id) => tagIds.has(id))) result.add(path);
	}
	return result;
}

/**
 * Restricts `visiblePaths` to those whose assigned type is in `typeIds` (OR semantics — selecting
 * several types shows anything matching any of them, i.e. "a group of types"). Returns
 * `visiblePaths` unchanged when `typeIds` is empty — no filter selected means show everything.
 * Folders are handled downstream by resolveCodexTree's own declutter logic (a folder with no
 * currently-visible descendant collapses out of the tree on its own).
 */
export function filterVisiblePathsByType(
	app: App,
	visiblePaths: ReadonlySet<string>,
	typeIds: ReadonlySet<string>,
): ReadonlySet<string> {
	if (typeIds.size === 0) return visiblePaths;
	const { types } = readCodexFrontmatter(app);
	const result = new Set<string>();
	for (const path of visiblePaths) {
		const type = types[path];
		if (type && typeIds.has(type)) result.add(path);
	}
	return result;
}

/** Codex entries of the given type, scoped like the Codex pane itself (universal + this book's own, excluding archived). */
export function getCodexEntriesByType(
	app: App,
	type: string,
	currentBookId: string | null,
): { path: string; name: string }[] {
	const { types } = readCodexFrontmatter(app);
	const { codex } = partitionCodexNotes(collectCodexNotes(app), currentBookId);
	return codex.filter((note) => types[note.path] === type).map((note) => ({ path: note.path, name: codexBasename(note.path) }));
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
		const raw: unknown = fm?.book;
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

export function getCodexView(
	app: App,
	currentBookId: string | null,
	mode: CodexViewMode,
	typeFilter?: ReadonlySet<string>,
): CodexTreeFolder | null {
	if (mode === "codexHidden") return null;
	const notes = collectCodexNotes(app);
	const { codex } = partitionCodexNotes(notes, currentBookId);
	const visiblePaths = new Set(codex.map((n) => n.path));
	return buildCodexTree(app, typeFilter ? filterVisiblePathsByType(app, visiblePaths, typeFilter) : visiblePaths);
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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

/**
 * Idempotent virtual folder ensure by stable id (e.g. `xf-timeline`).
 * Does not create a real filesystem folder under `Codex/`.
 * If the id already exists, updates `name` when provided and returns the id.
 */
export async function ensureVirtualFolder(
	app: App,
	opts: { id: string; name: string; parentId?: string | null },
): Promise<string> {
	const id = opts.id.trim();
	if (!id || id.includes("/") || id.toLowerCase().endsWith(".md")) {
		throw new Error(`ensureVirtualFolder: invalid folder id "${opts.id}"`);
	}
	const name = opts.name.trim() || id;
	const parentId = opts.parentId ?? null;

	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		if (isFolderKey(folders, id)) {
			folders[id] = { name, order: folders[id].order };
			fm.folders = folders;
			fm.order = order;
			return;
		}
		folders[id] = { name, order: [] };
		insertIntoContainer(folders, order, parentId, id, Number.MAX_SAFE_INTEGER);
		fm.folders = folders;
		fm.order = order;
	});
	return id;
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		if (!folders[folderId]) return;
		folders[folderId] = { ...folders[folderId], name: trimmed };
		fm.folders = folders;
	});
}

/** Archives a file or an entire folder (as a unit — a folder's own nested `order` is left completely intact, only its key moves into `archive`). */
export async function archiveCodexItem(app: App, key: string): Promise<void> {
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive).filter((k) => k !== key);
		if (!order.includes(key)) order.push(key);
		fm.order = order;
		fm.archive = archive;
	});
}

/**
 * "Remove Folder and Keep Items": deletes the folder's own entry and splices its direct children
 * into its former position in its former parent (or root) — not recursive, nested subfolders keep
 * their own identity. For a Lore Entry folder (has `linkedNotePath`), the underlying note is
 * spliced back in ahead of those children, restoring it as a plain file in the same slot rather
 * than losing its place in the tree — the note itself was never touched either way.
 */
export async function removeCodexFolder(app: App, folderId: string): Promise<void> {
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const entry = folders[folderId];
		if (!entry) return;
		const container = findContainer(folders, order, folderId);
		delete folders[folderId];
		const replacement = entry.linkedNotePath ? [entry.linkedNotePath, ...entry.order] : entry.order;
		if (container) {
			const idx = container.order.indexOf(folderId);
			if (idx !== -1) container.order.splice(idx, 1, ...replacement);
		}
		fm.folders = folders;
		fm.order = order;
	});
}

/**
 * Turns an existing Codex note into a Lore Entry folder in place — mints a new, ordinary folder id
 * (never the note's own path — see CodexFolderEntry.linkedNotePath's doc comment for why),
 * replaces the note's own `order` reference with that id, and links the two via
 * `linkedNotePath`. The note keeps its place in the tree; other entries can now be filed inside it
 * (e.g. a group's members) the same way as any other folder. Returns the new folder id.
 */
export async function convertCodexNoteToFolder(app: App, path: string): Promise<string> {
	let newId = "";
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const container = findContainer(folders, order, path);
		const displayName = codexBasename(path);
		newId = mintFolderId(displayName, folders);
		folders[newId] = { name: displayName, order: [], linkedNotePath: path };
		const targetArr = container ? container.order : order;
		const idx = targetArr.indexOf(path);
		if (idx !== -1) targetArr.splice(idx, 1, newId);
		else targetArr.push(newId);
		fm.folders = folders;
		fm.order = order;
	});
	return newId;
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		const types = parseTypes(fm.types);
		const tags = parseTagsMap(fm.tags);
		const rekey = (arr: string[]): string[] =>
			newPath ? arr.map((k) => (k === oldPath ? newPath : k)) : arr.filter((k) => k !== oldPath);
		for (const id of Object.keys(folders)) {
			const entry = folders[id];
			const next: CodexFolderEntry = { name: entry.name, order: rekey(entry.order) };
			// A Lore Entry folder's linkedNotePath isn't a plain order-array entry, so `rekey` above
			// never touches it — handled separately here. Clearing it (newPath === null, the note
			// was deleted or moved out of Codex/) degrades the folder to a plain organisational one
			// rather than leaving it pointing at a path that no longer exists.
			if (entry.linkedNotePath && entry.linkedNotePath !== oldPath) next.linkedNotePath = entry.linkedNotePath;
			else if (entry.linkedNotePath === oldPath && newPath) next.linkedNotePath = newPath;
			folders[id] = next;
		}
		if (oldPath in types) {
			const value = types[oldPath];
			delete types[oldPath];
			if (newPath) types[newPath] = value;
		}
		if (oldPath in tags) {
			const value = tags[oldPath];
			delete tags[oldPath];
			if (newPath) tags[newPath] = value;
		}
		fm.folders = folders;
		fm.order = rekey(order);
		fm.archive = rekey(archive);
		fm.types = types;
		fm.tags = tags;
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
	await modifyBackstageFrontmatter<RawCodexFrontmatter>(app, app.vault, codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
