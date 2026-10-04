import { describe, expect, it } from "vitest";
import { checkArticleAgreement } from "../engine/articles.js";
import { generateMany, generateOne, validateSpec } from "../engine/generate.js";
import { ALL_TITLEFORGE_LEXICONS } from "../lexicons/index.js";

/**
 * The in-repo equivalent of the brief's 306-assertion self-test and
 * `fix-articles.py --check`: runs the engine's own validators over every
 * bundled lexicon, so a typo'd slot or an article-agreement violation fails
 * `npm test` instead of silently rendering a broken title.
 */
describe("titleforge bundled lexicons — structural validation", () => {
	it("ships exactly the eight documented traditions", () => {
		expect(ALL_TITLEFORGE_LEXICONS.map((s) => s.id).sort()).toEqual(
			[
				"chinese-web",
				"indonesian-web",
				"japanese-ln",
				"korean-web",
				"thai-web",
				"title-composer",
				"vietnamese-web",
				"western-serial",
			].sort(),
		);
	});

	for (const spec of ALL_TITLEFORGE_LEXICONS) {
		describe(spec.id, () => {
			it("passes validateSpec (no unknown slots, no duplicate ids, no template defects)", () => {
				expect(validateSpec(spec)).toEqual([]);
			});

			it("passes checkArticleAgreement (no unindexed \"the the\" style doubling)", () => {
				expect(checkArticleAgreement(spec)).toEqual([]);
			});

			it("pluralises with {slot|plural}, never a literal {slot}s (which gives \"Centurys\")", () => {
				for (const pattern of spec.patterns) {
					for (const template of pattern.templates) {
						expect(template, `${spec.id}/${pattern.id}`).not.toMatch(/\}s\b/);
					}
				}
			});

			it("every pattern has a non-empty note and exemplar", () => {
				for (const pattern of spec.patterns) {
					expect(pattern.note?.trim(), `${spec.id}/${pattern.id} note`).not.toBe("");
					expect(pattern.exemplar?.trim(), `${spec.id}/${pattern.id} exemplar`).not.toBe("");
				}
			});

			it("every genre id is reachable and every pattern genre is declared", () => {
				const genreIds = new Set(spec.genres.map((g) => g.id));
				for (const pattern of spec.patterns) {
					for (const genre of pattern.genres ?? []) {
						expect(genreIds.has(genre), `${spec.id}/${pattern.id}: "${genre}"`).toBe(true);
					}
				}
			});

			it("generates a non-empty title under every declared genre", () => {
				for (const genre of spec.genres) {
					const result = generateOne(spec, { genre: genre.id, seed: 1 });
					expect(result.title, `${spec.id} genre "${genre.id}"`).not.toBe("");
				}
			});

			it("generateMany produces a full batch with no duplicates", () => {
				const results = generateMany(spec, 8, { seed: 1 });
				expect(results.length).toBe(8);
				const titles = results.map((r) => r.title.toLowerCase());
				expect(new Set(titles).size).toBe(titles.length);
			});
		});
	}
});
