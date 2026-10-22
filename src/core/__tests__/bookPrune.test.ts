import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { pruneMissingChapterEntries, readBookFrontmatter, stripMissingChapterRefs } from "../book";
import { LIBRARY_ROOT, bookFilePath, libraryChapterPath } from "../paths";

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

async function bookWith(existingChapterFilenames: string[], initialFm: Record<string, unknown>) {
	const files: Record<string, string | null> = { [`${LIBRARY_ROOT}/BookA`]: null, [bookFilePath("BookA")]: fmFile(initialFm) };
	for (const name of existingChapterFilenames) files[libraryChapterPath("BookA", name)] = "text";
	return memoryProject(files);
}

describe("pruneMissingChapterEntries", () => {
	it("strips gone chapters from order, unplaced, archive, and the chapters map", async () => {
		const { project, fm } = await bookWith(["kept.md", "archived-kept.md"], {
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
		expect(await pruneMissingChapterEntries(project, "BookA")).toBe(true);
		const data = fm(bookFilePath("BookA"));
		expect(data["chapter-order"]).toEqual(["kept.md"]);
		expect(data.unplaced).toEqual([]);
		expect(data.archive).toEqual(["archived-kept.md"]);
		expect(Object.keys(data.chapters as object).sort()).toEqual(["archived-kept.md", "kept.md"]);
		expect(readBookFrontmatter(project, "BookA")?.archive).toEqual(["archived-kept.md"]);
	});

	it("no-ops (and writes nothing) when every referenced chapter file still exists", async () => {
		const { project, backend } = await bookWith(["kept.md"], {
			"chapter-order": ["kept.md"],
			unplaced: [],
			archive: [],
			chapters: { "kept.md": { "chapter-id": "c1", "chapter-title": "Kept" } },
		});
		const before = backend.files.get(bookFilePath("BookA"));
		backend.writes.length = 0;
		expect(await pruneMissingChapterEntries(project, "BookA")).toBe(false);
		expect(backend.files.get(bookFilePath("BookA"))).toBe(before);
		expect(backend.writes).toEqual([]);
	});
});
