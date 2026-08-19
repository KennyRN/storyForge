/**
 * British-convention title case, plus the indefinite-article fix that lets a
 * template write `a {role}` without knowing whether the drawn word starts with
 * a vowel sound.
 *
 * Deliberately re-derives casing from scratch rather than trusting the input's
 * casing, because slot fills arrive lowercase (glosses are authored lowercase
 * except proper nouns) and literal template text arrives already-capitalised —
 * the two only agree once this pass runs. The one thing it must never do is
 * relowercase an acronym: `NEET` must stay `NEET`, not become `Neet`/`neet`.
 */

const SMALL_WORDS = new Set([
	"a",
	"an",
	"and",
	"as",
	"at",
	"but",
	"by",
	"for",
	"from",
	"if",
	"in",
	"into",
	"nor",
	"of",
	"on",
	"onto",
	"or",
	"over",
	"per",
	"so",
	"than",
	"that",
	"the",
	"to",
	"up",
	"upon",
	"vs",
	"vs.",
	"via",
	"with",
	"yet",
	"near",
]);

/** Words that look vowel-initial but take "a", or consonant-initial but take "an". */
const A_AN_EXCEPTIONS: Record<string, "a" | "an"> = {
	university: "a",
	universe: "a",
	unicorn: "a",
	unique: "a",
	union: "a",
	united: "a",
	usual: "a",
	user: "a",
	useful: "a",
	one: "a",
	european: "a",
	eucalyptus: "a",
	euphemism: "a",
	hour: "an",
	honest: "an",
	honour: "an",
	honor: "an",
	heir: "an",
	heiress: "an",
};

function isAcronym(word: string): boolean {
	const letters = word.replace(/[^A-Za-z]/g, "");
	return letters.length >= 2 && letters === letters.toUpperCase() && /[A-Z]/.test(letters);
}

/** Capitalise the first letter of each hyphen-separated segment; leave acronym segments alone. */
function capitaliseWord(word: string): string {
	return word
		.split("-")
		.map((segment) => {
			if (segment.length === 0) return segment;
			if (isAcronym(segment)) return segment;
			const first = segment.match(/[A-Za-z]/);
			if (!first || first.index === undefined) return segment;
			const i = first.index;
			return segment.slice(0, i) + segment[i]!.toUpperCase() + segment.slice(i + 1).toLowerCase();
		})
		.join("-");
}

function lowerWord(word: string): string {
	// Never lowercase an acronym even when it's grammatically a "small word" homograph.
	if (isAcronym(word)) return word;
	return word.toLowerCase();
}

/** Title-case one string. Small words lowercase unless first, last, or right after a colon. */
export function titleCase(input: string): string {
	if (input.trim() === "") return "";
	const words = input.trim().split(/\s+/);
	let afterColon = true; // the start of the string counts as a sentence start too

	const cased = words.map((word, index) => {
		const isFirst = index === 0;
		const isLast = index === words.length - 1;
		const bare = word.replace(/[.,!?:;"']+$/g, "");
		const small = SMALL_WORDS.has(bare.toLowerCase());

		const out =
			isFirst || isLast || afterColon || !small ? capitaliseWord(word) : lowerWord(word);

		afterColon = /:$/.test(word);
		return out;
	});

	return fixIndefiniteArticles(cased.join(" "));
}

function startsWithVowelSound(word: string): boolean {
	const bare = word.replace(/^[^A-Za-z]+/, "");
	if (bare.length === 0) return false;
	const lower = bare.toLowerCase();
	const exception = A_AN_EXCEPTIONS[lower];
	if (exception) return exception === "an";
	return /^[aeiou]/i.test(bare);
}

/** Fix every "a"/"A" or "an"/"An" that precedes the wrong-sounding next word. */
function fixIndefiniteArticles(text: string): string {
	return text.replace(/\b([Aa]n?)\s+(\S+)/g, (match, article: string, next: string) => {
		const wantAn = startsWithVowelSound(next);
		const isAn = article.length === 2;
		if (wantAn === isAn) return match;
		const capital = article[0] === "A";
		const fixed = wantAn ? "an" : "a";
		return `${capital ? fixed[0]!.toUpperCase() + fixed.slice(1) : fixed} ${next}`;
	});
}

/** Word count, used for `GenerateOptions.wordCount` constraints. */
export function countWords(text: string): number {
	const trimmed = text.trim();
	if (trimmed === "") return 0;
	return trimmed.split(/\s+/).length;
}
