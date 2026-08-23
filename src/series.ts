import { App, TFile, TFolder, type FrontMatterCache } from "obsidian";
import { LIBRARY_ROOT, seriesBackstagePath, seriesFilePath } from "./paths";
import { resolveOrder, type OrderResult } from "./ordering";
import { deleteBackstagePath, enqueueBackstageWrite, modifyBackstageFrontmatter, writeBackstageBinary, writeBackstageFile } from "./writeGuard";
import { mintId } from "./slug";
import { applyHashNumbering } from "./titleNumbering";
import type { NumberingStyle } from "./numberingStyle";
import { safeCoverExtension, safeCoverFilename } from "./coverImage";
import { extractSection, splitFrontmatterAndBody, upsertSection } from "./sectionBody";

export interface SeriesBookEntry {
	bookId: string;
	bookTitle: string;
	/** Row-accent override picked via NovelTitleModal's colour option, or null when none has been
	 * assigned yet (resolveNovelRowColor then auto-assigns and persists a random one). */
	color: string | null;
}

export interface SeriesFrontmatter {
	seriesId: string;
	seriesTitle: string;
	order: string[];
	/** A separate, independently-persisted sequence for books *not* in `order` — unplaced books have
	 * no position of their own in `order` (that's what "unplaced" means, see resolveOrder), so
	 * reordering them needs a field of their own rather than borrowing `order`, which would place
	 * them the moment they were written into it. Any unplaced folder missing from this list simply
	 * falls back to natural order, trailing after the ones it does list (see getSeriesBooks). */
	unplacedOrder: string[];
	books: Record<string, SeriesBookEntry>;
	/** Bare filename of the series' own cover image under `seriesBackstagePath()`, or null if unset. */
	coverImage: string | null;
}

/** The raw, dash-cased on-disk shape of a `books` map entry, before `parseBooksMap` sanitizes it. */
export interface RawSeriesBookEntry {
	"book-id"?: unknown;
	"book-title"?: unknown;
	"book-color"?: unknown;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** The raw, dash-cased on-disk shape of series.md's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
export interface RawSeriesFrontmatter extends FrontMatterCache {
	books?: Record<string, RawSeriesBookEntry>;
	order?: unknown[];
	"unplaced-order"?: unknown[];
	"series-title"?: unknown;
	"series-id"?: unknown;
	"cover-image"?: unknown;
	/** Legacy pre-migration key, migrated to "series-title" by migrateSeriesTitleField. */
	title?: unknown;
}

export const DEFAULT_SERIES_CONTENT = `---\nseries-title: Series\norder:\nbooks:\n---\n`;

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
		const color = typeof entry["book-color"] === "string" && HEX_COLOR_RE.test(entry["book-color"]) ? entry["book-color"] : null;
		result[folderName] = { bookId, bookTitle, color };
	}
	return result;
}

export function readSeriesFrontmatter(app: App): SeriesFrontmatter {
	const file = app.vault.getAbstractFileByPath(seriesFilePath());
	if (!file) {
		return { seriesId: "", seriesTitle: "Series", order: [], unplacedOrder: [], books: {}, coverImage: null };
	}
	const cache = app.metadataCache.getCache(seriesFilePath());
	const fm = cache?.frontmatter;
	const order = Array.isArray(fm?.order) ? fm.order.filter((v: unknown) => typeof v === "string") : [];
	const unplacedOrder = Array.isArray(fm?.["unplaced-order"])
		? fm["unplaced-order"].filter((v: unknown) => typeof v === "string")
		: [];
	const seriesId = typeof fm?.["series-id"] === "string" ? fm["series-id"] : "";
	const seriesTitle = typeof fm?.["series-title"] === "string" ? fm["series-title"] : "Series";
	const books = parseBooksMap(fm?.books);
	const coverImage = safeCoverFilename(fm?.["cover-image"]);
	return { seriesId, seriesTitle, order, unplacedOrder, books, coverImage };
}

