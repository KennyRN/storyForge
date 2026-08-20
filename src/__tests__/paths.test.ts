import { describe, expect, it } from "vitest";
import {
	LIBRARY_ROOT,
	bookFilePath,
	bookWordCountFilePath,
	chapterSidecarPath,
	codexFilePath,
	isBackstageBookkeepingPath,
	isLibraryChapterPath,
	isLibraryRootFilePath,
	libraryChapterPath,
	recommendSidecarPath,
	seriesFilePath,
	wordCountFilePath,
} from "../paths";

describe("isBackstageBookkeepingPath", () => {
	it("does not flag series.md", () => {
		expect(isBackstageBookkeepingPath(seriesFilePath())).toBe(false);
	});

	it("does not flag a novel.md", () => {
		expect(isBackstageBookkeepingPath(bookFilePath("My Novel"))).toBe(false);
	});

	it("does not flag codex.md", () => {
		expect(isBackstageBookkeepingPath(codexFilePath())).toBe(false);
	});

	it("does not flag a library chapter path", () => {
		expect(isBackstageBookkeepingPath(libraryChapterPath("My Novel", "Chapter 1.md"))).toBe(false);
	});

	it("flags legacy wordcount.md", () => {
		expect(isBackstageBookkeepingPath(wordCountFilePath())).toBe(true);
	});

	it("flags per-book wordcount.md", () => {
		expect(isBackstageBookkeepingPath(bookWordCountFilePath("My Novel"))).toBe(true);
	});

	it("flags a chapter sidecar path", () => {
		expect(isBackstageBookkeepingPath(chapterSidecarPath("My Novel", "Chapter 1.md"))).toBe(true);
	});

	it("flags a recommend sidecar path", () => {
		expect(isBackstageBookkeepingPath(recommendSidecarPath("My Novel", "Chapter 1.md"))).toBe(true);
	});
});

describe("isLibraryRootFilePath / isLibraryChapterPath", () => {
	it("recognizes a novel-<code>.md at the library root as a root file, not a chapter", () => {
		expect(isLibraryRootFilePath(bookFilePath("aaa"))).toBe(true);
		expect(isLibraryChapterPath(bookFilePath("aaa"))).toBe(false);
	});

	it("recognizes series.md as a root file too", () => {
		expect(isLibraryRootFilePath(seriesFilePath())).toBe(true);
	});

	it("recognizes any other flat file directly at the library root", () => {
		expect(isLibraryRootFilePath(`${LIBRARY_ROOT}/index.json`)).toBe(true);
		expect(isLibraryRootFilePath(`${LIBRARY_ROOT}/not-a-novel.md`)).toBe(true);
	});

	it("recognizes a chapter file one segment deeper as a chapter path, not a root file", () => {
		const chapterPath = libraryChapterPath("aaa", "aaa_chapter-aaa.md");
		expect(isLibraryChapterPath(chapterPath)).toBe(true);
		expect(isLibraryRootFilePath(chapterPath)).toBe(false);
	});

	it("does not flag a bare book-code folder (no extension) as a root file", () => {
		// nextNovelCode codes are plain letter sequences, never containing a
		// "." — this is what keeps a book folder itself write-guard protected.
		expect(isLibraryRootFilePath(`${LIBRARY_ROOT}/aaa`)).toBe(false);
		expect(isLibraryRootFilePath(`${LIBRARY_ROOT}/novel-aaa`)).toBe(false);
	});

	it("does not flag the library root itself", () => {
		expect(isLibraryRootFilePath(LIBRARY_ROOT)).toBe(false);
	});
});
