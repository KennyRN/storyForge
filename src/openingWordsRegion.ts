import { countWordsInLine } from "./wordCount";

/**
 * The depth guide's ("opening words") region rule, DOM-free so the chapter editor (openingWords.ts)
 * and the manuscript editor (view/manuscript/manuscriptGuides.ts) share it rather than copy it.
 *
 * Lines are numbered 1..`lineCount`, read through `lineText`. The region runs from line 1 through
 * the end of the paragraph containing the `targetWords`-th word — pushed forward to the paragraph's
 * last line of text rather than cutting it in half — and on through any blank lines after it, to
 * where the next paragraph's text starts.
 *
 * Returns null when there aren't `targetWords` words yet. Otherwise `endLine` is the paragraph's last
 * line of text, and `nextTextLine` the first line of the next paragraph — the region stops at its top
 * — or null when no text follows, in which case the region runs to the end.
 */
export function findOpeningWordsBoundary(
	lineCount: number,
	lineText: (line: number) => string,
	targetWords: number,
): { endLine: number; nextTextLine: number | null } | null {
	let cumulative = 0;
	let crossingLine = -1;
	for (let i = 1; i <= lineCount; i++) {
		cumulative += countWordsInLine(lineText(i));
		if (cumulative >= targetWords) {
			crossingLine = i;
			break;
		}
	}
	if (crossingLine === -1) return null;

	let endLine = crossingLine;
	while (endLine < lineCount && lineText(endLine + 1).trim() !== "") endLine++;

	let nextTextLine = endLine + 1;
	while (nextTextLine <= lineCount && lineText(nextTextLine).trim() === "") nextTextLine++;
	return { endLine, nextTextLine: nextTextLine <= lineCount ? nextTextLine : null };
}
