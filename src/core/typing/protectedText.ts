/**
 * Text no typing aid may act inside (docs/typing-aids.md §3, Brief 9 §1.3): `[[links]]` and `![[embeds]]`, markdown
 * link targets, bare URLs, inline and fenced code, `%% comments %%` and a table's separator row. Pure and DOM-free.
 *
 * It scans the text from the start of the document up to the caret, so a fence or comment opened earlier is still
 * open, and anything **unclosed** protects up to the end (the caret): the first characters of a link can't be
 * curled before the link is closed. Indented lines are not code (decision 22: fiction is often indented).
 */

export type Range = readonly [from: number, to: number];

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SEPARATOR = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

/** The protected ranges in `text` (a document prefix), in order, as `[from, to)`. */
export function protectedRanges(text: string): Range[] {
	const out: Range[] = [];
	let comment: number | null = null; // where an open `%%` began
	let fence: string | null = null; // the marker character of an open fence
	let lineStart = 0;
	while (lineStart <= text.length) {
		let lineEnd = text.indexOf("\n", lineStart);
		if (lineEnd === -1) lineEnd = text.length;
		const line = text.slice(lineStart, lineEnd);

		if (fence !== null) {
			out.push([lineStart, lineEnd]);
			const closing = FENCE.exec(line);
			if (closing && closing[1][0] === fence && /^ {0,3}[`~]+\s*$/.test(line)) fence = null;
		} else if (comment === null && FENCE.test(line)) {
			fence = FENCE.exec(line)![1][0];
			out.push([lineStart, lineEnd]);
		} else if (comment === null && line.includes("|") && line.includes("-") && SEPARATOR.test(line)) {
			out.push([lineStart, lineEnd]);
		} else {
			comment = scanInline(text, lineStart, lineEnd, comment, out);
		}
		lineStart = lineEnd + 1;
	}
	if (comment !== null) out.push([comment, text.length]);
	return merge(out);
}

/** Scans one line outside fences. Returns where an unclosed `%%` began (or null). */
function scanInline(text: string, from: number, to: number, comment: number | null, out: Range[]): number | null {
	let i = from;
	let open = comment;
	while (i < to) {
		if (open !== null) {
			const close = text.indexOf("%%", i);
			if (close === -1 || close >= to) return open; // still open at the end of the line
			out.push([open, close + 2]);
			open = null;
			i = close + 2;
			continue;
		}
		const ch = text[i];
		if (ch === "%" && text[i + 1] === "%") {
			open = i;
			i += 2;
		} else if (ch === "`") {
			let run = 1;
			while (text[i + run] === "`") run++;
			const closer = findRun(text, "`", run, i + run, to);
			out.push([i, closer === -1 ? to : closer + run]);
			i = closer === -1 ? to : closer + run;
		} else if (ch === "[" && text[i + 1] === "[") {
			const start = text[i - 1] === "!" && i > from ? i - 1 : i;
			const close = text.indexOf("]]", i + 2);
			const end = close === -1 || close >= to ? to : close + 2;
			out.push([start, end]);
			i = end;
		} else if (ch === "]" && text[i + 1] === "(") {
			const close = text.indexOf(")", i + 2);
			const end = close === -1 || close >= to ? to : close + 1;
			out.push([i + 2, end]);
			i = end;
		} else if ((ch === "h" || ch === "H") && /^https?:\/\//i.test(text.slice(i, i + 8))) {
			let end = i;
			while (end < to && !/\s/.test(text[end])) end++;
			out.push([i, end]);
			i = end;
		} else {
			i++;
		}
	}
	return open;
}

/** The index of a run of exactly `len` of `ch` at or after `from` and before `to`, or -1. */
function findRun(text: string, ch: string, len: number, from: number, to: number): number {
	let i = from;
	while (i < to) {
		if (text[i] !== ch) {
			i++;
			continue;
		}
		let run = 0;
		while (i + run < to && text[i + run] === ch) run++;
		if (run === len) return i;
		i += run;
	}
	return -1;
}

function merge(ranges: Range[]): Range[] {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const out: [number, number][] = [];
	for (const [from, to] of sorted) {
		const last = out[out.length - 1];
		if (last && from <= last[1]) last[1] = Math.max(last[1], to);
		else out.push([from, to]);
	}
	return out;
}

/** True if any character in `[from, to)` is protected. For a single character, `to` is `from + 1`. */
export function touchesProtected(ranges: readonly Range[], from: number, to: number = from + 1): boolean {
	return ranges.some(([a, b]) => a < to && from < b);
}
