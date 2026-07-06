/**
 * titleToId — derive a short, uppercase ID from a story title.
 *
 * The selection rule weights the END of the title, because the subject of a
 * title usually lives there ("Mr. Jones"), while filler sits in the middle.
 * For a 3-letter code it takes the FIRST segment plus the LAST TWO segments:
 *
 *   "UnTold Tales"                -> UTT   (Un + Told + Tales)
 *   "Great and Amazing Mr. Jones" -> GMJ   (Great + Mr + Jones, "and" dropped)
 *
 * Two extras make those examples work:
 *   - internal capitals split a word: "UnTold" -> ["Un", "Told"]
 *   - a small stop-word list drops grammatical filler ("and", "the", "of"...),
 *     but NOT honorifics, so "Mr" survives.
 */

export interface TitleToIdOptions {
	/** Desired ID length. Default 3. */
	length?: number;
	/** Words ignored when picking segments. Case-insensitive. */
	stopWords?: Set<string>;
	/** Treat internal capitals ("UnTold") as word breaks. Default true. */
	splitCamelCase?: boolean;
}

const DEFAULT_STOP_WORDS = new Set([
	"a", "an", "and", "the", "of", "or", "to", "in",
	"on", "at", "for", "by", "with", "from", "as",
]);

/** Break a title into meaningful segments. */
function segment(title: string, splitCamelCase: boolean): string[] {
	const words = title.split(/[^A-Za-z]+/).filter(Boolean);
	if (!splitCamelCase) return words;

	const out: string[] = [];
	for (const word of words) {
		out.push(...word.split(/(?=[A-Z])/).filter(Boolean));
	}
	return out;
}

export function titleToId(title: string, options: TitleToIdOptions = {}): string {
	const length = options.length ?? 3;
	const stopWords = options.stopWords ?? DEFAULT_STOP_WORDS;
	const splitCamelCase = options.splitCamelCase ?? true;

	const all = segment(title, splitCamelCase);

	let segments = all.filter((s) => !stopWords.has(s.toLowerCase()));
	if (segments.length === 0) segments = all;

	const chosen =
		segments.length <= length
			? segments
			: [segments[0], ...segments.slice(segments.length - (length - 1))];

	const letters = chosen.map((s) => s[0].toUpperCase());

	if (letters.length < length) {
		const tail = chosen.map((s) => s.slice(1).toUpperCase()).join("");
		for (let i = 0; letters.length < length && i < tail.length; i++) {
			letters.push(tail[i]);
		}
	}
	while (letters.length < length) letters.push("X");

	return letters.slice(0, length).join("");
}

const GUIDE_LETTER_COUNT = 26;

/**
 * Next 4-letter book folder code for `seriesTitle`: a 3-letter prefix from
 * `titleToId` plus a sequential guide letter that never reuses one already
 * seen in `existingNames` (even if that book's folders were since deleted).
 */
export function nextBookFolderCode(seriesTitle: string, existingNames: Iterable<string>): string {
	const prefix = titleToId(seriesTitle, { length: 3 });
	let maxIndex = -1;
	for (const name of existingNames) {
		if (name.length !== 4) continue;
		if (name.slice(0, 3).toUpperCase() !== prefix) continue;
		const guideChar = name[3].toLowerCase();
		if (guideChar < "a" || guideChar > "z") continue;
		const idx = guideChar.charCodeAt(0) - "a".charCodeAt(0);
		if (idx > maxIndex) maxIndex = idx;
	}
	const nextIdx = maxIndex + 1;
	if (nextIdx >= GUIDE_LETTER_COUNT) {
		throw new Error(`storyForge: exhausted guide letters for prefix "${prefix}"`);
	}
	return `${prefix}${String.fromCharCode("a".charCodeAt(0) + nextIdx)}`;
}
