import { describe, expect, it } from "vitest";
import {
	ancestorIds,
	descendantIds,
	eligiblePatterns,
	genreById,
	generateOne,
	genreScope,
	isParent,
	narrowLeaf,
	narrowParent,
	resolveGenreNarrowing,
	validateSpec,
} from "../engine/generate.js";
import type { GeneratorSpec, Lexeme } from "../engine/types.js";
import { titleComposerLexicon } from "../lexicons/titleComposer.js";

/**
 * Synthetic fixture — deliberately not one of the shipped lexicons, so these tests never depend
 * on (or accidentally fabricate) real corpus content. Two subgenres (`western`, `regency`) share
 * one parent (`hist`); `sf` is a flat, unrelated genre with no parent and no children, to prove
 * the hierarchy is a no-op where it doesn't apply.
 */
function fixture(): GeneratorSpec {
	return {
		id: "fixture-gen",
		name: "Fixture",
		blurb: "",
		tradition: "Fixture",
		genres: [
			{ id: "all", label: "Any" },
			{ id: "hist", label: "Historical" },
			{ id: "western", label: "Western", parent: "hist" },
			{ id: "regency", label: "Regency", parent: "hist" },
			{ id: "sf", label: "Science fiction" },
		],
		patterns: [
			{
				id: "hist-only",
				label: "Hist only",
				templates: ["The {noun}"],
				genres: ["hist"],
				exemplar: "n/a",
				note: "n/a",
			},
			{
				id: "western-only",
				label: "Western only",
				templates: ["{place} Justice"],
				genres: ["western"],
				exemplar: "n/a",
				note: "n/a",
			},
			{
				id: "regency-only",
				label: "Regency only",
				templates: ["A {noun} of Manners"],
				genres: ["regency"],
				exemplar: "n/a",
				note: "n/a",
			},
			{
				id: "sf-only",
				label: "SF only",
				templates: ["The {ship}"],
				genres: ["sf"],
				exemplar: "n/a",
				note: "n/a",
			},
		],
		lexicon: {
			noun: ["Crown #hist", "Frontier #western", "Debutante #regency"],
			place: ["Dodge #western"],
			ship: ["Nova #sf"],
		},
	};
}

describe("genre-hierarchy helpers (genreById/isParent/ancestorIds/descendantIds/genreScope)", () => {
	it("genreById finds a declared genre and returns undefined for an unknown id", () => {
		const spec = fixture();
		expect(genreById(spec, "western")?.label).toBe("Western");
		expect(genreById(spec, "nope")).toBeUndefined();
	});

	it("isParent is true only for a genre something else declares as its parent", () => {
		const spec = fixture();
		expect(isParent(spec, "hist")).toBe(true);
		expect(isParent(spec, "western")).toBe(false);
		expect(isParent(spec, "sf")).toBe(false);
	});

	it("ancestorIds walks up from a subgenre, and is empty for a top-level/flat genre", () => {
		const spec = fixture();
		expect(ancestorIds(spec, "western")).toEqual(["hist"]);
		expect(ancestorIds(spec, "hist")).toEqual([]);
		expect(ancestorIds(spec, "sf")).toEqual([]);
	});

	it("ancestorIds guards a missing parent id rather than throwing", () => {
		const spec = fixture();
		spec.genres.push({ id: "orphan", label: "Orphan", parent: "does-not-exist" });
		expect(ancestorIds(spec, "orphan")).toEqual([]);
	});

	it("ancestorIds guards a cycle rather than looping forever", () => {
		const spec = fixture();
		spec.genres.push(
			{ id: "cycle-a", label: "A", parent: "cycle-b" },
			{ id: "cycle-b", label: "B", parent: "cycle-a" },
		);
		expect(ancestorIds(spec, "cycle-a")).toEqual(["cycle-b"]);
	});

	it("descendantIds returns every direct child, and is empty for a leaf", () => {
		const spec = fixture();
		expect(descendantIds(spec, "hist").sort()).toEqual(["regency", "western"]);
		expect(descendantIds(spec, "western")).toEqual([]);
		expect(descendantIds(spec, "sf")).toEqual([]);
	});

	it("descendantIds guards a self-referential cycle rather than recursing forever", () => {
		const spec = fixture();
		spec.genres.push({ id: "self", label: "Self", parent: "self" });
		expect(descendantIds(spec, "self")).toEqual([]);
	});

	it("genreScope reduces to [id] for a flat genre with no parent and no children", () => {
		const spec = fixture();
		expect(genreScope(spec, "sf")).toEqual(["sf"]);
	});

	it("genreScope on a leaf is [self, ...ancestors]; on a parent, [self, ...descendants]", () => {
		const spec = fixture();
		expect(genreScope(spec, "western")).toEqual(["western", "hist"]);
		expect(genreScope(spec, "hist").sort()).toEqual(["hist", "regency", "western"].sort());
	});

	it("genreScope treats 'all' as the no-narrowing sentinel", () => {
		const spec = fixture();
		expect(genreScope(spec, "all")).toEqual([]);
	});
});

