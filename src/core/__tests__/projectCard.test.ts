import { describe, expect, it } from "vitest";
import { finishCard, planCard, type PeekBook, type PeekResult } from "../projectCard";

const cover = (filename: string) => ({ filename, base64: "AAAA" });
const peek = (over: Partial<PeekResult> = {}): PeekResult => ({
	exists: true,
	hasLibrary: true,
	projectMd: null,
	seriesMd: "---\nseries-title: The Lantern Cycle\norder:\n  - bbb\n  - aaa\nbooks:\n  aaa:\n    book-id: b1\n    book-title: Harbour\n  bbb:\n    book-id: b2\n    book-title: Marsh\n---\n",
	bookFolders: ["aaa", "bbb", "ccc"],
	seriesCover: null,
	...over,
});

describe("the project card", () => {
	it("a folder that is gone says so, and a folder with no _story-library is not a project; both keep the folder's name and no image", () => {
		expect(planCard(peek({ exists: false, hasLibrary: false }), "Old")).toMatchObject({ state: "not-found", name: "Old", cover: null, needsBook: false });
		expect(planCard(peek({ hasLibrary: false }), "Notes")).toMatchObject({ state: "not-a-project", name: "Notes", cover: null });
	});

	it("a series project is named by its series title; a single-novel project by its book's title (the first placed book)", () => {
		expect(planCard(peek(), "folder").name).toBe("The Lantern Cycle");
		const standalone = planCard(peek({ projectMd: "---\nstory-kind: standalone\n---\n" }), "folder");
		expect(standalone.name).toBe("Marsh"); // order puts bbb first
		expect(standalone.firstBook).toEqual({ position: 1, folder: "bbb" });
	});

	it("an unreadable, empty or missing title falls back to the folder's name, never a failure", () => {
		expect(planCard(peek({ seriesMd: "---\nseries-title: [unclosed\n---\n" }), "folder").name).toBe("folder");
		expect(planCard(peek({ seriesMd: "---\nseries-title: \"  \"\n---\n" }), "folder").name).toBe("folder");
		expect(planCard(peek({ seriesMd: null, projectMd: "garbage" }), "folder")).toMatchObject({ name: "folder", state: "ok", firstBook: null }); // no order: no book is placed, so there is no first one
		expect(planCard(peek({ seriesMd: "no frontmatter at all" }), "folder").name).toBe("folder");
	});

	it("the image order: the series cover, else the first novel's cover, else none", () => {
		const withSeries = peek({ seriesMd: "---\nseries-title: S\ncover-image: cover.png\norder:\n  - aaa\n---\n", seriesCover: cover("cover.png") });
		const a = planCard(withSeries, "f");
		expect(a.cover?.filename).toBe("cover.png");
		expect(a.needsBook).toBe(false); // the book is asked about only when the series has no cover
		const none = planCard(peek({ seriesMd: "---\nseries-title: S\norder:\n  - aaa\n---\n" }), "f");
		expect(none).toMatchObject({ cover: null, needsBook: true });
		const book: PeekBook = { folder: "aaa", novelMd: "---\ncover-image: cover.jpg\n---\n", cover: cover("cover.jpg") };
		expect(finishCard(none, book).cover?.filename).toBe("cover.jpg");
		expect(finishCard(none, null).cover).toBeNull();
	});

	it("a recorded cover whose file is missing, or isn't the recorded one, counts as no cover", () => {
		const recordedOnly = peek({ seriesMd: "---\nseries-title: S\ncover-image: cover.png\norder:\n  - aaa\n---\n" });
		expect(planCard(recordedOnly, "f")).toMatchObject({ cover: null, needsBook: true });
		const other = peek({ seriesMd: "---\nseries-title: S\ncover-image: cover.png\norder:\n  - aaa\n---\n", seriesCover: cover("cover.jpg") });
		expect(planCard(other, "f").cover).toBeNull();
		const plan = planCard(peek({ seriesMd: "---\nseries-title: S\norder:\n  - aaa\n---\n" }), "f");
		expect(finishCard(plan, { folder: "aaa", novelMd: "---\ncover-image: cover.png\n---\n", cover: cover("cover.jpg") }).cover).toBeNull(); // not the book's recorded file
		expect(finishCard(plan, { folder: "aaa", novelMd: "---\n---\n", cover: cover("cover.jpg") }).cover).toBeNull(); // nothing recorded
	});

	it("a book that is not the one chosen (the folder changed between the two calls) is ignored", () => {
		const plan = planCard(peek({ seriesMd: "---\nseries-title: S\norder:\n  - aaa\n---\n" }), "f");
		const stale: PeekBook = { folder: "zzz", novelMd: "---\ncover-image: cover.jpg\n---\n", cover: cover("cover.jpg") };
		expect(finishCard(plan, stale)).toEqual({ state: "ok", name: "S", cover: null });
	});

	it("a single-novel project is named as the library names its novel: series.md's title, # numbered by the project's style, never the novel file's own reference", () => {
		const one = (titles: string, extra = "") => peek({ projectMd: `---\nstory-kind: standalone\n${extra}---\n`, seriesMd: `---\norder:\n  - aaa\nbooks:\n  aaa:\n    book-id: b1\n    book-title: ${titles}\n---\n`, bookFolders: ["aaa"] });
		expect(planCard(one('"Book #: The Harbour Wakes"'), "folder").name).toBe("Book 1: The Harbour Wakes"); // # becomes its number
		expect(planCard(one('"Book #: The Harbour Wakes"', "series-numbering-style: roman-upper\n"), "folder").name).toBe("Book I: The Harbour Wakes");
		expect(planCard(one('"Book #: The Harbour Wakes"', "series-numbering-style: no-such-style\n"), "folder").name).toBe("Book 1: The Harbour Wakes"); // an unknown style is the default
		expect(planCard(one("Plain Title"), "folder").name).toBe("Plain Title");
		// No title, or an entry without a book-id: the folder's name, as the library does; the novel's own reference is never used.
		const noEntry = peek({ projectMd: "---\nstory-kind: standalone\n---\n", seriesMd: "---\norder:\n  - aaa\nbooks:\n  aaa:\n    book-title: Orphan\n---\n", bookFolders: ["aaa"] });
		expect(planCard(noEntry, "folder").name).toBe("aaa"); // the book's folder name (the library's fallback)
		expect(planCard(peek({ projectMd: "---\nstory-kind: standalone\n---\n", seriesMd: "---\norder:\n  - aaa\n---\n", bookFolders: ["aaa"] }), "folder").name).toBe("aaa");
		const plan = planCard(noEntry, "folder");
		expect(finishCard(plan, { folder: "aaa", novelMd: "---\nbook-title-reference: \"Own Title\"\n---\n", cover: null }).name).toBe("aaa");
	});
});