export function getSeriesBooks(app: App): OrderResult<TFolder> & { seriesTitle: string } {
	const folders = getLibraryBookFolders(app);
	const { seriesTitle, order, unplacedOrder } = readSeriesFrontmatter(app);
	const { ordered, unplaced } = resolveOrder(folders, order, (folder) => folder.name);
	// Unplaced books have no slot in `order` (that's what makes them unplaced) — sort them by their
	// own separately-persisted sequence instead, via the same resolveOrder primitive: anything not
	// yet in unplacedOrder (e.g. a freshly created book) just trails after in natural order.
	const { ordered: unplacedSorted, unplaced: unplacedRest } = resolveOrder(unplaced, unplacedOrder, (folder) => folder.name);
	return { seriesTitle, ordered, unplaced: [...unplacedSorted, ...unplacedRest] };
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

/** The book's title, with "#" resolved to its number among the series' "#"-titled books (same counter TopPanel's row rendering uses).
 * Pass `prefetched` when the caller already has `getSeriesBooks`'s result on hand (e.g. TopPanel's
 * header, rendered right after its own `getSeriesBooks` call), to avoid a redundant re-read. */
export function numberedBookTitle(
	app: App,
	bookFolderName: string,
	prefetched?: { ordered: TFolder[]; unplaced: TFolder[] },
	style: NumberingStyle = "arabic",
): string {
	const { ordered, unplaced } = prefetched ?? getSeriesBooks(app);
	const sequence = [...ordered, ...unplaced];
	const idx = sequence.findIndex((folder) => folder.name === bookFolderName);
	if (idx === -1) return bookDisplayTitle(app, bookFolderName);
	const numbered = applyHashNumbering(sequence.map((folder) => bookDisplayTitle(app, folder.name)), style);
	return numbered[idx];
}

export function collectAllBookIds(app: App): string[] {
	return Object.values(readSeriesFrontmatter(app).books).map((entry) => entry.bookId);
}

/** 1-based position of `folderName` in the series' display sequence (ordered, then unplaced), or null if it isn't a library folder. */
export function getSeriesOrderPosition(app: App, folderName: string): number | null {
	const { ordered, unplaced } = getSeriesBooks(app);
	const sequence = [...ordered, ...unplaced];
	const index = sequence.findIndex((folder) => folder.name === folderName);
	return index === -1 ? null : index + 1;
}

export async function writeSeriesTitle(app: App, newTitle: string): Promise<void> {
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm["series-title"] = newTitle;
	});
}

/** Writes/replaces the series' own cover image (`_backstage/storyforge/_series/cover.<ext>`) and
 * records its filename in series.md's frontmatter — same pattern as writeBookCoverImage in book.ts,
 * just rooted at seriesBackstagePath() instead of a per-book folder. Removes the previous cover
 * file first if its extension differs. */
export async function writeSeriesCoverImage(app: App, data: ArrayBuffer, extension: string): Promise<string> {
	const previous = readSeriesFrontmatter(app).coverImage;
	const filename = `cover.${safeCoverExtension(extension)}`;
	const folder = seriesBackstagePath();
	const path = `${folder}/${filename}`;
	if (previous && previous !== filename) {
		await deleteBackstagePath(app, `${folder}/${previous}`);
	}
	await writeBackstageBinary(app.vault, path, data);

	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm["cover-image"] = filename;
	});
	return path;
}

const DESCRIPTION_HEADER = "## Description";

/** Reads the series' description from series.md's body, under a `## Description` heading. Empty string if none exists yet. */
export async function readSeriesDescription(app: App): Promise<string> {
	const file = app.vault.getAbstractFileByPath(seriesFilePath());
	if (!(file instanceof TFile)) return "";
	const { body } = splitFrontmatterAndBody(await app.vault.read(file));
	return extractSection(body, DESCRIPTION_HEADER);
}

/** Writes the series' description into series.md's body under a `## Description` heading, leaving the frontmatter and any other body content untouched. */
export async function writeSeriesDescription(app: App, description: string): Promise<void> {
	const path = seriesFilePath();
	await enqueueBackstageWrite(path, async () => {
		const file = app.vault.getAbstractFileByPath(path);
		const raw = file instanceof TFile ? await app.vault.read(file) : DEFAULT_SERIES_CONTENT;
		const { frontmatterBlock, body } = splitFrontmatterAndBody(raw);
		await writeBackstageFile(app.vault, path, frontmatterBlock + upsertSection(body, DESCRIPTION_HEADER, description));
	});
}

export async function writeSeriesOrder(app: App, newOrder: string[]): Promise<void> {
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm.order = newOrder;
	});
}

/** Persists a drag-reorder of the *unplaced* books among themselves — see SeriesFrontmatter's
 * `unplacedOrder` doc comment for why this is a separate field from `order` rather than reusing it. */
export async function writeUnplacedOrder(app: App, newOrder: string[]): Promise<void> {
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		fm["unplaced-order"] = newOrder;
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
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books: Record<string, RawSeriesBookEntry> = fm.books && typeof fm.books === "object" ? fm.books : {};
		books[folderName] = { "book-id": bookId, "book-title": bookTitle };
		fm.books = books;
		if (options.appendToOrder) {
			const order: unknown[] = Array.isArray(fm.order) ? fm.order : [];
			if (!order.includes(folderName)) order.push(folderName);
			fm.order = order;
		}
	});
}

