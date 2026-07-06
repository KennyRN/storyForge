import { App, TFile, TFolder } from "obsidian";
import { bookFilePath, libraryBookPath, LIBRARY_ROOT } from "./paths";
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

export interface CompileSettings {
	format?: string;
	chapter_heading?: string;
	separator?: string;
	output?: string;
}

export interface BookFrontmatter {
	goalDaily: number | null;
	order: string[];
	compile: CompileSettings | null;
	bookIdReference: string;
	bookTitleReference: string;
	seriesOrderReference: number | null;
}

function defaultBookContent(bookId: string, bookTitle: string, seriesOrderReference: number | null): string {
	// JSON.stringify quotes/escapes the values so a title containing ":" or other
	// YAML-significant characters (e.g. "Book One: The Beginning") still parses.
	return `---\nbook-id-reference: ${JSON.stringify(bookId)}\nbook-title-reference: ${JSON.stringify(bookTitle)}\nseries-order-reference: ${seriesOrderReference ?? ""}\norder:\n---\n`;
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
	const order = Array.isArray(fm?.order) ? fm.order.filter((v: unknown) => typeof v === "string") : [];
	return {
		bookIdReference: typeof fm?.["book-id-reference"] === "string" ? fm["book-id-reference"] : "",
		bookTitleReference:
			typeof fm?.["book-title-reference"] === "string" ? fm["book-title-reference"] : bookFolderName,
		seriesOrderReference: typeof fm?.["series-order-reference"] === "number" ? fm["series-order-reference"] : null,
		goalDaily: typeof fm?.goal_daily === "number" ? fm.goal_daily : null,
		order,
		compile: fm?.compile && typeof fm.compile === "object" ? (fm.compile as CompileSettings) : null,
	};
}

export function getBookChapters(app: App, bookFolderName: string): OrderResult<TFile> {
	const files = getBookChapterFiles(app, bookFolderName);
	const fm = readBookFrontmatter(app, bookFolderName);
	return resolveOrder(files, fm?.order ?? [], (file) => file.name);
}

export async function writeBookOrder(app: App, bookFolderName: string, newOrder: string[]): Promise<void> {
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
			fm.order = newOrder;
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
