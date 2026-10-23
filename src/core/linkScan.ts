/**
 * Finding links in markdown text, for the link rewriter (docs/safety-core.md §9). Pure: no I/O.
 *
 * Recognised: wikilinks `[[X]]` with `#heading`, `#^block` and `|display` in any combination;
 * embeds `![[X]]`; markdown links `[text](Codex/X.md)` (also `![alt](...)`), with `%20`-style
 * encoding, `<angle-bracket>` destinations and optional titles.
 *
 * Never reported: anything inside fenced code blocks, inline code, or `%% comments %%`. When in doubt
 * the scanner treats text as protected (an unclosed fence or comment runs to the end of the text):
 * a link that isn't rewritten is listed and harmless, a changed code sample is wrong.
 */

export type LinkForm = "wikilink" | "embed" | "markdown" | "markdown-embed";

export interface RawLink {
	form: LinkForm;
	/** The whole link, including a leading `!` for embeds. */
	start: number;
	end: number;
	/** The link target as written, before any `#heading`, `#^block`, `|display` or markdown title. */
	target: string;
	targetStart: number;
	targetEnd: number;
	/** Markdown links only: the destination was written `<like this>`. */
	angle?: boolean;
}

/** Ranges `[start, end)` that are code or comments. */
export function protectedRanges(text: string): [number, number][] {
	const ranges: [number, number][] = [];
	const n = text.length;
	let i = 0;
	let lineStart = true;
	while (i < n) {
		if (lineStart) {
			const fence = matchFenceOpen(text, i);
			if (fence) {
				const end = findFenceClose(text, fence);
				ranges.push([i, end]);
				i = end;
				lineStart = true;
				continue;
			}
			lineStart = false;
		}
		const c = text[i];
		if (c === "\n") {
			lineStart = true;
			i++;
		} else if (c === "`") {
			let run = 1;
			while (text[i + run] === "`") run++;
			const close = findBacktickClose(text, i + run, run);
			if (close === -1) {
				i += run;
			} else {
				ranges.push([i, close + run]);
				i = close + run;
			}
		} else if (c === "%" && text[i + 1] === "%") {
			const close = text.indexOf("%%", i + 2);
			const end = close === -1 ? n : close + 2;
			ranges.push([i, end]);
			i = end;
		} else {
			i++;
		}
	}
	return ranges;
}

interface FenceOpen {
	char: "`" | "~";
	length: number;
	lineEnd: number;
}

const FENCE_PREFIX = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})([^\n]*)/;

function matchFenceOpen(text: string, lineStart: number): FenceOpen | null {
	const lineEndIdx = text.indexOf("\n", lineStart);
	const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
	const m = FENCE_PREFIX.exec(text.slice(lineStart, lineEnd));
	if (!m) return null;
	const char = m[1][0] as "`" | "~";
	if (char === "`" && m[2].includes("`")) return null; // that's inline code, not a fence
	return { char, length: m[1].length, lineEnd };
}

/** Index just past the closing fence line (or the end of the text if it never closes). */
function findFenceClose(text: string, open: FenceOpen): number {
	let pos = open.lineEnd + 1;
	while (pos <= text.length && pos < text.length) {
		const nl = text.indexOf("\n", pos);
		const end = nl === -1 ? text.length : nl;
		const line = text.slice(pos, end);
		const m = /^[ \t]*(?:>[ \t]*)*(`{3,}|~{3,})[ \t]*$/.exec(line);
		if (m && m[1][0] === open.char && m[1].length >= open.length) return nl === -1 ? text.length : nl + 1;
		pos = nl === -1 ? text.length : nl + 1;
	}
	return text.length;
}

/** Start of the next run of exactly `len` backticks at or after `from`, not crossing a blank line. */
function findBacktickClose(text: string, from: number, len: number): number {
	let i = from;
	while (i < text.length) {
		const c = text[i];
		if (c === "\n") {
			let j = i + 1;
			while (text[j] === " " || text[j] === "\t" || text[j] === "\r") j++;
			if (text[j] === "\n" || j >= text.length) return -1;
		}
		if (c === "`") {
			let run = 1;
			while (text[i + run] === "`") run++;
			if (run === len) return i;
			i += run;
		} else {
			i++;
		}
	}
	return -1;
}

