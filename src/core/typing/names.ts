/**
 * Name autocorrect (docs/typing-aids.md §5, decision 37 and the rulings of decision 46). When a word the author has
 * just typed is finished, and once joined letters, accents and capitals are ignored it matches exactly one known
 * name, it is replaced by the name's proper spelling. Pure: no editor, no DOM.
 *
 * Folding turns `Ælfric` and `Aelfric` and `aelfric` into the same key. A name is indexed under **every** form it folds
 * to (`ð` can be `th` or `d`, `ȝ` can be `g`, `y` or `gh`); if two different names share any form, that form is
 * ambiguous and nothing is changed. Only the word just finished is looked at, and only text typed in the current
 * unbroken run is ever changed.
 */
import { protectedRanges, touchesProtected } from "./protectedText";
import type { AidChange } from "./smartPunctuation";

/** Letters that fold to more than one plain spelling, and letters with no accent to strip. */
const FOLDS: Record<string, string[]> = {
	æ: ["ae"],
	œ: ["oe"],
	ð: ["th", "d"],
	þ: ["th"],
	ƿ: ["w"],
	ȝ: ["g", "y", "gh"],
	ß: ["ss"],
	ø: ["o"],
	đ: ["d"],
	ł: ["l"],
	ı: ["i"],
};
const MAX_FORMS = 16;

/** Every plain spelling `word` folds to: lower case, accents stripped, joined letters split. At least one. */
export function foldForms(word: string): string[] {
	const plain = word.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[‘’]/g, "'");
	let forms = [""];
	for (const ch of plain) {
		const options = FOLDS[ch] ?? [ch];
		const next: string[] = [];
		for (const f of forms) for (const o of options) next.push(f + o);
		forms = next.length > MAX_FORMS ? next.slice(0, MAX_FORMS) : next;
	}
	return [...new Set(forms)];
}

/** Where a known name comes from. Aliases are only ever read. */
export interface NameSource {
	spelling: string;
	/** A Codex note's path, or `"word list"`: names of the same note don't make each other ambiguous. */
	origin: string;
	/** The note's own title (as opposed to one of its aliases). */
	title: boolean;
}

interface Entry {
	spelling: string;
	tokens: string[];
	forms: string[][];
	optOut: boolean;
}

export interface NameIndex {
	/** Every name with the folded forms of each of its words (for offering names after `~`). */
	all: readonly { spelling: string; forms: string[][] }[];
	/** Entries by the folded forms of their last word. */
	byLast: Map<string, Entry[]>;
	/** The longest name, in words. */
	maxWords: number;
	/** Every known spelling exactly as written: a word typed that way is never changed. */
	exact: Set<string>;
	size: number;
}

export const EMPTY_NAMES: NameIndex = { all: [], byLast: new Map(), maxWords: 0, exact: new Set(), size: 0 };

const tokensOf = (spelling: string): string[] => spelling.split(/\s+/).filter(Boolean);

/**
 * Builds the index. An alias that folds to the same thing as its own note's title is dropped (it can't be told apart
 * from the title, and the title is the proper spelling). Names of one word under two letters are left out.
 */
export function buildNameIndex(sources: readonly NameSource[], optOuts: Iterable<string> = []): NameIndex {
	const out = new Set([...optOuts].map((n) => n.toLowerCase()));
	const titleKeys = new Map<string, Set<string>>();
	for (const s of sources) if (s.title) titleKeys.set(s.origin, new Set([...(titleKeys.get(s.origin) ?? []), foldForms(s.spelling.replace(/\s+/g, " ")).join("|")]));
	const seen = new Set<string>();
	const entries: Entry[] = [];
	for (const s of sources) {
		const spelling = s.spelling.replace(/\s+/g, " ").trim();
		if (spelling.length < 2 || seen.has(spelling)) continue;
		if (!s.title && titleKeys.get(s.origin)?.has(foldForms(spelling).join("|"))) continue;
		seen.add(spelling);
		const tokens = tokensOf(spelling);
		entries.push({ spelling, tokens, forms: tokens.map(foldForms), optOut: out.has(spelling.toLowerCase()) });
	}
	const byLast = new Map<string, Entry[]>();
	let maxWords = 0;
	for (const e of entries) {
		maxWords = Math.max(maxWords, e.tokens.length);
		for (const form of e.forms[e.forms.length - 1]) byLast.set(form, [...(byLast.get(form) ?? []), e]);
	}
	return { all: entries.map((e) => ({ spelling: e.spelling, forms: e.forms })), byLast, maxWords, exact: new Set(entries.map((e) => e.spelling)), size: entries.length };
}

export interface NameCorrectionOptions {
	/** Smart punctuation is on: a kept possessive's apostrophe is curled. */
	smartPunctuation: boolean;
	/** The protected ranges, from the editor's parse tree; with none given they are parsed from `before`. */
	protect?: readonly [number, number][];
}

const isLetter = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{M}]/u.test(ch);
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{M}\p{Nd}]/u.test(ch);
const isApostrophe = (ch: string | undefined): boolean => ch === "'" || ch === "’";

