/**
 * Smart punctuation (docs/typing-aids.md §4, decision 37 and the H1 rulings of decision 46): curly quotes and
 * apostrophes, a spaced hyphen to an en dash, two hyphens to an em dash, three full stops to an ellipsis. Pure.
 *
 * The function is given the document **after** a character was typed, up to the caret (`before`), and says what
 * single change, if any, the aid makes in answer to that keystroke. It never looks past the caret, and it only
 * changes text that was typed in the current unbroken run (`runStart`): a change that reaches back into text that was
 * already there is refused. Nothing happens inside protected text.
 */
import { protectedRanges, touchesProtected } from "./protectedText";

/** Replace `[from, to)` of the document with `insert`. Offsets are into the same text as `before`. */
export interface AidChange {
	from: number;
	to: number;
	insert: string;
	/** For a name correction: what was typed and what it became, so an undo of it can offer to stop correcting that name. */
	name?: { spelling: string; original: string; lowercase: boolean };
	kind: "quote" | "apostrophe-before-digit" | "elision" | "en-dash" | "em-dash" | "ellipsis" | "name";
}

export interface SmartPunctuationOptions {
	/** The lower-case words that begin with an apostrophe (`tis`), from the project's list. */
	elisions: ReadonlySet<string>;
	/** The protected ranges, from the editor's parse tree; with none given they are parsed from `before`. */
	protect?: readonly [number, number][];
}

const OPENERS = "([{";
const DASHES = "—–";
const isLetter = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{M}]/u.test(ch);
const isDigit = (ch: string | undefined): boolean => ch !== undefined && /\p{Nd}/u.test(ch);
const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);
const isQuote = (ch: string | undefined): boolean => ch !== undefined && "'\"‘’“”".includes(ch);

/** Where a quote would open: the start of a line, a space, an opening bracket or a dash. */
const opensAfter = (prev: string | undefined): boolean => prev === undefined || prev === "\n" || isSpace(prev) || OPENERS.includes(prev) || DASHES.includes(prev);

/**
 * The changes the aid makes after the last character of `before` was typed (none, one, or two: a dash that this
 * keystroke completes, and the quote this keystroke is). They are one step: one ⌘Z undoes them together. `runStart`
 * is the offset where the current run of typed text began: nothing before it is ever changed.
 */
export function smartPunctuationChanges(before: string, runStart: number, options: SmartPunctuationOptions): AidChange[] {
	const col = before.length;
	if (col === 0) return [];
	const c = before[col - 1];
	const prev = col >= 2 ? before[col - 2] : undefined;
	const inRun = (from: number): boolean => from >= runStart;
	const found: AidChange[] = [];

	// What this keystroke completes in the text before it.
	let prevForQuote = prev;
	if (c !== "-" && col >= 3 && before.slice(col - 3, col - 1) === "--" && before[col - 4] !== "-" && inRun(col - 3) && !onlyRuleChars(before, col)) {
		// Two hyphens become an em dash once the next character is typed (so `---` is never touched).
		found.push({ from: col - 3, to: col - 1, insert: "—", kind: "em-dash" });
		prevForQuote = "—";
	} else if (c !== "-" && !isSpace(c) && col >= 4 && before.slice(col - 4, col - 1) === " - " && before[col - 5] !== "-" && inRun(col - 3) && !isListMarker(before, col - 3) && !onlyRuleChars(before, col) && !(isDigit(c) && endsWithNumber(before, col - 4))) {
		// A spaced hyphen becomes an en dash once the next character is typed, unless it is a digit right after a number (5 - 3).
		found.push({ from: col - 3, to: col - 2, insert: "–", kind: "en-dash" });
	}

	if (c === '"') {
		found.push({ from: col - 1, to: col, insert: opensAfter(prevForQuote) || prevForQuote === "‘" || prevForQuote === "“" ? "“" : "”", kind: "quote" });
	} else if (c === "'") {
		let insert: string;
		if (isLetter(prevForQuote) || isDigit(prevForQuote)) insert = "’";
		else if (prevForQuote === "‘") insert = "’"; // an apostrophe after an opening quote: ‘’Tis
		else if (prevForQuote === "“") insert = "‘"; // nested speech
		else if (opensAfter(prevForQuote)) insert = "‘";
		else insert = "’"; // after closing punctuation
		found.push({ from: col - 1, to: col, insert, kind: "quote" });
	} else if (isDigit(c) && prev === "‘" && inRun(col - 2) && opensAfter(col >= 3 ? before[col - 3] : undefined)) {
		// An apostrophe before a number is always an apostrophe: ’90s.
		found.push({ from: col - 2, to: col - 1, insert: "’", kind: "apostrophe-before-digit" });
	} else if (c === "." && before.slice(Math.max(0, col - 3), col - 1) === ".." && before[col - 4] !== "." && inRun(col - 3)) {
		found.push({ from: col - 3, to: col, insert: "…", kind: "ellipsis" });
	} else if (isFinisher(c)) {
		const elision = elisionChange(before, col, runStart, options);
		if (elision) found.push(elision);
	}

	if (found.length === 0) return [];
	const ranges = options.protect ?? protectedRanges(before);
	if (touchesProtected(ranges, col - 1)) return [];
	return found.filter((ch) => !touchesProtected(ranges, ch.from, ch.to)).sort((x, y) => x.from - y.from);
}

/** Characters that finish a word for the elision rule: whitespace and punctuation, but not quotes, hyphens or the apostrophe. */
function isFinisher(c: string): boolean {
	if (isLetter(c) || isDigit(c) || isQuote(c) || c === "-" || c === "~") return false;
	return isSpace(c) || /[\p{P}\p{S}]/u.test(c);
}

/** True if the line so far (through the typed character) is only hyphens, spaces, pipes and colons: a rule or a table's separator row. */
function onlyRuleChars(text: string, caret: number): boolean {
	const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
	return /^[\s|:-]*$/.test(text.slice(lineStart, caret));
}

/** True if the hyphen at `at` is the first non-space character of its line: a list item, not a dash. */
function isListMarker(text: string, at: number): boolean {
	const lineStart = text.lastIndexOf("\n", at - 1) + 1;
	return /^\s*$/.test(text.slice(lineStart, at));
}

/** True if the word ending just before `end` is a number (digits, with separators). */
function endsWithNumber(text: string, end: number): boolean {
	return /(?:^|\s)\d[\d.,:]*$/.test(text.slice(0, end));
}

/** A word that began with `‘` and is on the elision list gets an apostrophe instead, unless a quote mark finished it. */
function elisionChange(before: string, col: number, runStart: number, options: SmartPunctuationOptions): AidChange | null {
	let start = col - 1;
	while (start > 0 && isLetter(before[start - 1])) start--;
	const word = before.slice(start, col - 1);
	if (word.length === 0 || before[start - 1] !== "‘") return null;
	const quoteAt = start - 1;
	if (quoteAt < runStart || !opensAfter(quoteAt > 0 ? before[quoteAt - 1] : undefined)) return null;
	if (!options.elisions.has(word.toLowerCase())) return null;
	return { from: quoteAt, to: quoteAt + 1, insert: "’", kind: "elision" };
}
