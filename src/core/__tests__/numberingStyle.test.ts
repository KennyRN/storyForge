import { describe, expect, it } from "vitest";
import { formatNumber, numberToWords, NUMBERING_STYLE_OPTIONS } from "../numberingStyle";

describe("formatNumber", () => {
	it("renders plain arabic numerals", () => {
		expect(formatNumber(1, "arabic", 5)).toBe("1");
		expect(formatNumber(42, "arabic", 100)).toBe("42");
	});

	it("pads arabic numerals to the sequence's own width", () => {
		// Width is derived from `total` (the highest position in the sequence), not the individual
		// number being rendered — a 5-item sequence needs no padding at all (1 digit is enough).
		expect(formatNumber(1, "arabic-padded", 5)).toBe("1");
		expect(formatNumber(1, "arabic-padded", 15)).toBe("01");
		expect(formatNumber(5, "arabic-padded", 15)).toBe("05");
		expect(formatNumber(3, "arabic-padded", 150)).toBe("003");
		expect(formatNumber(100, "arabic-padded", 150)).toBe("100");
	});

	it("renders roman numerals, upper and lower case", () => {
		expect(formatNumber(1, "roman-upper", 5)).toBe("I");
		expect(formatNumber(4, "roman-upper", 5)).toBe("IV");
		expect(formatNumber(9, "roman-upper", 20)).toBe("IX");
		expect(formatNumber(1994, "roman-upper", 2000)).toBe("MCMXCIV");
		expect(formatNumber(4, "roman-lower", 5)).toBe("iv");
	});

	it("renders spelled-out cardinal words, lower and title case", () => {
		expect(formatNumber(1, "words-lower", 5)).toBe("one");
		expect(formatNumber(5, "words-lower", 5)).toBe("five");
		expect(formatNumber(21, "words-lower", 30)).toBe("twenty one");
		expect(formatNumber(100, "words-lower", 100)).toBe("one hundred");
		expect(formatNumber(21, "words-title", 30)).toBe("Twenty One");
	});

	it("renders alphabetic numbering, upper and lower case, wrapping past Z", () => {
		expect(formatNumber(1, "alpha-upper", 30)).toBe("A");
		expect(formatNumber(26, "alpha-upper", 30)).toBe("Z");
		expect(formatNumber(27, "alpha-upper", 30)).toBe("AA");
		expect(formatNumber(28, "alpha-upper", 30)).toBe("AB");
		expect(formatNumber(5, "alpha-lower", 5)).toBe("e");
	});

	it("renders ordinal numerals with correct suffixes, including the 11-13 special case", () => {
		expect(formatNumber(1, "ordinal-numeral", 5)).toBe("1st");
		expect(formatNumber(2, "ordinal-numeral", 5)).toBe("2nd");
		expect(formatNumber(3, "ordinal-numeral", 5)).toBe("3rd");
		expect(formatNumber(4, "ordinal-numeral", 5)).toBe("4th");
		expect(formatNumber(11, "ordinal-numeral", 20)).toBe("11th");
		expect(formatNumber(12, "ordinal-numeral", 20)).toBe("12th");
		expect(formatNumber(13, "ordinal-numeral", 20)).toBe("13th");
		expect(formatNumber(21, "ordinal-numeral", 30)).toBe("21st");
		expect(formatNumber(22, "ordinal-numeral", 30)).toBe("22nd");
		expect(formatNumber(23, "ordinal-numeral", 30)).toBe("23rd");
		expect(formatNumber(101, "ordinal-numeral", 200)).toBe("101st");
	});

	it("renders spelled-out ordinal words, only changing the last component", () => {
		expect(formatNumber(1, "ordinal-words", 5)).toBe("First");
		expect(formatNumber(5, "ordinal-words", 5)).toBe("Fifth");
		expect(formatNumber(12, "ordinal-words", 20)).toBe("Twelfth");
		expect(formatNumber(21, "ordinal-words", 30)).toBe("Twenty First");
		expect(formatNumber(100, "ordinal-words", 100)).toBe("One Hundredth");
	});

	it("has the expected sample dropdown label for every style", () => {
		// arabic-padded's label is illustrative (what it looks like once a sequence reaches double
		// digits), not a literal 5-item rendering — every other style's label is exactly what
		// formatNumber(1..5, style, 5) produces, so it's asserted directly against that.
		expect(NUMBERING_STYLE_OPTIONS).toEqual({
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
		});
		for (const style of ["arabic", "roman-upper", "roman-lower", "words-lower", "words-title", "alpha-upper", "alpha-lower", "ordinal-numeral", "ordinal-words"] as const) {
			const rendered = [1, 2, 3, 4, 5].map((n) => formatNumber(n, style, 5)).join(" ");
			expect(NUMBERING_STYLE_OPTIONS[style]).toBe(rendered);
		}
	});
});

describe("numberToWords", () => {
	it("handles zero and teens", () => {
		expect(numberToWords(0)).toBe("zero");
		expect(numberToWords(13)).toBe("thirteen");
	});

	it("handles compound tens and hundreds", () => {
		expect(numberToWords(42)).toBe("forty two");
		expect(numberToWords(305)).toBe("three hundred five");
	});

	it("handles thousands", () => {
		expect(numberToWords(1234)).toBe("one thousand two hundred thirty four");
	});
});
