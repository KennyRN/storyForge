import { App, TFile, TFolder } from "obsidian";
import { bookFilePath, libraryBookPath, libraryChapterPath, LIBRARY_ROOT } from "./paths";
import { resolveOrder, type OrderResult } from "./ordering";
import { mintId } from "./slug";
import { modifyBackstageFrontmatter } from "./writeGuard";
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
	chapters: Record<string, ChapterEntry>;
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
		result[filename] = { chapterId, chapterTitle };
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

export function getChapterId(app: App, bookFolderName: string, filename: string): string | null {
	return getChapterEntry(app, bookFolderName, filename)?.chapterId ?? null;
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
	await modifyBackstageFrontmatter(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			fm["chapter-order"] = newOrder;
		},
	);
}

/** Moves a chapter to the archive list, removing it from chapter-order and unplaced. */
export async function archiveChapter(app: App, bookFolderName: string, filename: string): Promise<void> {
	const path = bookFilePath(bookFolderName);
	const entry = getSeriesBookEntry(app, bookFolderName);
	const bookId = entry?.bookId ?? mintId(bookFolderName, collectAllBookIds(app));
	const bookTitle = entry?.bookTitle ?? bookFolderName;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await modifyBackstageFrontmatter(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapterOrder = Array.isArray(fm["chapter-order"]) ? fm["chapter-order"] : [];
			const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
			const archive = Array.isArray(fm.archive) ? fm.archive : [];
			fm["chapter-order"] = chapterOrder.filter((v: string) => v !== filename);
			fm.unplaced = unplaced.filter((v: string) => v !== filename);
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
	await modifyBackstageFrontmatter(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const unplaced = Array.isArray(fm.unplaced) ? fm.unplaced : [];
			const archive = Array.isArray(fm.archive) ? fm.archive : [];
			fm.archive = archive.filter((v: string) => v !== filename);
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
	await modifyBackstageFrontmatter(
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

/** Rewrites one book's `-reference` mirror fields in book.md from series.md's authoritative data. No-op if the folder has no series.md entry yet. */
export async function syncBookReferenceFields(app: App, bookFolderName: string): Promise<void> {
	const entry = getSeriesBookEntry(app, bookFolderName);
	if (!entry) return;
	const position = getSeriesOrderPosition(app, bookFolderName);
	await writeBookReferenceFields(app, bookFolderName, entry.bookId, entry.bookTitle, position);
}

/**
 * Bulk-syncs every book's `-reference` mirrors. Pass `booksOverride` (e.g. the
 * map just returned by `ensureAllSeriesBookEntries`) when this runs right
 * after a series.md write in the same call chain, to avoid a stale
 * `metadataCache` re-read; omit it for a standalone sync (e.g. on load, once
 * prior writes have had time to settle).
 */
export async function syncAllBookReferenceFields(
	app: App,
	booksOverride?: Record<string, SeriesBookEntry>,
): Promise<void> {
	const books = booksOverride ?? readSeriesFrontmatter(app).books;
	const { ordered, unplaced } = getSeriesBooks(app);
	const sequence = [...ordered, ...unplaced];
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

	const folders = getLibraryBookFolders(app);
	const { ordered, unplaced } = resolveOrder(folders, newOrder, (folder) => folder.name);
	const sequence = [...ordered, ...unplaced];
	for (let i = 0; i < sequence.length; i++) {
		const entry = books[sequence[i].name];
		if (!entry) continue;
		await writeBookReferenceFields(app, sequence[i].name, entry.bookId, entry.bookTitle, i + 1);
	}
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
	await modifyBackstageFrontmatter(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
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
	await modifyBackstageFrontmatter(
		app,
		app.vault,
		path,
		defaultBookContent(bookId, bookTitle, position),
		(fm) => {
			const chapters = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
			const existing = chapters[filename] && typeof chapters[filename] === "object" ? chapters[filename] : {};
			const chapterId: string =
				typeof existing["chapter-id"] === "string"
					? existing["chapter-id"]
					: nextChapterCode(bookId, collectAllChapterIds(app, bookFolderName));
			chapters[filename] = { "chapter-id": chapterId, "chapter-title": newTitle };
			fm.chapters = chapters;
		},
	);
}

/** Rekeys a chapter's `chapters` map entry when its file is renamed outside the plugin. No-op if `oldFilename` isn't present. */
export async function renameChapterEntry(
	app: App,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const path = bookFilePath(bookFolderName);
	await modifyBackstageFrontmatter(app, app.vault, path, `---\norder:\n---\n`, (fm) => {
		const chapters = fm.chapters && typeof fm.chapters === "object" ? fm.chapters : {};
		if (Object.prototype.hasOwnProperty.call(chapters, oldFilename)) {
			chapters[newFilename] = chapters[oldFilename];
			delete chapters[oldFilename];
			fm.chapters = chapters;
		}
		const rekeyList = (list: unknown): string[] => {
			if (!Array.isArray(list)) return [];
			return list.map((v) => (v === oldFilename ? newFilename : v));
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
		merged[file.name] = { chapterId, chapterTitle };
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
	const bookTitle = initialTitle?.trim() || folderName;
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
