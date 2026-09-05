import { describe, expect, it } from "vitest";
import {
	ForbiddenWriteError,
	assertBackstagePath,
	modifyBackstageFrontmatter,
	modifyCodexNoteAliases,
	normalizeVaultPath,
	writeBackstageFile,
	writeBackupText,
	writeExportText,
} from "../writeGuard";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, TITLEFORGE_BACKSTAGE_ROOT, bookFilePath, libraryChapterPath, seriesFilePath } from "../paths";
import { makeTFile } from "./obsidianStub";
import type { App, FrontMatterCache, TFile, Vault } from "obsidian";

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
		`${BACKSTAGE_ROOT}/TECa/story-details/ch1.md`,
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

describe("writeExportText", () => {
	it("creates text exports only under _export/", async () => {
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

		await writeExportText(vault, "_export/2026-08-28 - Cast.json", "{}");
		expect(created).toEqual(["_export/2026-08-28 - Cast.json"]);

		await expect(
			writeExportText(vault, "_export/nested/Cast.json", "{}"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(
			writeExportText(vault, "_export/../Codex/settings.json", "{}"),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});

describe("writeBackstageFile — cold-start index lag", () => {
	it("treats createFolder 'already exists' as success and still writes the file", async () => {
		const created: string[] = [];
		const vault = {
			getAbstractFileByPath: () => null,
			create: async (path: string) => {
				created.push(path);
				return makeTFile(path);
			},
			modify: async () => undefined,
			createFolder: async () => {
				throw new Error("Folder already exists.");
			},
		} as unknown as Vault;

		await writeBackstageFile(vault, `${TITLEFORGE_BACKSTAGE_ROOT}/lexicons/title-composer.json`, "{}");
		expect(created).toEqual([`${TITLEFORGE_BACKSTAGE_ROOT}/lexicons/title-composer.json`]);
	});

	it("modifies when create throws because the file already exists on disk", async () => {
		const file = makeTFile(`${TITLEFORGE_BACKSTAGE_ROOT}/settings.json`);
		const modified: string[] = [];
		let createCalls = 0;
		const vault = {
			getAbstractFileByPath: () => (createCalls > 0 ? file : null),
			create: async () => {
				createCalls += 1;
				throw new Error("File already exists.");
			},
			modify: async () => {
				modified.push("ok");
			},
			createFolder: async () => undefined,
		} as unknown as Vault;

		const result = await writeBackstageFile(vault, `${TITLEFORGE_BACKSTAGE_ROOT}/settings.json`, "{}");
		expect(result).toBe(file);
		expect(modified).toEqual(["ok"]);
	});
});

describe("modifyCodexNoteAliases", () => {
	function fakeCodexNote(
		path: string,
		initial: Record<string, unknown>,
	): {
		app: App;
		vault: Vault;
		frontmatter: Record<string, unknown>;
		processCalls: number;
		bodyWrites: number;
	} {
		const file = makeTFile(path);
		const frontmatter: Record<string, unknown> = { ...initial };
		let processCalls = 0;
		let bodyWrites = 0;
		const vault = {
			getAbstractFileByPath: (p: string) => (p === path ? file : null),
			modify: async () => {
				bodyWrites += 1;
			},
			create: async () => {
				throw new Error("unexpected create");
			},
		} as unknown as Vault;
		const app = {
			vault,
			fileManager: {
				processFrontMatter: async (_file: TFile, fn: (fm: FrontMatterCache) => void) => {
					processCalls += 1;
					fn(frontmatter as FrontMatterCache);
				},
			},
		} as unknown as App;
		return {
			app,
			vault,
			frontmatter,
			get processCalls() {
				return processCalls;
			},
			get bodyWrites() {
				return bodyWrites;
			},
		};
	}

	it("rewrites only the aliases key on a Codex note", async () => {
		const fake = fakeCodexNote("Codex/Arsenal.md", { book: "TECa", title: "keep me", aliases: ["A"] });
		await modifyCodexNoteAliases(fake.app, fake.vault, "Codex/Arsenal.md", (aliases) => [
			...aliases,
			"The Gunners",
		]);
		expect(fake.frontmatter).toEqual({ book: "TECa", title: "keep me", aliases: ["A", "The Gunners"] });
		expect(fake.processCalls).toBe(1);
		expect(fake.bodyWrites).toBe(0);
	});

	it("refuses non-Codex paths without touching frontmatter", async () => {
		const fake = fakeCodexNote("notes/Jane.md", { aliases: [] });
		await expect(
			modifyCodexNoteAliases(fake.app, fake.vault, "notes/Jane.md", (aliases) => [...aliases, "Gunners"]),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		await expect(
			modifyCodexNoteAliases(fake.app, fake.vault, `${LIBRARY_ROOT}/TECa/ch1.md`, (a) => a),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
		expect(fake.processCalls).toBe(0);
	});

	it("does not expose a general Codex frontmatter or body write", async () => {
		const file = makeTFile("Codex/Jane.md");
		const vault = {
			getAbstractFileByPath: () => file,
			modify: async () => undefined,
			create: async () => file,
			createFolder: async () => undefined,
		} as unknown as Vault;
		const app = {
			vault,
			fileManager: {
				processFrontMatter: async () => undefined,
			},
		} as unknown as App;

		await expect(writeBackstageFile(vault, "Codex/Jane.md", "stolen body")).rejects.toBeInstanceOf(
			ForbiddenWriteError,
		);
		await expect(
			modifyBackstageFrontmatter(app, vault, "Codex/Jane.md", "---\n---\n", (fm) => {
				fm.title = "nope";
			}),
		).rejects.toBeInstanceOf(ForbiddenWriteError);
	});
});