describe("eligiblePatterns — subgenre inheritance", () => {
	it("a leaf/subgenre inherits its parent's patterns", () => {
		const spec = fixture();
		const ids = eligiblePatterns(spec, { genre: "western" }).map((p) => p.id);
		expect(ids).toContain("western-only");
		expect(ids).toContain("hist-only");
	});

	it("a parent reaches its children's patterns", () => {
		const spec = fixture();
		const ids = eligiblePatterns(spec, { genre: "hist" }).map((p) => p.id);
		expect(ids).toContain("hist-only");
		expect(ids).toContain("western-only");
		expect(ids).toContain("regency-only");
	});

	it("siblings never share", () => {
		const spec = fixture();
		const ids = eligiblePatterns(spec, { genre: "western" }).map((p) => p.id);
		expect(ids).not.toContain("regency-only");
	});

	it("a flat genre's eligibility is unaffected by the hierarchy elsewhere in the spec", () => {
		const spec = fixture();
		const ids = eligiblePatterns(spec, { genre: "sf" }).map((p) => p.id);
		expect(ids).toEqual(["sf-only"]);
	});
});

describe("lexicon scoping — narrowLeaf / narrowParent", () => {
	const tagged = (gloss: string, tags: string[]): Lexeme => ({ gloss, tags });
	// Deliberately no "regency"-tagged entry yet — these two slots represent the "brand-new
	// subgenre with zero own vocabulary" case the feature is meant to handle gracefully.
	const pool: Lexeme[] = [
		tagged("Crown", ["hist"]),
		tagged("Frontier", ["western"]),
		tagged("Untagged", []),
	];

	it("a subgenre with no own-tagged entries in a slot falls back to the parent pool", () => {
		// chain = [regency, hist]: nothing here is tagged "regency", so narrowLeaf falls through
		// to the next-most-specific tag in the chain, "hist".
		const result = narrowLeaf(pool, ["regency", "hist"]);
		expect(result.map((l) => l.gloss)).toEqual(["Crown"]);
	});

	it("adding one own-tagged entry makes that slot subgenre-only, without affecting a slot with none", () => {
		const withOwnEntry: Lexeme[] = [...pool, tagged("Ballroom", ["regency"])];
		const regencyChain = ["regency", "hist"];
		// This slot now has a "regency" hit, so it stops there — "hist"'s Crown is not offered.
		expect(narrowLeaf(withOwnEntry, regencyChain).map((l) => l.gloss)).toEqual(["Ballroom"]);
		// A different slot with still nothing tagged "regency" keeps falling back to "hist".
		expect(narrowLeaf(pool, regencyChain).map((l) => l.gloss)).toEqual(["Crown"]);
	});

	it("a slot with nothing in the whole chain is genre-neutral (pass through)", () => {
		const noMatch = [tagged("Nova", ["sf"])];
		expect(narrowLeaf(noMatch, ["regency", "hist"])).toBe(noMatch);
	});

	it("a parent selection unions self and every descendant", () => {
		const withRegency: Lexeme[] = [...pool, tagged("Debutante", ["regency"])];
		const result = narrowParent(withRegency, ["hist", "western", "regency"]);
		expect(result.map((l) => l.gloss).sort()).toEqual(["Crown", "Debutante", "Frontier"]);
	});

	it("resolveGenreNarrowing resolves the right kind for a leaf, a parent, 'all', and undefined", () => {
		const spec = fixture();
		expect(resolveGenreNarrowing(spec, "western")).toEqual({ kind: "leaf", chain: ["western", "hist"] });
		expect(resolveGenreNarrowing(spec, "hist").kind).toBe("parent");
		expect(resolveGenreNarrowing(spec, undefined)).toEqual({ kind: "none", chain: [] });
	});
});

describe("end-to-end: generateOne draws only from the resolved scope", () => {
	it("a subgenre with no own vocabulary still produces valid, parent-scoped titles", () => {
		const spec = fixture();
		for (let seed = 0; seed < 20; seed++) {
			const result = generateOne(spec, { genre: "regency", seed });
			expect(result.title).not.toBe("");
		}
	});
});

