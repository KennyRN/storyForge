import { ICON_MAP_PIN, ICON_PERSON_2_FILL, ICON_PERSON_FILL } from "./icons";
import { CODEX_ROOT, codexFilePath } from "./paths";
import { foldKey } from "./pathRules";
import type { FrontmatterRecord } from "./frontmatter";
import type { Project } from "./project";
import type { IndexEntry } from "./projectIndex";
import {
	codexBasename,
	collectReferencedPaths,
	countFilesInFolder,
	findContainer,
	flattenCodexTreeFiles,
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

export { isDescendantFolder, countFilesInFolder, type CodexFolders, type CodexFolderEntry };
export type { CodexTreeFile, CodexTreeFolder, CodexTreeItem };

export type CodexViewMode = "codex" | "codexHidden";

export interface CodexFrontmatterShape {
	folders: CodexFolders;
	order: string[];
	archive: string[];
	types: Record<string, string>;
}

/** The raw, unsanitized on-disk shape of codex.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
export interface RawCodexFrontmatter extends FrontmatterRecord {
	folders?: unknown;
	order?: unknown;
	archive?: unknown;
	types?: unknown;
}

export interface CodexTypeOption {
	type: string;
	label: string;
	icon: string;
	/** Nesting parent — another type's id, or null/undefined at the root. Only ever set for a
	 * child of the built-in "person"/"place" types (see tagRegistry.ts's TagDefinition.parentId,
	 * which this mirrors once resolved). */
	parentId?: string | null;
}

/** Built-in Codex types. */
export const BUILTIN_CODEX_TYPES: readonly CodexTypeOption[] = [
	{ type: "person", label: "Person", icon: ICON_PERSON_FILL },
	{ type: "place", label: "Place", icon: ICON_MAP_PIN },
	{ type: "populace", label: "Populace", icon: ICON_PERSON_2_FILL },
];

/**
 * Live assignable Codex entry types ("Set as..."), in menu order.
 * Seeded with builtins; replaced from the persisted registry by `loadCodexTypesFromRegistry`.
 */
export const CODEX_TYPES: CodexTypeOption[] = BUILTIN_CODEX_TYPES.map((t) => ({ ...t }));

export function getCodexTypes(): readonly CodexTypeOption[] {
	return CODEX_TYPES;
}

export function codexTypeIcon(type: string): string | null {
	return CODEX_TYPES.find((t) => t.type === type)?.icon ?? null;
}

/**
 * True when `type` *is* `ancestorType`, or is nested under it (directly or, in principle,
 * transitively — today nesting only ever goes one level deep, under "person"/"place", but this
 * walks the chain generically rather than assuming that depth). This is the "soft tag" behind
 * nested Codex types: an entry typed with a specific nested type (e.g. "Hero" under "Person")
 * still counts as its ancestor type ("Person") everywhere the app checks entry type — the type
 * filter, and PoV/location pickers (`getCodexEntriesByType`). Guards against a corrupt/cyclic
 * parentId chain by capping the walk at CODEX_TYPES's own size.
 */
export function codexTypeMatchesOrDescendsFrom(type: string, ancestorType: string): boolean {
	let current: string | null = type;
	for (let i = 0; i < CODEX_TYPES.length && current; i++) {
		if (current === ancestorType) return true;
		current = CODEX_TYPES.find((t) => t.type === current)?.parentId ?? null;
	}
	return false;
}

/**
 * Replaces CODEX_TYPES's contents with `resolved` (the persisted registry from tagRegistry.ts,
 * already resolved to real icon ids). Called by tagRegistry.ts only; kept here (rather than
 * tagRegistry.ts mutating CODEX_TYPES directly) so this module's only import direction is outward
 * to tagRegistry.ts, never the reverse. CODEX_TYPES is process-wide state, as it was in the plugin.
 */
