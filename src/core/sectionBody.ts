/**
 * Tiny `## `-headed-section helpers for reading/writing one named block of a backstage note's body
 * while leaving its frontmatter and every other section untouched — shared by book.ts (novel.md's
 * `## Synopsis`) and series.ts (series.md's `## Description`) so the two don't carry two copies of
 * the same three functions.
 */

/** Splits raw file content into its frontmatter fence (verbatim, incl. trailing newline) and body. */
export function splitFrontmatterAndBody(raw: string): { frontmatterBlock: string; body: string } {
	if (!raw.startsWith("---")) return { frontmatterBlock: "", body: raw };
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return { frontmatterBlock: "", body: raw };
	let fenceEnd = end + 4;
	if (raw[fenceEnd] === "\n") fenceEnd += 1;
	return { frontmatterBlock: raw.slice(0, fenceEnd), body: raw.slice(fenceEnd) };
}

/** The heading appears more than once, so the section can't be told apart: the field is read-only and a write is refused (decision 42). */
export class SectionDuplicateError extends Error {
	constructor(readonly header: string) {
		super(`"${header}" appears more than once in the file, so it can't be read or written safely. Tidy the file in Obsidian.`);
		this.name = "SectionDuplicateError";
	}
}

/** The text can't be written as a section without turning part of it into a heading. */
export class SectionContentError extends Error {
	constructor(readonly header: string) {
		super(`A line in this text starts with "# " or "## ", which would split the "${header}" section.`);
		this.name = "SectionContentError";
	}
}

export type SectionRead = { status: "ok"; text: string } | { status: "duplicate" };

const stripCr = (line: string): string => line.replace(/\r$/, "");
const isHeading = (line: string): boolean => /^#{1,2} /.test(stripCr(line));

/** Where the section `header` (a line that is exactly the header, trailing spaces and CR allowed) sits in `lines`: its heading line and the line after its last (the next `# ` or `## ` line, or the end). */
function locate(lines: string[], header: string): { start: number; end: number } | "duplicate" | null {
	const hits: number[] = [];
	lines.forEach((l, i) => {
		if (stripCr(l).trimEnd() === header) hits.push(i);
	});
	if (hits.length > 1) return "duplicate";
	if (hits.length === 0) return null;
	let end = hits[0] + 1;
	while (end < lines.length && !isHeading(lines[end])) end++;
	return { start: hits[0], end };
}

/** Reads the trimmed text under `header` up to the next `# ` or `## ` line. Empty if the heading isn't there; "duplicate" if it is there more than once. */
export function readSection(body: string, header: string): SectionRead {
	const lines = body.split("\n");
	const at = locate(lines, header);
	if (at === "duplicate") return { status: "duplicate" };
	if (at === null) return { status: "ok", text: "" };
	return { status: "ok", text: lines.slice(at.start + 1, at.end).join("\n").trim() };
}

/**
 * Replaces (or appends) the `header` section and changes nothing else: every other line is kept
 * byte for byte, and so are the blank lines that closed the old section. Empty text removes the
 * section, heading and text. More than one heading, or text that would split the section, throws.
 */
export function writeSection(body: string, header: string, content: string): string {
	const text = content.trim();
	const lines = body.split("\n");
	const at = locate(lines, header);
	if (at === "duplicate") throw new SectionDuplicateError(header);
	if (text.split("\n").some(isHeading)) throw new SectionContentError(header);
	const eol = body.includes("\r\n") ? "\r\n" : "\n";
	const written = text.split("\n").map((l) => stripCr(l)).join(eol);
	if (at === null) {
		if (text === "") return body;
		const sep = body.trim().length === 0 ? "" : eol;
		return `${body.trimEnd()}${sep}${eol}${header}${eol}${written}${eol}`;
	}
	if (text === "") return [...lines.slice(0, at.start), ...lines.slice(at.end)].join("\n");
	let tail = at.end;
	while (tail > at.start + 1 && (lines[tail - 1] === "" || lines[tail - 1] === "\r")) tail--;
	const closing = lines.slice(tail, at.end);
	// Lines carry their own CR in a CRLF file (the body is split on "\n"), except a last line with no newline after it.
	const cr = eol === "\r\n" ? "\r" : "";
	const fresh = written.split(eol).map((l) => l + cr);
	if (closing.length === 0 && at.end === lines.length) fresh[fresh.length - 1] = stripCr(fresh[fresh.length - 1]);
	return [...lines.slice(0, at.start), lines[at.start], ...fresh, ...closing, ...lines.slice(at.end)].join("\n");
}
