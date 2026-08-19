import { describe, expect, it } from "vitest";
import {
	LIBRARY_ROOT,
	bookFilePath,
	bookWordCountFilePath,
	chapterSidecarPath,
	codexFilePath,
	isBackstageBookkeepingPath,
	isLibraryChapterPath,
	isLibraryNovelPath,
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

describe("isLibraryNovelPath / isLibraryChapterPath", () => {
	it("recognizes a novel-<code>.md at the library root as a novel path, not a chapter", () => {
		expect(isLibraryNovelPath(bookFilePath("aaa"))).toBe(true);
		expect(isLibraryChapterPath(bookFilePath("aaa"))).toBe(false);
	});

	it("recognizes a chapter file one segment deeper as a chapter path, not a novel path", () => {
		const chapterPath = libraryChapterPath("aaa", "aaa_chapter-aaa.md");
		expect(isLibraryChapterPath(chapterPath)).toBe(true);
		expect(isLibraryNovelPath(chapterPath)).toBe(false);
	});

	it("does not flag series.md as a novel path", () => {
		expect(isLibraryNovelPath(seriesFilePath())).toBe(false);
	});

	it("does not flag a bare novel- prefixed folder name", () => {
		expect(isLibraryNovelPath(`${LIBRARY_ROOT}/novel-aaa`)).toBe(false);
	});
});
