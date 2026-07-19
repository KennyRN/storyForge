/**
 * Minimal runtime stand-in for the "obsidian" package, used only under test
 * (see the "obsidian" alias in vitest.config.ts). The real package ships type
 * declarations only — Obsidian's app supplies the actual module at runtime.
 * Extend this as more tests need more of the surface.
 */

export class TFile {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

// Not real YAML — just a round-trip-consistent stand-in, sufficient for tests
// that only care about the parsed structure, not the on-disk text format.
export function parseYaml(raw: string): unknown {
	return raw ? JSON.parse(raw) : null;
}

export function stringifyYaml(data: unknown): string {
	return JSON.stringify(data);
}
