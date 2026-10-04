import { describe, expect, it } from "vitest";
import {
	eligiblePatterns,
	generateOne,
	genreScope,
	RESERVED_RETRIES,
	scopedLexicon,
} from "../engine/generate.js";
import type { GeneratorSpec } from "../engine/types.js";
import { westernSerialLexicon as spec } from "../lexicons/westernSerial.js";

/** Synthetic spec for the two engine features webnovel v1.2.0 introduced: `genreExclusions` and
 * `reservedTitles`. Kept off the shipped lexicon so the behaviour is pinned independently of it. */
function fixture(overrides: Partial<GeneratorSpec> = {}): GeneratorSpec {
	return {
		id: "fixture-gen",
		name: "Fixture",
		blurb: "",
		tradition: "Fixture",
		genres: [
			{ id: "all", label: "Any" },
			{ id: "isekai", label: "Isekai" },
			{ id: "isekai/rebirth", label: "Rebirth", parent: "isekai" },
			{ id: "cultivation", label: "Cultivation" },
		],
		patterns: [
			{ id: "plain", label: "", templates: ["The {noun}"], genres: ["isekai", "cultivation"], exemplar: "x", note: "x" },
			{ id: "dao", label: "", templates: ["Dao of {noun}"], genres: ["cultivation"], exemplar: "x", note: "x" },
		],
		lexicon: {
			noun: ["Qi #cultivation", "Sect #cultivation #isekai", "Portal #isekai/rebirth"],
		},
		genreExclusions: [{ when: "isekai", exclude: ["cultivation"] }],
		...overrides,
	};
}

describe("genreExclusions", () => {
	it("drops entries carrying only the excluded tag, keeps ones that also carry an in-scope tag", () => {
		const glosses = (genre: string) => scopedLexicon(fixture(), genre).noun.map((e) => e.gloss).sort();
		expect(glosses("isekai")).toEqual(["Portal", "Sect"]);
		// Sect also reaches isekai/rebirth through its parent's lexicon (it's tagged #isekai).
		expect(glosses("isekai/rebirth")).toEqual(["Portal", "Sect"]);
		expect(glosses("cultivation")).toEqual(["Qi", "Sect"]);
	});

	it("never lets the forgiving fallback bring an excluded entry back", () => {
		// No #isekai entries at all: without the exclusion the slot would fall back to everything.
		const spec = fixture({ lexicon: { noun: ["Qi #cultivation", "Gate"] } });
		expect(scopedLexicon(spec, "isekai").noun.map((e) => e.gloss)).toEqual(["Gate"]);
	});
});

describe("reservedTitles", () => {
	it("resamples within the pattern rather than handing its share to another one", () => {
		const spec = fixture({
			genreExclusions: [],
			lexicon: { noun: ["Qi #cultivation", "Sect #cultivation"] },
			reservedTitles: ["dao of qi", "THE QI"],
		});
		for (let seed = 1; seed <= 200; seed++) {
			const r = generateOne(spec, { genre: "cultivation", seed });
			expect(["The Sect", "Dao of Sect"]).toContain(r.title);
		}
	});

	it(`falls back to the next pattern once one collides more than ${RESERVED_RETRIES} times`, () => {
		const spec = fixture({
			genreExclusions: [],
			lexicon: { noun: ["Qi #cultivation"] },
			reservedTitles: ["Dao of Qi"],
		});
		for (let seed = 1; seed <= 50; seed++) {
			expect(generateOne(spec, { genre: "cultivation", seed }).title).toBe("The Qi");
		}
	});

	it("returns no title at all rather than a reserved one when every pattern is exhausted", () => {
		const spec = fixture({ lexicon: { noun: ["Qi"] }, reservedTitles: ["The Qi", "Dao of Qi"] });
		const r = generateOne(spec, { genre: "cultivation", seed: 3 });
		expect(r.title).toBe("");
		expect(r.constraintRelaxed).toBe(true);
	});
});

describe("western-serial — webnovel v1.2.0", () => {
	const cultivationWord = /\b(Cultivation|Cultivator|Dao|Qi|Xianxia)\b/i;

	it("keeps #dungeon working, and dungeon-core inherits both dungeon and progression", () => {
		expect(genreScope(spec, "dungeon-core")).toEqual(["dungeon-core", "dungeon", "progression"]);
		expect(scopedLexicon(spec, "dungeon-core").monster.length).toBeGreaterThan(30);
		expect(eligiblePatterns(spec, { genre: "dungeon" }).map((p) => p.id)).toContain("dungeon-anchor");
	});

	it("a parent draws on all of its children", () => {
		const ids = eligiblePatterns(spec, { genre: "progression" }).map((p) => p.id);
		for (const id of ["dao-of", "vr-online", "tower-anchor", "dungeon-anchor", "re-prefix"]) {
			expect(ids).toContain(id);
		}
	});

	it("never draws cultivation material under an isekai genre", () => {
		for (const genre of ["isekai", "isekai/reincarnation", "isekai/media-world"]) {
			expect(eligiblePatterns(spec, { genre }).map((p) => p.id)).not.toContain("dao-of");
			for (let seed = 1; seed <= 300; seed++) {
				const r = generateOne(spec, { genre, seed });
				expect(r.title, `${genre} seed ${seed}`).not.toMatch(cultivationWord);
			}
		}
	});

	it("isekai draws on the general role list, romance never does", () => {
		expect(scopedLexicon(spec, "isekai").role.length).toBeGreaterThanOrEqual(15);
		expect(scopedLexicon(spec, "romance").role.map((e) => e.gloss).sort()).toEqual(["Bad Boy", "Billionaire"]);
	});

	it("ships no bracket tags and no thin genres in the picker", () => {
		expect(spec.lexicon.bracketTag).toBeUndefined();
		expect(spec.patterns.map((p) => p.id)).not.toContain("bracket-tag");
		expect(spec.patterns.map((p) => p.id)).not.toContain("genre-subtitle");
		const ids = spec.genres.map((g) => g.id);
		for (const thin of ["rational-magic", "isekai/transmigration", "isekai/portal", "isekai/summoning"]) {
			expect(ids).not.toContain(thin);
		}
	});

	it("never reproduces a reserved real title", () => {
		const reserved = new Set(spec.reservedTitles!.map((t) => t.toLowerCase()));
		for (const genre of ["vrmmo", "isekai/media-world", "dungeon-core", "progression"]) {
			for (let seed = 1; seed <= 300; seed++) {
				expect(reserved.has(generateOne(spec, { genre, seed }).title.toLowerCase())).toBe(false);
			}
		}
	});
});
