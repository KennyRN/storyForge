import { countWordsInLine } from "../wordCount";

/**
 * The cycling guide's counting across a whole book (continuous-mode manuscript brief §3.9), DOM-free.
 * The count starts at zero at the first placed chapter and never resets at a chapter break; it uses
 * the single-chapter guide's own per-line rule (countWordsInLine), so the two agree, and titles never
 * count because they aren't text. Counts are kept per chapter, so an edit recounts only the chapters
 * it touches; every other chapter's guide lines follow from the running totals.
 */

/** Words on each line of one chapter's text. */
export function lineWordCounts(text: string): number[] {
	return text.split("\n").map(countWordsInLine);
}

/** Where each chapter's count starts: the words in every chapter before it. */
export function runningStarts(totals: readonly number[]): number[] {
	const starts: number[] = [];
	let sum = 0;
	for (const total of totals) {
		starts.push(sum);
		sum += total;
	}
	return starts;
}

/**
 * The lines (0-based, within the chapter) where the book's running count crosses a new multiple of
 * `interval` — the same test the chapter editor's guide applies line by line from the top of its file.
 */
export function cyclingCrossings(lineCounts: readonly number[], startCumulative: number, interval: number): number[] {
	const crossings: number[] = [];
	let cumulative = startCumulative;
	for (let i = 0; i < lineCounts.length; i++) {
		const before = cumulative;
		cumulative += lineCounts[i];
		if (Math.floor(cumulative / interval) > Math.floor(before / interval)) crossings.push(i);
	}
	return crossings;
}
