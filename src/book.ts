import { App, TFile, TFolder, type FrontMatterCache } from "obsidian";
import { bookBackstagePath, bookFilePath, libraryBookPath, libraryChapterPath, LIBRARY_ROOT } from "./paths";
import { resolveOrder, type OrderResult } from "./ordering";
import { mintId } from "./slug";
import { deleteBackstagePath, enqueueBackstageWrite, modifyBackstageFrontmatter, writeBackstageBinary, writeBackstageFile } from "./writeGuard";
import { safeCoverExtension, safeCoverFilename } from "./coverImage";
import { extractSection, splitFrontmatterAndBody, upsertSection } from "./sectionBody";
import {
	collectAllBookIds,
	getLibraryBookFolders,
	getSeriesBookEntry,
	getSeriesBooks,
	getSeriesOrderPosition,
	readSeriesFrontmatter,
	upsertSeriesBookEntry,
	writeSeriesBookTitle,
	writeSeriesOrder,
	type SeriesBookEntry,
} from "./series";
import { nextNovelCode } from "./novelCode";
import { nextChapterCode } from "./chapterCode";
import { applyHashNumbering } from "./titleNumbering";
import type { NumberingStyle } from "./numberingStyle";
import {
	normalizeDialogueQuoteStyle,
	type DialogueQuoteStyle,
} from "./recommend/quoteSpans";

export interface CompileSettings {
	format?: string;
	chapter_heading?: string;
	separator?: string;
	output?: string;
}

/** A Codex person or place referenced from a chapter (PoV / location). Order is meaningful. */
export interface CodexRef {
	path: string;
	name: string;
}

export interface ChapterEntry {
	chapterId: string;
	chapterTitle: string;
	/** Ordered PoV characters for this chapter. Empty when unset (book default may still apply). */
	pov: CodexRef[];
	/** Ordered locations for this chapter. Empty when unset. */
	location: CodexRef[];
	/** Per-chapter plot notes (backstage metadata; never written into the library manuscript). */
	plot: string;
	/** Ids into tagRegistry.ts's chapterTags list. Empty when untagged. */
	tags: string[];
	/** Card-colour override picked via ChapterTitleModal's colour option, or null when the chapter
	 * just follows its book's own colour (resolveChapterRowColor's default). Legacy: new picks
	 * store `plotThreadId` instead and this stays null. */
	color: string | null;
	/** Id into plotThreads.ts's registry. Null when the chapter has no named thread (it then
	 * follows `color` if set, else the book's own colour). */
	plotThreadId: string | null;
}

export interface BookFrontmatter {
	goalDaily: number | null;
	chapterOrder: string[];
	unplaced: string[];
	archive: string[];
	compile: CompileSettings | null;
	bookIdReference: string;
	bookTitleReference: string;
	seriesOrderReference: number | null;
	coverImage: string | null;
	/** Declared dialogue quote style for narrator span scoping. */
	dialogueQuotes: DialogueQuoteStyle;
	/** Book-level default PoV when a chapter has none set. */
	defaultPovPath: string | null;
	defaultPovName: string | null;
	chapters: Record<string, ChapterEntry>;
	/** Ids into tagRegistry.ts's novelTags list. */
	novelTags: string[];
}

