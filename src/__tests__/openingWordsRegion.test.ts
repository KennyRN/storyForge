import { describe, expect, it } from "vitest";
import { findOpeningWordsBoundary } from "../openingWordsRegion";

function boundary(text: string, target: number) {
	const lines = text.split("\n");
	return findOpeningWordsBoundary(lines.length, (i) => lines[i - 1], target);
}

describe("findOpeningWordsBoundary", () => {
	it("is null when the text is shorter than the target", () => {
		expect(boundary("one two three", 4)).toBeNull();
		expect(boundary("", 1)).toBeNull();
	});

	it("ends at the paragraph holding the target-th word, not mid-paragraph", () => {
		// Target word 3 sits on line 2; the paragraph runs on to line 3.
		expect(boundary("one two\nthree four\nfive\n\nsix", 3)).toEqual({ endLine: 3, nextTextLine: 5 });
	});

	it("extends through blank lines to the next paragraph's text", () => {
		expect(boundary("a b c\n\n\n\nd", 3)).toEqual({ endLine: 1, nextTextLine: 5 });
	});

	it("runs to the end when no text follows", () => {
		expect(boundary("a b c\n\n", 2)).toEqual({ endLine: 1, nextTextLine: null });
		expect(boundary("a b c", 3)).toEqual({ endLine: 1, nextTextLine: null });
	});

	it("counts exactly the target, not one past it", () => {
		expect(boundary("a b\n\nc d", 2)).toEqual({ endLine: 1, nextTextLine: 3 });
		expect(boundary("a b\n\nc d", 3)).toEqual({ endLine: 3, nextTextLine: null });
	});
});
