import { describe, expect, it } from "vitest";
import {
	ForbiddenWriteError,
	assertBackstagePath,
	normalizeVaultPath,
	writeBackstageFile,
	writeBackupText,
} from "../writeGuard";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, TITLEFORGE_BACKSTAGE_ROOT, bookFilePath, libraryChapterPath, seriesFilePath } from "../paths";
import { makeTFile } from "./obsidianStub";
import type { Vault } from "obsidian";

describe("normalizeVaultPath", () => {
	it("collapses . segments and trailing slashes", () => {
		expect(normalizeVaultPath(`${BACKSTAGE_ROOT}/./series.md`)).toBe(`${BACKSTAGE_ROOT}/series.md`);
		expect(normalizeVaultPath(`${BACKSTAGE_ROOT}/`)).toBe(BACKSTAGE_ROOT);
	});

	it("rejects absolute paths and null bytes", () => {
		expect(() => normalizeVaultPath(`/${BACKSTAGE_ROOT}/series.md`)).toThrow(ForbiddenWriteError);
		expect(() => normalizeVaultPath(`${BACKSTAGE_ROOT}/series.md\0.md`)).toThrow(ForbiddenWriteError);
	});

	it("rejects escape-above-root via ..", () => {
		expect(() => normalizeVaultPath("..")).toThrow(ForbiddenWriteError);
		// BACKSTAGE_ROOT is two segments deep now, so it takes three ".." to run past an empty root.
		expect(() => normalizeVaultPath(`${BACKSTAGE_ROOT}/../../../etc/passwd`)).toThrow(ForbiddenWriteError);
	});
});

describe("assertBackstagePath — adversarial", () => {
	const allowed = [
		BACKSTAGE_ROOT,
		`${BACKSTAGE_ROOT}/settings-presets/x.json`,
		`${BACKSTAGE_ROOT}/TECa/cover.png`,
		`${BACKSTAGE_ROOT}/TECa/chapters/ch1.md`,
		`${BACKSTAGE_ROOT}/TECa/recommend/ch1.md`,
		// titleForge's own sibling region under the shared _backstage/ parent.
		TITLEFORGE_BACKSTAGE_ROOT,
		`${TITLEFORGE_BACKSTAGE_ROOT}/settings.json`,
		`${TITLEFORGE_BACKSTAGE_ROOT}/lexicons/title-composer.json`,
		`${TITLEFORGE_BACKSTAGE_ROOT}/history/title-composer.jsonl`,
		// The narrow library-root exception: series.md and novel-<code>.md describe
		// the manuscripts without being manuscript prose themselves.
		seriesFilePath(),
		bookFilePath("TECa"),
		// General library-root file allowance: any flat file directly at the
		// root, not just the two named ones above (still requires an
		// extension — see isLibraryRootFilePath's doc comment).
		`${LIBRARY_ROOT}/not-a-novel.md`,
		`${LIBRARY_ROOT}/index.json`,
	];
	const forbidden = [
		`${LIBRARY_ROOT}/TECa/ch1.md`,
		libraryChapterPath("TECa", "ch1.md"),
		"Codex/Jane.md",
		LIBRARY_ROOT,
		"Codex",
		// A bare book-code folder itself (no extension) is never mistaken for
		// an allowed root file — that folder, and everything in it, stays
		// write-guard protected (nextNovelCode codes never contain a ".").
		`${LIBRARY_ROOT}/novel-TECa`,
		`${LIBRARY_ROOT}/TECa`,
		// Traversal that genuinely clears BACKSTAGE_ROOT's two segments and lands in the library.
		`${BACKSTAGE_ROOT}/../../${LIBRARY_ROOT}/TECa/ch1.md`,
		`${BACKSTAGE_ROOT}/foo/../../../Codex/Jane.md`,
		`${BACKSTAGE_ROOT}/../../Codex/Jane.md`,
		`${BACKSTAGE_ROOT}_evil/x.md`,
		`foo/${BACKSTAGE_ROOT}/x.md`,
		`${BACKSTAGE_ROOT.toUpperCase()}/series.md`,
	];

	it.each(allowed)("allows %s", (path) => {
		expect(() => assertBackstagePath(path)).not.toThrow();
	});

	it.each(forbidden)("forbids %s", (path) => {
		expect(() => assertBackstagePath(path)).toThrow(ForbiddenWriteError);
	});
});

describe("writeBackstageFile — refuses library/codex before touching vault", () => {
	it("does not call vault.create for a traversal escape into the library", async () => {
		const calls: string[] = [];
		const vault = {
			getAbstractFileByPath: () => null,
			create: async (path: string) => {
				calls.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async () => undefined,
		} as unknown as Vault;

		await expect(
			writeBackstageFile(vault, `${BACKSTAGE_ROOT}/../../${LIBRARY_ROOT}/BOOK/ch.md`, "stolen"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		expect(calls).toEqual([]);
	});
});

describe("writeBackstageFile — creates a brand-new flat library-root file", () => {
	it("does not treat LIBRARY_ROOT-as-parent as a forbidden write target (regression: adding a book)", async () => {
		// LIBRARY_ROOT itself already exists (ensureEagerFolders creates it at plugin load) but the
		// new book's novel-<code>.md does not yet — the exact shape of createBook's first write to a
		// never-before-seen novel.md, which used to throw ForbiddenWriteError("_story-library") from
		// ensureParentFolder trying (and failing) to "ensure" the library root as if it were a
		// backstage path.
		const created: string[] = [];
		const vault = {
			getAbstractFileByPath: (path: string) => (path === LIBRARY_ROOT ? { path } : null),
			create: async (path: string) => {
				created.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async () => undefined,
		} as unknown as Vault;

		await writeBackstageFile(vault, bookFilePath("TECb"), "---\n---\n");
		expect(created).toEqual([bookFilePath("TECb")]);
	});
});

describe("writeBackupText", () => {
	it("creates text exports only under the backup folder", async () => {
		const created: string[] = [];
		const folders = new Set<string>();
		const vault = {
			getAbstractFileByPath: (path: string) => (folders.has(path) ? { path } : null),
			create: async (path: string) => {
				created.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async (path: string) => {
				folders.add(path);
			},
		} as unknown as Vault;

		await writeBackupText(vault, "_sf-backup/formatForge settings.json", "{}");
		expect(created).toEqual(["_sf-backup/formatForge settings.json"]);

		await expect(
			writeBackupText(vault, "_sf-backup/../Codex/settings.json", "{}"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
