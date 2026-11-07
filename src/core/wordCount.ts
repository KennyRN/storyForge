/**
 * Strips YAML frontmatter and <!-- ... --> comments from raw markdown, then counts words (decision 49, 0.13.1):
 * runs of text between spaces, where an em dash, an en dash, two or more hyphens and an ellipsis (`…` or three or more
 * dots) act like a space; a single hyphen joins (`well-known` is one word); a run with no letter or digit is not a word
 * (a spaced dash, a lone ellipsis, a bare `#`); and a dash between two digits joins (`1990–95` is one word, as it always
 * was). The typing aids swap `--` for `—` and `...` for `…`, which this treats alike, so they never change a count.
 */
export function stripForCounting(raw: string): string {
	let text = raw;

	if (text.startsWith("---")) {
		const end = text.indexOf("\n---", 3);
		if (end !== -1) {
			const afterDelim = text.indexOf("\n", end + 1);
			text = afterDelim === -1 ? "" : text.slice(afterDelim + 1);
		}
	}

	text = text.replace(/<!--[\s\S]*?-->/g, "");

	return text;
}

const SEPARATOR = /—|–|-{2,}|…|\.{3,}/g;
const DIGIT = /\p{Nd}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Counts words in a single line of text, using the same rule as `countWords`. */
export function countWordsInLine(text: string): number {
	const spaced = text.replace(SEPARATOR, (m, at: number, whole: string) => {
		const dash = m !== "…" && m[0] !== ".";
		return dash && DIGIT.test(whole[at - 1] ?? "") && DIGIT.test(whole[at + m.length] ?? "") ? m : " ";
	});
	return (spaced.match(/\S+/g) ?? []).filter((w) => HAS_LETTER_OR_DIGIT.test(w)).length;
}

export function countWords(raw: string): number {
	const stripped = stripForCounting(raw);
	return countWordsInLine(stripped);
}

/** Digit grouping for a displayed word count (e.g. 1234 → "1,234") — digits only, no unit word. */
export function formatWordCount(n: number): string {
	return Math.round(n).toLocaleString("en-US");
}

export function sumWordCounts(chapterContents: string[]): number {
	return chapterContents.reduce((total, content) => total + countWords(content), 0);
}

/** Collapses raw markdown into a short, single-line preview for a row tooltip — shared by the chapter and codex archive modals. */
export function excerpt(raw: string, maxLength = 200): string {
	const collapsed = stripForCounting(raw).trim().replace(/\s+/g, " ");
	if (!collapsed) return "";
	return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength).trimEnd()}…` : collapsed;
}
