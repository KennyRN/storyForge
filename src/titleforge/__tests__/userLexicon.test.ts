import { describe, expect, it } from "vitest";
import { generateMany } from "../engine/generate.js";
import type { GeneratorSpec } from "../engine/types.js";
import { mergeUserLexicon, scanUserLexicon } from "../engine/userLexicon.js";

/** A deliberately tiny bundled spec, so these tests don't ride on the real title-composer taxonomy. */
function makeBundle(): GeneratorSpec {
	return {
		id: "title-composer",
		name: "Title composer",
		blurb: "",
		tradition: "Test",
		genres: [
			{ id: "all", label: "any genre" },
			{ id: "fantasy", label: "fantasy" },
			{ id: "urban-fantasy", label: "urban fantasy", parent: "fantasy" },
			{ id: "sf", label: "science fiction" },
		],
		patterns: [
			{
				id: "bare-place",
				label: "[Place]",
				templates: ["{place}"],
				exemplar: "n/a",
				note: "n/a",
			},
			{
				id: "adj-noun",
				label: "The [Adj] [Noun]",
				templates: ["The {adj} {noun}"],
				exemplar: "n/a",
				note: "n/a",
			},
		],
		lexicon: {
			adj: ["old"],
			noun: ["crown"],
			place: ["Greyhaven #fantasy"],
		},
	};
}

const KNOWN_SLOTS = new Set(["adj", "noun", "place"]);

describe("scanUserLexicon", () => {
	it("reads `- word #tag *weight ^stem` under a known `## slot` heading", () => {
		const { entries } = scanUserLexicon(
			["## place", "- Neon Quay #sf *2 ^The Neon Quay", "", "## noun", "- cyberdeck #sf"].join("\n"),
			KNOWN_SLOTS,
		);
		expect(entries).toEqual([
			{ slot: "place", raw: "Neon Quay #sf *2 ^The Neon Quay" },
			{ slot: "noun", raw: "cyberdeck #sf" },
		]);
	});

	it("ignores anything inside a fenced code block (invariant I4)", () => {
		const text = [
			"## place",
			"```",
			"- Should Not Appear #sf",
			"## noun",
			"- also-not #sf",
			"```",
			"- Real Entry #sf",
		].join("\n");
		const { entries } = scanUserLexicon(text, KNOWN_SLOTS);
		expect(entries).toEqual([{ slot: "place", raw: "Real Entry #sf" }]);
	});

	it("ignores prose, bold pseudo-headings, and list items with no active slot", () => {
		const text = [
			"Some intro prose.",
			"**Describing words**",
			"- adj — not a real entry",
			"## How to add a word",
			"- this bullet is under a prose heading",
		].join("\n");
		const { entries, unknownSlots } = scanUserLexicon(text, KNOWN_SLOTS);
		expect(entries).toEqual([]);
		// "How to add a word" has spaces, so it is not mistaken for a slot typo.
		expect(unknownSlots).toEqual([]);
	});

	it("flags a single-token `## heading` that matches no slot (e.g. a plural typo)", () => {
		const { entries, unknownSlots } = scanUserLexicon(
			["## nouns", "- widget #sf"].join("\n"),
			KNOWN_SLOTS,
		);
		expect(entries).toEqual([]);
		expect(unknownSlots).toEqual(["nouns"]);
	});

	it("ends a slot section at the next heading of any level", () => {
		const { entries } = scanUserLexicon(
			["## place", "- Kept #sf", "### aside", "- Dropped #sf"].join("\n"),
			KNOWN_SLOTS,
		);
		expect(entries).toEqual([{ slot: "place", raw: "Kept #sf" }]);
	});
});

describe("mergeUserLexicon", () => {
	it("appends user words to the right slot and leaves bundled entries intact (I1)", () => {
		const bundle = makeBundle();
		const { spec, messages } = mergeUserLexicon(bundle, ["## place", "- Neon Quay #sf"].join("\n"));

		expect(spec.lexicon.place).toEqual(["Greyhaven #fantasy", { gloss: "Neon Quay", tags: ["sf"] }]);
		expect(messages).toEqual([]);
		// The bundle object itself is untouched.
		expect(bundle.lexicon.place).toEqual(["Greyhaven #fantasy"]);
	});

	it("an empty file yields a spec that deep-equals the bundle (I1)", () => {
		const bundle = makeBundle();
		const { spec, messages } = mergeUserLexicon(bundle, "");
		expect(spec).toEqual(bundle);
		expect(messages).toEqual([]);
	});

	it("makes a user word reachable under its tag", () => {
		const bundle = makeBundle();
		const { spec } = mergeUserLexicon(bundle, ["## place", "- Neon Quay #sf"].join("\n"));

		const sfTitles = generateMany(spec, 20, { genre: "sf", pattern: "bare-place" }).map(
			(r) => r.title,
		);
		expect(sfTitles).toContain("Neon Quay");
		// And it does NOT leak into an unrelated genre that has its own tagged pool.
		const fantasyTitles = generateMany(spec, 20, { genre: "fantasy", pattern: "bare-place" }).map(
			(r) => r.title,
		);
		expect(fantasyTitles).not.toContain("Neon Quay");
	});

	it("carries weight and stem through the shared parser (I2)", () => {
		const bundle = makeBundle();
		const { spec } = mergeUserLexicon(
			bundle,
			["## noun", "- reckoning #sf *3 ^Great Reckoning"].join("\n"),
		);
		expect(spec.lexicon.noun).toContainEqual({
			gloss: "reckoning",
			tags: ["sf"],
			weight: 3,
			stem: "Great Reckoning",
		});
	});

	it("warns about an untagged word and one tagged with an unknown genre", () => {
		const bundle = makeBundle();
		const { messages } = mergeUserLexicon(
			bundle,
			["## noun", "- lonely", "- chrome #cyberpunk"].join("\n"),
		);
		expect(messages).toEqual([
			expect.stringContaining('"lonely" (## noun) has no genre tag'),
			expect.stringContaining("#cyberpunk"),
		]);
	});

	it("skips a malformed (word-less) line and keeps the rest (I3)", () => {
		const bundle = makeBundle();
		const { spec, messages } = mergeUserLexicon(
			bundle,
			["## noun", "- #sf *2", "- keeper #sf"].join("\n"),
		);
		expect(spec.lexicon.noun).toEqual(["crown", { gloss: "keeper", tags: ["sf"] }]);
		expect(messages).toEqual([expect.stringContaining("no word")]);
	});

	it("reports an unknown `## slot` heading without losing the file", () => {
		const bundle = makeBundle();
		const { spec, messages } = mergeUserLexicon(
			bundle,
			["## nouns", "- widget #sf", "## place", "- Real #sf"].join("\n"),
		);
		expect(messages).toEqual([expect.stringContaining('"## nouns" is not a known slot')]);
		expect(spec.lexicon.place).toContainEqual({ gloss: "Real", tags: ["sf"] });
	});

	it("validateSpec runs clean for a well-formed merge", () => {
		const bundle = makeBundle();
		const { messages } = mergeUserLexicon(bundle, ["## place", "- Neon Quay #sf"].join("\n"));
		expect(messages.filter((m) => m.startsWith("Lexicon check:"))).toEqual([]);
	});
});
