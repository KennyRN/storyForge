/**
 * The manuscript editor's document model (continuous-mode manuscript brief §3.2): every placed
 * chapter of a book, in spine order, assembled into the text of one CodeMirror document, and split
 * back out again. DOM-free and obsidian-free, so every invariant is unit-tested.
 *
 * Shape of the document: each chapter's body, with chapters joined by `SEPARATOR` — a line break,
 * one empty separator line that belongs to no chapter, and another line break. A chapter's range
 * runs from the first character of its body to the last, so the separator sits strictly between
 * ranges and never inside one. An empty chapter is a zero-length range, which is still a whole
 * (empty) line the caret can occupy, because the separators either side of it supply the breaks.
 *
 * Nothing about the file that isn't prose is ever document text: YAML frontmatter is held aside
 * verbatim, and each chapter's line-ending style and final-newline state are recorded so the file
 * can be rebuilt byte for byte. Titles are not document text either — they're drawn as widgets.
 */

/** Two line breaks around an empty separator line: copying across a break therefore yields the
 * chapters joined by one blank line, with no titles (brief §3.3). */
export const SEPARATOR = "\n\n";

/** One chapter's place in the manuscript document. `id` is opaque here; the view keys it to a TFile. */
export interface ChapterRange {
	id: string;
	from: number;
	to: number;
}

/** Everything about a chapter file that isn't its editable body, held aside on load and re-attached
 * verbatim on save. */
export interface ChapterShape {
	/** The YAML block, fences and the line break after the closing fence included, or "". */
	frontmatter: string;
	/** The file's line-ending style. CodeMirror normalises to "\n"; this restores it on save. */
	eol: "\n" | "\r\n";
	/** Whether the file's body ended in a line break (which is not shown as an extra empty line). */
	trailingNewline: boolean;
}

/**
 * Splits YAML frontmatter off the top of a file, line-ending agnostic. The opening fence must be the
 * file's first line and the closing fence a line of exactly "---"; anything else means there's no
 * frontmatter and the whole file is body. Returned verbatim, so `frontmatter + rest === raw`.
 */
export function splitFrontmatter(raw: string): { frontmatter: string; rest: string } {
	const open = /^---\r?\n/.exec(raw);
	if (!open) return { frontmatter: "", rest: raw };
	let lineStart = open[0].length;
	while (lineStart <= raw.length) {
		const nl = raw.indexOf("\n", lineStart);
		const lineEnd = nl === -1 ? raw.length : nl;
		const line = raw.slice(lineStart, lineEnd).replace(/\r$/, "");
		if (line === "---") {
			const end = nl === -1 ? raw.length : nl + 1;
			return { frontmatter: raw.slice(0, end), rest: raw.slice(end) };
		}
		if (nl === -1) break;
		lineStart = nl + 1;
	}
	return { frontmatter: "", rest: raw };
}

/** Reads a chapter file into its editable body (always "\n" line breaks) and the shape needed to
 * rebuild it. */
export function parseChapterFile(raw: string): { shape: ChapterShape; body: string } {
	const { frontmatter, rest } = splitFrontmatter(raw);
	const firstBreak = rest.indexOf("\n");
	const eol: ChapterShape["eol"] = firstBreak > 0 && rest[firstBreak - 1] === "\r" ? "\r\n" : "\n";
	let body = rest.replace(/\r\n?/g, "\n");
	const trailingNewline = body.endsWith("\n");
	if (trailingNewline) body = body.slice(0, -1);
	return { shape: { frontmatter, eol, trailingNewline }, body };
}

/** Rebuilds a chapter file from an edited body and the shape it was loaded with. */
export function serialiseChapterFile(shape: ChapterShape, body: string): string {
	const withEnding = shape.trailingNewline ? `${body}\n` : body;
	return shape.frontmatter + (shape.eol === "\n" ? withEnding : withEnding.replace(/\n/g, "\r\n"));
}

/**
 * Where an offset into a chapter's editable body lands in the file on disk: after the frontmatter,
 * and one character later per preceding line break when the file uses CRLF. Used on exit, to put
 * the normal editor's caret where the manuscript's was.
 */
export function bodyOffsetToFileOffset(shape: ChapterShape, body: string, offset: number): number {
	const clamped = Math.max(0, Math.min(offset, body.length));
	let breaks = 0;
	if (shape.eol === "\r\n") {
		for (let i = 0; i < clamped; i++) if (body.charCodeAt(i) === 10) breaks++;
	}
	return shape.frontmatter.length + clamped + breaks;
}

/** Joins chapter bodies, in spine order, into one document, with each chapter's range. */
export function assembleManuscript(chapters: { id: string; body: string }[]): { text: string; ranges: ChapterRange[] } {
	const ranges: ChapterRange[] = [];
	const parts: string[] = [];
	let pos = 0;
	chapters.forEach((chapter, i) => {
		if (i > 0) {
			parts.push(SEPARATOR);
			pos += SEPARATOR.length;
		}
		ranges.push({ id: chapter.id, from: pos, to: pos + chapter.body.length });
		parts.push(chapter.body);
		pos += chapter.body.length;
	});
	return { text: parts.join(""), ranges };
}

/** The body text of one chapter, read back out of the document. `slice` is the document's own
 * substring accessor (a plain string's `slice`, or CodeMirror's `doc.sliceString`). */
export function chapterBody(slice: (from: number, to: number) => string, range: ChapterRange): string {
	return slice(range.from, range.to);
}

/**
 * Checks the §3.2 structural invariants against a document of `docLength`: ranges in order,
 * non-overlapping, each separated from the next by exactly `SEPARATOR`'s length, the first starting
 * at 0 and the last ending at the document's end. Returns null when sound, or a reason.
 */
export function validateRanges(ranges: ChapterRange[], docLength: number): string | null {
	if (ranges.length === 0) return docLength === 0 ? null : "no chapters but the document has text";
	if (ranges[0].from !== 0) return "the first chapter does not start the document";
	for (let i = 0; i < ranges.length; i++) {
		const r = ranges[i];
		if (r.to < r.from) return `chapter ${r.id} ends before it starts`;
		if (i > 0 && r.from !== ranges[i - 1].to + SEPARATOR.length) return `chapter ${r.id} is not one separator after the last`;
	}
	if (ranges[ranges.length - 1].to !== docLength) return "the last chapter does not end the document";
	return null;
}
