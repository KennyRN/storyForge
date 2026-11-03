/**
 * The data bar's tooltip text, DOM-free so it can be unit tested. (The three card sizes this file once held, bar, collapsed and
 * extended, went in 1.7.0 with the cards: every chapter card is now just its bar. The stored sizes are carried through untouched,
 * see `cardTiers` in `app/settings.ts`.)
 */
import { formatWordCount } from "./wordCount";

/**
 * The data bar's tooltip: `<word count>: <first paragraph of the description>`, or the count
 * alone when the description is empty or whitespace. The first paragraph is everything before
 * the first line break once leading whitespace (blank lines included) is trimmed.
 */
export function plotCardTooltip(wordCount: number, description: string): string {
	const count = formatWordCount(wordCount);
	const firstParagraph = description.trimStart().split(/\r?\n/, 1)[0].trimEnd();
	return firstParagraph ? `${count}: ${firstParagraph}` : count;
}
