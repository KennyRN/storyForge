import { App, MarkdownView, TFile, TFolder, WorkspaceLeaf, type FrontMatterCache } from "obsidian";
import { numberedChapterTitle } from "./book";
import {
	codexBasename,
	collectReferencedPaths,
	findContainer,
	insertIntoContainer,
	isDescendantFolder,
	isFolderKey,
	mintFolderId,
	removeFromContainer,
	resolveCodexTree,
	type CodexFolderEntry,
	type CodexFolders,
	type CodexTreeFolder,
	type CodexTreeItem,
} from "./codexTree";
import { stripMissingCodexNoteRefs } from "./codex";
import { bookFolderNameFromChapterPath, chapterFilenameFromPath, isLibraryChapterPath, NOTES_ARCHIVE_ROOT, NOTES_ROOT, notesFilePath } from "./paths";
import type { NumberingStyle } from "./numberingStyle";
import { formatSingleLine } from "./titleNumbering";
import { filterVisiblePathsByTag, listVaultTagRows, readVaultTags, resolveVaultTagIconAlias, sortTreeByPageOrder, tagsFromFileCache, type DisplayedVaultTag } from "./vaultTags";
import { modifyBackstageFrontmatter } from "./writeGuard";

export {
	isDescendantFolder,
	type CodexFolders as NotesFolders,
	type CodexFolderEntry as NotesFolderEntry,
	type CodexTreeFolder,
};
export type { CodexTreeFile as NotesTreeFile, CodexTreeItem as NotesTreeItem } from "./codexTree";

export interface NotesFrontmatterShape {
	folders: CodexFolders;
	order: string[];
	archive: string[];
	types: Record<string, string>;
}

export interface RawNotesFrontmatter extends FrontMatterCache {
	folders?: unknown;
	order?: unknown;
	archive?: unknown;
	types?: unknown;
}

export interface IdeaTypeOption {
	type: string;
	label: string;
	icon: string;
}

/** Live assignable Notebook types ("Set as..."), in menu order. Seeded from tag-registry.md. */
export const IDEA_TYPES: IdeaTypeOption[] = [];

export function getIdeaTypes(): readonly IdeaTypeOption[] {
	return IDEA_TYPES;
}

export function ideaTypeIcon(type: string): string | null {
	return IDEA_TYPES.find((t) => t.type === type)?.icon ?? null;
}

export function loadIdeaTypesFromRegistry(resolved: readonly IdeaTypeOption[]): void {
	IDEA_TYPES.length = 0;
	IDEA_TYPES.push(...resolved.map((t) => ({ ...t })));
}

export const DEFAULT_NOTES_CONTENT = `---\nfolders:\norder:\narchive:\ntypes:\n---\n`;

/**
 * `processFrontMatter` does not update `metadataCache` on the same tick (see tagRegistry.ts).
 * Notebook index re-renders immediately after a drag, so reads must see the write we just made.
 */
const notesFrontmatterLive = new WeakMap<App, NotesFrontmatterShape>();

function snapshotNotesFrontmatter(app: App, fm: RawNotesFrontmatter): void {
	notesFrontmatterLive.set(app, {
		folders: parseFolders(fm.folders),
		order: parseStringArray(fm.order),
		archive: parseStringArray(fm.archive),
		types: parseTypes(fm.types),
	});
}

async function modifyNotesFrontmatter(app: App, mutate: (fm: RawNotesFrontmatter) => void): Promise<void> {
	await modifyBackstageFrontmatter<RawNotesFrontmatter>(app, app.vault, notesFilePath(), DEFAULT_NOTES_CONTENT, (fm) => {
		mutate(fm);
		snapshotNotesFrontmatter(app, fm);
	});
}

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

export function readNotesFrontmatter(app: App): NotesFrontmatterShape {
	const live = notesFrontmatterLive.get(app);
	if (live) return live;
	const file = app.vault.getAbstractFileByPath(notesFilePath());
	if (!file) return { folders: {}, order: [], archive: [], types: {} };
	const cache = app.metadataCache.getCache(notesFilePath());
	const fm = cache?.frontmatter;
	return {
		folders: parseFolders(fm?.folders),
		order: parseStringArray(fm?.order),
		archive: parseStringArray(fm?.archive),
		types: parseTypes(fm?.types),
	};
}