/** Characters that finish a word: whitespace and punctuation, but not the apostrophe or hyphen that can sit inside one. */
function isFinisher(c: string): boolean {
	if (isWordChar(c) || isApostrophe(c) || c === "-" || c === "‘" || c === "~") return false;
	return /\s/.test(c) || /[\p{P}\p{S}]/u.test(c);
}

interface Word {
	start: number;
	end: number;
	text: string;
}

/** The word that ends at `end` (exclusive): letters, marks and digits, with `'`, `’` or `-` allowed between letters. */
function wordBefore(text: string, end: number): Word | null {
	let start = end;
	while (start > 0) {
		const ch = text[start - 1];
		if (isWordChar(ch)) start--;
		else if ((isApostrophe(ch) || ch === "-") && isLetter(text[start - 2]) && isLetter(text[start])) start--;
		else break;
	}
	return start < end && isWordChar(text[end - 1]) ? { start, end, text: text.slice(start, end) } : null;
}

/** The typed words ending at `end`, newest first, joined by exactly one space, none starting before `runStart`. */
function wordsBefore(text: string, end: number, count: number, runStart: number): Word[] {
	const words: Word[] = [];
	let at = end;
	while (words.length < count) {
		const w = wordBefore(text, at);
		if (!w || w.start < runStart) break;
		words.push(w);
		if (text[w.start - 1] === " " && isWordChar(text[w.start - 2])) at = w.start - 1;
		else break;
	}
	return words;
}

const overlap = (a: readonly string[], b: readonly string[]): boolean => a.some((x) => b.includes(x));

/** Finds the one name a run of typed words stands for, or null if none matches or the match is ambiguous. */
function findEntry(index: NameIndex, typed: readonly string[]): Entry | null {
	// typed is oldest first; try the longest name that fits, then shorter.
	const last = typed[typed.length - 1];
	const candidates = new Set<Entry>();
	for (const form of foldForms(last)) for (const e of index.byLast.get(form) ?? []) candidates.add(e);
	let best: Entry[] = [];
	let bestLength = 0;
	for (const e of candidates) {
		const n = e.tokens.length;
		if (n > typed.length || n < bestLength) continue;
		const tail = typed.slice(typed.length - n);
		if (!tail.every((word, i) => overlap(foldForms(word), e.forms[i]))) continue;
		if (n > bestLength) {
			best = [];
			bestLength = n;
		}
		best.push(e);
	}
	const spellings = new Set(best.map((e) => e.spelling));
	return spellings.size === 1 ? best[0] : null;
}

/** What a possessive looks like at the end of a word: `'s` or `’s`. */
const POSSESSIVE = /^(.+?)(['’][sS])$/u;

/**
 * The correction the aid makes after the last character of `before` was typed, or null. `runStart` is where the
 * current unbroken run of typed text began: nothing before it is ever changed.
 */
export function nameCorrection(before: string, runStart: number, index: NameIndex, options: NameCorrectionOptions): AidChange | null {
	if (index.size === 0) return null;
	const col = before.length;
	const c = before[col - 1];
	if (c === undefined || !isFinisher(c)) return null;
	const last = wordBefore(before, col - 1);
	if (!last || last.start < runStart) return null;
	if (before[last.start - 1] === "~") return null; // a shortcode in progress
	const words = wordsBefore(before, col - 1, Math.max(1, index.maxWords), runStart);

	const attempt = (typedWords: Word[], possessive: string): AidChange | null => {
		const ordered = [...typedWords].reverse();
		const entry = findEntry(index, ordered.map((w) => w.text));
		if (!entry) return null;
		const used = ordered.slice(ordered.length - entry.tokens.length);
		const from = used[0].start;
		const to = used[used.length - 1].end;
		const typed = before.slice(from, to);
		if (typed === entry.spelling) return null;
		const lowercase = typed === typed.toLowerCase() && /\p{L}/u.test(typed);
		if (entry.optOut && lowercase) return null; // an ordinary word that is also a name: left as typed
		return { from, to: to + possessive.length, insert: entry.spelling + (options.smartPunctuation ? possessive.replace("'", "’") : possessive), kind: "name", name: { spelling: entry.spelling, original: typed, lowercase } };
	};

	// The whole last word first (so a name that really ends in 's is found), then without a possessive.
	const whole = attempt(words, "");
	let change = whole;
	if (!whole) {
		const m = POSSESSIVE.exec(last.text);
		if (m) {
			const stem: Word = { start: last.start, end: last.start + m[1].length, text: m[1] };
			change = attempt([stem, ...words.slice(1)], m[2]);
		}
	}
	if (!change) return null;
	// A name typed exactly as a known spelling is the author's choice, whatever else it folds to.
	if (index.exact.has(before.slice(change.from, change.to))) return null;
	const ranges = options.protect ?? protectedRanges(before);
	return touchesProtected(ranges, change.from, change.to) || touchesProtected(ranges, col - 1) ? null : change;
}
