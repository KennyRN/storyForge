import { App, TFolder } from "obsidian";
import { LIBRARY_ROOT, seriesFilePath } from "./paths";
import { resolveOrder, type OrderResult } from "./ordering";
import { modifyBackstageFrontmatter } from "./writeGuard";
import { mintId } from "./slug";

export interface SeriesBookEntry {
	bookId: string;
	bookTitle: string;
}

export interface SeriesFrontmatter {
	seriesId: string;
	seriesTitle: string;
	order: string[];
	books: Record<string, SeriesBookEntry>;
}

const DEFAULT_SERIES_CONTENT = `---\nseries-title: Untitled Series\norder:\nbooks:\n---\n`;

export function getLibraryBookFolders(app: App): TFolder[] {
	const root = app.vault.getAbstractFileByPath(LIBRARY_ROOT);
	if (!(root instanceof TFolder)) return [];
	return root.children.filter((child): child is TFolder => child instanceof TFolder);
}

function parseBooksMap(raw: unknown): Record<string, SeriesBookEntry> {
	if (!raw || typeof raw !== "object") return {};
	const result: Record<string, SeriesBookEntry> = {};
	for (const [folderName, value] of Object.entries(raw as Record<string, unknown>)) {
		if (!value || typeof value !== "object") continue;
		const entry = value as Record<string, unknown>;
		const bookId = typeof entry["book-id"] === "string" ? entry["book-id"] : null;
		if (!bookId) continue;
		const bookTitle = typeof entry["book-title"] === "string" ? entry["book-title"] : folderName;
		result[folderName] = { bookId, bookTitle };
	}
	return result;
}

export function readSeriesFrontmatter(app: App): SeriesFrontmatter {
	const file = app.vault.getAbstractFileByPath(seriesFilePath());
	if (!file) {
		return { seriesId: "", seriesTitle: "Untitled Series", order: [], books: {} };
	}
	const cache = app.metadataCache.getCache(seriesFilePath());
	const fm = cache?.frontmatter;
	const order = Array.isArray(fm?.order) ? fm.order.filter((v: unknown) => typeof v === "string") : [];
	const seriesId = typeof fm?.["series-id"] === "string" ? fm["series-id"] : "";
	const seriesTitle = typeof fm?.["series-title"] === "string" ? fm["series-title"] : "Untitled Series";
	const books = parseBooksMap(fm?.books);
	return { seriesId, seriesTitle, order, books };
}

/** Stable identifier for the vault's series, minted once and never re-derived from `seriesTitle` — see `migrateSeriesIdField`. */
export function getSeriesId(app: App): string {
	return readSeriesFrontmatter(app).seriesId;
}

export function getSeriesBooks(app: App): OrderResult<TFolder> & { seriesTitle: string } {
	const folders = getLibraryBookFolders(app);
	const { seriesTitle, order } = readSeriesFrontmatter(app);
	const result = resolveOrder(folders, order, (folder) => folder.name);
	return { seriesTitle, ...result };
}

export function getSeriesBookEntry(app: App, folderName: string): SeriesBookEntry | null {
	return readSeriesFrontmatter(app).books[folderName] ?? null;
}

export function getBookId(app: App, folderName: string): string | null {
	return getSeriesBookEntry(app, folderName)?.bookId ?? null;
}

export function bookDisplayTitle(app: App, folderName: string): string {
	return getSeriesBookEntry(app, folderName)?.bookTitle ?? folderName;
}

export function collectAllBookIds(app: App): string[] {
	return Object.values(readSeriesFrontmatter(app).books).map((entry) => entry.bookId);
}

export function findBookFolderNameById(app: App, bookId: string): string | null {
	const { books } = readSeriesFrontmatter(app);
	for (const [folderName, entry] of Object.entries(books)) {
		if (entry.bookId === bookId) return folderName;
	}
	return null;
}

/** 1-based position of `folderName` in the series' display sequence (ordered, then unplaced), or null if it isn't a library folder. */
export function getSeriesOrderPosition(app: App, folderName: string): number | null {
	const { ordered, unplaced } = getSeriesBooks(app);
	const sequence = [...ordered, ...unplaced];
	const index = sequence.findIndex((folder) => folder.name === folderName);
	return index === -1 ? null : index + 1;
}