/** The raw, dash-cased on-disk shape of a `chapters` map entry, before `parseChaptersMap` sanitizes it. */
export interface RawChapterEntry {
	"chapter-id"?: unknown;
	"chapter-title"?: unknown;
	/** Ordered `{ path, name }` list. Preferred over the legacy scalar pair below. */
	pov?: unknown;
	"pov-path"?: unknown;
	"pov-name"?: unknown;
	/** Ordered `{ path, name }` list. Preferred over the legacy scalar pair below. */
	location?: unknown;
	"location-path"?: unknown;
	"location-name"?: unknown;
	plot?: unknown;
	tags?: unknown;
	"chapter-color"?: unknown;
	"plot-thread"?: unknown;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function isCodexRef(value: unknown): value is CodexRef {
	return (
		!!value &&
		typeof value === "object" &&
		typeof (value as CodexRef).path === "string" &&
		(value as CodexRef).path.length > 0 &&
		typeof (value as CodexRef).name === "string"
	);
}

function zipPathNameLists(paths: unknown, names: unknown): CodexRef[] {
	if (!Array.isArray(paths)) return [];
	const nameList = Array.isArray(names) ? names : [];
	const result: CodexRef[] = [];
	for (let i = 0; i < paths.length; i++) {
		const path = paths[i];
		if (typeof path !== "string" || path.length === 0) continue;
		const name = nameList[i];
		result.push({
			path,
			name: typeof name === "string" && name.length > 0 ? name : path,
		});
	}
	return result;
}

/**
 * Accepts, in order: a `{ path, name }` list (or a single object if YAML collapsed a
 * one-item list), parallel `*-path` / `*-name` string arrays, or a leftover scalar pair.
 */
export function parseCodexRefs(list: unknown, legacyPath: unknown, legacyName: unknown): CodexRef[] {
	if (Array.isArray(list)) {
		const objects = list.filter(isCodexRef);
		if (objects.length > 0) return objects;
	} else if (isCodexRef(list)) {
		return [list];
	}
	const fromParallel = zipPathNameLists(legacyPath, legacyName);
	if (fromParallel.length > 0) return fromParallel;
	if (typeof legacyPath === "string" && legacyPath.length > 0) {
		return [
			{
				path: legacyPath,
				name: typeof legacyName === "string" && legacyName.length > 0 ? legacyName : legacyPath,
			},
		];
	}
	return [];
}

/** Persist as parallel string arrays — nested `{ path, name }` objects inside `chapters`
 * have been observed to make Obsidian's YAML round-trip drop the rest of the chapter entry
 * (title falls back to the filename code, PoV/location read back empty). */
function applyCodexRefList(
	entry: RawChapterEntry,
	listKey: "pov" | "location",
	legacyPathKey: "pov-path" | "location-path",
	legacyNameKey: "pov-name" | "location-name",
	refs: CodexRef[],
): void {
	delete entry[listKey];
	if (refs.length > 0) {
		entry[legacyPathKey] = refs.map((r) => r.path);
		entry[legacyNameKey] = refs.map((r) => r.name);
	} else {
		delete entry[legacyPathKey];
		delete entry[legacyNameKey];
	}
}

function withChapterIdentity(
	app: App,
	bookFolderName: string,
	filename: string,
	existing: RawChapterEntry,
): RawChapterEntry {
	const { bookId } = resolveBookIdentity(app, bookFolderName);
	const chapterId: string =
		typeof existing["chapter-id"] === "string"
			? existing["chapter-id"]
			: nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
	const chapterTitle: string =
		typeof existing["chapter-title"] === "string" ? existing["chapter-title"] : filename.replace(/\.md$/i, "");
	return { ...existing, "chapter-id": chapterId, "chapter-title": chapterTitle };
}

function rekeyCodexRefList(refs: CodexRef[], oldPath: string, newPath: string | null): CodexRef[] {
	if (newPath === null) return refs.filter((r) => r.path !== oldPath);
	return refs.map((r) => (r.path === oldPath ? { ...r, path: newPath } : r));
}

/** The raw, dash-cased on-disk shape of novel.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
export interface RawBookFrontmatter extends FrontMatterCache {
	chapters?: Record<string, RawChapterEntry>;
	"chapter-order"?: unknown[];
	/** Legacy pre-migration key, renamed to "chapter-order" by migrateChapterOrderField. */
	order?: unknown[];
	unplaced?: unknown[];
	archive?: unknown[];
	"cover-image"?: unknown;
	"book-id-reference"?: unknown;
	"book-title-reference"?: unknown;
	"series-order-reference"?: unknown;
	"dialogue-quotes"?: unknown;
	"default-pov-path"?: unknown;
	"default-pov-name"?: unknown;
	/** Deliberately not the bare key "tags" — that collides with Obsidian's own native tag-pane frontmatter key. */
	"novel-tags"?: unknown;
	/** Legacy pre-migration keys, deleted by migrateLegacyBookEntry. */
	id?: unknown;
	title?: unknown;
}

function defaultBookContent(bookId: string, bookTitle: string, seriesOrderReference: number | null): string {
	// JSON.stringify quotes/escapes the values so a title containing ":" or other
	// YAML-significant characters (e.g. "Book One: The Beginning") still parses.
	return `---\nbook-id-reference: ${JSON.stringify(bookId)}\nbook-title-reference: ${JSON.stringify(bookTitle)}\nseries-order-reference: ${seriesOrderReference ?? ""}\nchapter-order:\n---\n`;
}

/** Resolves the (bookId, bookTitle, series position) triple every novel.md write needs to seed a correct default file. */
function resolveBookIdentity(app: App, bookFolderName: string): { bookId: string; bookTitle: string; position: number | null } {
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	return { bookId, bookTitle, position };
}

/** Shared entry point for every novel.md frontmatter mutation: resolves the identity fields
 * needed to seed a fresh file, then delegates to modifyBackstageFrontmatter so callers only
 * supply their mutate step. (writeBookReferenceFields is the one exception — it's passed
 * already-resolved identity values to avoid a stale re-read, so it calls
 * modifyBackstageFrontmatter directly instead.) */
