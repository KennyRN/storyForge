/**
 * What a start-screen card shows about a project that is not open (Brief 16, docs/project-cards.md): its name, its image and whether it can
 * be opened. Pure: it reads the texts `peek_recent` and `peek_recent_book` return, and uses the core's own ordering to find the first placed
 * book (one order logic only, `resolveOrder`). Anything it can't read leaves the card with the folder's name and no image; it never throws.
 */
import { safeCoverFilename } from "./coverImage";
import { readFrontmatter } from "./frontmatter";
import { NUMBERING_STYLE_OPTIONS, type NumberingStyle } from "./numberingStyle";
import { numberedBookTitleIn, orderBookMembers, seriesFrontmatterFromData, type RawSeriesFrontmatter } from "./series";

export interface PeekCover {
	/** Exactly `cover.<ext>`, as Rust checked. */
	filename: string;
	base64: string;
}

/** What `peek_recent` returns. Display information only. */
export interface PeekResult {
	exists: boolean;
	hasLibrary: boolean;
	projectMd: string | null;
	seriesMd: string | null;
	/** The book folders under `_story-library`, sorted. A position in this list is what `peek_recent_book` takes. */
	bookFolders: string[];
	/** The series cover file, when there is one that reads. */
	seriesCover: PeekCover | null;
}

/** What `peek_recent_book` returns for the book at one position. */
export interface PeekBook {
	folder: string;
	novelMd: string | null;
	cover: PeekCover | null;
}

export type CardState = "ok" | "not-found" | "not-a-project";

export interface CardPlan {
	state: CardState;
	/** The name to show now. */
	name: string;
	/** The image to show now: the series' own cover, when it has one. */
	cover: PeekCover | null;
	/** The first placed book, found by the core's ordering; null when there is none. */
	firstBook: { position: number; folder: string } | null;
	/** True when there is a first book to ask about: always for a single-novel project (its title is its novel's), and for a series only when it has no cover of its own. */
	needsBook: boolean;
	standalone: boolean;
}

export interface CardView {
	state: CardState;
	name: string;
	cover: PeekCover | null;
}

function dataOf(text: string | null): Record<string, unknown> | null {
	if (text === null) return null;
	const fm = readFrontmatter(text);
	return fm.state === "ok" ? fm.data : null;
}
const nonEmpty = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The card as far as `peek_recent` alone can tell. `folderName` is the project folder's own name (the fallback for every name). */
export function planCard(peek: PeekResult, folderName: string): CardPlan {
	const plain = (state: CardState): CardPlan => ({ state, name: folderName, cover: null, firstBook: null, needsBook: false, standalone: false });
	if (!peek.exists) return plain("not-found");
	if (!peek.hasLibrary) return plain("not-a-project");

	const project = dataOf(peek.projectMd);
	const series = dataOf(peek.seriesMd);
	const standalone = project?.["story-kind"] === "standalone";
	// The library's own reading of series.md and its own ordering (core/series.ts), so a card names a novel exactly as the library does.
	const fm = seriesFrontmatterFromData(series as RawSeriesFrontmatter | null);
	const { ordered, unplaced } = orderBookMembers(peek.bookFolders, (f) => f, fm.order, fm.unplacedOrder);
	const first = ordered[0] ?? null;
	const firstBook = first === null ? null : { position: peek.bookFolders.indexOf(first), folder: first };

	// A recorded cover whose file is missing, unreadable or a different file counts as no cover.
	const recorded = safeCoverFilename(series?.["cover-image"]);
	const cover = peek.seriesCover && recorded !== null && peek.seriesCover.filename === recorded ? peek.seriesCover : null;

	let name: string | null;
	if (standalone) {
		// The novel's title as the library shows it (series.md's recorded title, "#" resolved to its number by the project's numbering style); the
		// novel's own file isn't consulted for it, the library doesn't either.
		const style = project?.["series-numbering-style"];
		const numbering: NumberingStyle = typeof style === "string" && style in NUMBERING_STYLE_OPTIONS ? (style as NumberingStyle) : "arabic";
		name = firstBook ? nonEmpty(numberedBookTitleIn(fm.books, [...ordered, ...unplaced], firstBook.folder, numbering)) : null;
	} else name = nonEmpty(series?.["series-title"]);

	return { state: "ok", name: name ?? folderName, cover, firstBook, needsBook: firstBook !== null && (standalone || cover === null), standalone };
}

/**
 * The finished card, given the first book's details when they were asked for. A book that isn't the one the plan chose (the folder changed
 * between the two calls) is ignored: the card keeps what the plan had.
 */
export function finishCard(plan: CardPlan, book: PeekBook | null): CardView {
	let { cover } = plan;
	if (book && plan.firstBook && book.folder === plan.firstBook.folder && cover === null && book.cover) {
		const recorded = safeCoverFilename(dataOf(book.novelMd)?.["cover-image"]);
		if (recorded !== null && book.cover.filename === recorded) cover = book.cover;
	}
	return { state: plan.state, name: plan.name, cover };
}
