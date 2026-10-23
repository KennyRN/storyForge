import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import {
	parseCodexRefs,
	readBookFrontmatter,
	rekeyChapterLocationReferences,
	rekeyChapterPovReferences,
	writeBookCoverImage,
	writeChapterLocation,
	writeChapterPlotThread,
	writeChapterPov,
	writeChapterTags,
	writeNovelTags,
} from "../book";
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

const BOOK = "BookA";
const NOVEL = bookFilePath(BOOK);

/** A project with one book folder whose novel file has the given frontmatter, plus any extra files. */
async function makeBook(initialFrontmatter: Record<string, unknown> = {}, extraFiles: Record<string, string | Uint8Array | null> = {}) {
	const mp = await memoryProject({
		[`${LIBRARY_ROOT}/${BOOK}`]: null,
		[NOVEL]: fmFile(initialFrontmatter),
		...extraFiles,
	});
	const chapters = () => mp.fm(NOVEL).chapters as Record<string, Record<string, unknown>>;
	return { ...mp, frontmatter: () => mp.fm(NOVEL), chapters };
}

describe("writeBookCoverImage", () => {
	it("writes cover.<ext> under the book's own backstage folder and records it in frontmatter", async () => {
		const { project, frontmatter, backend } = await makeBook();
		const path = await writeBookCoverImage(project, BOOK, new ArrayBuffer(4), "PNG");
		expect(path).toBe(`${BACKSTAGE_ROOT}/BookA/cover.png`);
		expect(frontmatter()["cover-image"]).toBe("cover.png");
		expect(backend.files.has(path)).toBe(true);
	});

	it("falls back to png for an unsafe extension instead of joining it into the path", async () => {
		const { project } = await makeBook();
		const path = await writeBookCoverImage(project, BOOK, new ArrayBuffer(4), "png/../../evil");
		expect(path).toBe(`${BACKSTAGE_ROOT}/BookA/cover.png`);
	});

	it("retires the previous cover file when the extension changes", async () => {
		const { project, trashed } = await makeBook(
			{ "cover-image": "cover.png" },
			{ [`${BACKSTAGE_ROOT}/BookA/cover.png`]: new Uint8Array([1, 2, 3, 4]) },
		);
		await writeBookCoverImage(project, BOOK, new ArrayBuffer(4), "jpg");
		expect(trashed()).toEqual([`.trash/${BACKSTAGE_ROOT}/BookA/cover.png`]);
	});

	it("never retires outside the book's own backstage folder even with a hand-edited traversal cover-image", async () => {
		const { project, trashed } = await makeBook({ "cover-image": "../../_backstage/storyforge/BookB/novel.md" });
		// A malicious cover-image must not survive the read...
		expect(readBookFrontmatter(project, BOOK)?.coverImage).toBeNull();
		// ...so replacing the cover must not attempt to remove anything at all.
		await writeBookCoverImage(project, BOOK, new ArrayBuffer(4), "png");
		expect(trashed()).toEqual([]);
	});

	it("never retires outside the book's own backstage folder with a hand-edited '..' cover-image", async () => {
		const { project, trashed } = await makeBook({ "cover-image": ".." });
		await writeBookCoverImage(project, BOOK, new ArrayBuffer(4), "png");
		expect(trashed()).toEqual([]);
	});
});

describe("writeChapterTags", () => {
	it("sets a chapter's tags while preserving its other fields", async () => {
		const { project, chapters } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", plot: "stuff happens" } },
		});
		await writeChapterTags(project, BOOK, "ch1.md", ["draft", "needs-review"]);
		expect(chapters()["ch1.md"]).toEqual({
			"chapter-id": "c1",
			"chapter-title": "Chapter One",
			plot: "stuff happens",
			tags: ["draft", "needs-review"],
		});
	});

	it("clears tags entirely (omits the key) when given an empty array", async () => {
		const { project, chapters } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", tags: ["draft"] } },
		});
		await writeChapterTags(project, BOOK, "ch1.md", []);
		expect(chapters()["ch1.md"].tags).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter's parseChaptersMap", async () => {
		const { project } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterTags(project, BOOK, "ch1.md", ["draft"]);
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].tags).toEqual(["draft"]);
	});

	it("defaults to an empty array for a chapter with no tags key at all", async () => {
		const { project } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].tags).toEqual([]);
	});
});