async function modifyBookFrontmatter(
	app: App,
	bookFolderName: string,
	mutate: (fm: RawBookFrontmatter) => void,
): Promise<TFile> {
	const { bookId, bookTitle, position } = resolveBookIdentity(app, bookFolderName);
	const path = bookFilePath(bookFolderName);
	return modifyBackstageFrontmatter<RawBookFrontmatter>(app, app.vault, path, defaultBookContent(bookId, bookTitle, position), mutate);
}

/** Defensive parse mirroring series.ts's `parseBooksMap` — needs a string `chapter-id`, falls back to the filename (sans ".md") for the title. */
function parseChaptersMap(raw: unknown): Record<string, ChapterEntry> {
	if (!raw || typeof raw !== "object") return {};
	const result: Record<string, ChapterEntry> = {};
	for (const [filename, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		const chapterId = typeof entry["chapter-id"] === "string" ? entry["chapter-id"] : null;
		if (!chapterId) continue;
		const chapterTitle =
			typeof entry["chapter-title"] === "string" ? entry["chapter-title"] : filename.replace(/\.md$/i, "");
		const pov = parseCodexRefs(entry.pov, entry["pov-path"], entry["pov-name"]);
		const location = parseCodexRefs(entry.location, entry["location-path"], entry["location-name"]);
		const plot = typeof entry.plot === "string" ? entry.plot : "";
		const tags = Array.isArray(entry.tags) ? entry.tags.filter((v): v is string => typeof v === "string") : [];
		const color =
			typeof entry["chapter-color"] === "string" && HEX_COLOR_RE.test(entry["chapter-color"])
				? entry["chapter-color"]
				: null;
		const plotThreadId = typeof entry["plot-thread"] === "string" ? entry["plot-thread"] : null;
		result[filename] = { chapterId, chapterTitle, pov, location, plot, tags, color, plotThreadId };
	}
	return result;
}

export function getBookChapterFiles(app: App, bookFolderName: string): TFile[] {
	const folder = app.vault.getAbstractFileByPath(libraryBookPath(bookFolderName));
	if (!(folder instanceof TFolder)) return [];
	return folder.children.filter(
		(child): child is TFile => child instanceof TFile && child.extension === "md",
	);
}

export function readBookFrontmatter(app: App, bookFolderName: string): BookFrontmatter | null {
	const path = bookFilePath(bookFolderName);
	const file = app.vault.getAbstractFileByPath(path);
	if (!file) return null;
	const fm = app.metadataCache.getCache(path)?.frontmatter;
		const chapterOrder = Array.isArray(fm?.["chapter-order"])
			? fm["chapter-order"].filter((v: unknown) => typeof v === "string")
			: Array.isArray(fm?.order)
				? fm.order.filter((v: unknown) => typeof v === "string")
				: [];
		const unplaced = Array.isArray(fm?.unplaced) ? fm.unplaced.filter((v: unknown) => typeof v === "string") : [];
		const archive = Array.isArray(fm?.archive) ? fm.archive.filter((v: unknown) => typeof v === "string") : [];
		return {
			bookIdReference: typeof fm?.["book-id-reference"] === "string" ? fm["book-id-reference"] : "",
			bookTitleReference:
				typeof fm?.["book-title-reference"] === "string" ? fm["book-title-reference"] : bookFolderName,
			seriesOrderReference: typeof fm?.["series-order-reference"] === "number" ? fm["series-order-reference"] : null,
			coverImage: safeCoverFilename(fm?.["cover-image"]),
			goalDaily: typeof fm?.goal_daily === "number" ? fm.goal_daily : null,
			chapterOrder,
			unplaced,
			archive,
			compile: fm?.compile && typeof fm.compile === "object" ? (fm.compile as CompileSettings) : null,
			dialogueQuotes: normalizeDialogueQuoteStyle(fm?.["dialogue-quotes"]),
			defaultPovPath: typeof fm?.["default-pov-path"] === "string" ? fm["default-pov-path"] : null,
			defaultPovName: typeof fm?.["default-pov-name"] === "string" ? fm["default-pov-name"] : null,
			chapters: parseChaptersMap(fm?.chapters),
			novelTags: Array.isArray(fm?.["novel-tags"])
				? fm["novel-tags"].filter((v: unknown): v is string => typeof v === "string")
				: [],
		};
}

export function getBookChapters(app: App, bookFolderName: string): OrderResult<TFile> {
	const files = getBookChapterFiles(app, bookFolderName);
	const fm = readBookFrontmatter(app, bookFolderName);
	const archived = new Set(fm?.archive ?? []);
	const liveFiles = files.filter((file) => !archived.has(file.name));
	return resolveOrder(liveFiles, fm?.chapterOrder ?? [], (file) => file.name);
}

/** Returns every archived chapter (filename + display title), scoped to `bookFolderName` if given, otherwise across all books. */
export function getArchivedChapters(app: App, bookFolderName?: string): { bookFolderName: string; bookTitle: string; filename: string; chapterTitle: string }[] {
	const result: { bookFolderName: string; bookTitle: string; filename: string; chapterTitle: string }[] = [];
	const names = bookFolderName ? [bookFolderName] : getLibraryBookFolders(app).map((f) => f.name);
	for (const name of names) {
		const fm = readBookFrontmatter(app, name);
		if (!fm) continue;
		for (const filename of fm.archive) {
			result.push({
				bookFolderName: name,
				bookTitle: fm.bookTitleReference || name,
				filename,
				chapterTitle: chapterDisplayTitle(app, name, filename),
			});
		}
	}
	return result;
}

export function getChapterEntry(app: App, bookFolderName: string, filename: string): ChapterEntry | null {
	return readBookFrontmatter(app, bookFolderName)?.chapters[filename] ?? null;
}

/** Falls back to the filename (sans ".md") if no entry exists yet — same defensive pattern as `bookDisplayTitle`. */
export function chapterDisplayTitle(app: App, bookFolderName: string, filename: string): string {
	return getChapterEntry(app, bookFolderName, filename)?.chapterTitle ?? filename.replace(/\.md$/i, "");
}

/** The chapter's title, with "#" resolved to its number among the book's "#"-titled chapters (same counter the chapter list's rows use). */
export function numberedChapterTitle(
	app: App,
	bookFolderName: string,
	filename: string,
	style: NumberingStyle = "arabic",
): string {
	const { ordered, unplaced } = getBookChapters(app, bookFolderName);
	const sequence = [...ordered, ...unplaced];
	const idx = sequence.findIndex((file) => file.name === filename);
	if (idx === -1) return chapterDisplayTitle(app, bookFolderName, filename);
	const numbered = applyHashNumbering(sequence.map((file) => chapterDisplayTitle(app, bookFolderName, file.name)), style);
	return numbered[idx];
}

export function collectAllChapterIds(app: App, bookFolderName: string): string[] {
	return Object.values(readBookFrontmatter(app, bookFolderName)?.chapters ?? {}).map((entry) => entry.chapterId);
}

export async function writeBookChapterOrder(app: App, bookFolderName: string, newOrder: string[]): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		fm["chapter-order"] = newOrder;
	});
}