export function loadCodexTypesFromRegistry(resolved: readonly CodexTypeOption[]): void {
	CODEX_TYPES.length = 0;
	CODEX_TYPES.push(...resolved.map((t) => ({ ...t })));
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

/** Writes `folders` back to the frontmatter, keeping any keys inside a folder entry that this module doesn't know about. */
function setFolders(fm: RawCodexFrontmatter, folders: CodexFolders): void {
	const raw = fm.folders && typeof fm.folders === "object" ? (fm.folders as Record<string, unknown>) : {};
	const out: Record<string, unknown> = {};
	for (const [id, entry] of Object.entries(folders)) {
		const previous = raw[id];
		const extras: Record<string, unknown> = {};
		if (previous && typeof previous === "object") {
			for (const [k, v] of Object.entries(previous)) {
				if (k !== "name" && k !== "order" && k !== "linkedNotePath") extras[k] = v;
			}
		}
		out[id] = { ...extras, ...entry };
	}
	fm.folders = out;
}

export function readCodexFrontmatter(project: Project): CodexFrontmatterShape {
	if (!project.exists(codexFilePath())) return { folders: {}, order: [], archive: [], types: {} };
	const fm = project.frontmatter(codexFilePath());
	return {
		folders: parseFolders(fm?.folders),
		order: parseStringArray(fm?.order),
		archive: parseStringArray(fm?.archive),
		types: parseTypes(fm?.types),
	};
}

export function getCodexEntryType(project: Project, path: string): string | null {
	return readCodexFrontmatter(project).types[path] ?? null;
}

export async function setCodexEntryType(project: Project, path: string, type: string): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const types = parseTypes(fm.types);
		types[path] = type;
		fm.types = types;
	});
}

/**
 * Restricts `visiblePaths` to those whose assigned type is in `typeIds`, or descends from one of
 * them (OR semantics — selecting several types shows anything matching any of them, i.e. "a group
 * of types"; a nested type's entries stay included when its ancestor is selected — the "soft tag"
 * behind nested Codex types, see codexTypeMatchesOrDescendsFrom). Returns `visiblePaths` unchanged
 * when `typeIds` is empty — no filter selected means show everything. Folders are handled
 * downstream by resolveCodexTree's own declutter logic (a folder with no currently-visible
 * descendant collapses out of the tree on its own).
 */
export function filterVisiblePathsByType(
	project: Project,
	visiblePaths: ReadonlySet<string>,
	typeIds: ReadonlySet<string>,
): ReadonlySet<string> {
	if (typeIds.size === 0) return visiblePaths;
	const { types } = readCodexFrontmatter(project);
	const result = new Set<string>();
	for (const path of visiblePaths) {
		const type = types[path];
		if (type && Array.from(typeIds).some((typeId) => codexTypeMatchesOrDescendsFrom(type, typeId))) result.add(path);
	}
	return result;
}

/** Non-archived Codex notes, in the same order as a fully-expanded Codex tree
 * (folders flattened). Not filtered by type. */
export function getCodexEntries(project: Project): { path: string; name: string }[] {
	const visiblePaths = new Set(collectCodexNotes(project));
	const tree = buildCodexTree(project, visiblePaths);
	return tree
		? flattenCodexTreeFiles(tree)
		: [...visiblePaths].map((path) => ({ path, name: codexBasename(path) }));
}

/** Codex entries of the given type (or a type nested under it — see codexTypeMatchesOrDescendsFrom),
 * scoped like the Codex pane itself (all non-archived notes), in the same order as a
 * fully-expanded Codex tree (folders flattened). */
export function getCodexEntriesByType(
	project: Project,
	type: string,
): { path: string; name: string }[] {
	const { types } = readCodexFrontmatter(project);
	return getCodexEntries(project).filter((entry) => {
		const entryType = types[entry.path];
		return entryType != null && codexTypeMatchesOrDescendsFrom(entryType, type);
	});
}

/** Flat, single-pass scan — Codex notes always live directly under `Codex/` now (folders are virtual). Archived paths (direct or nested inside an archived folder) are excluded. */
export function collectCodexNotes(project: Project): string[] {
	if (!project.isFolder(CODEX_ROOT)) return [];
	const { folders, archive } = readCodexFrontmatter(project);
	const archivedPaths = collectReferencedPaths(folders, archive);

	const paths: string[] = [];
	for (const child of project.list(CODEX_ROOT)) {
		if (child.kind !== "file" || child.extension !== "md") continue;
		if (archivedPaths.has(child.path)) continue;
		paths.push(child.path);
	}
	return paths;
}

export function buildCodexTree(
	project: Project,
	visiblePaths: ReadonlySet<string>,
): CodexTreeFolder | null {
	if (!project.isFolder(CODEX_ROOT)) return null;
	const { folders, order } = readCodexFrontmatter(project);
	const realPaths = new Set(
		project.list(CODEX_ROOT).filter((c) => c.kind === "file" && c.extension === "md").map((c) => c.path),
	);
	return resolveCodexTree(folders, order, realPaths, visiblePaths);
}