describe("validateSpec — genre hierarchy checks", () => {
	it("flags an orphan parent", () => {
		const spec = fixture();
		spec.genres.push({ id: "orphan", label: "Orphan", parent: "does-not-exist" });
		expect(validateSpec(spec)).toEqual(
			expect.arrayContaining([expect.stringContaining('unknown parent "does-not-exist"')]),
		);
	});

	it("flags self-parenting", () => {
		const spec = fixture();
		spec.genres.push({ id: "self", label: "Self", parent: "self" });
		expect(validateSpec(spec)).toEqual(
			expect.arrayContaining([expect.stringContaining('"self" is its own parent')]),
		);
	});

	it("flags a depth-3 grandchild (a subgenre that is itself a parent)", () => {
		const spec = fixture();
		spec.genres.push({ id: "grandchild", label: "Grandchild", parent: "western" });
		expect(validateSpec(spec)).toEqual(
			expect.arrayContaining([expect.stringContaining('"western" is both a subgenre and a parent')]),
		);
	});

	it("flags a cyclic parent chain", () => {
		const spec = fixture();
		spec.genres.push(
			{ id: "cycle-a", label: "A", parent: "cycle-b" },
			{ id: "cycle-b", label: "B", parent: "cycle-a" },
		);
		expect(validateSpec(spec)).toEqual(
			expect.arrayContaining([expect.stringContaining("cyclic parent chain")]),
		);
	});

	it("does not flag a brand-new subgenre with zero own patterns as unreachable — inheritance covers it", () => {
		const spec = fixture();
		spec.genres.push({ id: "empty-subgenre", label: "Empty", parent: "hist" });
		const problems = validateSpec(spec);
		expect(problems).not.toEqual(
			expect.arrayContaining([expect.stringContaining('"empty-subgenre" has no patterns')]),
		);
	});

	it("still flags a genuinely unreachable flat genre (no patterns, no parent to inherit from)", () => {
		const spec = fixture();
		spec.genres.push({ id: "dead-genre", label: "Dead" });
		expect(validateSpec(spec)).toEqual(
			expect.arrayContaining([expect.stringContaining('"dead-genre" has no patterns')]),
		);
	});

	it("the real title-composer spec (with its shipped parent links) still passes validateSpec clean", () => {
		expect(validateSpec(titleComposerLexicon)).toEqual([]);
	});
});

describe("regression — the shipped fantasy/sf parent retrofit changes nothing for a flat genre with an unused-elsewhere parent tag", () => {
	/** Same spec, with every `parent` link stripped — i.e. title-composer exactly as it behaved
	 * before this feature existed. */
	function beforeRetrofit(): GeneratorSpec {
		const clone = JSON.parse(JSON.stringify(titleComposerLexicon)) as GeneratorSpec;
		for (const g of clone.genres) delete g.parent;
		return clone;
	}

	// "fantasy" (the new umbrella) is never used as a pattern/lexeme tag anywhere in the bundle,
	// so making epic/heroic-fantasy/sword-sorcery/urban-fantasy its children cannot widen what
	// any of them draws from — genreScope adds "fantasy" to the chain, but nothing is tagged with
	// it, so every lookup falls through exactly as it did with no parent at all.
	it.each(["epic", "heroic-fantasy", "sword-sorcery", "urban-fantasy"])(
		"selecting %s yields the same eligible patterns as before the retrofit",
		(genre) => {
			const before = eligiblePatterns(beforeRetrofit(), { genre }).map((p) => p.id).sort();
			const after = eligiblePatterns(titleComposerLexicon, { genre }).map((p) => p.id).sort();
			expect(after).toEqual(before);
		},
	);

	it.each(["epic", "heroic-fantasy", "sword-sorcery", "urban-fantasy"])(
		"selecting %s produces byte-identical output across many seeds",
		(genre) => {
			const before = beforeRetrofit();
			for (let seed = 0; seed < 200; seed++) {
				expect(generateOne(titleComposerLexicon, { genre, seed }).title).toBe(
					generateOne(before, { genre, seed }).title,
				);
			}
		},
	);

	// space-opera happens to already carry the "sf" tag (or an equivalent) on every pattern it
	// needs, so making sf its parent is also a no-op for it specifically — verified, not assumed.
	it("selecting space-opera also produces byte-identical output (its own tagging already covers sf's pool)", () => {
		const before = beforeRetrofit();
		for (let seed = 0; seed < 200; seed++) {
			expect(generateOne(titleComposerLexicon, { genre: "space-opera", seed }).title).toBe(
				generateOne(before, { genre: "space-opera", seed }).title,
			);
		}
	});

	// military-sf is the honest exception: `genre-coverage` flags it THIN (well under the shipped
	// vocabulary of its siblings), so making sf its parent is exactly the fix — it now draws on
	// sf's much larger pool instead of staying starved. This is deliberately NOT asserted as
	// "unchanged"; it's asserted as "measurably richer", which is the point of the feature.
	it("selecting military-sf now draws on sf's wider pool, rather than being sealed off (deliberate change)", () => {
		const before = beforeRetrofit();
		const beforeIds = eligiblePatterns(before, { genre: "military-sf" }).length;
		const afterIds = eligiblePatterns(titleComposerLexicon, { genre: "military-sf" }).length;
		expect(afterIds).toBeGreaterThan(beforeIds);

		let differed = 0;
		for (let seed = 0; seed < 200; seed++) {
			if (
				generateOne(titleComposerLexicon, { genre: "military-sf", seed }).title !==
				generateOne(before, { genre: "military-sf", seed }).title
			) {
				differed++;
			}
		}
		expect(differed).toBeGreaterThan(0);
	});
});
