import { describe, expect, it } from "vitest";
import { checkArticleAgreement } from "../engine/articles.js";
import type { GeneratorSpec } from "../engine/types.js";

function specWith(templates: string[], lexicon: GeneratorSpec["lexicon"]): GeneratorSpec {
	return {
		id: "test",
		name: "Test",
		blurb: "",
		tradition: "Test",
		genres: [{ id: "all", label: "Any" }],
		patterns: [
			{
				id: "p",
				label: "p",
				templates,
				exemplar: "n/a",
				note: "n/a",
			},
		],
		lexicon,
	};
}

describe("titleforge checkArticleAgreement", () => {
	it("is clean for a bare slot combined with a literal 'the'", () => {
		const spec = specWith(["The {noun}"], { noun: ["Crown", "Reckoning"] });
		expect(checkArticleAgreement(spec)).toEqual([]);
	});

	it("flags 'the {slot}' when every entry already carries 'the'", () => {
		const spec = specWith(["The {place}"], { place: ["the Weald", "the Fens"] });
		const problems = checkArticleAgreement(spec);
		expect(problems.length).toBe(1);
		expect(problems[0]).toMatch(/place/);
	});

	it("flags 'the {slot}' when the slot is mixed (some entries articled)", () => {
		const spec = specWith(["The {place}"], { place: ["the Weald", "Widdershin"] });
		expect(checkArticleAgreement(spec).length).toBe(1);
	});

	it("catches the article two words away ('The Hidden {place}')", () => {
		const spec = specWith(["The Hidden {place}"], { place: ["the Weald"] });
		expect(checkArticleAgreement(spec).length).toBe(1);
	});

	it("does not flag 'The Hidden {place}' when place is bare", () => {
		const spec = specWith(["The Hidden {place}"], { place: ["Widdershin"] });
		expect(checkArticleAgreement(spec)).toEqual([]);
	});

	it("stops at a function word and doesn't false-positive across it", () => {
		// "The Lord of the {noun}" — the first "The" governs "Lord", not {noun};
		// "of" breaks the lookahead before it ever reaches the slot.
		const spec = specWith(["The Lord of the {noun}"], { noun: ["Rings", "Flies"] });
		expect(checkArticleAgreement(spec)).toEqual([]);
	});

	it("is clean for title-composer's own of-the shape (bare noun, mixed place avoided)", () => {
		const spec = specWith(["The {noun#1} of the {noun#2}"], {
			noun: ["Lord", "Rings"],
		});
		expect(checkArticleAgreement(spec)).toEqual([]);
	});
});
