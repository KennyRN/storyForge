import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { pruneMissingChapterEntries, readBookFrontmatter, stripMissingChapterRefs } from "../book";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, bookFilePath, libraryBookPath, libraryChapterPath } from "../paths";
import { makeTFile, makeTFolder } from "./obsidianStub";

describe("stripMissingChapterRefs", () => {
	it("removes gone filenames from order, unplaced, archive, and the chapters map keys", () => {
		const next = stripMissingChapterRefs(
			["kept.md", "gone.md"],
			["unplaced-gone.md", "unplaced-kept.md"],
			["archived-gone.md", "archived-kept.md"],
			["kept.md", "gone.md", "unplaced-kept.md", "archived-kept.md", "orphan.md"],
			(name) => name.endsWith("-kept.md") || name === "kept.md",
		);
		expect(next.chapterOrder).toEqual(["kept.md"]);
		expect(next.unplaced).toEqual(["unplaced-kept.md"]);
		expect(next.archive).toEqual(["archived-kept.md"]);
		expect(next.chapterKeys).toEqual(["kept.md", "unplaced-kept.md", "archived-kept.md"]);
	});
});

function fakeBookApp(existingChapterFilenames: string[], initialFm: Record<string, unknown>) {
	const book = "BookA";
	const novelPath = bookFilePath(book);
	const bookFolderPath = libraryBookPath(book);
	const files = new Map<string, ReturnType<typeof makeTFile>>();
	const folders = new Map<string, ReturnType<typeof makeTFolder>>();
	folders.set(LIBRARY_ROOT, makeTFolder(LIBRARY_ROOT));
	folders.set(bookFolderPath, makeTFolder(bookFolderPath));
	folders.set(BACKSTAGE_ROOT, makeTFolder(BACKSTAGE_ROOT));
	folders.set(`${BACKSTAGE_ROOT}/${book}`, makeTFolder(`${BACKSTAGE_ROOT}/${book}`));
	files.set(novelPath, makeTFile(novelPath));
	for (const name of existingChapterFilenames) {
		files.set(libraryChapterPath(book, name), makeTFile(libraryChapterPath(book, name)));
	}
	folders.get(bookFolderPath)!.children = existingChapterFilenames.map((name) =>
		files.get(libraryChapterPath(book, name))!,
	);
	const frontmatter: Record<string, unknown> = { ...initialFm };

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => folders.get(path) ?? files.get(path) ?? null,
			createFolder: async () => undefined,
			create: async (path: string) => {
				const file = makeTFile(path);
				files.set(path, file);
				return file;
			},
		},
		metadataCache: {
			getCache: (path: string) => (path === novelPath ? { frontmatter } : null),
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === novelPath) fn(frontmatter);
			},
		},
	} as unknown as App;

	return { app, frontmatter };
}

describe("pruneMissingChapterEntries", () => {
	it("strips gone chapters from order, unplaced, archive, and the chapters map", async () => {
		const { app, frontmatter } = fakeBookApp(["kept.md", "archived-kept.md"], {
			"chapter-order": ["kept.md", "gone.md"],
			unplaced: ["unplaced-gone.md"],
			archive: ["archived-kept.md", "archived-gone.md"],
			chapters: {
				"kept.md": { "chapter-id": "c1", "chapter-title": "Kept" },
				"gone.md": { "chapter-id": "c2", "chapter-title": "Gone" },
				"archived-kept.md": { "chapter-id": "c3", "chapter-title": "Archived Kept" },
				"archived-gone.md": { "chapter-id": "c4", "chapter-title": "Archived Gone" },
			},
		});
		expect(await pruneMissingChapterEntries(app, "BookA")).toBe(true);
		expect(frontmatter["chapter-order"]).toEqual(["kept.md"]);
		expect(frontmatter.unplaced).toEqual([]);
		expect(frontmatter.archive).toEqual(["archived-kept.md"]);
		expect(Object.keys(frontmatter.chapters as object).sort()).toEqual(["archived-kept.md", "kept.md"]);
		expect(readBookFrontmatter(app, "BookA")?.archive).toEqual(["archived-kept.md"]);
	});

	it("no-ops when every referenced chapter file still exists", async () => {
		const { app, frontmatter } = fakeBookApp(["kept.md"], {
			"chapter-order": ["kept.md"],
			unplaced: [],
			archive: [],
			chapters: { "kept.md": { "chapter-id": "c1", "chapter-title": "Kept" } },
		});
		const before = JSON.stringify(frontmatter);
		expect(await pruneMissingChapterEntries(app, "BookA")).toBe(false);
		expect(JSON.stringify(frontmatter)).toBe(before);
	});
});