/** Writes/replaces the book's cover image (`_backstage/storyforge/<book>/cover.<ext>`) and records its filename in novel-<code>.md's frontmatter. Removes the previous cover file first if its extension differs. Returns the new cover's vault path. */
export async function writeBookCoverImage(
	app: App,
	bookFolderName: string,
	data: ArrayBuffer,
	extension: string,
): Promise<string> {
	const previous = readBookFrontmatter(app, bookFolderName)?.coverImage ?? null;
	const filename = `cover.${safeCoverExtension(extension)}`;
	const folder = bookBackstagePath(bookFolderName);
	const path = `${folder}/${filename}`;
	if (previous && previous !== filename) {
		await deleteBackstagePath(app, `${folder}/${previous}`);
	}
	await writeBackstageBinary(app.vault, path, data);

	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		fm["cover-image"] = filename;
	});
	return path;
}

/** Moves a chapter to the archive list, removing it from chapter-order and unplaced. */
export async function archiveChapter(app: App, bookFolderName: string, filename: string): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapterOrder = Array.isArray(fm["chapter-order"]) ? fm["chapter-order"] : [];
		const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
		const archive = Array.isArray(fm.archive) ? fm.archive : [];
		fm["chapter-order"] = chapterOrder.filter((v) => v !== filename);
		fm.unplaced = unplaced.filter((v) => v !== filename);
		if (!archive.includes(filename)) archive.push(filename);
		fm.archive = archive;
	});
}

/** Moves a chapter out of the archive back into the unplaced list. */
export async function unarchiveChapter(app: App, bookFolderName: string, filename: string): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
		const archive = Array.isArray(fm.archive) ? fm.archive : [];
		fm.archive = archive.filter((v) => v !== filename);
		if (!unplaced.includes(filename)) unplaced.push(filename);
		fm.unplaced = unplaced;
	});
}

/** Writes novel.md's `-reference` mirror fields from already-known-good values (never re-reads series.md's cache). */
async function writeBookReferenceFields(
	app: App,
	bookFolderName: string,
	bookId: string,
	bookTitle: string,
	position: number | null,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			fm["book-id-reference"] = bookId;
			fm["book-title-reference"] = bookTitle;
			fm["series-order-reference"] = position;
		},
	);
}

/**
 * Bulk-syncs every book's `-reference` mirrors, in series display order
 * (ordered, then unplaced). Pass `booksOverride`/`sequenceOverride` (e.g. the
 * map just returned by `ensureAllSeriesBookEntries`, or an order just written
 * by the caller) when this runs right after a series.md write in the same
 * call chain, to avoid a stale `metadataCache` re-read; omit either for a
 * standalone sync (e.g. on load, once prior writes have had time to settle).
 */
