/**
 * The ten numbering styles offered for series/chapter "#" numbering (see titleNumbering.ts's
 * applyHashNumbering, which this module's formatNumber() feeds). Each is a pure display-layer
 * transform of a 1-based counter value; nothing here touches stored titles.
 */
export type NumberingStyle =
	| "arabic"
	| "arabic-padded"
	| "roman-upper"
	| "roman-lower"
	| "words-lower"
	| "words-title"
	| "alpha-upper"
	| "alpha-lower"
	| "ordinal-numeral"
	| "ordinal-words";

/** Dropdown option label for each style — a live sample using 1-5, matching the numbers those
 * positions would actually show. Order here is the order they appear in the settings dropdown. */
export const NUMBERING_STYLE_OPTIONS: Record<NumberingStyle, string> = {
	arabic: "1 2 3 4 5",
	"arabic-padded": "01 02 03 04 05",
	"roman-upper": "I II III IV V",
	"roman-lower": "i ii iii iv v",
	"words-lower": "one two three four five",
	"words-title": "One Two Three Four Five",
	"alpha-upper": "A B C D E",
	"alpha-lower": "a b c d e",
	"ordinal-numeral": "1st 2nd 3rd 4th 5th",
	"ordinal-words": "First Second Third Fourth Fifth",
};

const ROMAN_VALUES: [number, string][] = [
	[1000, "M"],
	[900, "CM"],
	[500, "D"],
	[400, "CD"],
	[100, "C"],
	[90, "XC"],
	[50, "L"],
	[40, "XL"],
	[10, "X"],
	[9, "IX"],
	[5, "V"],
	[4, "IV"],
	[1, "I"],
];

function toRoman(n: number): string {
	let result = "";
	let remaining = n;
	for (const [value, symbol] of ROMAN_VALUES) {
		while (remaining >= value) {
			result += symbol;
			remaining -= value;
		}
	}
	return result;
}

/** Bijective base-26 — 1=A, 2=B, …, 26=Z, 27=AA, 28=AB, … (same scheme spreadsheet columns use). */
function toAlpha(n: number): string {
	let result = "";
	let remaining = n;
	while (remaining > 0) {
		remaining -= 1;
		result = String.fromCharCode(65 + (remaining % 26)) + result;
		remaining = Math.floor(remaining / 26);
	}
	return result;
}

const ONES = [
	"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
	"eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function threeDigitToWords(n: number): string {
	const parts: string[] = [];
	let remaining = n;
	if (remaining >= 100) {
		parts.push(ONES[Math.floor(remaining / 100)], "hundred");
		remaining %= 100;
	}
	if (remaining >= 20) {
		parts.push(TENS[Math.floor(remaining / 10)]);
		remaining %= 10;
		if (remaining > 0) parts.push(ONES[remaining]);
	} else if (remaining > 0) {
		parts.push(ONES[remaining]);
	}
	return parts.join(" ");
}

const SCALES: [number, string][] = [
	[1_000_000_000, "billion"],
	[1_000_000, "million"],
	[1_000, "thousand"],
];

/** English cardinal number words — "twenty one" (space-separated, not hyphenated), covering
 * anything a series/chapter count could plausibly reach. */
export function numberToWords(n: number): string {
	if (n === 0) return "zero";
	let remaining = n;
	const parts: string[] = [];
	for (const [scale, name] of SCALES) {
		if (remaining >= scale) {
			parts.push(threeDigitToWords(Math.floor(remaining / scale)), name);
			remaining %= scale;
		}
	}
	if (remaining > 0) parts.push(threeDigitToWords(remaining));
	return parts.join(" ");
}

function titleCase(words: string): string {
	return words
		.split(" ")
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(" ");
}

const ONES_ORDINAL: Record<string, string> = {
	zero: "zeroth", one: "first", two: "second", three: "third", four: "fourth", five: "fifth",
	six: "sixth", seven: "seventh", eight: "eighth", nine: "ninth", ten: "tenth",
	eleven: "eleventh", twelve: "twelfth", thirteen: "thirteenth", fourteen: "fourteenth", fifteen: "fifteenth",
	sixteen: "sixteenth", seventeen: "seventeenth", eighteen: "eighteenth", nineteen: "nineteenth",
};
const TENS_ORDINAL: Record<string, string> = {
	twenty: "twentieth", thirty: "thirtieth", forty: "fortieth", fifty: "fiftieth",
	sixty: "sixtieth", seventy: "seventieth", eighty: "eightieth", ninety: "ninetieth",
};
const SCALE_ORDINAL: Record<string, string> = {
	hundred: "hundredth", thousand: "thousandth", million: "millionth", billion: "billionth",
};

/** Cardinal-to-ordinal: only the last word of the phrase changes ("twenty one" -> "twenty first"). */
function toOrdinalWords(n: number): string {
	const words = numberToWords(n).split(" ");
	const last = words[words.length - 1];
	words[words.length - 1] = ONES_ORDINAL[last] ?? TENS_ORDINAL[last] ?? SCALE_ORDINAL[last] ?? `${last}th`;
	return words.join(" ");
}

function ordinalSuffix(n: number): string {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return "th";
	switch (n % 10) {
		case 1: return "st";
		case 2: return "nd";
		case 3: return "rd";
		default: return "th";
	}
}

/**
 * Renders `n` (1-based position) in the given style. `total` is the highest position in the same
 * sequence — only used by "arabic-padded" to size its zero-padding to that sequence's own length
 * (e.g. "01".."99" for a 99-chapter book, "001".."150" for a 150-chapter one), so it never breaks
 * for a long book instead of being capped at a fixed width.
 */
export function formatNumber(n: number, style: NumberingStyle, total: number): string {
	switch (style) {
		case "arabic":
			return String(n);
		case "arabic-padded":
			return String(n).padStart(String(total).length, "0");
		case "roman-upper":
			return toRoman(n);
		case "roman-lower":
			return toRoman(n).toLowerCase();
		case "words-lower":
			return numberToWords(n);
		case "words-title":
			return titleCase(numberToWords(n));
		case "alpha-upper":
			return toAlpha(n);
		case "alpha-lower":
			return toAlpha(n).toLowerCase();
		case "ordinal-numeral":
			return `${n}${ordinalSuffix(n)}`;
		case "ordinal-words":
			return titleCase(toOrdinalWords(n));
	}
}
