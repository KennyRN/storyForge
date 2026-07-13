/**
 * Strips YAML frontmatter and %% ... %% comments from raw markdown, then
 * counts words as runs of non-whitespace. The rule is kept deliberately dumb
 * and stable so the word-count graph stays consistent over time.
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

	text = text.replace(/%%[\s\S]*?%%/g, "");

	return text;
}

/** Counts whitespace-separated words in a single line of text, using the same rule as `countWords`. */
export function countWordsInLine(text: string): number {
	const matches = text.trim().match(/\S+/g);
	return matches ? matches.length : 0;
}

export function countWords(raw: string): number {
	const stripped = stripForCounting(raw);
	return countWordsInLine(stripped);
}

export function sumWordCounts(chapterContents: string[]): number {
	return chapterContents.reduce((total, content) => total + countWords(content), 0);
}