export async function syncAllBookReferenceFields(
	app: App,
	booksOverride?: Record<string, SeriesBookEntry>,
	sequenceOverride?: TFolder[],
): Promise<void> {
	const books = booksOverride ?? readSeriesFrontmatter(app).books;
	const sequence =
		sequenceOverride ??
		(() => {
			const { ordered, unplaced } = getSeriesBooks(app);
			return [...ordered, ...unplaced];
		})();
	for (let i = 0; i < sequence.length; i++) {
		const entry = books[sequence[i].name];
		if (!entry) continue;
		await writeBookReferenceFields(app, sequence[i].name, entry.bookId, entry.bookTitle, i + 1);
	}
}

/** Edits a book's title (series.md, authoritative) and refreshes its novel.md mirror using the values just written — no stale re-read. */
export async function renameBookTitle(app: App, bookFolderName: string, newTitle: string): Promise<void> {
	const position = getSeriesOrderPosition(app, bookFolderName);
	const { bookId } = await writeSeriesBookTitle(app, bookFolderName, newTitle);
	await writeBookReferenceFields(app, bookFolderName, bookId, newTitle, position);
}

/** Reorders the series (series.md, authoritative) and refreshes every book's `series-order-reference`, since a reorder can shift more than one book's position. */
export async function reorderSeriesBooks(app: App, newOrder: string[]): Promise<void> {
	const { books } = readSeriesFrontmatter(app);
	await writeSeriesOrder(app, newOrder);

	// Resolved from `newOrder` directly (not re-read via getSeriesBooks) since the
	// metadataCache may not have caught up with the write above yet.
	const folders = getLibraryBookFolders(app);
	const { ordered, unplaced } = resolveOrder(folders, newOrder, (folder) => folder.name);
	await syncAllBookReferenceFields(app, books, [...ordered, ...unplaced]);
}

/** Overwrites (or inserts) one chapter's entry in novel.md's `chapters` map. */
export async function upsertChapterEntry(
	app: App,
	bookFolderName: string,
	filename: string,
	chapterId: string,
	chapterTitle: string,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		chapters[filename] = { ...existing, "chapter-id": chapterId, "chapter-title": chapterTitle };
		fm.chapters = chapters;
	});
}

/** Edits a chapter's title in novel.md — a single write, since chapters have no separate mirror file the way books mirror series.md into novel.md. */
export async function renameChapterTitle(
	app: App,
	bookFolderName: string,
	filename: string,
	newTitle: string,
): Promise<void> {
	const { bookId } = resolveBookIdentity(app, bookFolderName);
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const chapterId: string =
			typeof existing["chapter-id"] === "string"
				? existing["chapter-id"]
				: nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
		chapters[filename] = { ...existing, "chapter-id": chapterId, "chapter-title": newTitle };
		fm.chapters = chapters;
	});
}

/** Declared dialogue quote style for narrator span scoping (`double` default). */
export async function writeDialogueQuotes(
	app: App,
	bookFolderName: string,
	style: DialogueQuoteStyle,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		fm["dialogue-quotes"] = style;
	});
}

/** Sets (or clears) the book-level default PoV used when a chapter has none. */
export async function writeDefaultPov(
	app: App,
	bookFolderName: string,
	povPath: string | null,
	povName: string | null,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		fm["default-pov-path"] = povPath;
		fm["default-pov-name"] = povName;
	});
}

/** Overwrites a chapter's ordered PoV list (empty array clears). */
export async function writeChapterPov(
	app: App,
	bookFolderName: string,
	filename: string,
	refs: CodexRef[],
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const next = withChapterIdentity(app, bookFolderName, filename, existing);
		applyCodexRefList(next, "pov", "pov-path", "pov-name", refs);
		chapters[filename] = next;
		fm.chapters = chapters;
	});
}

/** Overwrites a chapter's ordered location list (empty array clears). */
export async function writeChapterLocation(
	app: App,
	bookFolderName: string,
	filename: string,
	refs: CodexRef[],
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const next = withChapterIdentity(app, bookFolderName, filename, existing);
		applyCodexRefList(next, "location", "location-path", "location-name", refs);
		chapters[filename] = next;
		fm.chapters = chapters;
	});
}

/** Overwrites a chapter's full tag set (ids into tagRegistry.ts's chapterTags list), preserving every other field. An empty array clears tags entirely. */
export async function writeChapterTags(app: App, bookFolderName: string, filename: string, tagIds: string[]): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		chapters[filename] = { ...existing, tags: tagIds.length > 0 ? tagIds : undefined };
		fm.chapters = chapters;
	});
}