export function getNotesEntryType(app: App, path: string): string | null {
	return readNotesFrontmatter(app).types[path] ?? null;
}

export async function setNotesEntryType(app: App, path: string, type: string): Promise<void> {
	await modifyNotesFrontmatter(app, (fm) => {
		const types = parseTypes(fm.types);
		types[path] = type;
		fm.types = types;
	});
}

export function filterNotesVisiblePathsByType(
	app: App,
	visiblePaths: ReadonlySet<string>,
	typeIds: ReadonlySet<string>,
): ReadonlySet<string> {
	if (typeIds.size === 0) return visiblePaths;
	const { types } = readNotesFrontmatter(app);
	const result = new Set<string>();
	for (const path of visiblePaths) {
		const type = types[path];
		if (type && typeIds.has(type)) result.add(path);
	}
	return result;
}

/** Flat scan of `notes/*.md`. Nested folders (including `notes/archive/`) are ignored. */
export function collectNotesPaths(app: App): string[] {
	const root = app.vault.getAbstractFileByPath(NOTES_ROOT);
	if (!(root instanceof TFolder)) return [];
	const paths: string[] = [];
	for (const child of root.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		paths.push(child.path);
	}
	return paths;
}

export function collectArchivedNotes(app: App): { path: string; name: string }[] {
	const root = app.vault.getAbstractFileByPath(NOTES_ARCHIVE_ROOT);
	if (!(root instanceof TFolder)) return [];
	const notes: { path: string; name: string }[] = [];
	for (const child of root.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		notes.push({ path: child.path, name: child.basename });
	}
	const order = readNotesFrontmatter(app).archive;
	if (order.length === 0) return notes;
	const byPath = new Map(notes.map((note) => [note.path, note]));
	const ordered: { path: string; name: string }[] = [];
	const seen = new Set<string>();
	for (const path of order) {
		const note = byPath.get(path);
		if (!note || seen.has(path)) continue;
		ordered.push(note);
		seen.add(path);
	}
	for (const note of notes) {
		if (!seen.has(note.path)) ordered.push(note);
	}
	return ordered;
}

export function buildNotesTree(
	app: App,
	visiblePaths: ReadonlySet<string>,
	options?: { tagFilterMode?: boolean; pageOrder?: readonly string[] },
): CodexTreeFolder | null {
	const root = app.vault.getAbstractFileByPath(NOTES_ROOT);
	if (!(root instanceof TFolder)) return null;
	const { folders, order } = readNotesFrontmatter(app);
	const realPaths = new Set(collectNotesPaths(app));
	const tree = resolveCodexTree(folders, order, realPaths, visiblePaths, {
		tagFilterMode: options?.tagFilterMode,
	});
	tree.name = "Ideas";
	return options?.pageOrder?.length ? sortTreeByPageOrder(tree, options.pageOrder) : tree;
}

export function getNotesView(
	app: App,
	typeFilter?: ReadonlySet<string>,
	tagFilter?: string | null,
): CodexTreeFolder | null {
	let visiblePaths: ReadonlySet<string> = new Set(collectNotesPaths(app));
	if (typeFilter && typeFilter.size > 0) visiblePaths = filterNotesVisiblePathsByType(app, visiblePaths, typeFilter);
	if (tagFilter) {
		visiblePaths = filterVisiblePathsByTag(app, visiblePaths, tagFilter);
		const pageOrder = readVaultTags(app).tags.find((entry) => entry.id === tagFilter)?.pageOrder;
		return buildNotesTree(app, visiblePaths, { tagFilterMode: true, pageOrder });
	}
	return buildNotesTree(app, visiblePaths);
}

/** First file in display order (depth-first). Folders are walked; they are not themselves a selection. */
export function firstFilePathInNotesTree(tree: CodexTreeFolder | null): string | null {
	if (!tree) return null;
	const walk = (items: CodexTreeItem[]): string | null => {
		for (const item of items) {
			if (item.type === "file") return item.path;
			const nested = walk(item.children);
			if (nested) return nested;
		}
		return null;
	};
	return walk(tree.children);
}

