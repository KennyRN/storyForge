import { describe, expect, it } from "vitest";
import { countWords } from "../../wordCount";
import { typeWith } from "./simulate";

/**
 * Brief 9 §1.5 and decision 37: an aid never changes the word count. The counter counts runs of non-space
 * characters, and every conversion swaps non-space characters for non-space characters inside a run.
 */
describe("the word count does not change because of an aid", () => {
	const PAIRS: [string, string][] = [
		["don't", "don’t"],
		["'tis", "’tis"],
		["rock 'n' roll", "rock ’n’ roll"],
		["word--word", "word—word"],
		["word - word", "word – word"],
		["wait...", "wait…"],
		["wait...what", "wait…what"],
		["1990-95", "1990-95"],
	];
	for (const [straight, converted] of PAIRS) {
		it(`${JSON.stringify(straight)} and ${JSON.stringify(converted)} count the same`, () => {
			expect(countWords(straight)).toBe(countWords(converted));
		});
	}

	it("an unspaced dash is one word before and after, as it has always been (decision 46 leaves the counter alone)", () => {
		expect(countWords("word--word")).toBe(1);
		expect(countWords("word—word")).toBe(1);
	});

	it("typing through the aid gives the same count as the typed text, for sentences and for random typing", () => {
		const sentences = ["'Don't say \"never\" - not yet,' she said.", "Well--then... 'twas the '90s -- or so 'em said", "x - 5 - 3 and a-b", "%% a -- b %% 'c' --d"];
		for (const typed of sentences) expect(countWords(typeWith(typed).doc), typed).toBe(countWords(typed));
		let seed = 99;
		const next = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
		const alphabet = ["a", "b", "'", '"', "-", "-", ".", ".", " ", " ", "\n", "9", "%", "%"];
		for (let n = 0; n < 3000; n++) {
			const typed = Array.from({ length: 1 + Math.floor(next() * 40) }, () => alphabet[Math.floor(next() * alphabet.length)]).join("");
			expect(countWords(typeWith(typed).doc), JSON.stringify(typed)).toBe(countWords(typed));
		}
	});
});