export function getCodexView(
	project: Project,
	mode: CodexViewMode,
	typeFilter?: ReadonlySet<string>,
): CodexTreeFolder | null {
	if (mode === "codexHidden") return null;
	let visiblePaths: ReadonlySet<string> = new Set(collectCodexNotes(project));
	if (typeFilter && typeFilter.size > 0) visiblePaths = filterVisiblePathsByType(project, visiblePaths, typeFilter);
	return buildCodexTree(project, visiblePaths);
}

/** Filename characters that would leave `Codex/` or break the filesystem. Mirrors uniqueCodexFilename. */
const CODEX_BASENAME_UNSAFE = /[/\\?%*:|"<>]/g;

/**
 * Strips path separators and illegal filename characters so a Codex note always
 * stays a single segment under `CODEX_ROOT`. Empty, `.`, and `..` collapse to "".
 */
export function sanitizeCodexBasename(raw: string): string {
	const trimmed = raw.trim().replace(/\.md$/i, "");
	const stripped = trimmed
		.replace(CODEX_BASENAME_UNSAFE, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "");
	if (!stripped) return "";
	return stripped;
}

function sameVaultPath(a: string, b: string): boolean {
	return foldKey(a) === foldKey(b);
}

function pathInSet(paths: Iterable<string>, path: string): boolean {
	return [...paths].some((entry) => sameVaultPath(entry, path));
}

/** Markdown files under `Codex/`, from the index (which is the disk truth: it is built by a scan and kept current by write-through and `applyChange`). */
function listCodexMarkdownOnDisk(project: Project): Set<string> {
	return new Set(
		project
			.list(CODEX_ROOT)
			.filter((e) => e.kind === "file" && e.extension === "md")
			.map((e) => e.path),
	);
}

/** Collision-unique `stem.md` under `CODEX_ROOT`, using a sanitized stem.
 * Occupancy is read from the index, which mirrors the disk, so a reused name like `Berwyn.md` is
 * not forced to `Berwyn 2.md` after the old note was deleted.
 * `ignorePath` is the note being renamed — its own numbered name must not count as taken. */
export async function uniqueCodexFilename(
	project: Project,
	baseName: string,
	ignorePath?: string,
): Promise<string> {
	const stem = sanitizeCodexBasename(baseName) || "New Note";
	if (!isCodexPathOccupied(project, `${CODEX_ROOT}/${stem}.md`, ignorePath)) return `${stem}.md`;
	let n = 2;
	while (isCodexPathOccupied(project, `${CODEX_ROOT}/${stem} ${n}.md`, ignorePath)) n++;
	return `${stem} ${n}.md`;
}

/** True when `path` is a Codex markdown file that exists (case-insensitively). */
function vaultPathExistsOnDisk(project: Project, path: string): boolean {
	return pathInSet(listCodexMarkdownOnDisk(project), path);
}

function isCodexPathOccupied(project: Project, path: string, ignorePath?: string): boolean {
	if (ignorePath && sameVaultPath(path, ignorePath)) return false;
	return pathInSet(listCodexMarkdownOnDisk(project), path);
}

/** Mints a new virtual folder and registers it into `parentFolderId`'s order (or the root's, if null). Returns the new folder id. */
export async function createCodexFolder(project: Project, parentFolderId: string | null): Promise<string> {
	let newId = "";
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		newId = mintFolderId("New Folder", folders);
		folders[newId] = { name: "New Folder", order: [] };
		insertIntoContainer(folders, order, parentFolderId, newId, Number.MAX_SAFE_INTEGER);
		setFolders(fm, folders);
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
	project: Project,
	opts: { id: string; name: string; parentId?: string | null },
): Promise<string> {
	const id = opts.id.trim();
	if (!id || id.includes("/") || id.toLowerCase().endsWith(".md")) {
		throw new Error(`ensureVirtualFolder: invalid folder id "${opts.id}"`);
	}
	const name = opts.name.trim() || id;
	const parentId = opts.parentId ?? null;

	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		if (isFolderKey(folders, id)) {
			folders[id] = { name, order: folders[id].order };
			setFolders(fm, folders);
			fm.order = order;
			return;
		}
		folders[id] = { name, order: [] };
		insertIntoContainer(folders, order, parentId, id, Number.MAX_SAFE_INTEGER);
		setFolders(fm, folders);
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
	project: Project,
	parentFolderId: string | null,
	options: CreateCodexNoteOptions = {},
): Promise<IndexEntry> {
	if (!project.exists(CODEX_ROOT)) await project.createFolder(CODEX_ROOT);
	const filename = await uniqueCodexFilename(project, options.filename ?? "New Note");
	const path = `${CODEX_ROOT}/${filename}`;
	await project.createFile(path, options.content ?? "");
	const file = project.entry(path) as IndexEntry;
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		insertIntoContainer(folders, order, parentFolderId, path, Number.MAX_SAFE_INTEGER);
		setFolders(fm, folders);
		fm.order = order;
	});
	return file;
}

