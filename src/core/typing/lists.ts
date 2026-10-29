/**
 * The lists behind the typing aids (docs/typing-aids.md §8): what each entry may look like, and how a typed entry is
 * tidied before it is stored. Pure: no editor, no DOM. The settings table checks stored values with the same rules
 * (a stored entry is valid only if tidying it changes nothing), so what the settings view accepts and what a
 * hand-edited `project.md` may hold agree.
 */

/** Limits, so a project file can't grow without bound. */
export const TYPING_LIMITS = { elisions: 200, names: 1000, shortcodes: 200, characters: 100, codeLength: 20, textLength: 500, nameLength: 80 } as const;

const LETTERS = /^\p{L}+$/u;

/** An elision is the letters after the apostrophe (`tis` for `’tis`), lower case. Returns null if it can't be one. */
export function normaliseElision(raw: string): string | null {
	const word = raw.trim().replace(/^['‘’]+/, "").toLowerCase();
	return word.length > 0 && word.length <= TYPING_LIMITS.codeLength && LETTERS.test(word) ? word : null;
}

/** A name for the autocorrect: a single line, no characters a Codex name can't hold (`[ ] # ^ |`), whitespace collapsed. */
export function normaliseName(raw: string): string | null {
	const name = raw.replace(/\s+/g, " ").trim();
	if (name.length === 0 || name.length > TYPING_LIMITS.nameLength) return null;
	return /[\[\]#^|]/.test(name) ? null : name;
}

/** A shortcode's letters, without the `~`. Letters only (any script), so `~` followed by a digit or a space is never one. */
export function normaliseShortcodeCode(raw: string): string | null {
	const code = raw.trim().replace(/^~/, "");
	return code.length > 0 && code.length <= TYPING_LIMITS.codeLength && LETTERS.test(code) ? code : null;
}

/** A shortcode's full text: one line (Return in prose is a new paragraph, so a code can't hold one). */
export function normaliseShortcodeText(raw: string): string | null {
	const text = raw.replace(/\s+/g, " ").trim();
	return text.length > 0 && text.length <= TYPING_LIMITS.textLength ? text : null;
}

/** The characters a person sees as one: a letter with its accent counts once, an emoji with a modifier counts once. */
export function graphemes(text: string): string[] {
	const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
	return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment) : [...text];
}

/** A special character: exactly one visible character, not whitespace or a control character. */
export function normaliseSpecialCharacter(raw: string): string | null {
	const text = raw.trim();
	const parts = graphemes(text);
	if (parts.length !== 1 || text.length > 8) return null;
	return /^[\p{Z}\p{C}]/u.test(text) ? null : text;
}

const same = <T,>(a: T[], b: T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function validList(v: unknown, normalise: (s: string) => string | null, max: number, fold: (s: string) => string = (s) => s): boolean {
	if (!strings(v) || v.length > max) return false;
	if (!same(v, v.map((s) => normalise(s) ?? "\0"))) return false;
	return new Set(v.map(fold)).size === v.length;
}

export const isElisionList = (v: unknown): boolean => validList(v, normaliseElision, TYPING_LIMITS.elisions);
export const isNameList = (v: unknown): boolean => validList(v, normaliseName, TYPING_LIMITS.names, (s) => s.toLowerCase());
export const isCharacterList = (v: unknown): boolean => validList(v, normaliseSpecialCharacter, TYPING_LIMITS.characters);

/** `{ code: full text }`: every code a valid code, every text a valid text, no two codes the same ignoring case. */
export function isShortcodeMap(v: unknown): boolean {
	if (!v || typeof v !== "object" || Array.isArray(v)) return false;
	const entries = Object.entries(v as Record<string, unknown>);
	if (entries.length > TYPING_LIMITS.shortcodes) return false;
	if (!entries.every(([code, text]) => typeof text === "string" && normaliseShortcodeCode(code) === code && normaliseShortcodeText(text) === text)) return false;
	return new Set(entries.map(([code]) => code.toLowerCase())).size === entries.length;
}

/** Adds an entry to a list unless it is already there (ignoring case, for names and elisions), keeping the order. */
export function withEntry(list: readonly string[], entry: string, fold: (s: string) => string = (s) => s): string[] {
	return list.some((x) => fold(x) === fold(entry)) ? [...list] : [...list, entry];
}

export function withoutEntry(list: readonly string[], entry: string): string[] {
	return list.filter((x) => x !== entry);
}

/** Moves the entry at `index` one place earlier (`-1`) or later (`1`). */
export function moved(list: readonly string[], index: number, by: -1 | 1): string[] {
	const to = index + by;
	if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
	const next = [...list];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}
