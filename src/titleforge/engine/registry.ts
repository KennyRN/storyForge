import type { GeneratorSpec } from "./types.js";

/**
 * Registry of generator specs.
 *
 * Kept separate from the specs themselves so titleForge's own bootstrap
 * (`TitleForgeController`) can register the bundled lexicons, and a future
 * host (or a user's own custom lexicon) can register more without editing
 * this module.
 */
const registry = new Map<string, GeneratorSpec>();

export function register(...specs: GeneratorSpec[]): void {
	for (const spec of specs) {
		if (registry.has(spec.id)) {
			throw new Error(`Title generator "${spec.id}" is already registered`);
		}
		registry.set(spec.id, spec);
	}
}

export function unregister(id: string): boolean {
	return registry.delete(id);
}

export function getGenerator(id: string): GeneratorSpec | undefined {
	return registry.get(id);
}

export function listGenerators(): GeneratorSpec[] {
	return [...registry.values()];
}

/** Grouped by tradition, for the picker. Insertion order is preserved. */
export function listByTradition(): { tradition: string; specs: GeneratorSpec[] }[] {
	const groups = new Map<string, GeneratorSpec[]>();
	for (const spec of registry.values()) {
		const group = groups.get(spec.tradition) ?? [];
		group.push(spec);
		groups.set(spec.tradition, group);
	}
	return [...groups].map(([tradition, specs]) => ({ tradition, specs }));
}