/** Assigns (or, passing null, clears) one chapter's plot thread — see ChapterTitleModal's thread
 * rows and resolveChapterRowColor. Clears any leftover `chapter-color` so the named thread is the
 * single source of truth. Preserves the entry's other fields via a spread. */
export async function writeChapterPlotThread(
	app: App,
	bookFolderName: string,
	filename: string,
	plotThreadId: string | null,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const next: RawChapterEntry = { ...existing };
		if (plotThreadId) next["plot-thread"] = plotThreadId;
		else delete next["plot-thread"];
		delete next["chapter-color"];
		chapters[filename] = next;
		fm.chapters = chapters;
	});
}

/** Overwrites (or clears, passing null) one chapter's leftover anonymous colour override.
 * New picks go through writeChapterPlotThread; this remains for legacy `chapter-color` values. */
export async function writeChapterColor(app: App, bookFolderName: string, filename: string, hex: string | null): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const next: RawChapterEntry = { ...existing };
		if (hex) next["chapter-color"] = hex;
		else delete next["chapter-color"];
		chapters[filename] = next;
		fm.chapters = chapters;
	});
}

/** Overwrites the novel's full tag set (ids into tagRegistry.ts's novelTags list). An empty array clears the field entirely. */
export async function writeNovelTags(app: App, bookFolderName: string, tagIds: string[]): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		fm["novel-tags"] = tagIds.length > 0 ? tagIds : undefined;
	});
}

/** Rewrites any chapter's PoV reference matching `oldPath` to `newPath` (or drops it if `newPath` is null), across every book — called when a Codex person note is renamed/moved. */
export async function rekeyChapterPovReferences(app: App, oldPath: string, newPath: string | null): Promise<void> {
	for (const folder of getLibraryBookFolders(app)) {
		const fm = readBookFrontmatter(app, folder.name);
		if (!fm) continue;
		const hasChapterMatch = Object.values(fm.chapters).some((entry) => entry.pov.some((r) => r.path === oldPath));
		const hasDefaultMatch = fm.defaultPovPath === oldPath;
		if (!hasChapterMatch && !hasDefaultMatch) continue;
		await modifyBookFrontmatter(app, folder.name, (bfm) => {
			if (bfm["default-pov-path"] === oldPath) {
				bfm["default-pov-path"] = newPath;
				bfm["default-pov-name"] = newPath ? bfm["default-pov-name"] : null;
			}
			const chapters: Record<string, RawChapterEntry> = bfm.chapters && typeof bfm.chapters === "object" ? bfm.chapters : {};
			for (const [filename, entry] of Object.entries(chapters)) {
				const current = parseCodexRefs(entry.pov, entry["pov-path"], entry["pov-name"]);
				const next = rekeyCodexRefList(current, oldPath, newPath);
				if (next.length === current.length && next.every((r, i) => r.path === current[i].path)) continue;
				const updated: RawChapterEntry = { ...entry };
				applyCodexRefList(updated, "pov", "pov-path", "pov-name", next);
				chapters[filename] = updated;
			}
			bfm.chapters = chapters;
		});
	}
}

/** Rewrites any chapter's location reference matching `oldPath` to `newPath` (or drops it if `newPath` is null), across every book — called when a Codex place note is renamed/moved. */
export async function rekeyChapterLocationReferences(app: App, oldPath: string, newPath: string | null): Promise<void> {
	for (const folder of getLibraryBookFolders(app)) {
		const fm = readBookFrontmatter(app, folder.name);
		if (!fm) continue;
		const hasMatch = Object.values(fm.chapters).some((entry) => entry.location.some((r) => r.path === oldPath));
		if (!hasMatch) continue;
		await modifyBookFrontmatter(app, folder.name, (bfm) => {
			const chapters: Record<string, RawChapterEntry> = bfm.chapters && typeof bfm.chapters === "object" ? bfm.chapters : {};
			for (const [filename, entry] of Object.entries(chapters)) {
				const current = parseCodexRefs(entry.location, entry["location-path"], entry["location-name"]);
				const next = rekeyCodexRefList(current, oldPath, newPath);
				if (next.length === current.length && next.every((r, i) => r.path === current[i].path)) continue;
				const updated: RawChapterEntry = { ...entry };
				applyCodexRefList(updated, "location", "location-path", "location-name", next);
				chapters[filename] = updated;
			}
			bfm.chapters = chapters;
		});
	}
}

/** Rekeys a chapter's `chapters` map entry when its file is renamed outside the plugin. No-op if `oldFilename` isn't present. */
export async function renameChapterEntry(
	app: App,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		if (Object.prototype.hasOwnProperty.call(chapters, oldFilename)) {
			chapters[newFilename] = chapters[oldFilename];
			delete chapters[oldFilename];
			fm.chapters = chapters;
		}
		const rekeyList = (list: unknown): string[] => {
			if (!Array.isArray(list)) return [];
			return list.filter((v): v is string => typeof v === "string").map((v) => (v === oldFilename ? newFilename : v));
		};
		fm["chapter-order"] = rekeyList(fm["chapter-order"]);
		fm.unplaced = rekeyList(fm.unplaced);
		fm.archive = rekeyList(fm.archive);
	});
}

