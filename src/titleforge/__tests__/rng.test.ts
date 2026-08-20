import { describe, expect, it } from "vitest";
import { createRng, pick, randomSeed, weightedPick } from "../engine/rng.js";

describe("titleforge rng", () => {
	it("is deterministic for a given seed", () => {
		const a = createRng(12345);
		const b = createRng(12345);
		const seqA = Array.from({ length: 20 }, () => a.next());
		const seqB = Array.from({ length: 20 }, () => b.next());
		expect(seqA).toEqual(seqB);
	});

	it("produces different sequences for different seeds", () => {
		const a = createRng(1);
		const b = createRng(2);
		const seqA = Array.from({ length: 10 }, () => a.next());
		const seqB = Array.from({ length: 10 }, () => b.next());
		expect(seqA).not.toEqual(seqB);
	});

	it("next() stays in [0, 1)", () => {
		const rng = createRng(999);
		for (let i = 0; i < 500; i++) {
			const n = rng.next();
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(1);
		}
	});

	it("int(n) stays in [0, n)", () => {
		const rng = createRng(42);
		for (let i = 0; i < 500; i++) {
			const n = rng.int(7);
			expect(n).toBeGreaterThanOrEqual(0);
			expect(n).toBeLessThan(7);
		}
	});

	it("randomSeed varies across calls", () => {
		const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()));
		expect(seeds.size).toBeGreaterThan(1);
	});

	it("pick returns undefined for an empty array", () => {
		expect(pick(createRng(1), [])).toBeUndefined();
	});

	it("pick only ever returns items from the array", () => {
		const rng = createRng(7);
		const items = ["a", "b", "c"];
		for (let i = 0; i < 50; i++) {
			expect(items).toContain(pick(rng, items));
		}
	});

	it("weightedPick favours heavier items over many draws", () => {
		const rng = createRng(3);
		const items = [
			{ name: "rare", weight: 1 },
			{ name: "common", weight: 20 },
		];
		const counts = { rare: 0, common: 0 };
		for (let i = 0; i < 500; i++) {
			const picked = weightedPick(rng, items, (x) => x.weight)!;
			counts[picked.name as "rare" | "common"]++;
		}
		expect(counts.common).toBeGreaterThan(counts.rare * 5);
	});

	it("weightedPick falls back to uniform when every weight is zero", () => {
		const rng = createRng(3);
		const items = ["a", "b", "c"];
		const picked = weightedPick(rng, items, () => 0);
		expect(items).toContain(picked);
	});

	it("weightedPick treats negative weights as zero rather than throwing", () => {
		const rng = createRng(3);
		const items = [{ w: -5 }, { w: 3 }];
		const picked = weightedPick(rng, items, (x) => x.w);
		expect(items).toContain(picked);
	});
});