/** Finds the links in `text`. Pass `protect: false` for text that is not a markdown body (a frontmatter string). */
export function scanLinks(text: string, options: { protect?: boolean } = {}): RawLink[] {
	const ranges = options.protect === false ? [] : protectedRanges(text);
	const links: RawLink[] = [];
	const n = text.length;
	let r = 0;
	let i = 0;
	while (i < n) {
		while (r < ranges.length && ranges[r][1] <= i) r++;
		if (r < ranges.length && ranges[r][0] <= i) {
			i = ranges[r][1];
			continue;
		}
		const limit = r < ranges.length ? ranges[r][0] : n; // links may not run into protected text
		const bang = text[i] === "!" && (text[i + 1] === "[" || text.startsWith("[[", i + 1));
		const at = bang ? i + 1 : i;
		if (text.startsWith("[[", at)) {
			const link = parseWikilink(text, at, limit);
			if (link) {
				links.push({ ...link, form: bang ? "embed" : "wikilink", start: i });
				i = link.end;
				continue;
			}
		} else if (text[at] === "[") {
			const link = parseMarkdownLink(text, at, limit);
			if (link) {
				links.push({ ...link, form: bang ? "markdown-embed" : "markdown", start: i });
				i = at + 1; // inner links (inside the link text) are still found
				continue;
			}
		}
		i++;
	}
	return links;
}

function parseWikilink(text: string, at: number, limit: number): Omit<RawLink, "form" | "start"> | null {
	let j = at + 2;
	while (j < limit && text[j] !== "]" && text[j] !== "[" && text[j] !== "\n") j++;
	if (text[j] !== "]" || text[j + 1] !== "]" || j + 2 > limit) return null;
	const inner = text.slice(at + 2, j);
	let cut = inner.search(/[#|]/);
	if (cut === -1) cut = inner.length;
	else if (inner[cut] === "|" && inner[cut - 1] === "\\") cut--; // an escaped pipe inside a table
	const target = inner.slice(0, cut);
	if (target.trim() === "") return null;
	return { end: j + 2, target, targetStart: at + 2, targetEnd: at + 2 + cut };
}

function parseMarkdownLink(text: string, at: number, limit: number): Omit<RawLink, "form" | "start"> | null {
	// the link text: balanced brackets, one line
	let depth = 0;
	let j = at;
	for (; j < limit; j++) {
		const c = text[j];
		if (c === "\\") {
			j++;
			continue;
		}
		if (c === "\n") return null;
		if (c === "[") depth++;
		else if (c === "]") {
			depth--;
			if (depth === 0) break;
		}
	}
	if (j >= limit || text[j] !== "]" || text[j + 1] !== "(") return null;
	let k = j + 2;
	while (text[k] === " " || text[k] === "\t") k++;
	let target: string;
	let targetStart: number;
	let targetEnd: number;
	let angle = false;
	if (text[k] === "<") {
		angle = true;
		targetStart = k + 1;
		let e = targetStart;
		while (e < limit && text[e] !== ">" && text[e] !== "\n") e++;
		if (text[e] !== ">") return null;
		targetEnd = e;
		k = e + 1;
	} else {
		targetStart = k;
		let parens = 0;
		let e = k;
		for (; e < limit; e++) {
			const c = text[e];
			if (c === "\\") {
				e++;
				continue;
			}
			if (c === " " || c === "\t" || c === "\n") break;
			if (c === "(") parens++;
			else if (c === ")") {
				if (parens === 0) break;
				parens--;
			}
		}
		targetEnd = e;
		k = e;
	}
	// optional title, then the closing parenthesis
	while (text[k] === " " || text[k] === "\t") k++;
	if (text[k] === '"' || text[k] === "'") {
		const q = text[k];
		let e = k + 1;
		while (e < limit && text[e] !== q && text[e] !== "\n") e++;
		if (text[e] !== q) return null;
		k = e + 1;
		while (text[k] === " " || text[k] === "\t") k++;
	}
	if (text[k] !== ")" || k >= limit) return null;
	target = text.slice(targetStart, targetEnd);
	if (target === "") return null;
	return { end: k + 1, target, targetStart, targetEnd, ...(angle ? { angle } : {}) };
}
