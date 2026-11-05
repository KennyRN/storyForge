/**
 * What a start-screen card shows about a project that is not open (Brief 16, docs/project-cards.md): its name, its image and whether it can
 * be opened. Pure: it reads the texts `peek_recent` and `peek_recent_book` return, and uses the core's own ordering to find the first placed
 * book (one order logic only, `resolveOrder`). Anything it can't read leaves the card with the folder's name and no image; it never throws.
 */
import { safeCoverFilename } from "./coverImage";
import { readFrontmatter } from "./frontmatter";
import { resolveOrder } from "./ordering";

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
	/** Whether `name` came from the project's own files (not the folder's name). */
	nameFound: boolean;
	/** The image to show now: the series' own cover, when it has one. */
	cover: PeekCover | null;
	/** The first placed book, found by the core's ordering; null when there is none. */
	firstBook: { position: number; folder: string } | null;
	/** True when the series has no cover and there is a first book to ask about. */
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
	const plain = (state: CardState): CardPlan => ({ state, name: folderName, nameFound: false, cover: null, firstBook: null, needsBook: false, standalone: false });
	if (!peek.exists) return plain("not-found");
	if (!peek.hasLibrary) return plain("not-a-project");

	const project = dataOf(peek.projectMd);
	const series = dataOf(peek.seriesMd);
	const standalone = project?.["story-kind"] === "standalone";
	const order = Array.isArray(series?.order) ? (series.order as unknown[]).filter((v): v is string => typeof v === "string") : [];
	const placed = resolveOrder(peek.bookFolders, order, (f) => f).ordered;
	const first = placed[0] ?? null;
	const firstBook = first === null ? null : { position: peek.bookFolders.indexOf(first), folder: first };

	// A recorded cover whose file is missing, unreadable or a different file counts as no cover.
	const recorded = safeCoverFilename(series?.["cover-image"]);
	const cover = peek.seriesCover && recorded !== null && peek.seriesCover.filename === recorded ? peek.seriesCover : null;

	let name: string | null;
	if (standalone) {
		const books = series?.books;
		const entry = firstBook && books && typeof books === "object" ? (books as Record<string, unknown>)[firstBook.folder] : null;
		name = entry && typeof entry === "object" ? nonEmpty((entry as Record<string, unknown>)["book-title"]) : null;
	} else name = nonEmpty(series?.["series-title"]);

	return { state: "ok", name: name ?? folderName, nameFound: name !== null, cover, firstBook, needsBook: cover === null && firstBook !== null, standalone };
}

/**
 * The finished card, given the first book's details when they were asked for. A book that isn't the one the plan chose (the folder changed
 * between the two calls) is ignored: the card keeps what the plan had.
 */
export function finishCard(plan: CardPlan, book: PeekBook | null): CardView {
	let { name, cover } = plan;
	if (book && plan.firstBook && book.folder === plan.firstBook.folder) {
		const novel = dataOf(book.novelMd);
		if (cover === null && book.cover) {
			const recorded = safeCoverFilename(novel?.["cover-image"]);
			if (recorded !== null && book.cover.filename === recorded) cover = book.cover;
		}
		// A single-novel project's name is its book's title: series.md's own entry came first, the book's own reference is the fallback.
		if (plan.standalone && !plan.nameFound) name = nonEmpty(novel?.["book-title-reference"]) ?? name;
	}
	return { state: plan.state, name, cover };
}
