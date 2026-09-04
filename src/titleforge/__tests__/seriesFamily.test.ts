import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkArticleAgreement } from "../engine/articles.js";
import { eligiblePatterns, generateSeries, validateSpec } from "../engine/generate.js";
import { titleComposerLexicon } from "../lexicons/titleComposer.js";

/**
 * Stage 5 integration check for the corpus-grounded `family: "series"` shape set
 * (INTEGRATION-PROMPT.md, series corpus v1.0.0, n=303). Verifies the nine
 * patterns are present, structurally clean, and that genre-eligibility visibly
 * bites when series generation is routed through the family.
 */

const SERIES_SHAPE_IDS = [
	"series-simple",
	"series-compound",
	"series-of",
	"series-pair",
	"series-name",
	"series-marker",
	"series-colon",
	"series-verb",
	"series-clause",
];

describe("titleComposer — series umbrella family", () => {
	it("declares the series family option", () => {
		expect(titleComposerLexicon.families?.some((f) => f.id === "series")).toBe(true);
	});

	it("carries exactly the nine derived series shapes", () => {
		const ids = titleComposerLexicon.patterns
			.filter((p) => p.family === "series")
			.map((p) => p.id);
		expect(ids.sort()).toEqual([...SERIES_SHAPE_IDS].sort());
	});

	it("every series shape keeps its note and exemplar", () => {
		for (const p of titleComposerLexicon.patterns.filter((p) => p.family === "series")) {
			expect(p.note?.trim(), `${p.id} note`).not.toBe("");
			expect(p.exemplar?.trim(), `${p.id} exemplar`).not.toBe("");
		}
	});

	it("keeps the corpus-frequency weight ordering within the family", () => {
		const weight = (id: string) =>
			titleComposerLexicon.patterns.find((p) => p.id === id)!.weight ?? 1;
		expect(weight("series-compound")).toBe(15);
		expect(weight("series-name")).toBe(6);
		expect(weight("series-marker")).toBe(6);
		expect(weight("series-of")).toBe(5);
		expect(weight("series-simple")).toBe(3);
		for (const rare of ["series-pair", "series-colon", "series-verb", "series-clause"]) {
			expect(weight(rare)).toBe(1);
		}
	});

	it("matches the vendored corpus/series-shapes.json verbatim (invariant 8)", () => {
		const shapesPath = fileURLToPath(
			new URL("../corpus/series-shapes.json", import.meta.url),
		);
		const vendored = JSON.parse(readFileSync(shapesPath, "utf8"));
		const key = (p: unknown) => {
			const q = p as Record<string, unknown>;
			return {
				id: q.id,
				family: q.family,
				label: q.label,
				templates: q.templates,
				genres: q.genres,
				weight: q.weight,
				exemplar: q.exemplar,
				note: q.note,
			};
		};
		expect(
			titleComposerLexicon.patterns.filter((p) => p.family === "series").map(key),
		).toEqual(vendored.map(key));
	});

	it("still passes validateSpec and checkArticleAgreement", () => {
		expect(validateSpec(titleComposerLexicon)).toEqual([]);
		expect(checkArticleAgreement(titleComposerLexicon)).toEqual([]);
	});

	it("narrows to only the series shapes when family is supplied", () => {
		const picked = eligiblePatterns(titleComposerLexicon, { family: "series" });
		expect(picked.length).toBe(9);
		expect(picked.every((p) => p.family === "series")).toBe(true);
	});

	it("genre-eligibility bites: crime is character-led, epic is world-led", () => {
		const crime = eligiblePatterns(titleComposerLexicon, { family: "series", genre: "crime" }).map(
			(p) => p.id,
		);
		expect(crime).toContain("series-name");
		expect(crime).toContain("series-colon");
		expect(crime).not.toContain("series-verb");
		expect(crime).not.toContain("series-clause");
		expect(crime).not.toContain("series-simple");

		const epic = eligiblePatterns(titleComposerLexicon, { family: "series", genre: "epic" }).map(
			(p) => p.id,
		);
		expect(epic).toContain("series-compound");
		expect(epic).toContain("series-of");
		expect(epic).toContain("series-marker");
		expect(epic).not.toContain("series-colon");
	});

	it("generateSeries under family:\"series\" draws every title from a series shape", () => {
		for (const strategy of ["echo", "anchor", "free"] as const) {
			for (let seed = 1; seed <= 25; seed++) {
				const set = generateSeries(titleComposerLexicon, {
					family: "series",
					genre: seed % 2 ? "crime" : "epic",
					strategy,
					volumes: 3,
					seed,
				});
				expect(set.series.title, `${strategy}/${seed}`).not.toBe("");
				for (const result of [set.series, ...set.volumes]) {
					expect(result.patternId, `${strategy}/${seed}: ${result.title}`).toMatch(/^series-/);
				}
			}
		}
	});
});
