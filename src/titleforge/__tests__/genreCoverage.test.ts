import { describe, expect, it } from "vitest";
import type { GeneratorSpec } from "../engine/types.js";
import { countTagged, reportGenerator, THIN_LEXEME_THRESHOLD } from "../tools/genre-coverage.js";

/** A small synthetic spec exercising every row shape the reporter distinguishes: a parent with
 * plenty of its own material, a subgenre with none ("inherits only"), a subgenre with a little
 * (enough to be non-zero but still under THIN_LEXEME_THRESHOLD), and an unrelated flat genre. */
function fixture(ownCount: number): GeneratorSpec {
	const manyNouns = Array.from({ length: ownCount }, (_, i) => `Noun${i} #hist`);
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
			{ id: "hist-only", label: "H", templates: ["The {noun}"], genres: ["hist"], exemplar: "n/a", note: "n/a" },
			{ id: "western-only", label: "W", templates: ["{place}"], genres: ["western"], exemplar: "n/a", note: "n/a" },
			{ id: "sf-only", label: "S", templates: ["The {ship}"], genres: ["sf"], exemplar: "n/a", note: "n/a" },
		],
		lexicon: {
			noun: manyNouns,
			place: ["Dodge #western"],
			ship: ["Nova #sf"],
		},
	};
}

describe("countTagged", () => {
	it("counts entries carrying any of the given ids, across every slot", () => {
		const lexemes = {
			noun: [{ gloss: "Crown", tags: ["hist"] }, { gloss: "Nova", tags: ["sf"] }],
			place: [{ gloss: "Dodge", tags: ["western"] }],
		};
		expect(countTagged(lexemes, ["hist", "western"])).toBe(2);
		expect(countTagged(lexemes, ["sf"])).toBe(1);
		expect(countTagged(lexemes, [])).toBe(0);
	});
});

describe("reportGenerator", () => {
	it("flags a subgenre with zero own lexemes as both THIN and inherits-only", () => {
		const { rows } = reportGenerator(fixture(30));
		const regency = rows.find((r) => r.id === "regency")!;
		expect(regency.ownLexemes).toBe(0);
		expect(regency.thin).toBe(true);
		expect(regency.inheritsOnly).toBe(true);
		// Its inherited count reaches the parent's real material.
		expect(regency.inheritedLexemes).toBeGreaterThan(0);
	});

	it("does not flag a subgenre with real own material of its own", () => {
		const { rows } = reportGenerator(fixture(30));
		const western = rows.find((r) => r.id === "western")!;
		expect(western.ownLexemes).toBeGreaterThan(0);
		expect(western.inheritsOnly).toBe(false);
	});

	it("flags a parent THIN once its own tagged count drops below the threshold", () => {
		const belowThreshold = reportGenerator(fixture(THIN_LEXEME_THRESHOLD - 1)).rows.find(
			(r) => r.id === "hist",
		)!;
		expect(belowThreshold.thin).toBe(true);

		const atThreshold = reportGenerator(fixture(THIN_LEXEME_THRESHOLD)).rows.find((r) => r.id === "hist")!;
		expect(atThreshold.thin).toBe(false);
	});

	it("reports zero eligible patterns as unreachable", () => {
		const spec = fixture(30);
		spec.genres.push({ id: "dead", label: "Dead" });
		const { unreachable } = reportGenerator(spec);
		expect(unreachable).toContain("fixture-gen/dead");
	});

	it("never reports a subgenre unreachable purely for having no own patterns — inheritance covers it", () => {
		const { unreachable } = reportGenerator(fixture(30));
		expect(unreachable).not.toContain("fixture-gen/regency");
	});
});
