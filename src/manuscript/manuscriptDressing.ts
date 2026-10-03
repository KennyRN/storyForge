import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

/**
 * The manuscript editor's light prose dressing (continuous-mode manuscript brief §3.11), DOM-free:
 * the surface holds markdown source, and this finds just enough of it to read as prose — emphasis
 * (`*`, `_`, `**`, `__`, and `***` for both), `#` heading markers, and `%% %%` comments. Nothing else
 * is recognised; links, embeds and the rest stay plain source.
 *
 * Positions from the scanners are offsets into the text they were given.
 */

export type EmphasisKind = "em" | "strong" | "strong-em";

export interface EmphasisSpan {
	kind: EmphasisKind;
	/** The whole span, markers included. */
	from: number;
	to: number;
	/** Marker length at each end. */
	marker: number;
}

const KIND_BY_LENGTH: Record<number, EmphasisKind> = { 1: "em", 2: "strong", 3: "strong-em" };
const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Length of the run of `ch` starting at `i`, stopping at `end`. */
function runLength(text: string, i: number, end: number, ch: string): number {
	let n = 0;
	while (i + n < end && text[i + n] === ch) n++;
	return n;
}

/**
 * Finds the closing run for an opener of `len` × `ch` opened just before `from`: exactly `len` long,
 * not preceded by whitespace, and — for `_` — not followed by a letter or digit (no intraword
 * underscores). Skips escapes and code spans. Returns its start, or -1.
 */
function findCloser(text: string, from: number, end: number, ch: string, len: number): number {
	let j = from;
	while (j < end) {
		const c = text[j];
		if (c === "\\") {
			j += 2;
			continue;
		}
		if (c === "`") {
			const skipped = skipCodeSpan(text, j, end);
			if (skipped !== j) {
				j = skipped;
				continue;
			}
		}
		if (c === ch) {
			const run = runLength(text, j, end, ch);
			const closes = run === len && !isSpace(text[j - 1]) && (ch !== "_" || !isWordChar(text[j + run]));
			if (closes) return j;
			j += run;
			continue;
		}
		j++;
	}
	return -1;
}

/** If a code span opens at `i`, the index just past it; otherwise `i` (no closing run → not code). */
function skipCodeSpan(text: string, i: number, end: number): number {
	const run = runLength(text, i, end, "`");
	const close = text.indexOf("`".repeat(run), i + run);
	return close !== -1 && close + run <= end ? close + run : i;
}

function scanRange(text: string, start: number, end: number, out: EmphasisSpan[]): void {
	let i = start;
	while (i < end) {
		const c = text[i];
		if (c === "\\") {
			i += 2;
			continue;
		}
		if (c === "`") {
			const skipped = skipCodeSpan(text, i, end);
			i = skipped !== i ? skipped : i + runLength(text, i, end, "`");
			continue;
		}
		if (c !== "*" && c !== "_") {
			i++;
			continue;
		}
		const run = runLength(text, i, end, c);
		const kind = KIND_BY_LENGTH[run];
		const opens = kind !== undefined && !isSpace(text[i + run]) && (c !== "_" || !isWordChar(text[i - 1]));
		if (!opens) {
			i += run;
			continue;
		}
		const close = findCloser(text, i + run, end, c, run);
		if (close === -1) {
			i += run;
			continue;
		}
		out.push({ kind, from: i, to: close + run, marker: run });
		scanRange(text, i + run, close, out); // emphasis nested inside
		i = close + run;
	}
}

/** Emphasis spans in one line of text, nested spans included, in document order of their start. */
export function scanEmphasis(line: string): EmphasisSpan[] {
	const out: EmphasisSpan[] = [];
	scanRange(line, 0, line.length, out);
	return out.sort((a, b) => a.from - b.from);
}

/** A heading line's level and where its marker (the `#`s and the space after them) ends, or null. */
export function scanHeading(line: string): { level: number; markerEnd: number } | null {
	const match = /^(#{1,6})[ \t]+/.exec(line);
	return match ? { level: match[1].length, markerEnd: match[0].length } : null;
}

/** `%% … %%` comments in a chapter's text — they may span lines. An unclosed `%%` runs to the end,
 * as in Obsidian. */
export function scanComments(text: string): { from: number; to: number }[] {
	const out: { from: number; to: number }[] = [];
	let i = text.indexOf("%%");
	while (i !== -1) {
		const close = text.indexOf("%%", i + 2);
		if (close === -1) {
			out.push({ from: i, to: text.length });
			break;
		}
		out.push({ from: i, to: close + 2 });
		i = text.indexOf("%%", close + 2);
	}
	return out;
}

/**
 * Mod-B / Mod-I: toggles `marker` (`**` or `*`) around each selection. Unwraps when the selection
 * is already wrapped — markers just outside it, or just inside it — otherwise wraps it; an empty
 * selection gets a pair of markers with the caret between them.
 */
export function toggleEmphasis(state: EditorState, marker: "**" | "*"): TransactionSpec {
	const n = marker.length;
	const { doc } = state;
	// A lone `*` must not mistake one half of a `**` for its own marker.
	const isMarkerAt = (pos: number): boolean =>
		pos >= 0 &&
		pos + n <= doc.length &&
		doc.sliceString(pos, pos + n) === marker &&
		(n === 2 || (doc.sliceString(pos - 1, pos) !== "*" && doc.sliceString(pos + 1, pos + 2) !== "*"));
	return state.changeByRange((range) => {
		if (range.empty) {
			return {
				changes: { from: range.from, insert: marker + marker },
				range: EditorSelection.cursor(range.from + n),
			};
		}
		if (isMarkerAt(range.from - n) && isMarkerAt(range.to)) {
			return {
				changes: [
					{ from: range.from - n, to: range.from },
					{ from: range.to, to: range.to + n },
				],
				range: EditorSelection.range(range.from - n, range.to - n),
			};
		}
		if (range.to - range.from >= 2 * n && isMarkerAt(range.from) && isMarkerAt(range.to - n)) {
			return {
				changes: [
					{ from: range.from, to: range.from + n },
					{ from: range.to - n, to: range.to },
				],
				range: EditorSelection.range(range.from, range.to - 2 * n),
			};
		}
		return {
			changes: [
				{ from: range.from, insert: marker },
				{ from: range.to, insert: marker },
			],
			range: EditorSelection.range(range.from + n, range.to + n),
		};
	});
}
