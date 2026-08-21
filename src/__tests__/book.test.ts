import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { readBookFrontmatter, writeBookCoverImage, writeChapterTags, writeNovelTags } from "../book";
import { safeCoverFilename } from "../coverImage";
import { BACKSTAGE_ROOT, LIBRARY_ROOT, bookFilePath } from "../paths";

describe("safeCoverFilename", () => {
	it("accepts a plain basename", () => {
		expect(safeCoverFilename("cover.png")).toBe("cover.png");
	});

	it("rejects non-strings, empty, '.' and '..'", () => {
		expect(safeCoverFilename(undefined)).toBeNull();
		expect(safeCoverFilename(42)).toBeNull();
		expect(safeCoverFilename("")).toBeNull();
		expect(safeCoverFilename("   ")).toBeNull();
		expect(safeCoverFilename(".")).toBeNull();
		expect(safeCoverFilename("..")).toBeNull();
	});

	it("rejects any path separator or traversal segment", () => {
		expect(safeCoverFilename("../series.md")).toBeNull();
		expect(safeCoverFilename("../../_sf-backstage/BookB/novel.md")).toBeNull();
		expect(safeCoverFilename("sub/cover.png")).toBeNull();
		expect(safeCoverFilename("sub\\cover.png")).toBeNull();
	});

	it("rejects embedded null bytes", () => {
		expect(safeCoverFilename("cover.png\0.md")).toBeNull();
	});
});

// Fake App: a book folder ("BookA") whose novel.md frontmatter is a single mutable
// object shared between metadataCache.getCache and fileManager.processFrontMatter,
// mirroring the real Obsidian contract closely enough for modifyBackstageFrontmatter.
function makeFakeApp(initialFrontmatter: Record<string, unknown> = {}): {
	app: App;
	frontmatter: Record<string, unknown>;
	trashedPaths: string[];
	binaryFiles: Set<string>;
} {
	const book = "BookA";
	const novelPath = bookFilePath(book);
	const frontmatter: Record<string, unknown> = { ...initialFrontmatter };
	const folders = new Set<string>([LIBRARY_ROOT, `${LIBRARY_ROOT}/${book}`, BACKSTAGE_ROOT, `${BACKSTAGE_ROOT}/${book}`]);
	const binaryFiles = new Set<string>();
	const trashedPaths: string[] = [];

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (folders.has(path)) return makeTFolder(path);
				if (path === novelPath) return makeTFile(path);
				if (binaryFiles.has(path)) return makeTFile(path);
				return null;
			},
			create: async (path: string) => makeTFile(path),
			createBinary: async (path: string) => {
				binaryFiles.add(path);
				return makeTFile(path);
			},
			modifyBinary: async (path: { path: string }) => {
				binaryFiles.add(path.path);
			},
			modify: async () => {},
			createFolder: async (path: string) => {
				folders.add(path);
			},
		},
		metadataCache: {
			getCache: (path: string) => {
				if (path === novelPath) return { frontmatter };
				return null;
			},
		},
		fileManager: {
			processFrontMatter: async (file: { path: string }, fn: (fm: Record<string, unknown>) => void) => {
				if (file.path === novelPath) fn(frontmatter);
			},
			trashFile: async (file: { path: string }) => {
				trashedPaths.push(file.path);
				binaryFiles.delete(file.path);
			},
		},
	} as unknown as App;

	return { app, frontmatter, trashedPaths, binaryFiles };
}

