import { describe, expect, it } from "vitest";
import { generateOne, inParentLexicon, isGeneralEntry, scopedLexicon } from "../engine/generate.js";
import type { GeneratorSpec, Lexeme } from "../engine/types.js";

/**
 * Synthetic fixture for the additive vocabulary model (`engine/generate.ts` `blendSlot`):
 * fantasy (epic, sword, dark) and horror (gothic) as two top-level genres, plus a flat `rom`.
 * `fullTier: 1` switches off the thin-tier cut except where a test sets it, so shares are exact.
 */
function fixture(overrides: Partial<GeneratorSpec> = {}): GeneratorSpec {
	return {
		id: "fixture-gen",
		name: "Fixture",
		blurb: "",
		tradition: "Fixture",
		genres: [
			{ id: "all", label: "Any" },
			{ id: "fantasy", label: "Fantasy" },
			{ id: "epic", label: "Epic", parent: "fantasy" },
			{ id: "sword", label: "Sword", parent: "fantasy" },
			{ id: "dark", label: "Dark", parent: "fantasy" },
			{ id: "horror", label: "Horror" },
			{ id: "gothic", label: "Gothic", parent: "horror" },
			{ id: "rom", label: "Romance" },
		],
		patterns: [{ id: "p", label: "", templates: ["The {role}"], exemplar: "x", note: "x" }],
		lexicon: {
			role: [
				"Swordsman #sword", // own (sword)
				"Warlord #epic #dark", // fantasy's lexicon: 2 fantasy subgenres
				"Seer #epic", // epic only: not in sword's pools at all
				"Monk #epic #gothic", // general: fantasy + horror
				"Stranger", // general: untagged
				"Duke #rom", // rom only
			],
		},
		vocabularyBlend: { fullTier: 1 },
		...overrides,
	};
}

const share = (pool: Lexeme[], gloss: string) =>
	(pool.find((e) => e.gloss === gloss)?.weight ?? 0) / pool.reduce((a, e) => a + (e.weight ?? 1), 0);

describe("promotion rules", () => {
	const spec = fixture();

	it("one subgenre stays out of the parent's lexicon; two join it; the parent's own tag joins it", () => {
		expect(inParentLexicon(spec, ["epic"], "fantasy")).toBe(false);
		expect(inParentLexicon(spec, ["epic", "dark"], "fantasy")).toBe(true);
		expect(inParentLexicon(spec, ["fantasy"], "fantasy")).toBe(true);
		expect(inParentLexicon(spec, ["gothic", "rom"], "fantasy")).toBe(false);
	});

	it("deeper tags count towards the child they sit under", () => {
		const deep = fixture({
			genres: [
				{ id: "all", label: "Any" },
				{ id: "prog", label: "Prog" },
				{ id: "dungeon", label: "Dungeon", parent: "prog" },
				{ id: "core", label: "Core", parent: "dungeon" },
				{ id: "crawler", label: "Crawler", parent: "dungeon" },
			],
		});
		expect(inParentLexicon(deep, ["core", "crawler"], "prog")).toBe(false); // both under dungeon
		expect(inParentLexicon(deep, ["core", "crawler"], "dungeon")).toBe(true);
	});

	it("general = untagged, or spanning 2+ top-level genres (subgenres count towards their top genre)", () => {
		expect(isGeneralEntry(spec, undefined)).toBe(true);
		expect(isGeneralEntry(spec, ["epic", "dark"])).toBe(false); // one top genre
		expect(isGeneralEntry(spec, ["epic", "gothic"])).toBe(true); // fantasy + horror
		expect(isGeneralEntry(spec, ["rom", "sword"])).toBe(true);
		expect(isGeneralEntry(spec, ["mood-only"])).toBe(true); // non-genre tags are ignored
	});
});

describe("tiered blend", () => {
	it("a leaf draws own + parent lexicon + general, each entry once, split by the blend", () => {
		const pool = scopedLexicon(fixture(), "sword").role;
		expect(pool.map((e) => e.gloss).sort()).toEqual(["Monk", "Stranger", "Swordsman", "Warlord"]);
		expect(share(pool, "Swordsman")).toBeCloseTo(0.55, 5);
		expect(share(pool, "Warlord")).toBeCloseTo(0.3, 5);
		expect(share(pool, "Monk") + share(pool, "Stranger")).toBeCloseTo(0.15, 5);
	});

	it("an entry sits in its highest tier only (own beats inherited beats general)", () => {
		// Monk is general *and* tagged epic: under epic it is own, not double-counted.
		const pool = scopedLexicon(fixture(), "epic").role;
		expect(pool.filter((e) => e.gloss === "Monk")).toHaveLength(1);
		// own tier: Warlord, Seer, Monk; inherited is empty, so own and general renormalise
		expect(share(pool, "Monk")).toBeCloseTo(0.55 / 0.7 / 3, 5);
	});

	it("empty tiers are renormalised away", () => {
		// rom is top-level: no inherited tier, so own and general split 0.55 : 0.15.
		const pool = scopedLexicon(fixture(), "rom").role;
		expect(share(pool, "Duke")).toBeCloseTo(0.55 / 0.7, 5);
	});

	it("a thin tier gets a proportional cut of its share (fullTier)", () => {
		const pool = scopedLexicon(fixture({ vocabularyBlend: { fullTier: 4 } }), "sword").role;
		// own 0.55 × 1/4, inherited 0.3 × 1/4, general 0.15 × 2/4, renormalised
		const total = 0.55 / 4 + 0.3 / 4 + 0.15 / 2;
		expect(share(pool, "Swordsman")).toBeCloseTo(0.55 / 4 / total, 5);
	});

	it("a slot with nothing own or inherited stays genre-neutral (whole slot)", () => {
		const spec = fixture({ lexicon: { role: ["Duke #rom", "Monk #epic #gothic", "Stranger"] } });
		expect(scopedLexicon(spec, "sword").role.map((e) => e.gloss)).toEqual(["Duke", "Monk", "Stranger"]);
	});

	it("an isolated genre skips the general list", () => {
		const spec = fixture();
		spec.genres.find((g) => g.id === "rom")!.isolated = true;
		expect(scopedLexicon(spec, "rom").role.map((e) => e.gloss)).toEqual(["Duke"]);
		for (let seed = 1; seed <= 50; seed++) expect(generateOne(spec, { genre: "rom", seed }).title).toBe("The Duke");
	});

	it("exclusiveSlots keeps the old exclusive narrowing", () => {
		const spec = fixture({ exclusiveSlots: ["role"] });
		expect(scopedLexicon(spec, "sword").role.map((e) => e.gloss)).toEqual(["Swordsman"]);
	});

	it("exclusions run before the blend, so the general list can't bring an excluded word back", () => {
		const spec = fixture({ genreExclusions: [{ when: "fantasy", exclude: ["gothic"] }] });
		expect(scopedLexicon(spec, "sword").role.map((e) => e.gloss)).not.toContain("Monk");
	});

	it("a parent selection's own tier is the union of its subtree", () => {
		const pool = scopedLexicon(fixture(), "fantasy").role;
		expect(pool.map((e) => e.gloss).sort()).toEqual(["Monk", "Seer", "Stranger", "Swordsman", "Warlord"]);
	});
});
