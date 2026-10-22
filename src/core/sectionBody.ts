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

/** Reads the trimmed content under `header` up to (not including) the next `## ` heading, or "" if `header` isn't present. */
export function extractSection(body: string, header: string): string {
	const idx = body.indexOf(header);
	if (idx === -1) return "";
	const start = idx + header.length;
	const nextHeaderIdx = body.indexOf("\n## ", start);
	return (nextHeaderIdx === -1 ? body.slice(start) : body.slice(start, nextHeaderIdx)).trim();
}

/** Replaces (or appends) the given `## `-prefixed section, leaving any other body content untouched. */
export function upsertSection(body: string, header: string, content: string): string {
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
