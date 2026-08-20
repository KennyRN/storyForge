import { describe, expect, it } from "vitest";
import { generateOne } from "../engine/generate.js";
import {
	parseEntries,
	replay,
	replayMatches,
	serialiseEntries,
	titlesFrom,
	toEntry,
} from "../engine/history.js";
import type { GeneratorSpec, HistoryEntry } from "../engine/types.js";

const spec: GeneratorSpec = {
	id: "hist-gen",
	name: "History test generator",
	blurb: "",
	tradition: "Test",
	genres: [{ id: "all", label: "Any" }],
	patterns: [
		{
			id: "the-noun",
			label: "The [Noun]",
			templates: ["The {noun}"],
			exemplar: "n/a",
			note: "n/a",
		},
	],
	lexicon: { noun: ["Crown", "Reckoning", "Ash"] },
};

describe("titleforge history: parse/serialise", () => {
	it("round-trips entries through serialiseEntries/parseEntries", () => {
		const entries: HistoryEntry[] = [
			{ generatorId: "a", seed: 1, title: "One", at: "2026-01-01T00:00:00.000Z" },
			{ generatorId: "b", seed: 2, title: "Two", at: "2026-01-02T00:00:00.000Z", kept: true },
		];
		const text = serialiseEntries(entries);
		const { entries: parsed, errors } = parseEntries(text);
		expect(errors).toEqual([]);
		expect(parsed).toEqual(entries);
	});

	it("skips blank lines and reports malformed ones without losing the rest", () => {
		const good: HistoryEntry = { generatorId: "a", seed: 1, title: "One", at: "now" };
		const text = `${JSON.stringify(good)}\n\nnot json\n`;
		const { entries, errors } = parseEntries(text);
		expect(entries).toEqual([good]);
		expect(errors.length).toBe(1);
	});

	it("serialiseEntries of an empty array is an empty string", () => {
		expect(serialiseEntries([])).toBe("");
	});
});

describe("titleforge history: toEntry / titlesFrom", () => {
	it("builds an entry carrying the result's seed and title", () => {
		const result = generateOne(spec, { seed: 123 });
		const entry = toEntry(result);
		expect(entry.generatorId).toBe("hist-gen");
		expect(entry.seed).toBe(123);
		expect(entry.title).toBe(result.title);
		expect(typeof entry.at).toBe("string");
	});

	it("titlesFrom extracts just the titles", () => {
		const entries: HistoryEntry[] = [
			{ generatorId: "a", seed: 1, title: "One", at: "now" },
			{ generatorId: "a", seed: 2, title: "Two", at: "now" },
		];
		expect(titlesFrom(entries)).toEqual(["One", "Two"]);
	});
});

describe("titleforge history: replay", () => {
	it("reproduces the same title from the same seed while the lexicon is unchanged", () => {
		const original = generateOne(spec, { seed: 555 });
		const entry = toEntry(original);
		const replayed = replay(spec, entry);
		expect(replayed.title).toBe(original.title);
		expect(replayMatches(spec, entry)).toBe(true);
	});

	it("replayMatches is false against a stale stored title", () => {
		const entry: HistoryEntry = {
			generatorId: spec.id,
			seed: 555,
			title: "A title that was never actually generated",
			at: "now",
		};
		expect(replayMatches(spec, entry)).toBe(false);
	});
});
