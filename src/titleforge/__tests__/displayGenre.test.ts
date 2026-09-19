import { describe, expect, it } from "vitest";
import { generateOne } from "../engine/generate.js";
import type { GeneratorSpec } from "../engine/types.js";

/** A pattern tagged under several genres at once, some as bare top-level tags ("sf", "thriller",
 * "fantasy") and some as their own leaf subgenres ("space-opera" under "sf", "legal-thriller"
 * under "thriller") — the same redundant-tagging convention the real title-composer lexicon uses
 * (a pattern lists both a top genre and its own subgenres so it's reachable under either). */
const spec: GeneratorSpec = {
	id: "test-gen",
	name: "Test generator",
	blurb: "",
	tradition: "Test",
	genres: [
		{ id: "all", label: "any genre" },
		{ id: "fantasy", label: "fantasy" },
		{ id: "sf", label: "science fiction" },
		{ id: "space-opera", label: "space opera", parent: "sf" },
		{ id: "thriller", label: "thriller" },
		{ id: "legal-thriller", label: "legal thriller", parent: "thriller" },
	],
	patterns: [
		{
			id: "the-noun",
			label: "The [Noun]",
			templates: ["The {noun}"],
			genres: ["fantasy", "sf", "space-opera", "thriller", "legal-thriller"],
			exemplar: "n/a",
			note: "n/a",
		},
		{
			id: "universal",
			label: "[Noun]",
			templates: ["{noun}"],
			// No genres at all — genuinely eligible under every genre, nothing to attribute.
			exemplar: "n/a",
			note: "n/a",
		},
	],
	lexicon: {
		noun: ["Crown", "Reckoning", "Widdershin"],
	},
};

const LEAVES = ["space-opera", "legal-thriller"];
const TOPS = ["fantasy", "sf", "thriller"];

describe("generateOne — recorded genre reflects the pattern's own origin, not just the request", () => {
	it("under a fully unconstrained request, always resolves to one of the pattern's own leaf tags, never a bare top tag", () => {
		for (let seed = 0; seed < 50; seed++) {
			const result = generateOne(spec, { genre: "all", seed, pattern: "the-noun" });
			expect(LEAVES).toContain(result.genre);
			expect(TOPS).not.toContain(result.genre);
		}
	});

	it("under a top genre picked with 'any' subgenre, resolves to that branch's own leaf tag, not the bare top", () => {
		for (let seed = 0; seed < 50; seed++) {
			const result = generateOne(spec, { genre: "sf", seed, pattern: "the-noun" });
			expect(result.genre).toBe("space-opera");
		}
		for (let seed = 0; seed < 50; seed++) {
			const result = generateOne(spec, { genre: "thriller", seed, pattern: "the-noun" });
			expect(result.genre).toBe("legal-thriller");
		}
	});

	it("leaves an already-specific leaf request untouched", () => {
		const result = generateOne(spec, { genre: "space-opera", seed: 1, pattern: "the-noun" });
		expect(result.genre).toBe("space-opera");
	});

	it("records nothing for a pattern with no genre tags of its own, request unconstrained", () => {
		const result = generateOne(spec, { genre: "all", seed: 1, pattern: "universal" });
		expect(result.genre).toBeUndefined();
	});
});
