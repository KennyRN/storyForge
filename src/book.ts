import { App, TFile, TFolder, type FrontMatterCache } from "obsidian";
import { bookBackstagePath, bookFilePath, libraryBookPath, libraryChapterPath, LIBRARY_ROOT } from "./paths";
import { resolveOrder, type OrderResult } from "./ordering";
import { mintId } from "./slug";
import { deleteBackstagePath, modifyBackstageFrontmatter, writeBackstageBinary, writeBackstageFile } from "./writeGuard";
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
import { nextBookFolderCode } from "./bookCode";
import { nextChapterCode } from "./chapterCode";
import { applyHashNumbering } from "./titleNumbering";

export interface CompileSettings {
	format?: string;
	chapter_heading?: string;
	separator?: string;
	output?: string;
}

export interface ChapterEntry {
	chapterId: string;
	chapterTitle: string;
	povPath: string | null;
	povName: string | null;
	locationPath: string | null;
	locationName: string | null;
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
	chapters: Record<string, ChapterEntry>;
}

/** The raw, dash-cased on-disk shape of a `chapters` map entry, before `parseChaptersMap` sanitizes it. */
export interface RawChapterEntry {
	"chapter-id"?: unknown;
	"chapter-title"?: unknown;
	"pov-path"?: unknown;
	"pov-name"?: unknown;
	"location-path"?: unknown;
	"location-name"?: unknown;
}

/** The raw, dash-cased on-disk shape of book.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
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
	/** Legacy pre-migration keys, deleted by migrateLegacyBookEntry. */
	id?: unknown;
	title?: unknown;
}

function defaultBookContent(bookId: string, bookTitle: string, seriesOrderReference: number | null): string {
	// JSON.stringify quotes/escapes the values so a title containing ":" or other
	// YAML-significant characters (e.g. "Book One: The Beginning") still parses.
	return `---\nbook-id-reference: ${JSON.stringify(bookId)}\nbook-title-reference: ${JSON.stringify(bookTitle)}\nseries-order-reference: ${seriesOrderReference ?? ""}\nchapter-order:\n---\n`;
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
		const povPath = typeof entry["pov-path"] === "string" ? entry["pov-path"] : null;
		const povName = typeof entry["pov-name"] === "string" ? entry["pov-name"] : null;
		const locationPath = typeof entry["location-path"] === "string" ? entry["location-path"] : null;
		const locationName = typeof entry["location-name"] === "string" ? entry["location-name"] : null;
		result[filename] = { chapterId, chapterTitle, povPath, povName, locationPath, locationName };
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
			coverImage: typeof fm?.["cover-image"] === "string" && fm["cover-image"] ? fm["cover-image"] : null,
			goalDaily: typeof fm?.goal_daily === "number" ? fm.goal_daily : null,
			chapterOrder,
			unplaced,
			archive,
			compile: fm?.compile && typeof fm.compile === "object" ? (fm.compile as CompileSettings) : null,
			chapters: parseChaptersMap(fm?.chapters),
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
export function numberedChapterTitle(app: App, bookFolderName: string, filename: string): string {
	const { ordered, unplaced } = getBookChapters(app, bookFolderName);
	const sequence = [...ordered, ...unplaced];
	const idx = sequence.findIndex((file) => file.name === filename);
	if (idx === -1) return chapterDisplayTitle(app, bookFolderName, filename);
	const numbered = applyHashNumbering(sequence.map((file) => chapterDisplayTitle(app, bookFolderName, file.name)));
	return numbered[idx];
}

export function collectAllChapterIds(app: App, bookFolderName: string): string[] {
	return Object.values(readBookFrontmatter(app, bookFolderName)?.chapters ?? {}).map((entry) => entry.chapterId);
}

export async function writeBookChapterOrder(app: App, bookFolderName: string, newOrder: string[]): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			fm["chapter-order"] = newOrder;
		},
	);
}

