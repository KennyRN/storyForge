import { describe, expect, it } from "vitest";
import { normaliseLexicon } from "../engine/lexicon.js";
import { createRng } from "../engine/rng.js";
import { bareVerb, humanizeTemplate, pluralise, renderTemplate, slotsIn, validateTemplate } from "../engine/template.js";

describe("titleforge slotsIn", () => {
	it("lists each slot occurrence, index stripped, not deduped", () => {
		expect(slotsIn("A {taleWord} of {symbol#1} and {symbol#2}")).toEqual([
			"taleWord",
			"symbol",
			"symbol",
		]);
	});

	it("ignores literal escaped braces", () => {
		expect(slotsIn("{{literal}} {noun}")).toEqual(["noun"]);
	});
});

describe("titleforge humanizeTemplate", () => {
	it("turns tokens into bracketed slot names, dropping decorations", () => {
		expect(humanizeTemplate("The {adj} {noun}")).toBe("The [Adjective] [Noun]");
		expect(humanizeTemplate("The {noun#1} of the {noun#2}")).toBe("The [Noun] of the [Noun]");
		expect(humanizeTemplate("The {role|title} of {place}")).toBe("The [Role] of [Place]");
		expect(humanizeTemplate("{noun:epic} rises")).toBe("[Noun] rises");
	});

	it("spaces a camelCase slot name", () => {
		expect(humanizeTemplate("{placeBare}")).toBe("[Place Bare]");
	});

	it("spells out an abbreviated slot word, standalone or compound", () => {
		expect(humanizeTemplate("{adjective}")).toBe("[Adjective]");
		expect(humanizeTemplate("A {warmAdj} {coldNoun}")).toBe("A [Warm Adjective] [Cold Noun]");
	});

	it("keeps literal escaped braces", () => {
		expect(humanizeTemplate("{{not a slot}} {noun}")).toBe("{not a slot} [Noun]");
	});
});

describe("titleforge validateTemplate", () => {
	it("accepts a clean template", () => {
		expect(validateTemplate("The {adj} {noun}")).toEqual([]);
	});

	it("accepts an indexed repeat (the deliberate echo device)", () => {
		expect(validateTemplate("{place#1}, {place#1}")).toEqual([]);
	});

	it("accepts distinct indices of the same slot", () => {
		expect(validateTemplate("{symbol#1} and {symbol#2}")).toEqual([]);
	});

	it("flags an unindexed repeat of the same slot", () => {
		const problems = validateTemplate("The {noun} of {noun}");
		expect(problems.length).toBeGreaterThan(0);
		expect(problems[0]).toMatch(/noun/);
	});

	it("flags a malformed token", () => {
		const problems = validateTemplate("The {1noun}");
		expect(problems.length).toBeGreaterThan(0);
	});
});

describe("titleforge renderTemplate", () => {
	const lexemes = normaliseLexicon({
		adj: ["quiet", "hungry"],
		noun: ["ash", "ember"],
		symbol: ["salt", "iron", "frost"],
		transition: [{ gloss: "Reincarnated", stem: "Got Reincarnated" }],
	});

	it("is deterministic for a given seed", () => {
		const a = renderTemplate(createRng(5), "The {adj} {noun}", lexemes);
		const b = renderTemplate(createRng(5), "The {adj} {noun}", lexemes);
		expect(a).toBe(b);
	});

	it("echoes the same draw for a repeated index", () => {
		const out = renderTemplate(createRng(9), "{noun#1}-{noun#1}", lexemes);
		const [first, second] = out.split("-");
		expect(first).toBe(second);
	});

	it("draws without replacement across indices of the same slot when possible", () => {
		const out = renderTemplate(createRng(1), "{symbol#1} and {symbol#2}", lexemes);
		const [first, second] = out.split(" and ");
		expect(first).not.toBe(second);
	});

	it("honours a bound slot for every occurrence, indexed or not", () => {
		const bound = { noun: { gloss: "Bound" } };
		const out = renderTemplate(createRng(1), "{noun} and {noun#1}", lexemes, bound);
		expect(out).toBe("Bound and Bound");
	});

	it("applies the ^ stem token", () => {
		const out = renderTemplate(createRng(1), "{transition^}", lexemes);
		expect(out).toBe("Got Reincarnated");
	});

	it("applies filters: lower, upper, title, a, the", () => {
		expect(renderTemplate(createRng(1), "{noun|upper}", lexemes)).toMatch(/^[A-Z]+$/);
		expect(renderTemplate(createRng(1), "{noun|title}", lexemes)).toMatch(/^[A-Z]/);
		expect(renderTemplate(createRng(1), "{noun|a}", lexemes)).toMatch(/^a /);
		expect(renderTemplate(createRng(1), "{noun|the}", lexemes)).toMatch(/^the /);
	});

	it("resolves literal double braces to single braces", () => {
		expect(renderTemplate(createRng(1), "{{not a slot}}", lexemes)).toBe("{not a slot}");
	});

	it("returns an empty string when a referenced slot has no entries", () => {
		expect(renderTemplate(createRng(1), "{missingSlot}", lexemes)).toBe("");
	});

	it("restricts a draw to a slot:tag filter", () => {
		const tagged = normaliseLexicon({ noun: ["ash #epic", "ember #horror"] });
		const out = renderTemplate(createRng(1), "{noun:epic}", tagged);
		expect(out).toBe("ash");
	});

	describe("plural and bare filters", () => {
		it("pluralises the last word, leaving already-plural entries alone", () => {
			expect(pluralise("Century")).toBe("Centuries");
			expect(pluralise("wolf")).toBe("wolves");
			expect(pluralise("Sea Serpent")).toBe("Sea Serpents");
			expect(pluralise("Witness")).toBe("Witnesses");
			expect(pluralise("birds")).toBe("birds");
			expect(pluralise("children")).toBe("children");
		});

		it("turns a third-person verb into its base form for a plural subject", () => {
			expect(bareVerb("rises")).toBe("rise");
			expect(bareVerb("watches")).toBe("watch");
			expect(bareVerb("buries")).toBe("bury");
			expect(bareVerb("falls apart")).toBe("fall apart");
		});

		it("are usable from a template", () => {
			const lexemes = { era: [{ gloss: "Century" }], animal: [{ gloss: "wolf" }], strikeVerb: [{ gloss: "rises" }] };
			expect(renderTemplate(createRng(1), "Nine {era|plural}", lexemes)).toBe("Nine Centuries");
			expect(renderTemplate(createRng(1), "Where the {animal|plural} {strikeVerb|bare}", lexemes)).toBe("Where the wolves rise");
		});
	});
});