describe("writeNovelTags", () => {
	it("sets novel-tags (not the bare 'tags' key, to avoid colliding with Obsidian's native tag frontmatter)", async () => {
		const { project, frontmatter } = await makeBook();
		await writeNovelTags(project, BOOK, ["needs-cover", "on-hold"]);
		expect(frontmatter()["novel-tags"]).toEqual(["needs-cover", "on-hold"]);
		expect(frontmatter().tags).toBeUndefined();
	});

	it("clears novel-tags when given an empty array", async () => {
		const { project, frontmatter } = await makeBook({ "novel-tags": ["on-hold"] });
		await writeNovelTags(project, BOOK, []);
		expect(frontmatter()["novel-tags"]).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter", async () => {
		const { project } = await makeBook();
		await writeNovelTags(project, BOOK, ["needs-cover"]);
		expect(readBookFrontmatter(project, BOOK)?.novelTags).toEqual(["needs-cover"]);
	});

	it("defaults to an empty array when unset", async () => {
		const { project } = await makeBook();
		expect(readBookFrontmatter(project, BOOK)?.novelTags).toEqual([]);
	});
});

describe("writeChapterPlotThread", () => {
	it("sets plot-thread and clears a leftover chapter-color", async () => {
		const { project, chapters } = await makeBook({
			chapters: {
				"ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", "chapter-color": "#c41e3a" },
			},
		});
		await writeChapterPlotThread(project, BOOK, "ch1.md", "main-plot");
		expect(chapters()["ch1.md"]["plot-thread"]).toBe("main-plot");
		expect(chapters()["ch1.md"]["chapter-color"]).toBeUndefined();
	});

	it("clears plot-thread when given null", async () => {
		const { project, chapters } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One", "plot-thread": "main-plot" } },
		});
		await writeChapterPlotThread(project, BOOK, "ch1.md", null);
		expect(chapters()["ch1.md"]["plot-thread"]).toBeUndefined();
	});

	it("round-trips through readBookFrontmatter's parseChaptersMap", async () => {
		const { project } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterPlotThread(project, BOOK, "ch1.md", "romance");
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].plotThreadId).toBe("romance");
	});

	it("defaults to null when unset", async () => {
		const { project } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].plotThreadId).toBeNull();
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
		expect(parseCodexRefs(undefined, "Codex/Alice.md", "Alice")).toEqual([{ path: "Codex/Alice.md", name: "Alice" }]);
	});

	it("uses the path as the name when the leftover name is missing", () => {
		expect(parseCodexRefs(undefined, "Codex/Alice.md", undefined)).toEqual([{ path: "Codex/Alice.md", name: "Codex/Alice.md" }]);
	});

	it("returns an empty array when nothing is set", () => {
		expect(parseCodexRefs(undefined, undefined, undefined)).toEqual([]);
	});

	it("reads the encoded v1 scalar used on disk", () => {
		expect(parseCodexRefs("v1;Codex%2FAlice.md=Alice&Codex%2FBob.md=Bob", undefined, undefined)).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("reads a leftover JSON-stringified list", () => {
		expect(
			parseCodexRefs(
				JSON.stringify([
					{ path: "Codex/Alice.md", name: "Alice" },
					{ path: "Codex/Bob.md", name: "Bob" },
				]),
				undefined,
				undefined,
			),
		).toEqual([
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});
});

describe("chapter PoV and location lists", () => {
	it("parses encoded pov/location scalars", async () => {
		const { project } = await makeBook({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					pov: "v1;Codex%2FAlice.md=Alice&Codex%2FBob.md=Bob",
					location: "v1;Codex%2FHarbour.md=Harbour",
				},
			},
		});
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].location.map((r) => r.name)).toEqual(["Harbour"]);
	});

	it("parses parallel pov-path/pov-name arrays", async () => {
		const { project } = await makeBook({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": ["Codex/Alice.md", "Codex/Bob.md"],
					"pov-name": ["Alice", "Bob"],
				},
			},
		});
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
	});

	it("parses leftover scalar pov-path/pov-name into a one-item list", async () => {
		const { project } = await makeBook({
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
		const chapter = readBookFrontmatter(project, BOOK)?.chapters["ch1.md"];
		expect(chapter?.pov).toEqual([{ path: "Codex/Alice.md", name: "Alice" }]);
		expect(chapter?.location).toEqual([{ path: "Codex/Harbour.md", name: "Harbour" }]);
	});

	it("parses the new pov/location lists", async () => {
		const { project } = await makeBook({
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
		const chapter = readBookFrontmatter(project, BOOK)?.chapters["ch1.md"];
		expect(chapter?.pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
		expect(chapter?.location.map((r) => r.name)).toEqual(["Harbour"]);
	});

	it("writes an encoded scalar, drops the legacy keys and keeps the rest of the chapter entry", async () => {
		const { project, chapters } = await makeBook({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": "Codex/Old.md",
					"pov-name": "Old",
					"x-unknown": "kept",
				},
			},
		});
		await writeChapterPov(project, BOOK, "ch1.md", [
			{ path: "Codex/Alice.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
		const raw = chapters()["ch1.md"];
		expect(raw["chapter-id"]).toBe("c1");
		expect(raw["chapter-title"]).toBe("Chapter One");
		expect(raw["x-unknown"]).toBe("kept");
		expect(raw.pov).toBe("v1;Codex%2FAlice.md=Alice&Codex%2FBob.md=Bob");
		expect(raw["pov-path"]).toBeUndefined();
		expect(raw["pov-name"]).toBeUndefined();
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].pov.map((r) => r.name)).toEqual(["Alice", "Bob"]);
	});

	it("clears pov by omitting the encoded key", async () => {
		const { project, chapters } = await makeBook({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					"pov-path": ["Codex/Alice.md"],
					"pov-name": ["Alice"],
				},
			},
		});
		await writeChapterPov(project, BOOK, "ch1.md", []);
		const raw = chapters()["ch1.md"];
		expect(raw.pov).toBeUndefined();
		expect(raw["pov-path"]).toBeUndefined();
		expect(raw["pov-name"]).toBeUndefined();
		expect(raw["chapter-title"]).toBe("Chapter One");
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].pov).toEqual([]);
	});

	it("writes location lists the same way", async () => {
		const { project, chapters } = await makeBook({
			chapters: { "ch1.md": { "chapter-id": "c1", "chapter-title": "Chapter One" } },
		});
		await writeChapterLocation(project, BOOK, "ch1.md", [
			{ path: "Codex/Harbour.md", name: "Harbour" },
			{ path: "Codex/Keep.md", name: "Keep" },
		]);
		expect(chapters()["ch1.md"].location).toBe("v1;Codex%2FHarbour.md=Harbour&Codex%2FKeep.md=Keep");
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].location.map((r) => r.name)).toEqual(["Harbour", "Keep"]);
	});

	it("rekeys a matching PoV path inside the list and the book default", async () => {
		const { project } = await makeBook({
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
		await rekeyChapterPovReferences(project, "Codex/Alice.md", "Codex/Alicia.md");
		const fm = readBookFrontmatter(project, BOOK);
		expect(fm?.defaultPovPath).toBe("Codex/Alicia.md");
		expect(fm?.chapters["ch1.md"].pov).toEqual([
			{ path: "Codex/Alicia.md", name: "Alice" },
			{ path: "Codex/Bob.md", name: "Bob" },
		]);
	});

	it("drops a PoV entry when the Codex note is gone", async () => {
		const { project } = await makeBook({
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
		await rekeyChapterPovReferences(project, "Codex/Alice.md", null);
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].pov).toEqual([{ path: "Codex/Bob.md", name: "Bob" }]);
	});

	it("rekeys a location path inside the list", async () => {
		const { project } = await makeBook({
			chapters: {
				"ch1.md": {
					"chapter-id": "c1",
					"chapter-title": "Chapter One",
					location: [{ path: "Codex/Harbour.md", name: "Harbour" }],
				},
			},
		});
		await rekeyChapterLocationReferences(project, "Codex/Harbour.md", "Codex/Port.md");
		expect(readBookFrontmatter(project, BOOK)?.chapters["ch1.md"].location).toEqual([{ path: "Codex/Port.md", name: "Harbour" }]);
	});
});
