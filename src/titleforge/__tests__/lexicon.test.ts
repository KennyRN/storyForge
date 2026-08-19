import { describe, expect, it } from "vitest";
import { normaliseLexicon, withTags } from "../engine/lexicon.js";

describe("titleforge lexicon compact-string parsing", () => {
	it("parses a bare word", () => {
		const [entry] = normaliseLexicon({ noun: ["Crown"] }).noun!;
		expect(entry).toEqual({ gloss: "Crown" });
	});

	it("parses tags and a weight in either order", () => {
		const a = normaliseLexicon({ noun: ["Reckoning #fantasy *3"] }).noun![0]!;
		expect(a).toEqual({ gloss: "Reckoning", tags: ["fantasy"], weight: 3 });

		const b = normaliseLexicon({ noun: ["last #epic #sf #lit #hist *3 #ya"] }).noun![0]!;
		expect(b.gloss).toBe("last");
		expect(b.weight).toBe(3);
		expect(b.tags).toEqual(["epic", "sf", "lit", "hist", "ya"]);
	});

	it("parses a trailing stem that runs to the end of the string", () => {
		const entry = normaliseLexicon({
			transition: ["I Was Banished ^Being Banished"],
		}).transition![0]!;
		expect(entry).toEqual({ gloss: "I Was Banished", stem: "Being Banished" });
	});

	it("preserves multi-word glosses", () => {
		const entry = normaliseLexicon({
			object: ["prosthetic hand #sf #horror #crime"],
		}).object![0]!;
		expect(entry.gloss).toBe("prosthetic hand");
		expect(entry.tags).toEqual(["sf", "horror", "crime"]);
	});

	it("passes the object form through unchanged (the escape hatch)", () => {
		const entry = normaliseLexicon({
			noun: [{ gloss: "Reckoning", tags: ["fantasy"], weight: 3 }],
		}).noun![0]!;
		expect(entry).toEqual({ gloss: "Reckoning", tags: ["fantasy"], weight: 3 });
	});
});

describe("titleforge withTags", () => {
	const entries = normaliseLexicon({
		adj: ["quiet #lit #horror", "hungry #horror", "untagged-word"],
	}).adj!;

	it("narrows to entries carrying the tag when at least one does", () => {
		const filtered = withTags(entries, ["horror"]);
		expect(filtered.map((e) => e.gloss).sort()).toEqual(["hungry", "quiet"]);
	});

	it("is genre-neutral (passes everything through) when nothing carries the tag", () => {
		const filtered = withTags(entries, ["nonexistent-tag"]);
		expect(filtered).toEqual(entries);
	});

	it("returns the input unchanged for an empty tag list", () => {
		expect(withTags(entries, [])).toBe(entries);
	});

	it("requires every tag in a multi-tag filter (AND, not OR)", () => {
		const pool = normaliseLexicon({
			x: ["a #foo #bar", "b #foo", "c #bar"],
		}).x!;
		const filtered = withTags(pool, ["foo", "bar"]);
		expect(filtered.map((e) => e.gloss)).toEqual(["a"]);
	});
});