/** Thrown by renameCodexNoteFile: a Codex note cannot be renamed until link rewriting exists. */
export class CodexRenameUnavailableError extends Error {
	constructor(public readonly path: string) {
		super(
			`Renaming the Codex note "${path}" is not available yet: a rename has to update [[links]] to the note, ` +
				`and link rewriting has not been built. Nothing was renamed.`,
		);
		this.name = "CodexRenameUnavailableError";
	}
}

/**
 * Renaming a Codex note used to go through Obsidian's link-updating rename. Without it a rename
 * would silently break `[[links]]`, so a real rename is **refused** with a typed error (the link
 * rewriting exception is a later piece of work). Blank or unchanged names, and names that resolve to
 * the note's own, are still a no-op.
 */
export async function renameCodexNoteFile(_project: Project, file: IndexEntry, newBasename: string): Promise<void> {
	const stem = sanitizeCodexBasename(newBasename);
	if (!stem || stem === file.basename) return;
	const filename = await uniqueCodexFilename(_project, stem, file.path);
	if (sameVaultPath(`${CODEX_ROOT}/${filename}`, file.path)) return; // the name resolves to the note's own: nothing to rename
	throw new CodexRenameUnavailableError(file.path);
}

/**
 * Append `alias` to a Codex note's YAML `aliases` (Obsidian Properties). No-op when blank,
 * already present, or equal to the file basename (case-insensitive). Refuses non-Codex paths.
 */
export async function addCodexNoteAlias(project: Project, path: string, alias: string): Promise<void> {
	const trimmed = alias.trim();
	if (!trimmed) return;
	const basename = project.entry(path)?.basename ?? "";
	await project.modifyCodexNoteAliases(path, (aliases) => {
		if (basename.toLowerCase() === trimmed.toLowerCase()) return aliases;
		if (aliases.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return aliases;
		return [...aliases, trimmed];
	});
}

/** Pure metadata rename — virtual folders have no real file, so there's nothing to rename on disk. */
export async function renameCodexFolder(project: Project, folderId: string, newName: string): Promise<void> {
	const trimmed = newName.trim();
	if (!trimmed) return;
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		if (!folders[folderId]) return;
		folders[folderId] = { ...folders[folderId], name: trimmed };
		setFolders(fm, folders);
	});
}

/** Archives a file or an entire folder (as a unit — a folder's own nested `order` is left completely intact, only its key moves into `archive`). */
export async function archiveCodexItem(project: Project, key: string): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		removeFromContainer(folders, order, key);
		if (!archive.includes(key)) archive.push(key);
		setFolders(fm, folders);
		fm.order = order;
		fm.archive = archive;
	});
}

/** Restores a file or folder to the Codex root — a restored folder's previous nested contents come back intact since its `order` was never touched while archived. */
export async function unarchiveCodexItem(project: Project, key: string): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
export async function removeCodexFolder(project: Project, folderId: string): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
		setFolders(fm, folders);
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
export async function convertCodexNoteToFolder(project: Project, path: string): Promise<string> {
	let newId = "";
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
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
		setFolders(fm, folders);
		fm.order = order;
	});
	return newId;
}

export function getArchivedCodexItems(project: Project): ArchivedCodexItem[] {
	const { folders, archive } = readCodexFrontmatter(project);
	return archive.map((key) => {
		if (isFolderKey(folders, key)) {
			return { key, type: "folder" as const, name: folders[key].name, childCount: countFilesInFolder(folders, key) };
		}
		const name = project.entry(key)?.basename ?? codexBasename(key);
		return { key, type: "file" as const, name };
	});
}

export async function reorderArchivedCodexItems(project: Project, nextKeys: string[]): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		fm.archive = nextKeys;
	});
}

/**
 * Rekeys every reference to `oldPath` (root order, any folder's order, archive) to `newPath`,
 * or strips it entirely if `newPath` is null (deleted, or no longer a trackable flat Codex note
 * — moved out of `Codex/` or into a nested real subfolder). Called by the vault-rename and
 * vault-delete reconciliation handlers, so this fires for file-explorer and Finder deletes too.
 */
