import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import {
	createCodexNote,
	evictMissingCodexNotes,
	renameCodexNoteFile,
	sanitizeCodexBasename,
	uniqueCodexFilename,
} from "../codex";
import { CODEX_ROOT } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

function fakeCodexApp(
	existingPaths: string[] = [],
	opts: { missingOnDisk?: string[]; existsLiesFor?: string[] } = {},
): {
	app: App;
	created: string[];
	renamed: Array<[string, string]>;
	deleted: string[];
} {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	for (const path of existingPaths) files.set(path, makeTFile(path));
	const disk = new Set(existingPaths.filter((p) => !(opts.missingOnDisk ?? []).includes(p)));
	const created: string[] = [];
	const renamed: Array<[string, string]> = [];
	const deleted: string[] = [];
	const root = makeTFolder(CODEX_ROOT);
	const syncRootChildren = () => {
		root.children = [...files.values()].filter((f) => f.path.startsWith(`${CODEX_ROOT}/`));
	};
	syncRootChildren();
	const app = {
		vault: {
			adapter: {
				exists: async (path: string) => disk.has(path) || (opts.existsLiesFor ?? []).includes(path),
				list: async (path: string) => {
					if (path !== CODEX_ROOT) return { files: [], folders: [] };
					return {
						files: [...disk].filter((p) => p.startsWith(`${CODEX_ROOT}/`)),
						folders: [],
					};
				},
			},
			getAbstractFileByPath: (path: string) => {
				if (path === CODEX_ROOT) return root;
				return files.get(path) ?? null;
			},
			createFolder: async () => undefined,
			create: async (path: string) => {
				created.push(path);
				const file = makeTFile(path);
				files.set(path, file);
				disk.add(path);
				syncRootChildren();
				return file;
			},
			delete: async (file: { path: string }) => {
				deleted.push(file.path);
				files.delete(file.path);
				disk.delete(file.path);
				syncRootChildren();
			},
		},
		fileManager: {
			processFrontMatter: async () => undefined,
			renameFile: async (file: { path: string }, dest: string) => {
				renamed.push([file.path, dest]);
				files.delete(file.path);
				disk.delete(file.path);
				file.path = dest;
				files.set(dest, file as ReturnType<typeof makeTFile>);
				disk.add(dest);
				syncRootChildren();
			},
		},
	} as unknown as App;
	return { app, created, renamed, deleted };
}

describe("sanitizeCodexBasename", () => {
	it("keeps a plain title", () => {
		expect(sanitizeCodexBasename("Ada Lovelace")).toBe("Ada Lovelace");
	});

	it("strips path separators and traversal", () => {
		expect(sanitizeCodexBasename("../Library/ch")).toBe("Librarych");
		expect(sanitizeCodexBasename("foo/bar.md")).toBe("foobar");
		expect(sanitizeCodexBasename("..\\outside")).toBe("outside");
	});

	it("rejects empty, dot, and double-dot names", () => {
		expect(sanitizeCodexBasename("")).toBe("");
		expect(sanitizeCodexBasename("...")).toBe("");
		expect(sanitizeCodexBasename("..")).toBe("");
		expect(sanitizeCodexBasename(".")).toBe("");
		expect(sanitizeCodexBasename("   ")).toBe("");
	});
});

describe("uniqueCodexFilename", () => {
	it("falls back to New Note when the name sanitizes to empty", async () => {
		const { app } = fakeCodexApp();
		expect(await uniqueCodexFilename(app, "../")).toBe("New Note.md");
		expect(await uniqueCodexFilename(app, "..")).toBe("New Note.md");
	});

	it("disambiguates collisions", async () => {
		const { app } = fakeCodexApp([`${CODEX_ROOT}/Ada.md`]);
		expect(await uniqueCodexFilename(app, "Ada")).toBe("Ada 2.md");
	});

	it("reuses a name whose markdown was deleted outside Obsidian", async () => {
		const { app, deleted } = fakeCodexApp([`${CODEX_ROOT}/Berwyn.md`], {
			missingOnDisk: [`${CODEX_ROOT}/Berwyn.md`],
		});
		expect(await uniqueCodexFilename(app, "Berwyn")).toBe("Berwyn.md");
		expect(deleted).toEqual([`${CODEX_ROOT}/Berwyn.md`]);
	});

	it("reuses a name even when adapter.exists still reports the ghost", async () => {
		const { app } = fakeCodexApp([`${CODEX_ROOT}/Berwyn.md`], {
			missingOnDisk: [`${CODEX_ROOT}/Berwyn.md`],
			existsLiesFor: [`${CODEX_ROOT}/Berwyn.md`],
		});
		expect(await uniqueCodexFilename(app, "Berwyn")).toBe("Berwyn.md");
	});
});