export async function writeSeriesTitle(app: App, newTitle: string): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm["series-title"] = newTitle;
	});
}

export async function writeSeriesOrder(app: App, newOrder: string[]): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm.order = newOrder;
	});
}

/** Overwrites (or inserts) one book's entry in series.md's `books` map, optionally appending it to `order`. */
export async function upsertSeriesBookEntry(
	app: App,
	folderName: string,
	bookId: string,
	bookTitle: string,
	options: { appendToOrder?: boolean } = {},
): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books = fm.books && typeof fm.books === "object" ? fm.books : {};
		books[folderName] = { "book-id": bookId, "book-title": bookTitle };
		fm.books = books;
		if (options.appendToOrder) {
			const order: string[] = Array.isArray(fm.order) ? fm.order : [];
			if (!order.includes(folderName)) order.push(folderName);
			fm.order = order;
		}
	});
}

/**
 * Edits a book's title, returning the `book-id` used (existing, or freshly
 * minted if this folder somehow had no entry yet) so callers can update
 * book.md's reference mirror without a stale re-read of series.md's cache
 * right after this write (Obsidian's metadataCache doesn't update
 * synchronously with `processFrontMatter`).
 */
export async function writeSeriesBookTitle(app: App, folderName: string, newTitle: string): Promise<{ bookId: string }> {
	let resolvedId = "";
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books = fm.books && typeof fm.books === "object" ? fm.books : {};
		const existing = books[folderName] && typeof books[folderName] === "object" ? books[folderName] : {};
		const bookId: string =
			typeof existing["book-id"] === "string" ? existing["book-id"] : mintId(folderName, collectAllBookIds(app));
		resolvedId = bookId;
		books[folderName] = { "book-id": bookId, "book-title": newTitle };
		fm.books = books;
	});
	return { bookId: resolvedId };
}

/** Rekeys a book's `books`/`order` entries when its library folder is renamed outside the plugin. No-op if `oldFolderName` isn't present. */
export async function renameSeriesBookEntry(app: App, oldFolderName: string, newFolderName: string): Promise<void> {
	await modifyBackstageFrontmatter(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books = fm.books && typeof fm.books === "object" ? fm.books : {};
		if (Object.prototype.hasOwnProperty.call(books, oldFolderName)) {
			books[newFolderName] = books[oldFolderName];
			delete books[oldFolderName];
			fm.books = books;
		}
		if (Array.isArray(fm.order)) {
			fm.order = fm.order.map((entry: string) => (entry === oldFolderName ? newFolderName : entry));
		}
	});
}

/**
 * Mints a `books` entry for every library folder missing one. Never renames
 * an existing id, never touches `order`. Returns the resulting merged books
 * map (tracked in-memory as entries are added) so callers — e.g. the initial
 * load sequence in main.ts — can pass it straight into
 * `syncAllBookReferenceFields` without a stale `metadataCache` re-read right
 * after these writes.
 */
export async function ensureAllSeriesBookEntries(app: App): Promise<Record<string, SeriesBookEntry>> {
	const folders = getLibraryBookFolders(app);
	const { books } = readSeriesFrontmatter(app);
	const merged: Record<string, SeriesBookEntry> = { ...books };
	const knownIds = new Set(Object.values(books).map((entry) => entry.bookId));
	for (const folder of folders) {
		if (merged[folder.name]) continue;
		const id = mintId(folder.name, knownIds);
		knownIds.add(id);
		merged[folder.name] = { bookId: id, bookTitle: folder.name };
		await upsertSeriesBookEntry(app, folder.name, id, folder.name, { appendToOrder: false });
	}
	return merged;
}

export async function ensureSeriesFile(app: App): Promise<void> {
	const path = seriesFilePath();
	if (!app.vault.getAbstractFileByPath(path)) {
		await modifyBackstageFrontmatter(app, app.vault, path, DEFAULT_SERIES_CONTENT, () => {
			/* defaults from DEFAULT_SERIES_CONTENT are sufficient */
		});
	}
}