/** Writes/replaces the book's cover image (`_sf-backstage/<book>/cover.<ext>`) and records its filename in book.md's frontmatter. Removes the previous cover file first if its extension differs. Returns the new cover's vault path. */
export async function writeBookCoverImage(
	app: App,
	bookFolderName: string,
	data: ArrayBuffer,
	extension: string,
): Promise<string> {
	const previous = readBookFrontmatter(app, bookFolderName)?.coverImage ?? null;
	const filename = `cover.${extension}`;
	const folder = bookBackstagePath(bookFolderName);
	const path = `${folder}/${filename}`;
	if (previous && previous !== filename) {
		await deleteBackstagePath(app, `${folder}/${previous}`);
	}
	await writeBackstageBinary(app.vault, path, data);

	const bookPath = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		bookPath,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			fm["cover-image"] = filename;
		},
	);
	return path;
}

/** Moves a chapter to the archive list, removing it from chapter-order and unplaced. */
export async function archiveChapter(app: App, bookFolderName: string, filename: string): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapterOrder = Array.isArray(fm["chapter-order"]) ? fm["chapter-order"] : [];
			const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
			const archive = Array.isArray(fm.archive) ? fm.archive : [];
			fm["chapter-order"] = chapterOrder.filter((v) => v !== filename);
			fm.unplaced = unplaced.filter((v) => v !== filename);
			if (!archive.includes(filename)) archive.push(filename);
			fm.archive = archive;
		},
	);
}

/** Moves a chapter out of the archive back into the unplaced list. */
export async function unarchiveChapter(app: App, bookFolderName: string, filename: string): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
			const archive = Array.isArray(fm.archive) ? fm.archive : [];
			fm.archive = archive.filter((v) => v !== filename);
			if (!unplaced.includes(filename)) unplaced.push(filename);
			fm.unplaced = unplaced;
		},
	);
}

/** Writes book.md's `-reference` mirror fields from already-known-good values (never re-reads series.md's cache). */
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

/** Edits a book's title (series.md, authoritative) and refreshes its book.md mirror using the values just written — no stale re-read. */
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

/** Overwrites (or inserts) one chapter's entry in book.md's `chapters` map. */
export async function upsertChapterEntry(
	app: App,
	bookFolderName: string,
	filename: string,
	chapterId: string,
	chapterTitle: string,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
			chapters[filename] = { "chapter-id": chapterId, "chapter-title": chapterTitle };
			fm.chapters = chapters;
		},
	);
}

/** Edits a chapter's title in book.md — a single write, since chapters have no separate mirror file the way books mirror series.md into book.md. */
export async function renameChapterTitle(
	app: App,
	bookFolderName: string,
	filename: string,
	newTitle: string,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
			const existing: RawChapterEntry =
				chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
			const chapterId: string =
				typeof existing["chapter-id"] === "string"
					? existing["chapter-id"]
					: nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
			chapters[filename] = { ...existing, "chapter-id": chapterId, "chapter-title": newTitle };
			fm.chapters = chapters;
		},
	);
}

/** Sets (or, when both are null, clears) a chapter's PoV reference, preserving its existing id/title. */
export async function writeChapterPov(
	app: App,
	bookFolderName: string,
	filename: string,
	povPath: string | null,
	povName: string | null,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
			const existing: RawChapterEntry =
				chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
			chapters[filename] = { ...existing, "pov-path": povPath, "pov-name": povName };
			fm.chapters = chapters;
		},
	);
}

/** Sets (or, when both are null, clears) a chapter's location reference, preserving its existing id/title. */
export async function writeChapterLocation(
	app: App,
	bookFolderName: string,
	filename: string,
	locationPath: string | null,
	locationName: string | null,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters: Record<string, RawChapterEntry> = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
			const existing: RawChapterEntry =
				chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
			chapters[filename] = { ...existing, "location-path": locationPath, "location-name": locationName };
			fm.chapters = chapters;
		},
	);
}

/** Rewrites any chapter's PoV reference matching `oldPath` to `newPath` (or clears it if `newPath` is null), across every book — called when a Codex person note is renamed/moved. */
export async function rekeyChapterPovReferences(app: App, oldPath: string, newPath: string | null): Promise<void> {
	for (const folder of getLibraryBookFolders(app)) {
		const fm = readBookFrontmatter(app, folder.name);
		if (!fm) continue;
		const hasMatch = Object.values(fm.chapters).some((entry) => entry.povPath === oldPath);
		if (!hasMatch) continue;
		await modifyBackstageFrontmatter<RawBookFrontmatter>(app, app.vault, bookFilePath(folder.name), `---\norder:\n---\n`, (bfm) => {
			const chapters: Record<string, RawChapterEntry> = bfm.chapters && typeof bfm.chapters === "object" ? bfm.chapters : {};
			for (const [filename, entry] of Object.entries(chapters)) {
				if (entry["pov-path"] === oldPath) {
					chapters[filename] = { ...entry, "pov-path": newPath, "pov-name": newPath ? entry["pov-name"] : null };
				}
			}
			bfm.chapters = chapters;
		});
	}
}

