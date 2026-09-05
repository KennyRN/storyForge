import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { pruneMissingCodexNotes, readCodexFrontmatter, rekeyCodexNotePath, stripMissingCodexNoteRefs } from "../codex";
import { CODEX_ROOT, BACKSTAGE_ROOT, codexFilePath } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

describe("stripMissingCodexNoteRefs", () => {
	it("removes gone files from root order, nested order, archive, types, and linkedNotePath", () => {
		const folders = {
			characters: {
				name: "Characters",
				order: ["Codex/Jane.md", "Codex/Gone.md"],
				linkedNotePath: "Codex/Crew.md",
			},
		};
		const next = stripMissingCodexNoteRefs(
			folders,
			["characters", "Codex/Gone.md", "Codex/Kept.md"],
			["Codex/ArchivedGone.md", "Codex/ArchivedKept.md"],
			{ "Codex/Jane.md": "person", "Codex/Gone.md": "place" },
			(path) => path === "Codex/Jane.md" || path === "Codex/Kept.md" || path === "Codex/ArchivedKept.md",
		);
		expect(next.order).toEqual(["characters", "Codex/Kept.md"]);
		expect(next.folders.characters.order).toEqual(["Codex/Jane.md"]);
		expect(next.folders.characters.linkedNotePath).toBeUndefined();
		expect(next.archive).toEqual(["Codex/ArchivedKept.md"]);
		expect(next.types).toEqual({ "Codex/Jane.md": "person" });
	});

	it("keeps virtual folder ids even when they have no remaining files", () => {
		const next = stripMissingCodexNoteRefs(
			{ empty: { name: "Empty", order: ["Codex/Gone.md"] } },
			["empty"],
			[],
			{},
			() => false,
		);
		expect(next.order).toEqual(["empty"]);
		expect(next.folders.empty.order).toEqual([]);
	});
});

function fakeCodexOrderApp(
	existingNotePaths: string[],
	initialFm: Record<string, unknown>,
	opts: { missingOnDisk?: string[] } = {},
) {
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Map<string, ReturnType<typeof makeTFolder>>();
	folders.set(CODEX_ROOT, makeTFolder(CODEX_ROOT));
	folders.set(BACKSTAGE_ROOT, makeTFolder(BACKSTAGE_ROOT));
	folders.set("_backstage", makeTFolder("_backstage"));
	const meta = codexFilePath();
	files.set(meta, makeTFile(meta));
	for (const path of existingNotePaths) files.set(path, makeTFile(path));
	const missing = new Set(opts.missingOnDisk ?? []);
	const frontmatter: Record<string, unknown> = { ...initialFm };

	const app = {
		vault: {
			adapter: {
				exists: async (path: string) => {
					if (missing.has(path)) return false;
					return files.has(path) || folders.has(path);
				},
			},
			getAbstractFileByPath: (path: string) => folders.get(path) ?? files.get(path) ?? null,
			createFolder: async () => undefined,
			create: async (path: string) => {
				const file = makeTFile(path);
				files.set(path, file);
				return file;
			},
		},
		metadataCache: {
			getCache: (path: string) => (path === meta ? { frontmatter } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === meta) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter };
}

describe("pruneMissingCodexNotes", () => {
	it("writes the stripped order back to codex.md", async () => {
		const { app, frontmatter } = fakeCodexOrderApp(["Codex/Kept.md"], {
			folders: {},
			order: ["Codex/Kept.md", "Codex/Gone.md"],
			archive: [],
			types: { "Codex/Kept.md": "person", "Codex/Gone.md": "place" },
		});
		expect(await pruneMissingCodexNotes(app)).toBe(true);
		expect(frontmatter.order).toEqual(["Codex/Kept.md"]);
		expect(frontmatter.types).toEqual({ "Codex/Kept.md": "person" });
		expect(readCodexFrontmatter(app).order).toEqual(["Codex/Kept.md"]);
	});

	it("no-ops when every referenced note still exists", async () => {
		const { app, frontmatter } = fakeCodexOrderApp(["Codex/Kept.md"], {
			folders: {},
			order: ["Codex/Kept.md"],
			archive: [],
			types: { "Codex/Kept.md": "person" },
		});
		const before = JSON.stringify(frontmatter);
		expect(await pruneMissingCodexNotes(app)).toBe(false);
		expect(JSON.stringify(frontmatter)).toBe(before);
	});

	it("strips notes still in the vault index after an external delete", async () => {
		const { app, frontmatter } = fakeCodexOrderApp(
			["Codex/Kept.md", "Codex/Gone.md"],
			{
				folders: {},
				order: ["Codex/Kept.md", "Codex/Gone.md"],
				archive: [],
				types: { "Codex/Kept.md": "person", "Codex/Gone.md": "place" },
			},
			{ missingOnDisk: ["Codex/Gone.md"] },
		);
		expect(await pruneMissingCodexNotes(app)).toBe(true);
		expect(frontmatter.order).toEqual(["Codex/Kept.md"]);
		expect(frontmatter.types).toEqual({ "Codex/Kept.md": "person" });
	});
});

describe("rekeyCodexNotePath", () => {
	it("strips a deleted note from order and types", async () => {
		const { app, frontmatter } = fakeCodexOrderApp(["Codex/Kept.md"], {
			folders: { characters: { name: "Characters", order: ["Codex/Jane.md", "Codex/Kept.md"] } },
			order: ["characters", "Codex/Jane.md"],
			archive: ["Codex/Jane.md"],
			types: { "Codex/Jane.md": "person", "Codex/Kept.md": "person" },
		});
		await rekeyCodexNotePath(app, "Codex/Jane.md", null);
		expect(frontmatter.order).toEqual(["characters"]);
		expect((frontmatter.folders as { characters: { order: string[] } }).characters.order).toEqual(["Codex/Kept.md"]);
		expect(frontmatter.archive).toEqual([]);
		expect(frontmatter.types).toEqual({ "Codex/Kept.md": "person" });
	});
});
