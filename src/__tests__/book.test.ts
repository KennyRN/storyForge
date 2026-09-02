import { describe, expect, it } from "vitest";
import { type App } from "obsidian";
import { makeTFile, makeTFolder } from "./obsidianStub";
import { readBookFrontmatter, writeBookCoverImage, writeChapterLocation, writeChapterPlotThread, writeChapterPov, writeChapterTags, writeNovelTags, rekeyChapterLocationReferences, rekeyChapterPovReferences, parseCodexRefs } from "../book";
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
	const folderObjs = new Map<string, ReturnType<typeof makeTFolder>>();
	function folderFor(path: string): ReturnType<typeof makeTFolder> {
		let folder = folderObjs.get(path);
		if (!folder) {
			folder = makeTFolder(path);
			folderObjs.set(path, folder);
		}
		return folder;
	}
	folderFor(LIBRARY_ROOT).children = [folderFor(`${LIBRARY_ROOT}/${book}`)];
	const binaryFiles = new Set<string>();
	const trashedPaths: string[] = [];

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => {
				if (folders.has(path)) return folderFor(path);
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

describe("writeChapterPlotThread", () => {
	it("sets plot-thread and clears a leftover chapter-color", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: {
				"ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", "chapter-color": "#c41e3a" },
			},
		});
		await writeChapterPlotThread(app, "BookA", "ch1.md", "main-plot");
		const chapters = frontmatter.chapters as Record<string, Record<string, unknown>>;
		expect(chapters["ch1.md"]["plot-thread"]).toBe("main-plot");
		expect(chapters["ch1.md"]["chapter-color"]).toBeUndefined();
	});

	it("clears plot-thread when given null", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", "plot-thread": "main-plot" } },
		});
		await writeChapterPlotThread(app, "BookA", "ch1.md", null);
		const chapters = frontmatter.chapters as Record<string, Record<string, unknown>>;
		expect(chapters["ch1.md"]["plot-thread"]).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter's parseChaptersMap", async () => {
		const { app } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterPlotThread(app, "BookA", "ch1.md", "romance");
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].plotThreadId).toBe("romance");
	});

	it("defaults to null when unset", () => {
		const { app } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].plotThreadId).toBeNull();
	});
});

describe("parseCodexRefs", () => {
	it("reads a list of path/name objects", () => {
		expect(
			parseCodexRefs(
				[
					{ path: "Codex/Alice.md", name: "Alice" },
					{ path: "Codex/Bob.md", name: "Bob" },
				],
				undefined,
				undefined,
			),
		).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("zips parallel path/name string arrays", () => {
		expect(parseCodexRefs(undefined, ["Codex/Alice.md", "Codex/Bob.md"], ["Alice", "Bob"])).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("treats a single leftover object as a one-item list", () => {
		expect(parseCodexRefs({ path: "Codex/Alice.md", name: "Alice" }, undefined, undefined)).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
		]);
	});

	it("falls back to a leftover scalar path/name pair", () => {
		expect(parseCodexRefs(undefined, "Codex/Alice.md", "Alice")).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
		]);
	});

	it("uses the path as the name when the leftover name is missing", () => {
		expect(parseCodexRefs(undefined, "Codex/Alice.md", undefined)).toEqual([
			{ path: "Codex/Alice.md", name: "Codex/Alice.md" },
		]);
	});

	it("returns an empty array when nothing is set", () => {
		expect(parseCodexRefs(undefined, undefined, undefined)).toEqual([]);
	});
});

