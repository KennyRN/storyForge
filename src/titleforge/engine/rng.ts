/**
 * Seeded PRNG (mulberry32) plus the sampling helpers built on it.
 *
 * Every draw in titleForge goes through one of these, which is what makes a
 * generated title reproducible from its seed alone — see `history.ts`'s `replay`.
 */

export interface Rng {
	/** Next float in [0, 1). */
	next(): number;
	/** Next integer in [0, maxExclusive). Returns 0 if `maxExclusive <= 0`. */
	int(maxExclusive: number): number;
}

/** mulberry32 — small, fast, and good enough statistical quality for word draws. */
export function createRng(seed: number): Rng {
	let a = seed >>> 0;
	function next(): number {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	return {
		next,
		int(maxExclusive: number): number {
			if (maxExclusive <= 0) return 0;
			return Math.floor(next() * maxExclusive);
		},
	};
}

/** A fresh, non-deterministic seed — used when the caller doesn't supply one. */
export function randomSeed(): number {
	return Math.floor(Math.random() * 0xffffffff);
}

/** Uniform pick from `items`. Undefined if `items` is empty. */
export function pick<T>(rng: Rng, items: readonly T[]): T | undefined {
	if (items.length === 0) return undefined;
	return items[rng.int(items.length)];
}

/**
 * Weighted pick. Non-positive weights are treated as zero.
 *
 * If every item weighs zero (or `items` is empty), falls back to a uniform pick
 * rather than returning undefined — a spec with an accidental zero weight
 * shouldn't make a whole slot unreachable.
 */
export function weightedPick<T>(
	rng: Rng,
	items: readonly T[],
	weightOf: (item: T) => number,
): T | undefined {
	if (items.length === 0) return undefined;
	const weights = items.map((item) => Math.max(0, weightOf(item)));
	const total = weights.reduce((sum, w) => sum + w, 0);
	if (total <= 0) return pick(rng, items);
	let roll = rng.next() * total;
	for (let i = 0; i < items.length; i++) {
		roll -= weights[i]!;
		if (roll <= 0) return items[i];
	}
	return items[items.length - 1];
}
