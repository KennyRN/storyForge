import { describe, expect, it } from "vitest";
import {
	bookFilePath,
	bookWordCountFilePath,
	chapterSidecarPath,
	codexFilePath,
	isBackstageBookkeepingPath,
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