/** Rewrites any chapter's location reference matching `oldPath` to `newPath` (or clears it if `newPath` is null), across every book — called when a Codex place note is renamed/moved. */
export async function rekeyChapterLocationReferences(app: App, oldPath: string, newPath: string | null): Promise<void> {
	for (const folder of getLibraryBookFolders(app)) {
		const fm = readBookFrontmatter(app, folder.name);
		if (!fm) continue;
		const hasMatch = Object.values(fm.chapters).some((entry) => entry.locationPath === oldPath);
		if (!hasMatch) continue;
		await modifyBackstageFrontmatter<RawBookFrontmatter>(app, app.vault, bookFilePath(folder.name), `---\norder:\n---\n`, (bfm) => {
			const chapters: Record<string, RawChapterEntry> = bfm.chapters && typeof bfm.chapters === "object" ? bfm.chapters : {};
			for (const [filename, entry] of Object.entries(chapters)) {
				if (entry["location-path"] === oldPath) {
					chapters[filename] = {
						...entry,
						"location-path": newPath,
						"location-name": newPath ? entry["location-name"] : null,
					};
				}
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
	const path = bookFilePath(bookFolderName);
	await modifyBackstageFrontmatter<RawBookFrontmatter>(app, app.vault, path, `---\norder:\n---\n`, (fm) => {
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
		merged[file.name] = { chapterId, chapterTitle, povPath: null, povName: null, locationPath: null, locationName: null };
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

const DEFAULT_BOOK_TITLE = "Untitled Novel";

/** "Untitled Novel" / "Untitled Novel 2" / ... — same base+number disambiguation idiom as codex's uniqueChildPath. */
function uniqueBookTitle(base: string, existingTitles: Iterable<string>): string {
	const taken = new Set(existingTitles);
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base} ${n}`)) n++;
	return `${base} ${n}`;
}

/**
 * Creates a new book: a folder named with a 4-letter code (3 letters from the
 * series title + a sequential guide letter) in both the story library and
 * backstage, registered in series.md and appended to the series order.
 */
export async function createBook(app: App, initialTitle?: string): Promise<{ folderName: string; bookId: string }> {
	const { seriesTitle, order, books } = readSeriesFrontmatter(app);
	const candidateSpace = new Set<string>([
		...getLibraryBookFolders(app).map((f) => f.name),
		...Object.keys(books),
		...order,
	]);
	const folderName = nextBookFolderCode(seriesTitle, candidateSpace);
	const bookId = mintId(folderName, collectAllBookIds(app));
	const bookTitle =
		initialTitle?.trim() || uniqueBookTitle(DEFAULT_BOOK_TITLE, Object.values(books).map((entry) => entry.bookTitle));
	// Appended to the end of `order`, so its display position is right after
	// every book already placed (read before writing — no stale-cache risk).
	const { ordered } = getSeriesBooks(app);
	const position = ordered.length + 1;

	await ensureLibraryBookFolder(app, folderName);
	await upsertSeriesBookEntry(app, folderName, bookId, bookTitle, { appendToOrder: true });
	await writeBookReferenceFields(app, folderName, bookId, bookTitle, position);

	return { folderName, bookId };
}

/**
 * Creates a new chapter: a file named `<chapter-id>.md` (lowercase, e.g.
 * "knna_chapter-aaa.md") directly in the book's story-library folder,
 * registered in book.md's `chapters` map with a default "Untitled" title,
 * then opened. This — along with `createBook`'s folder creation — is one of
 * the only two plugin-initiated writes inside `_sf-storylibrary`.
 */
export async function createChapter(app: App, bookFolderName: string): Promise<{ filename: string; chapterId: string }> {
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const chapterId = nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
	const filename = `${chapterId}.md`;
	const path = libraryChapterPath(bookFolderName, filename);

	const file = await app.vault.create(path, "");
	await upsertChapterEntry(app, bookFolderName, filename, chapterId, "Untitled");
	await app.workspace.getLeaf(false).openFile(file);

	return { filename, chapterId };
}

const SYNOPSIS_HEADER = "## Synopsis";
const PLOT_HEADER = "## Plot";

/** Splits raw file content into its frontmatter fence (verbatim, incl. trailing newline) and body. */
function splitFrontmatterAndBody(raw: string): { frontmatterBlock: string; body: string } {
	if (!raw.startsWith("---")) return { frontmatterBlock: "", body: raw };
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return { frontmatterBlock: "", body: raw };
	let fenceEnd = end + 4;
	if (raw[fenceEnd] === "\n") fenceEnd += 1;
	return { frontmatterBlock: raw.slice(0, fenceEnd), body: raw.slice(fenceEnd) };
}

function extractSection(body: string, header: string): string {
	const idx = body.indexOf(header);
	if (idx === -1) return "";
	const start = idx + header.length;
	const nextHeaderIdx = body.indexOf("\n## ", start);
	return (nextHeaderIdx === -1 ? body.slice(start) : body.slice(start, nextHeaderIdx)).trim();
}

/** Replaces (or appends) the given `## `-prefixed section, leaving any other body content untouched. */
function upsertSection(body: string, header: string, content: string): string {
	const newSection = `${header}\n${content.trim()}\n`;
	const idx = body.indexOf(header);
	if (idx === -1) {
		const sep = body.trim().length === 0 ? "" : "\n";
		return `${body.trimEnd()}${sep}\n${newSection}`;
	}
	const start = idx + header.length;
	const nextHeaderIdx = body.indexOf("\n## ", start);
	const before = body.slice(0, idx);
	const after = nextHeaderIdx === -1 ? "" : body.slice(nextHeaderIdx + 1);
	return `${before}${newSection}${after}`;
}

/** Reads the book's synopsis from book.md's body, under a `## Synopsis` heading. Empty string if none exists yet. */
export async function readBookSynopsis(app: App, bookFolderName: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(bookFilePath(bookFolderName));
	if (!(file instanceof TFile)) return "";
	const { body } = splitFrontmatterAndBody(await app.vault.read(file));
	return extractSection(body, SYNOPSIS_HEADER);
}

/** Writes the book's synopsis into book.md's body under a `## Synopsis` heading, leaving the frontmatter and any other body content untouched. */
export async function writeBookSynopsis(app: App, bookFolderName: string, synopsis: string): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const file = app.vault.getAbstractFileByPath(path);
	let raw: string;
	if (file instanceof TFile) {
		raw = await app.vault.read(file);
	} else {
		const entry = getSeriesBookEntry(app, bookFolderName);
		const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
		const bookTitle = entry?.bookTitle ?? bookFolderName;
		raw = defaultBookContent(bookId, bookTitle, getSeriesOrderPosition(app, bookFolderName));
	}
	const { frontmatterBlock, body } = splitFrontmatterAndBody(raw);
	await writeBackstageFile(app.vault, path, frontmatterBlock + upsertSection(body, SYNOPSIS_HEADER, synopsis));
}

/** Reads a chapter's plot notes from its own file body, under a `## Plot` heading. Empty string if none exists yet. */
export async function readChapterPlot(app: App, bookFolderName: string, filename: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, filename));
	if (!(file instanceof TFile)) return "";
	const { body } = splitFrontmatterAndBody(await app.vault.read(file));
	return extractSection(body, PLOT_HEADER);
}

/** Writes a chapter's plot notes into its own file body under a `## Plot` heading, leaving frontmatter and the chapter's manuscript prose untouched. Chapter files live in the story library, so this writes directly via vault.modify rather than through the backstage guard (which physically refuses library writes). */
export async function writeChapterPlot(app: App, bookFolderName: string, filename: string, plot: string): Promise<void> {
	const path = libraryChapterPath(bookFolderName, filename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const { frontmatterBlock, body } = splitFrontmatterAndBody(await app.vault.read(file));
	await app.vault.modify(file, frontmatterBlock + upsertSection(body, PLOT_HEADER, plot));
}