/** Removes a chapter from novel.md's chapters map and order/unplaced/archive lists. */
export async function removeChapterEntry(app: App, bookFolderName: string, filename: string): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		delete chapters[filename];
		fm.chapters = chapters;
		const strip = (list: unknown): string[] =>
			Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && v !== filename) : [];
		fm["chapter-order"] = strip(fm["chapter-order"]);
		fm.unplaced = strip(fm.unplaced);
		fm.archive = strip(fm.archive);
	});
}

/**
 * Inserts a full chapter entry into the destination book (as unplaced). Used when a chapter
 * file is moved between library book folders outside the plugin.
 */
export async function insertChapterEntry(
	app: App,
	bookFolderName: string,
	filename: string,
	entry: ChapterEntry,
): Promise<void> {
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const raw: RawChapterEntry = {
			"chapter-id": entry.chapterId,
			"chapter-title": entry.chapterTitle,
			plot: entry.plot || undefined,
			tags: entry.tags.length > 0 ? entry.tags : undefined,
			"chapter-color": entry.color || undefined,
			"plot-thread": entry.plotThreadId || undefined,
		};
		applyCodexRefList(raw, "pov", "pov-path", "pov-name", entry.pov);
		applyCodexRefList(raw, "location", "location-path", "location-name", entry.location);
		chapters[filename] = raw;
		fm.chapters = chapters;
		const strip = (list: unknown): string[] =>
			Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && v !== filename) : [];
		fm["chapter-order"] = strip(fm["chapter-order"]);
		fm.archive = strip(fm.archive);
		const unplaced = strip(fm.unplaced);
		unplaced.push(filename);
		fm.unplaced = unplaced;
	});
}

/** Mints a `chapters` entry for every chapter file missing one. Never renames an existing id, never touches `order`. */
export async function ensureAllChapterEntries(app: App, bookFolderName: string): Promise<Record<string, ChapterEntry>> {
	const files = getBookChapterFiles(app, bookFolderName);
	const fm = readBookFrontmatter(app, bookFolderName);
	const chapters = fm?.chapters ?? {};
	const merged: Record<string, ChapterEntry> = { ...chapters };
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const knownIds = new Set(Object.values(chapters).map((e) => e.chapterId));
	const archived = new Set(fm?.archive ?? []);
	for (const file of files) {
		if (merged[file.name]) continue;
		if (archived.has(file.name)) continue;
		const chapterId = nextChapterCode(bookId, knownIds);
		knownIds.add(chapterId);
		const chapterTitle = file.basename;
		merged[file.name] = {
			chapterId,
			chapterTitle,
			pov: [],
			location: [],
			plot: "",
			tags: [],
			color: null,
			plotThreadId: null,
		};
		await upsertChapterEntry(app, bookFolderName, file.name, chapterId, chapterTitle);
	}
	return merged;
}

async function ensureLibraryBookFolder(app: App, folderName: string): Promise<void> {
	if (!app.vault.getAbstractFileByPath(LIBRARY_ROOT)) {
		await app.vault.createFolder(LIBRARY_ROOT);
	}
	const path = libraryBookPath(folderName);
	if (!app.vault.getAbstractFileByPath(path)) {
		await app.vault.createFolder(path);
	}
}

/** Contains "#" deliberately — applyHashNumbering resolves it to each book's series position at
 * display time (see numberedBookTitle), so every auto-titled book is distinct ("Novel 1", "Novel 2",
 * ...) without needing its own disambiguation pass the way a flat default title once did. */
const DEFAULT_BOOK_TITLE = "Novel #";

/**
 * Creates a new book: a folder named with a gap-free sequential letter code
 * (aaa, aab, ... — the same scheme chapter codes use) in both the story
 * library and backstage, registered in series.md. Only the very first book
 * in an empty vault is appended to the series order (so a brand-new vault
 * isn't left with an empty-looking series pane) — every book after that
 * lands in Unplaced instead, same as a new chapter does, so the writer
 * decides where it belongs in the sequence.
 */