/**
 * Edits a book's title, returning the `book-id` used (existing, or freshly
 * minted if this folder somehow had no entry yet) so callers can update
 * novel.md's reference mirror without a stale re-read of series.md's cache
 * right after this write (Obsidian's metadataCache doesn't update
 * synchronously with `processFrontMatter`).
 */
export async function writeSeriesBookTitle(app: App, folderName: string, newTitle: string): Promise<{ bookId: string }> {
	let resolvedId = "";
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books: Record<string, RawSeriesBookEntry> = fm.books && typeof fm.books === "object" ? fm.books : {};
		const existing: RawSeriesBookEntry =
			books[folderName] && typeof books[folderName] === "object" ? books[folderName] : {};
		const bookId: string =
			typeof existing["book-id"] === "string" ? existing["book-id"] : mintId(folderName, collectAllBookIds(app));
		resolvedId = bookId;
		books[folderName] = { ...existing, "book-id": bookId, "book-title": newTitle };
		fm.books = books;
	});
	return { bookId: resolvedId };
}

/** Overwrites (or clears, passing null) one book's row-colour override — see NovelTitleModal's
 * colour option and resolveNovelRowColor. Preserves the entry's other fields (id, title, …) via a
 * spread, unlike writeSeriesBookTitle's own whole-entry replace. */
export async function writeSeriesBookColor(app: App, folderName: string, hex: string | null): Promise<void> {
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books: Record<string, RawSeriesBookEntry> = fm.books && typeof fm.books === "object" ? fm.books : {};
		const existing: RawSeriesBookEntry = books[folderName] && typeof books[folderName] === "object" ? books[folderName] : {};
		const next: RawSeriesBookEntry = { ...existing };
		if (hex) next["book-color"] = hex;
		else delete next["book-color"];
		books[folderName] = next;
		fm.books = books;
	});
}

/** Rekeys a book's `books`/`order` entries when its library folder is renamed outside the plugin. No-op if `oldFolderName` isn't present. */
export async function renameSeriesBookEntry(app: App, oldFolderName: string, newFolderName: string): Promise<void> {
	await modifyBackstageFrontmatter<RawSeriesFrontmatter>(app, app.vault, seriesFilePath(), DEFAULT_SERIES_CONTENT, (fm) => {
		const books: Record<string, RawSeriesBookEntry> = fm.books && typeof fm.books === "object" ? fm.books : {};
		if (Object.prototype.hasOwnProperty.call(books, oldFolderName)) {
			books[newFolderName] = books[oldFolderName];
			delete books[oldFolderName];
			fm.books = books;
		}
		if (Array.isArray(fm.order)) {
			fm.order = fm.order.map((entry) => (entry === oldFolderName ? newFolderName : entry));
		}
		if (Array.isArray(fm["unplaced-order"])) {
			fm["unplaced-order"] = fm["unplaced-order"].map((entry) => (entry === oldFolderName ? newFolderName : entry));
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
 *
 * A folder with no `books` entry isn't only "a brand-new book nobody's registered yet" — it's also
 * exactly what a *dropped* entry looks like: parseBooksMap discards any entry without a valid
 * `book-id` outright, so any bug that ever blanks that one field (however briefly) makes this
 * function treat an existing, titled book as new and reset it to its raw folder code. `recoverReference`,
 * when supplied, is consulted before minting/falling back — each book's own novel-<code>.md mirrors
 * series.md's id/title in `book-id-reference`/`book-title-reference` (see book.ts's
 * writeBookReferenceFields), untouched by whatever corrupted the `books` map itself, so a still-intact
 * mirror restores the real book instead of silently renaming it.
 */
export async function ensureAllSeriesBookEntries(
	app: App,
	recoverReference?: (folderName: string) => { bookId: string; bookTitle: string } | null,
): Promise<Record<string, SeriesBookEntry>> {
	const folders = getLibraryBookFolders(app);
	const { books } = readSeriesFrontmatter(app);
	const merged: Record<string, SeriesBookEntry> = { ...books };
	const knownIds = new Set(Object.values(books).map((entry) => entry.bookId));
	for (const folder of folders) {
		if (merged[folder.name]) continue;
		const recovered = recoverReference?.(folder.name) ?? null;
		const id = recovered && !knownIds.has(recovered.bookId) ? recovered.bookId : mintId(folder.name, knownIds);
		const title = recovered?.bookTitle || folder.name;
		knownIds.add(id);
		merged[folder.name] = { bookId: id, bookTitle: title, color: null };
		await upsertSeriesBookEntry(app, folder.name, id, title, { appendToOrder: false });
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