describe("evictMissingCodexNotes", () => {
	it("removes vault-index ghosts under Codex/", async () => {
		const { app, deleted } = fakeCodexApp(
			[`${CODEX_ROOT}/Kept.md`, `${CODEX_ROOT}/Gone.md`],
			{ missingOnDisk: [`${CODEX_ROOT}/Gone.md`] },
		);
		expect(await evictMissingCodexNotes(app)).toEqual([`${CODEX_ROOT}/Gone.md`]);
		expect(deleted).toEqual([`${CODEX_ROOT}/Gone.md`]);
		expect(app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Gone.md`)).toBeNull();
		expect(app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Kept.md`)).toBeInstanceOf(TFile);
	});
});

describe("createCodexNote / renameCodexNoteFile", () => {
	it("never creates a note outside Codex/ even with a traversal filename", async () => {
		const { app, created } = fakeCodexApp();
		await createCodexNote(app, null, { filename: "../Library/secret.md" });
		expect(created.some((p) => p.startsWith(`${CODEX_ROOT}/`))).toBe(true);
		expect(created.every((p) => p.startsWith(`${CODEX_ROOT}/`) || p.includes("codex.md") || p.includes("backstage"))).toBe(
			true,
		);
		expect(created.some((p) => p.includes(".."))).toBe(false);
	});

	it("refuses to rename a Codex note out of Codex/", async () => {
		const { app, renamed } = fakeCodexApp([`${CODEX_ROOT}/Ada.md`]);
		const file = app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Ada.md`) as unknown as ReturnType<typeof makeTFile>;
		await renameCodexNoteFile(app, file as never, "../Library/stolen");
		expect(renamed).toHaveLength(1);
		expect(renamed[0][1].startsWith(`${CODEX_ROOT}/`)).toBe(true);
		expect(renamed[0][1].includes("..")).toBe(false);
	});

	it("renames Berwyn 2 back to Berwyn when the unnumbered file is only a ghost", async () => {
		const { app, renamed } = fakeCodexApp([`${CODEX_ROOT}/Berwyn.md`, `${CODEX_ROOT}/Berwyn 2.md`], {
			missingOnDisk: [`${CODEX_ROOT}/Berwyn.md`],
			existsLiesFor: [`${CODEX_ROOT}/Berwyn.md`],
		});
		const file = app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Berwyn 2.md`) as unknown as ReturnType<typeof makeTFile>;
		await renameCodexNoteFile(app, file as never, "Berwyn");
		expect(renamed).toEqual([[`${CODEX_ROOT}/Berwyn 2.md`, `${CODEX_ROOT}/Berwyn.md`]]);
	});

	it("does not bump Berwyn 2 to Berwyn 3 when Berwyn.md is still a real file", async () => {
		const { app, renamed } = fakeCodexApp([`${CODEX_ROOT}/Berwyn.md`, `${CODEX_ROOT}/Berwyn 2.md`]);
		const file = app.vault.getAbstractFileByPath(`${CODEX_ROOT}/Berwyn 2.md`) as unknown as ReturnType<typeof makeTFile>;
		await renameCodexNoteFile(app, file as never, "Berwyn");
		expect(renamed).toEqual([]);
		expect(file.path).toBe(`${CODEX_ROOT}/Berwyn 2.md`);
	});
});
