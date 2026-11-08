import { describe, expect, it } from "vitest";
import { fmFile, memoryProject } from "../../../test/helpers/memoryProject";
import { novelWordsNow, seriesWordsNow } from "../wordTotals";

const words = (n: number): string => Array.from({ length: n }, () => "w").join(" ");

describe("words now, from the index at both levels", () => {
	it("a series' words now is the sum of its novels' and is never less than any of them", async () => {
		const { project } = await memoryProject({
			"_story-library/series.md": fmFile({ "series-title": "S", order: ["aaa", "bbb"], "unplaced-order": ["ccc"], books: { aaa: { "book-id": "b1", "book-title": "A" }, bbb: { "book-id": "b2", "book-title": "B" }, ccc: { "book-id": "b3", "book-title": "C" } } }),
			"_story-library/novel-aaa.md": fmFile({ "chapter-order": ["c1.md", "c2.md"] }),
			"_story-library/novel-bbb.md": fmFile({ "chapter-order": ["c1.md"] }),
			"_story-library/novel-ccc.md": fmFile({ "chapter-order": ["c1.md"] }),
			"_story-library/aaa/c1.md": words(30),
			"_story-library/aaa/c2.md": words(25),
			"_story-library/bbb/c1.md": words(10),
			"_story-library/ccc/c1.md": words(7),
		});
		const books = ["aaa", "bbb", "ccc"].map((b) => novelWordsNow(project, b));
		expect(books).toEqual([55, 10, 7]);
		expect(seriesWordsNow(project)).toBe(72);
		for (const n of books) expect(seriesWordsNow(project)).toBeGreaterThanOrEqual(n);
	});
});
