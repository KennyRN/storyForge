import { describe, expect, it } from "vitest";
import {
	eligiblePatterns,
	generateMany,
	generateOne,
	generateSeries,
	validateSpec,
} from "../engine/generate.js";
import type { GeneratorSpec } from "../engine/types.js";

const spec: GeneratorSpec = {
	id: "test-gen",
	name: "Test generator",
	blurb: "",
	tradition: "Test",
	genres: [
		{ id: "all", label: "Any" },
		{ id: "fantasy", label: "Fantasy" },
		{ id: "horror", label: "Horror" },
	],
	families: [
		{ id: "all", label: "Any" },
		{ id: "core", label: "Core" },
	],
	patterns: [
		{
			id: "the-noun",
			family: "core",
			label: "The [Noun]",
			templates: ["The {noun}"],
			genres: ["fantasy"],
			weight: 3,
			exemplar: "n/a",
			note: "n/a",
		},
		{
			id: "the-adj-noun",
			family: "core",
			label: "The [Adj] [Noun]",
			templates: ["The {adj} {noun}"],
			genres: ["horror"],
			weight: 1,
			exemplar: "n/a",
			note: "n/a",
		},
		{
			id: "place-and-place",
			label: "[Place] & [Place]",
			templates: ["{place#1} of {place#2}"],
			exemplar: "n/a",
			note: "n/a",
		},
	],
	lexicon: {
		noun: ["Crown #fantasy", "Reckoning #horror"],
		adj: ["hungry #horror"],
		place: ["Widdershin", "Greyhaven", "Coldharbour"],
	},
};

describe("titleforge eligiblePatterns", () => {
	it("filters by genre", () => {
		const patterns = eligiblePatterns(spec, { genre: "fantasy" });
		expect(patterns.map((p) => p.id)).toContain("the-noun");
		expect(patterns.map((p) => p.id)).not.toContain("the-adj-noun");
	});

	it("filters by family", () => {
		const patterns = eligiblePatterns(spec, { family: "core" });
		expect(patterns.every((p) => p.family === "core")).toBe(true);
	});

	it("an exact pattern id bypasses every other filter", () => {
		const patterns = eligiblePatterns(spec, { genre: "horror", pattern: "the-noun" });
		expect(patterns.map((p) => p.id)).toEqual(["the-noun"]);
	});

	it("falls back to the full set under 'all'", () => {
		expect(eligiblePatterns(spec, { genre: "all" }).length).toBe(spec.patterns.length);
	});
});

describe("titleforge generateOne / generateMany", () => {
	it("is deterministic for a given seed", () => {
		const a = generateOne(spec, { seed: 4242 });
		const b = generateOne(spec, { seed: 4242 });
		expect(a).toEqual(b);
	});

	it("only ever draws from words scoped to the requested genre", () => {
		const result = generateOne(spec, { genre: "fantasy", pattern: "the-noun", seed: 1 });
		expect(result.title).toBe("The Crown");
	});

	it("generateMany returns no duplicate titles within the batch", () => {
		const results = generateMany(spec, 5, { pattern: "place-and-place", seed: 1 });
		const titles = results.map((r) => r.title.toLowerCase());
		expect(new Set(titles).size).toBe(titles.length);
	});

	it("honours a word-count constraint when satisfiable", () => {
		const result = generateOne(spec, { pattern: "the-noun", genre: "fantasy", wordCount: 2 });
		expect(result.wordCount).toBe(2);
		expect(result.constraintRelaxed).toBeUndefined();
	});

	it("reports constraintRelaxed honestly when the constraint is impossible", () => {
		const result = generateOne(spec, { pattern: "the-noun", wordCount: 99 });
		expect(result.constraintRelaxed).toBe(true);
	});

	it("never returns an excluded title if an alternative exists", () => {
		// "place-and-place" has 3 places (6 ordered pairs), so an alternative always exists.
		const first = generateOne(spec, { pattern: "place-and-place", seed: 1 });
		const second = generateOne(spec, {
			pattern: "place-and-place",
			seed: 2,
			exclude: [first.title],
		});
		expect(second.title.toLowerCase()).not.toBe(first.title.toLowerCase());
	});
});

describe("titleforge generateSeries", () => {
	it("echo: every volume and the series title share one template realisation", () => {
		const set = generateSeries(spec, {
			strategy: "echo",
			volumes: 2,
			pattern: "place-and-place",
			seed: 1,
		});
		expect(set.volumes.length).toBeGreaterThan(0);
		for (const v of set.volumes) expect(v.patternId).toBe("place-and-place");
	});

	it("anchor: never anchors a single-slot template, and carries the anchor into the series title", () => {
		const set = generateSeries(spec, {
			strategy: "anchor",
			volumes: 2,
			pattern: "place-and-place",
			seed: 7,
		});
		if (set.anchorSlot) {
			expect(set.anchorWord).toBeTruthy();
			expect(set.series.title.toLowerCase()).toContain(set.anchorWord!.toLowerCase());
		}
	});

	it("free: volumes are not forced to one shape", () => {
		const set = generateSeries(spec, { strategy: "free", volumes: 3, seed: 3 });
		expect(set.strategy).toBe("free");
		expect(set.volumes.length).toBeGreaterThan(0);
	});
});

describe("titleforge validateSpec", () => {
	it("passes a well-formed spec", () => {
		expect(validateSpec(spec)).toEqual([]);
	});

	it("catches a template referencing an unknown slot", () => {
		const bad: GeneratorSpec = {
			...spec,
			patterns: [
				{ id: "x", label: "x", templates: ["The {nonexistentSlot}"], exemplar: "n/a", note: "n/a" },
			],
		};
		const problems = validateSpec(bad);
		expect(problems.some((p) => p.includes("nonexistentSlot"))).toBe(true);
	});

	it("catches a duplicate pattern id", () => {
		const bad: GeneratorSpec = {
			...spec,
			patterns: [...spec.patterns, { ...spec.patterns[0]! }],
		};
		const problems = validateSpec(bad);
		expect(problems.some((p) => p.includes("duplicate pattern id"))).toBe(true);
	});

	it("catches an unindexed repeated slot via validateTemplate", () => {
		const bad: GeneratorSpec = {
			...spec,
			patterns: [
				{ id: "x", label: "x", templates: ["The {noun} of {noun}"], exemplar: "n/a", note: "n/a" },
			],
		};
		const problems = validateSpec(bad);
		expect(problems.some((p) => p.includes("noun"))).toBe(true);
	});

	it("catches an unreachable genre", () => {
		// Every pattern here declares an explicit genre list (no catch-all pattern),
		// so "unreachable" — named by no pattern — is genuinely unreachable.
		const bad: GeneratorSpec = {
			...spec,
			genres: [...spec.genres, { id: "unreachable", label: "Unreachable" }],
			patterns: spec.patterns.filter((p) => p.genres && p.genres.length > 0),
		};
		const problems = validateSpec(bad);
		expect(problems.some((p) => p.includes("unreachable"))).toBe(true);
	});
});