export async function createBook(app: App, initialTitle?: string): Promise<{ folderName: string; bookId: string }> {
	const { order, books } = readSeriesFrontmatter(app);
	const existingFolders = getLibraryBookFolders(app);
	const candidateSpace = new Set<string>([
		...existingFolders.map((f) => f.name),
		...Object.keys(books),
		...order,
	]);
	const folderName = nextNovelCode(candidateSpace);
	const bookId = mintId(folderName, collectAllBookIds(app));
	const bookTitle = initialTitle?.trim() || DEFAULT_BOOK_TITLE;
	const isFirstBook = existingFolders.length === 0;
	// Read before writing — no stale-cache risk. Position is this book's spot in the display
	// sequence (ordered, then unplaced): right after every already-placed book when it's placed
	// itself, or after every already-unplaced book too when it's landing in Unplaced instead.
	const { ordered, unplaced } = getSeriesBooks(app);
	const position = isFirstBook ? ordered.length + 1 : ordered.length + unplaced.length + 1;

	await ensureLibraryBookFolder(app, folderName);
	await upsertSeriesBookEntry(app, folderName, bookId, bookTitle, { appendToOrder: isFirstBook });
	await writeBookReferenceFields(app, folderName, bookId, bookTitle, position);

	return { folderName, bookId };
}

/**
 * Creates a new chapter: a file named `<chapter-id>.md` (lowercase, e.g.
 * "knna_chapter-aaa.md") directly in the book's story-library folder,
 * registered in novel-<code>.md's `chapters` map with a default "Chapter #" title
 * (contains "#" deliberately — applyHashNumbering resolves it to the chapter's position at
 * display time, same idiom as `DEFAULT_BOOK_TITLE`), then opened (unless `openFile: false` —
 * the idea-chapter creation path deliberately doesn't steal editor focus). Creating the empty
 * manuscript file (and `createBook`'s folder creation) are intentional library exceptions —
 * the plugin never modifies chapter prose after that.
 */
export async function createChapter(
	app: App,
	bookFolderName: string,
	options?: { openFile?: boolean },
): Promise<{ filename: string; chapterId: string }> {
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const chapterId = nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
	const filename = `${chapterId}.md`;
	const path = libraryChapterPath(bookFolderName, filename);

	await ensureLibraryBookFolder(app, bookFolderName);
	const file = await app.vault.create(path, "");
	await upsertChapterEntry(app, bookFolderName, filename, chapterId, "Chapter #");
	if (options?.openFile !== false) {
		await app.workspace.getLeaf(false).openFile(file);
	}

	return { filename, chapterId };
}

const SYNOPSIS_HEADER = "## Synopsis";

/** Reads the book's synopsis from novel.md's body, under a `## Synopsis` heading. Empty string if none exists yet. */
export async function readBookSynopsis(app: App, bookFolderName: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(bookFilePath(bookFolderName));
	if (!(file instanceof TFile)) return "";
	const { body } = splitFrontmatterAndBody(await app.vault.read(file));
	return extractSection(body, SYNOPSIS_HEADER);
}

/** Writes the book's synopsis into novel.md's body under a `## Synopsis` heading, leaving the frontmatter and any other body content untouched. */
export async function writeBookSynopsis(app: App, bookFolderName: string, synopsis: string): Promise<void> {
	const path = bookFilePath(bookFolderName);
	await enqueueBackstageWrite(path, async () => {
		const file = app.vault.getAbstractFileByPath(path);
		let raw: string;
		if (file instanceof TFile) {
			raw = await app.vault.read(file);
		} else {
			const { bookId, bookTitle, position } = resolveBookIdentity(app, bookFolderName);
			raw = defaultBookContent(bookId, bookTitle, position);
		}
		const { frontmatterBlock, body } = splitFrontmatterAndBody(raw);
		await writeBackstageFile(app.vault, path, frontmatterBlock + upsertSection(body, SYNOPSIS_HEADER, synopsis));
	});
}

/** Reads a chapter's plot notes from novel.md's `chapters` map. Empty string if none exists yet. */
export async function readChapterPlot(app: App, bookFolderName: string, filename: string): Promise<string> {
	return getChapterEntry(app, bookFolderName, filename)?.plot ?? "";
}

/**
 * Writes a chapter's plot notes into novel.md's `chapters.<file>.plot` field (backstage
 * metadata). Empty plot clears the field so the YAML stays easy to read by hand.
 */
export async function writeChapterPlot(app: App, bookFolderName: string, filename: string, plot: string): Promise<void> {
	const trimmed = plot.trim();
	const { bookId } = resolveBookIdentity(app, bookFolderName);
	await modifyBookFrontmatter(app, bookFolderName, (fm) => {
		const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		const existing: RawChapterEntry =
			chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
		const chapterId: string =
			typeof existing["chapter-id"] === "string"
				? existing["chapter-id"]
				: nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
		const chapterTitle: string =
			typeof existing["chapter-title"] === "string" ? existing["chapter-title"] : filename.replace(/\.md$/i, "");
		const next: RawChapterEntry = { ...existing, "chapter-id": chapterId, "chapter-title": chapterTitle };
		if (trimmed) next.plot = trimmed;
		else delete next.plot;
		chapters[filename] = next;
		fm.chapters = chapters;
	});
}
