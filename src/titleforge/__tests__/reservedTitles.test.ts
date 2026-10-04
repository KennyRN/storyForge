import { describe, expect, it } from "vitest";
import { generateOne } from "../engine/generate.js";
import { mergeUserLexicon } from "../engine/userLexicon.js";
import { japaneseLnLexicon } from "../lexicons/japaneseLn.js";
import { titleComposerLexicon } from "../lexicons/titleComposer.js";

/** The real-title guard for title-composer and japanese-ln (lists built by tools/build-reserved.ts). */
describe.each([
	["title-composer", titleComposerLexicon],
	["japanese-ln", japaneseLnLexicon],
])("%s reserved titles", (_id, spec) => {
	const reserved = new Set(spec.reservedTitles!.map((t) => t.toLowerCase()));

	it("ships a real-title list", () => {
		expect(reserved.size).toBeGreaterThan(100);
	});

	it("never reproduces a reserved title under any genre", () => {
		for (const genre of spec.genres) {
			for (let seed = 1; seed <= 60; seed++) {
				const title = generateOne(spec, { genre: genre.id, seed }).title;
				expect(reserved.has(title.toLowerCase()), `${genre.id}: ${title}`).toBe(false);
			}
		}
	});
});

describe("known leaks are closed", () => {
	it("title-composer world fiction no longer emits the classics it echoes", () => {
		const banned = ["war and peace", "life and fate", "dead souls", "crime and punishment", "season of migration to the north"];
		for (const genre of ["russian", "arabic", "world-fiction"]) {
			for (let seed = 1; seed <= 300; seed++) {
				expect(banned).not.toContain(generateOne(titleComposerLexicon, { genre, seed }).title.toLowerCase());
			}
		}
	});

	it("japanese-ln no longer emits Log Horizon or Reincarnated as a Sword", () => {
		for (let seed = 1; seed <= 400; seed++) {
			expect(["Log Horizon", "Reincarnated as a Sword"]).not.toContain(generateOne(japaneseLnLexicon, { seed }).title);
		}
	});

	it("the guard survives merging the writer's own words", () => {
		const { spec } = mergeUserLexicon(titleComposerLexicon, "## noun\n- Lantern #lit\n");
		expect(spec.reservedTitles).toEqual(titleComposerLexicon.reservedTitles);
	});
});
