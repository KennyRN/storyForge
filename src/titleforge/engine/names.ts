import { MarkovModel } from "./markov.js";
import type { GeneratorSpec, NameGenerator } from "./types.js";

/**
 * Invented character names for `@generator` lexicon entries (`Lexeme.generator`).
 *
 * Each `GeneratorSpec.nameGenerators` entry is a register (fantasy, regency, sf…) with a list of
 * source names. A draw builds nameForge's Markov model from that list (once per list, cached) and
 * invents a fresh name in the same style, seeded from the draw's own rng so replays are exact.
 * Anything within `novelty` edits of a source name is rejected, so sources are style only and are
 * never reproduced. The writer's own nameForge pack can stand in for a register's built-in
 * sources (`storage.ts`).
 */

/** Fewer source names than this and a register can't produce convincing output. A pack below it
 * is ignored in favour of the built-in sources. */
export const MIN_NAME_SOURCES = 10;

/**
 * `spec` with some name registers' sources swapped for the writer's own (nameForge packs, read by
 * `storage.ts`), keyed by register id. Registers not in `overrides`, or overridden with fewer than
 * MIN_NAME_SOURCES names, keep their built-in sources. Never mutates `spec`.
 */
export function withNameSources(spec: GeneratorSpec, overrides: Record<string, readonly string[]>): GeneratorSpec {
	if (!spec.nameGenerators) return spec;
	const nameGenerators = { ...spec.nameGenerators };
	let changed = false;
	for (const [id, sources] of Object.entries(overrides)) {
		const gen = nameGenerators[id];
		if (!gen || sources.length < MIN_NAME_SOURCES) continue;
		nameGenerators[id] = { ...gen, sources };
		changed = true;
	}
	return changed ? { ...spec, nameGenerators } : spec;
}

/** Shortest invented name accepted, whatever the sources: below this, output reads as a
 * truncation ("Con", "Fel") rather than a name. */
export const MIN_NAME_LENGTH = 4;

/** Candidates asked of the model per draw; the first inside the length band wins. */
const CANDIDATES = 8;

interface Built {
	model: MarkovModel;
	/** Accepted length band: the sources' own 10th–90th percentile lengths (floored at
	 * MIN_NAME_LENGTH, and at least three lengths wide). Outside it, Markov output is mostly stubs or portmanteaus ("Augustusiah"). */
	minLength: number;
	maxLength: number;
}

const built = new WeakMap<readonly string[], Built>();

function build(sources: readonly string[]): Built {
	let b = built.get(sources);
	if (!b) {
		const lengths = sources.map((n) => Array.from(n).length).sort((x, y) => x - y);
		const at = (p: number) => lengths[Math.min(lengths.length - 1, Math.floor(p * (lengths.length - 1)))];
		const minLength = Math.max(MIN_NAME_LENGTH, at(0.1));
		// At least three lengths wide: a register of short names (webnovel heroes, p90 = 5) otherwise
		// has so few acceptable outputs that one ("Conn") wins half the draws.
		b = { model: MarkovModel.build([...sources]), minLength, maxLength: Math.max(minLength + 2, at(0.9)) };
		built.set(sources, b);
	}
	return b;
}

/** One invented name from `gen`, or undefined if the register is too thin or nothing acceptable
 * came out for this seed (the caller treats that as "render failed, retry"). */
export function inventName(gen: NameGenerator, seed: number): string | undefined {
	if (gen.sources.length < MIN_NAME_SOURCES) return undefined;
	const { model, minLength, maxLength } = build(gen.sources);
	return model
		.generate({
			count: CANDIDATES,
			seed,
			faithfulness: gen.faithfulness ?? 2,
			strictness: gen.strictness ?? 3,
			novelty: gen.novelty ?? 1,
		})
		.find((name) => {
			const length = Array.from(name).length;
			return length >= minLength && length <= maxLength;
		});
}
