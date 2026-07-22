/**
 * Minimal runtime stand-in for the "obsidian" package, used only under test
 * (see the "obsidian" alias in vitest.config.ts). The real package ships type
 * declarations only — Obsidian's app supplies the actual module at runtime.
 * Extend this as more tests need more of the surface.
 *
 * Constructors take 0 args to match obsidian.d.ts; tests assign `path` afterwards.
 */

export class TFile {
	path = "";
	name = "";
	extension = "";
	basename = "";
}

export class TFolder {
	path = "";
	name = "";
	children: Array<TFile | TFolder> = [];
}

function applyPath(obj: { path: string; name: string }, path: string): void {
	obj.path = path;
	obj.name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
}

export function makeTFile(path: string): TFile {
	const file = new TFile();
	applyPath(file, path);
	const base = file.name;
	file.extension = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
	file.basename = file.extension ? base.slice(0, -(file.extension.length + 1)) : base;
	return file;
}

export function makeTFolder(path: string): TFolder {
	const folder = new TFolder();
	applyPath(folder, path);
	return folder;
}

// Not real YAML — just a round-trip-consistent stand-in, sufficient for tests
// that only care about the parsed structure, not the on-disk text format.
export function parseYaml(raw: string): unknown {
	return raw ? JSON.parse(raw) : null;
}

export function stringifyYaml(data: unknown): string {
	return JSON.stringify(data);
}