export function notesTreeContainsPath(tree: CodexTreeFolder | null, path: string): boolean {
	if (!tree) return false;
	const walk = (items: CodexTreeItem[]): boolean => {
		for (const item of items) {
			if (item.type === "file" && item.path === path) return true;
			if (item.type === "folder" && walk(item.children)) return true;
		}
		return false;
	};
	return walk(tree.children);
}

/** Keep a still-visible user selection; otherwise the topmost note in the current tree. */
export function resolveSelectedNotesPath(
	app: App,
	current: string | null,
	typeFilter?: ReadonlySet<string>,
	tagFilter?: string | null,
): string | null {
	const tree = getNotesView(app, typeFilter, tagFilter);
	if (current && notesTreeContainsPath(tree, current) && app.vault.getAbstractFileByPath(current) instanceof TFile) {
		return current;
	}
	return firstFilePathInNotesTree(tree);
}

/** Vault `#tags` that appear on at least one Notebook note and are marked display-on for the notebook rail. */
export function displayedNotesVaultTags(app: App): DisplayedVaultTag[] {
	const idsOnNotes = new Set<string>();
	for (const path of collectNotesPaths(app)) {
		for (const id of tagsFromFileCache(app.metadataCache.getCache(path))) idsOnNotes.add(id);
	}
	return listVaultTagRows(app, undefined, idsOnNotes)
		.filter((row) => row.notesDisplay && row.iconAlias)
		.map((row) => ({
			id: row.id,
			iconAlias: row.iconAlias,
			iconId: resolveVaultTagIconAlias(row.iconAlias),
		}));
}

