import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

const created: string[] = [];

/** Copies a fixture project into a fresh temp directory and returns its path. Call cleanupFixtures() afterwards. */
export function copyFixture(name: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sf-fixture-${name}-`));
	fs.cpSync(path.join(FIXTURES_DIR, name), dir, { recursive: true });
	created.push(dir);
	return fs.realpathSync(dir);
}

export function cleanupFixtures(): void {
	for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
}

/** True when the temp file system treats names that differ only by case as the same file. */
export function fsIsCaseInsensitive(): boolean {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-case-"));
	try {
		fs.writeFileSync(path.join(dir, "a"), "x");
		return fs.existsSync(path.join(dir, "A"));
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Adds a Codex note whose name differs from `Codex/Jane.md` only by case. Returns false (and adds
 * nothing) on a case-insensitive file system, where such a project cannot exist on disk.
 */
export function addCaseCollision(root: string): boolean {
	if (fsIsCaseInsensitive()) return false;
	fs.writeFileSync(path.join(root, "Codex", "jane.md"), "---\naliases: []\n---\nlowercase twin\n");
	return true;
}

/** Adds a note whose name is stored decomposed (NFD). The file system may normalise it; returns the name as listed. */
export function addNfdName(root: string): string {
	const name = "Café Noir.md";
	fs.writeFileSync(path.join(root, "Codex", name), "---\naliases: []\n---\nNFD named note\n");
	return fs.readdirSync(path.join(root, "Codex")).find((n) => n.normalize("NFC") === name.normalize("NFC")) as string;
}

/** SHA-256 of every file's bytes under `root` (hidden files included), keyed by "/"-separated relative path. */
export function snapshot(root: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (rel: string) => {
		for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
			const childRel = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				out.set(childRel + "/", "dir");
				walk(childRel);
			} else if (entry.isFile()) {
				out.set(childRel, createHash("sha256").update(fs.readFileSync(path.join(root, childRel))).digest("hex"));
			}
		}
	};
	walk("");
	return out;
}

export interface SnapshotDiff {
	added: string[];
	removed: string[];
	changed: string[];
}

export function diffSnapshots(before: Map<string, string>, after: Map<string, string>): SnapshotDiff {
	const added = [...after.keys()].filter((k) => !before.has(k)).sort();
	const removed = [...before.keys()].filter((k) => !after.has(k)).sort();
	const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)).sort();
	return { added, removed, changed };
}