describe("writeBookCoverImage", () => {
	it("writes cover.<ext> under the book's own backstage folder and records it in frontmatter", async () => {
		const { app, frontmatter } = makeFakeApp();
		const path = await writeBookCoverImage(app, "BookA", new ArrayBuffer(4), "PNG");
		expect(path).toBe(`${BACKSTAGE_ROOT}/BookA/cover.png`);
		expect(frontmatter["cover-image"]).toBe("cover.png");
	});

	it("falls back to png for an unsafe extension instead of joining it into the path", async () => {
		const { app } = makeFakeApp();
		const path = await writeBookCoverImage(app, "BookA", new ArrayBuffer(4), "png/../../evil");
		expect(path).toBe(`${BACKSTAGE_ROOT}/BookA/cover.png`);
	});

	it("deletes the previous cover file when the extension changes", async () => {
		const { app, trashedPaths, binaryFiles } = makeFakeApp({ "cover-image": "cover.png" });
		binaryFiles.add(`${BACKSTAGE_ROOT}/BookA/cover.png`);
		await writeBookCoverImage(app, "BookA", new ArrayBuffer(4), "jpg");
		expect(trashedPaths).toEqual([`${BACKSTAGE_ROOT}/BookA/cover.png`]);
	});

	it("never deletes outside the book's own backstage folder even with a hand-edited traversal cover-image", async () => {
		const { app, trashedPaths } = makeFakeApp({ "cover-image": "../../_backstage/storyforge/BookB/novel.md" });
		// A malicious cover-image must not survive the read...
		expect(readBookFrontmatter(app, "BookA")?.coverImage).toBeNull();
		// ...so replacing the cover must not attempt to delete anything at all.
		await writeBookCoverImage(app, "BookA", new ArrayBuffer(4), "png");
		expect(trashedPaths).toEqual([]);
	});

	it("never deletes outside the book's own backstage folder with a hand-edited '..' cover-image", async () => {
		const { app, trashedPaths } = makeFakeApp({ "cover-image": ".." });
		await writeBookCoverImage(app, "BookA", new ArrayBuffer(4), "png");
		expect(trashedPaths).toEqual([]);
	});
});

describe("writeChapterTags", () => {
	it("sets a chapter's tags while preserving its other fields", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", plot: "stuff happens" } },
		});
		await writeChapterTags(app, "BookA", "ch1.md", ["draft", "needs-review"]);
		const chapters = frontmatter.chapters as Record<string, Record<string, unknown>>;
		expect(chapters["ch1.md"]).toEqual({
			"chapter-id": "c1",
			"chapter-title": "Chapter One",
			plot: "stuff happens",
			tags: ["draft", "needs-review"],
		});
	});

	it("clears tags entirely (omits the key) when given an empty array", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", tags: ["draft"] } },
		});
		await writeChapterTags(app, "BookA", "ch1.md", []);
		const chapters = frontmatter.chapters as Record<string, Record<string, unknown>>;
		expect(chapters["ch1.md"].tags).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter's parseChaptersMap", async () => {
		const { app } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterTags(app, "BookA", "ch1.md", ["draft"]);
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].tags).toEqual(["draft"]);
	});

	it("defaults to an empty array for a chapter with no tags key at all", () => {
		const { app } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].tags).toEqual([]);
	});
});

describe("writeNovelTags", () => {
	it("sets novel-tags (not the bare 'tags' key, to avoid colliding with Obsidian's native tag frontmatter)", async () => {
		const { app, frontmatter } = makeFakeApp();
		await writeNovelTags(app, "BookA", ["needs-cover", "on-hold"]);
		expect(frontmatter["novel-tags"]).toEqual(["needs-cover", "on-hold"]);
		expect(frontmatter.tags).toBeUndefined();
	});

	it("clears novel-tags when given an empty array", async () => {
		const { app, frontmatter } = makeFakeApp({ "novel-tags": ["on-hold"] });
		await writeNovelTags(app, "BookA", []);
		expect(frontmatter["novel-tags"]).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter", async () => {
		const { app } = makeFakeApp();
		await writeNovelTags(app, "BookA", ["needs-cover"]);
		expect(readBookFrontmatter(app, "BookA")?.novelTags).toEqual(["needs-cover"]);
	});

	it("defaults to an empty array when unset", () => {
		const { app } = makeFakeApp();
		expect(readBookFrontmatter(app, "BookA")?.novelTags).toEqual([]);
	});
});