export async function rekeyCodexNotePath(project: Project, oldPath: string, newPath: string | null): Promise<void> {
	if (!project.entry(codexFilePath())) return;
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		const types = parseTypes(fm.types);
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
		setFolders(fm, folders);
		fm.order = rekey(order);
		fm.archive = rekey(archive);
		fm.types = types;
	});
}

/**
 * Drop every file-path reference in `codex.md` whose note is no longer in the vault.
 * Virtual folder ids stay. Used after an external delete (Finder, etc.) and on vault
 * open for deletes that happened while Obsidian was closed — `resolveCodexTree` already
 * hides these orphans; this writes the cleanup back to the order markdown.
 */
export function stripMissingCodexNoteRefs(
	folders: CodexFolders,
	order: string[],
	archive: string[],
	types: Record<string, string>,
	pathExists: (path: string) => boolean,
): CodexFrontmatterShape {
	const keep = (key: string): boolean => isFolderKey(folders, key) || pathExists(key);
	const nextFolders: CodexFolders = {};
	for (const [id, entry] of Object.entries(folders)) {
		const next: CodexFolderEntry = { name: entry.name, order: entry.order.filter(keep) };
		if (entry.linkedNotePath && pathExists(entry.linkedNotePath)) next.linkedNotePath = entry.linkedNotePath;
		nextFolders[id] = next;
	}
	const nextTypes: Record<string, string> = {};
	for (const [path, type] of Object.entries(types)) {
		if (pathExists(path)) nextTypes[path] = type;
	}
	return {
		folders: nextFolders,
		order: order.filter(keep),
		archive: archive.filter(keep),
		types: nextTypes,
	};
}

function codexShapeEquals(a: CodexFrontmatterShape, b: CodexFrontmatterShape): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export async function pruneMissingCodexNotes(project: Project): Promise<boolean> {
	if (!project.entry(codexFilePath())) return false;
	const current = readCodexFrontmatter(project);
	const referenced = collectReferencedPaths(current.folders, current.order);
	for (const path of collectReferencedPaths(current.folders, current.archive)) referenced.add(path);
	for (const path of Object.keys(current.types)) referenced.add(path);
	const existence = new Map<string, boolean>();
	await Promise.all(
		[...referenced].map(async (path) => {
			if (isFolderKey(current.folders, path)) return;
			existence.set(path, vaultPathExistsOnDisk(project, path));
		}),
	);
	const pathExists = (path: string) => existence.get(path) === true;
	const next = stripMissingCodexNoteRefs(current.folders, current.order, current.archive, current.types, pathExists);
	if (codexShapeEquals(current, next)) return false;
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		setFolders(fm, next.folders);
		fm.order = next.order;
		fm.archive = next.archive;
		fm.types = next.types;
	});
	return true;
}

/** Strip `codex.md`'s entries for notes gone from disk. A ghost the vault index still lists is left
 * alone: storyForge never deletes a file, and Obsidian drops the ghost on its next rescan. */
export async function reconcileMissingCodexNotes(project: Project): Promise<void> {
	await pruneMissingCodexNotes(project);
}

/**
 * Persists a drag-drop move: removes `key` from wherever it currently sits and inserts it
 * into `targetParentId`'s order (root if null), immediately before `beforeKey` — or at the
 * end if `beforeKey` is null or no longer found. `beforeKey` is looked up *after* removal, so
 * this is correct even when reordering within the same container (no index-shift arithmetic
 * needed). Folders carry their own `order` untouched — only the key itself re-parents.
 */
export async function moveCodexItem(
	project: Project,
	key: string,
	type: "file" | "folder",
	targetParentId: string | null,
	beforeKey: string | null,
): Promise<void> {
	await project.modifyFrontmatter<RawCodexFrontmatter>(codexFilePath(), DEFAULT_CODEX_CONTENT, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		if (type === "folder" && targetParentId !== null && isDescendantFolder(folders, key, targetParentId)) {
			return;
		}
		const current = findContainer(folders, order, key);
		if (beforeKey === key && (current?.folderId ?? null) === targetParentId) {
			return;
		}
		removeFromContainer(folders, order, key);
		const targetArr = targetParentId !== null ? (folders[targetParentId]?.order ?? order) : order;
		const idx = beforeKey ? targetArr.indexOf(beforeKey) : -1;
		targetArr.splice(idx === -1 ? targetArr.length : idx, 0, key);
		setFolders(fm, folders);
		fm.order = order;
	});
}
