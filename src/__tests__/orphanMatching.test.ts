import { describe, expect, it } from "vitest";
import { matchOrphansByFingerprint, matchOrphansExact } from "../orphanMatching";

describe("matchOrphansExact", () => {
	it("matches an orphan to an unplaced file of the identical name", () => {
		const matches = matchOrphansExact(["the-storm.md"], ["the-storm.md", "the-arrival.md"]);
		expect(matches.get("the-storm.md")).toBe("the-storm.md");
	});

	it("finds no match when no unplaced name is identical", () => {
		const matches = matchOrphansExact(["the-storm.md"], ["the-arrival.md"]);
		expect(matches.size).toBe(0);
	});
});

describe("matchOrphansByFingerprint", () => {
	it("surfaces the best-scoring candidate above the threshold, never auto-applying", () => {
		const orphans = [
			{ name: "the-storm.md", fingerprint: { opening: "The rain came sideways that morning.", closing: "Nobody spoke." } },
		];
		const unplaced = [
			{ name: "chapter-3.md", fingerprint: { opening: "The rain came sideways that morning.", closing: "Nobody spoke." } },
			{ name: "chapter-4.md", fingerprint: { opening: "A completely different opening line.", closing: "The end." } },
		];

		const [result] = matchOrphansByFingerprint(orphans, unplaced);
		expect(result.orphan).toBe("the-storm.md");
		expect(result.bestMatch).toBe("chapter-3.md");
		expect(result.score).toBeGreaterThan(0.3);
	});

	it("returns null bestMatch when nothing clears the similarity threshold", () => {
		const orphans = [{ name: "the-storm.md", fingerprint: { opening: "The rain came sideways.", closing: "Nobody spoke." } }];
		const unplaced = [{ name: "chapter-9.md", fingerprint: { opening: "Spaceships and lasers.", closing: "The mission ended." } }];

		const [result] = matchOrphansByFingerprint(orphans, unplaced);
		expect(result.bestMatch).toBeNull();
	});

	it("returns an empty bestMatch with score 0 when there are no candidates at all", () => {
		const orphans = [{ name: "the-storm.md", fingerprint: { opening: "x", closing: "y" } }];
		const [result] = matchOrphansByFingerprint(orphans, []);
		expect(result.bestMatch).toBeNull();
		expect(result.score).toBe(0);
	});
});