describe("chapter PoV and location lists", () => {
	it("parses parallel pov-path/pov-name arrays", () => {
		const { app } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": ["Codex/Alice.md", "Codex/Bob.md"],
					"pov-name": ["Alice", "Bob"],
				},
			},
		});
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
	});

	it("parses leftover scalar pov-path/pov-name into a one-item list", () => {
		const { app } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": "Codex/Alice.md",
					"pov-name": "Alice",
					"location-path": "Codex/Harbour.md",
					"location-name": "Harbour",
				},
			},
		});
		const chapter = readBookFrontmatter(app, "BookA")?.chapters["ch1.md"];
		expect(chapter?.pov).toEqual([{ path: "Codex/Alice.md", name: "Alice" }]);
		expect(chapter?.location).toEqual([{ path: "Codex/Harbour.md", name: "Harbour" }]);
	});

	it("parses the new pov/location lists", () => {
		const { app } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					pov: [
						{ path: "Codex/Alice.md", name: "Alice" },
						{ path: "Codex/Bob.md", name: "Bob" },
					],
					location: [{ path: "Codex/Harbour.md", name: "Harbour" }],
				},
			},
		});
		const chapter = readBookFrontmatter(app, "BookA")?.chapters["ch1.md"];
		expect(chapter?.pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
		expect(chapter?.location.map((r) => r.name)).toEqual(["Harbour"]);
	});

	it("writes parallel pov-path/pov-name arrays and keeps chapter identity", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": "Codex/Old.md",
					"pov-name": "Old",
				},
			},
		});
		await writeChapterPov(app, "BookA", "ch1.md", [
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
		const raw = (frontmatter.chapters as Record<string, Record<string, unknown>>)["ch1.md"];
		expect(raw["chapter-id"]).toBe("c1");
		expect(raw["chapter-title"]).toBe("Chapter One");
		expect(raw["pov-path"]).toEqual(["Codex/Alice.md", "Codex/Bob.md"]);
		expect(raw["pov-name"]).toEqual(["Alice", "Bob"]);
		expect(raw.pov).toBeUndefined();
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
	});

	it("clears pov by omitting the path/name keys", async () => {
		const { app, frontmatter } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": ["Codex/Alice.md"],
					"pov-name": ["Alice"],
				},
			},
		});
		await writeChapterPov(app, "BookA", "ch1.md", []);
		const raw = (frontmatter.chapters as Record<string, Record<string, unknown>>)["ch1.md"];
		expect(raw["pov-path"]).toBeUndefined();
		expect(raw["pov-name"]).toBeUndefined();
		expect(raw["chapter-title"]).toBe("Chapter One");
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].pov).toEqual([]);
	});

	it("writes location lists the same way", async () => {
		const { app } = makeFakeApp({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterLocation(app, "BookA", "ch1.md", [
			{ path: "Codex/Harbour.md", name: "Harbour" },
			{ path: "Codex/Keep.md", name: "Keep" },
		]);
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].location.map((r) => r.name)).toEqual([
			"Harbour",
			"Keep",
		]);
	});

	it("rekeys a matching PoV path inside the list and the book default", async () => {
		const { app } = makeFakeApp({
			"default-pov-path": "Codex/Alice.md",
			"default-pov-name": "Alice",
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					pov: [
						{ path: "Codex/Alice.md", name: "Alice" },
						{ path: "Codex/Bob.md", name: "Bob" },
					],
				},
			},
		});
		await rekeyChapterPovReferences(app, "Codex/Alice.md", "Codex/Alicia.md");
		const fm = readBookFrontmatter(app, "BookA");
		expect(fm?.defaultPovPath).toBe("Codex/Alicia.md");
		expect(fm?.chapters["ch1.md"].pov).toEqual([
			{ path: "Codex/Alicia.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("drops a PoV entry when the Codex note is gone", async () => {
		const { app } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					pov: [
						{ path: "Codex/Alice.md", name: "Alice" },
						{ path: "Codex/Bob.md", name: "Bob" },
					],
				},
			},
		});
		await rekeyChapterPovReferences(app, "Codex/Alice.md", null);
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].pov).toEqual([
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("rekeys a location path inside the list", async () => {
		const { app } = makeFakeApp({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					location: [{ path: "Codex/Harbour.md", name: "Harbour" }],
				},
			},
		});
		await rekeyChapterLocationReferences(app, "Codex/Harbour.md", "Codex/Port.md");
		expect(readBookFrontmatter(app, "BookA")?.chapters["ch1.md"].location).toEqual([
			{ path: "Codex/Port.md", name: "Harbour" },
		]);
	});
});