const NOTES_BASENAME_UNSAFE = /[/\\?%*:|"<>]/g;

export function sanitizeNotesBasename(raw: string): string {
	const trimmed = raw.trim().replace(/\.md$/i, "");
	const stripped = trimmed
		.replace(NOTES_BASENAME_UNSAFE, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^\.+/, "");
	if (!stripped) return "";
	return stripped;
}

function uniqueFilenameInDir(app: App, dir: string, baseName: string, emptyFallback: string): string {
	const stem = sanitizeNotesBasename(baseName) || emptyFallback;
	let candidate = `${stem}.md`;
	if (!app.vault.getAbstractFileByPath(`${dir}/${candidate}`)) return candidate;
	let n = 2;
	while (app.vault.getAbstractFileByPath(`${dir}/${stem} ${n}.md`)) n++;
	return `${stem} ${n}.md`;
}

export function uniqueNotesFilename(app: App, baseName: string): string {
	return uniqueFilenameInDir(app, NOTES_ROOT, baseName, "Untitled");
}

/** Centre-pane title, path-safe. Extra pages append ` b`, ` c`, … via `nextIdeaNoteBasename`. */
export function formatIdeaNoteBasename(centerTitle: string): string {
	return sanitizeNotesBasename(centerTitle) || "Untitled";
}

/** Older notebook pages used `YYYY-MM-DD HH-MM - Title`; still recognised so letters keep grouping. */
const IDEA_NOTE_STAMP = /^(\d{4}-\d{2}-\d{2} \d{2}-\d{2}) - (.+)$/;
const IDEA_NOTE_LETTER = /^(.+) ([a-z]+)$/;

/** First extra note is `b`, then `c`…`z`, then `aa`, `ab`, … (the unlettered first note is implicit `a`). */
export function ideaNoteSequenceLetter(n: number): string {
	let x = n + 1;
	let out = "";
	while (x > 0) {
		x--;
		out = String.fromCharCode(97 + (x % 26)) + out;
		x = Math.floor(x / 26);
	}
	return out;
}

function isIdeaNoteLetterSuffix(value: string): boolean {
	if (value.length === 1) return value >= "b" && value <= "z";
	return /^[a-z]+$/.test(value);
}

/** Chapter title + optional letter for an auto-named notebook page (`Title` / `Title b`). */
export function parseIdeaNoteChapterTitle(basename: string): { title: string; letter: string | null } {
	const stamped = basename.match(IDEA_NOTE_STAMP);
	const rest = stamped ? stamped[2] : basename;
	const lettered = rest.match(IDEA_NOTE_LETTER);
	if (lettered && isIdeaNoteLetterSuffix(lettered[2])) {
		return { title: lettered[1], letter: lettered[2] };
	}
	return { title: rest, letter: null };
}

function ideaNotesForChapterTitle(app: App, title: string): { letter: string | null }[] {
	const matches: { letter: string | null }[] = [];
	for (const path of collectNotesPaths(app)) {
		const parsed = parseIdeaNoteChapterTitle(codexBasename(path));
		if (parsed.title === title) matches.push({ letter: parsed.letter });
	}
	return matches;
}

/** First page about a chapter is the centre-pane title; further pages take `b`, `c`, … */
export function nextIdeaNoteBasename(app: App, centerTitle: string): string {
	const title = formatIdeaNoteBasename(centerTitle);
	const siblings = ideaNotesForChapterTitle(app, title);
	if (!siblings.some((s) => s.letter === null) && !app.vault.getAbstractFileByPath(`${NOTES_ROOT}/${title}.md`)) {
		return title;
	}
	const used = new Set(siblings.map((s) => s.letter).filter((letter): letter is string => letter !== null));
	for (let i = 1; i < 10_000; i++) {
		const letter = ideaNoteSequenceLetter(i);
		if (used.has(letter)) continue;
		const candidate = `${title} ${letter}`;
		if (!app.vault.getAbstractFileByPath(`${NOTES_ROOT}/${candidate}.md`)) return candidate;
	}
	return uniqueNotesFilename(app, title).replace(/\.md$/i, "");
}

/** Display title of whatever is open in the center/main-content leaf — never the grafted Notebook editor. */
export function resolveCenterPaneTitle(
	leaf: WorkspaceLeaf | null,
	app: App,
	numberingStyle: NumberingStyle,
): string {
	const view = leaf?.view;
	if (!(view instanceof MarkdownView) || !view.file) return "Untitled";
	const path = view.file.path;
	if (isLibraryChapterPath(path)) {
		const book = bookFolderNameFromChapterPath(path);
		const filename = chapterFilenameFromPath(path);
		if (book && filename) return formatSingleLine(numberedChapterTitle(app, book, filename, numberingStyle));
	}
	return view.file.basename;
}

async function ensureNotesRoot(app: App): Promise<void> {
	if (!app.vault.getAbstractFileByPath(NOTES_ROOT)) await app.vault.createFolder(NOTES_ROOT);
}

async function ensureNotesArchiveRoot(app: App): Promise<void> {
	await ensureNotesRoot(app);
	if (!app.vault.getAbstractFileByPath(NOTES_ARCHIVE_ROOT)) await app.vault.createFolder(NOTES_ARCHIVE_ROOT);
}

export async function createNotesFolder(app: App, parentFolderId: string | null): Promise<string> {
	let newId = "";
	await modifyNotesFrontmatter(app, (fm) => {
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

export interface CreateNotesNoteOptions {
	filename?: string;
	content?: string;
}

export async function createNotesNote(
	app: App,
	parentFolderId: string | null,
	options: CreateNotesNoteOptions = {},
): Promise<TFile> {
	await ensureNotesRoot(app);
	const filename = uniqueNotesFilename(app, options.filename ?? "Untitled");
	const path = `${NOTES_ROOT}/${filename}`;
	const file = await app.vault.create(path, options.content ?? "");
	await modifyNotesFrontmatter(app, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		insertIntoContainer(folders, order, parentFolderId, path, Number.MAX_SAFE_INTEGER);
		fm.folders = folders;
		fm.order = order;
	});
	return file;
}

export async function createIdeaNote(
	app: App,
	parentFolderId: string | null,
	centerTitle: string,
): Promise<TFile> {
	return createNotesNote(app, parentFolderId, { filename: nextIdeaNoteBasename(app, centerTitle) });
}

export async function renameNotesNoteFile(app: App, file: TFile, newBasename: string): Promise<void> {
	const stem = sanitizeNotesBasename(newBasename);
	if (!stem || stem === file.basename) return;
	let candidate = `${NOTES_ROOT}/${stem}.md`;
	if (candidate !== file.path && app.vault.getAbstractFileByPath(candidate)) {
		candidate = `${NOTES_ROOT}/${uniqueFilenameInDir(app, NOTES_ROOT, stem, "Untitled")}`;
	}
	await app.fileManager.renameFile(file, candidate);
}

export async function renameNotesFolder(app: App, folderId: string, newName: string): Promise<void> {
	const trimmed = newName.trim();
	if (!trimmed) return;
	await modifyNotesFrontmatter(app, (fm) => {
		const folders = parseFolders(fm.folders);
		if (!folders[folderId]) return;
		folders[folderId] = { ...folders[folderId], name: trimmed };
		fm.folders = folders;
	});
}

function descendantNotePaths(folders: CodexFolders, folderId: string): string[] {
	const entry = folders[folderId];
	if (!entry) return [];
	return [...collectReferencedPaths(folders, entry.order)];
}

async function moveNoteToArchive(app: App, path: string): Promise<string | null> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	await ensureNotesArchiveRoot(app);
	const destName = uniqueFilenameInDir(app, NOTES_ARCHIVE_ROOT, file.basename, "Untitled");
	const dest = `${NOTES_ARCHIVE_ROOT}/${destName}`;
	await app.fileManager.renameFile(file, dest);
	return dest;
}

/** Archives a note by moving it into `notes/archive/` and dropping it from the shelf tree. */
export async function archiveNotesItem(app: App, key: string): Promise<void> {
	const { folders } = readNotesFrontmatter(app);
	if (isFolderKey(folders, key)) {
		const paths = descendantNotePaths(folders, key);
		const dests: string[] = [];
		for (const path of paths) {
			const dest = await moveNoteToArchive(app, path);
			if (dest) dests.push(dest);
		}
		await modifyNotesFrontmatter(app, (fm) => {
			const nextFolders = parseFolders(fm.folders);
			const order = parseStringArray(fm.order);
			const archive = parseStringArray(fm.archive);
			const types = parseTypes(fm.types);
			for (const path of paths) {
				removeFromContainer(nextFolders, order, path);
				delete types[path];
			}
			removeFromContainer(nextFolders, order, key);
			delete nextFolders[key];
			for (const dest of dests) {
				if (!archive.includes(dest)) archive.push(dest);
			}
			fm.folders = nextFolders;
			fm.order = order;
			fm.archive = archive;
			fm.types = types;
		});
		return;
	}
	const dest = await moveNoteToArchive(app, key);
	await modifyNotesFrontmatter(app, (fm) => {
		const nextFolders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		const types = parseTypes(fm.types);
		removeFromContainer(nextFolders, order, key);
		if (dest && key in types) {
			types[dest] = types[key];
		}
		delete types[key];
		if (dest && !archive.includes(dest)) archive.push(dest);
		fm.folders = nextFolders;
		fm.order = order;
		fm.archive = archive;
		fm.types = types;
	});
}

/** Restores an archived note to `notes/` and appends it to the shelf root. */
export async function unarchiveNotesNote(app: App, archivePath: string): Promise<TFile | null> {
	const file = app.vault.getAbstractFileByPath(archivePath);
	if (!(file instanceof TFile)) return null;
	await ensureNotesRoot(app);
	const destName = uniqueFilenameInDir(app, NOTES_ROOT, file.basename, "Untitled");
	const dest = `${NOTES_ROOT}/${destName}`;
	await app.fileManager.renameFile(file, dest);
	const moved = app.vault.getAbstractFileByPath(dest);
	await modifyNotesFrontmatter(app, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive).filter((path) => path !== archivePath);
		const types = parseTypes(fm.types);
		if (!order.includes(dest)) order.push(dest);
		if (archivePath in types) {
			types[dest] = types[archivePath];
			delete types[archivePath];
		}
		fm.folders = folders;
		fm.order = order;
		fm.archive = archive;
		fm.types = types;
	});
	return moved instanceof TFile ? moved : null;
}

export async function reorderArchivedNotes(app: App, nextPaths: string[]): Promise<void> {
	await modifyNotesFrontmatter(app, (fm) => {
		fm.archive = nextPaths;
	});
}

export async function removeNotesFolder(app: App, folderId: string): Promise<void> {
	await modifyNotesFrontmatter(app, (fm) => {
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

export async function convertNotesNoteToFolder(app: App, path: string): Promise<string> {
	let newId = "";
	await modifyNotesFrontmatter(app, (fm) => {
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

export async function rekeyNotesNotePath(app: App, oldPath: string, newPath: string | null): Promise<void> {
	if (!app.vault.getAbstractFileByPath(notesFilePath())) return;
	await modifyNotesFrontmatter(app, (fm) => {
		const folders = parseFolders(fm.folders);
		const order = parseStringArray(fm.order);
		const archive = parseStringArray(fm.archive);
		const types = parseTypes(fm.types);
		const rekey = (arr: string[]): string[] =>
			newPath ? arr.map((k) => (k === oldPath ? newPath : k)) : arr.filter((k) => k !== oldPath);
		for (const id of Object.keys(folders)) {
			const entry = folders[id];
			const next: CodexFolderEntry = { name: entry.name, order: rekey(entry.order) };
			if (entry.linkedNotePath && entry.linkedNotePath !== oldPath) next.linkedNotePath = entry.linkedNotePath;
			else if (entry.linkedNotePath === oldPath && newPath) next.linkedNotePath = newPath;
			folders[id] = next;
		}
		if (oldPath in types) {
			const value = types[oldPath];
			delete types[oldPath];
			if (newPath) types[newPath] = value;
		}
		let nextOrder = rekey(order);
		if (newPath && !nextOrder.includes(newPath) && newPath.startsWith(`${NOTES_ROOT}/`) && !newPath.startsWith(`${NOTES_ARCHIVE_ROOT}/`)) {
			nextOrder.push(newPath);
		}
		if (newPath && newPath.startsWith(`${NOTES_ARCHIVE_ROOT}/`)) {
			nextOrder = nextOrder.filter((k) => k !== newPath);
			removeFromContainer(folders, nextOrder, newPath);
		}
		let nextArchive = rekey(archive);
		if (newPath && newPath.startsWith(`${NOTES_ARCHIVE_ROOT}/`)) {
			if (!nextArchive.includes(newPath)) nextArchive.push(newPath);
		} else if (newPath) {
			nextArchive = nextArchive.filter((k) => k !== newPath);
		}
		fm.folders = folders;
		fm.order = nextOrder;
		fm.archive = nextArchive;
		fm.types = types;
	});
}

function notesShapeEquals(a: NotesFrontmatterShape, b: NotesFrontmatterShape): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Drop every file-path reference in `notes.md` whose note is no longer in the vault
 * (`notes/*.md` or `notes/archive/*.md`). Virtual folder ids stay. Used on vault open
 * for deletes that happened while Obsidian was closed — `resolveCodexTree` /
 * `collectArchivedNotes` already hide these orphans; this writes the cleanup back.
 */
export async function pruneMissingNotesNotes(app: App): Promise<boolean> {
	if (!app.vault.getAbstractFileByPath(notesFilePath())) return false;
	const current = readNotesFrontmatter(app);
	const pathExists = (path: string) => app.vault.getAbstractFileByPath(path) != null;
	const next = stripMissingCodexNoteRefs(current.folders, current.order, current.archive, current.types, pathExists);
	if (notesShapeEquals(current, next)) return false;
	await modifyNotesFrontmatter(app, (fm) => {
		fm.folders = next.folders;
		fm.order = next.order;
		fm.archive = next.archive;
		fm.types = next.types;
	});
	return true;
}

export async function moveNotesItem(
	app: App,
	key: string,
	type: "file" | "folder",
	targetParentId: string | null,
	beforeKey: string | null,
): Promise<void> {
	await modifyNotesFrontmatter(app, (fm) => {
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
		fm.folders = folders;
		fm.order = order;
	});
}
