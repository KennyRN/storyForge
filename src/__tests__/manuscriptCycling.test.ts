import { describe, expect, it } from "vitest";
import { cyclingCrossings, lineWordCounts, runningStarts } from "../manuscript/manuscriptCycling";
import { assembleManuscript } from "../manuscript/manuscriptModel";
import { countWordsInLine } from "../wordCount";

const words = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

describe("cycling guide across a book", () => {
	const chapters = [
		{ id: "a", body: `${words(7, "a")}\n\n${words(5, "b")}` },
		{ id: "b", body: `${words(4, "c")}\n${words(9, "d")}\n\n${words(2, "e")}` },
		{ id: "c", body: "" },
		{ id: "d", body: `${words(11, "f")}\n\n${words(3, "g")}` },
	];

	it("matches a naive count over the whole manuscript: breaks never reset it, titles never count", () => {
		const interval = 6;
		const { text, ranges } = assembleManuscript(chapters);
		// Naive: the chapter editor's rule applied to every line of the whole document.
		const docLines = text.split("\n");
		const naive: number[] = [];
		let cum = 0;
		docLines.forEach((line, i) => {
			const before = cum;
			cum += countWordsInLine(line);
			if (Math.floor(cum / interval) > Math.floor(before / interval)) naive.push(i);
		});

		const counts = chapters.map((c) => lineWordCounts(c.body));
		const starts = runningStarts(counts.map((lines) => lines.reduce((a, b) => a + b, 0)));
		const incremental: number[] = [];
		ranges.forEach((r, k) => {
			const firstLine = text.slice(0, r.from).split("\n").length - 1;
			for (const i of cyclingCrossings(counts[k], starts[k], interval)) incremental.push(firstLine + i);
		});
		expect(incremental).toEqual(naive);
		expect(naive.length).toBeGreaterThan(3);
	});

	it("can land a guide just after a chapter's first paragraph", () => {
		// 5 words carried in from the chapter before: the next chapter's first line crosses 6
		// (5 + 3 = 8); its third line then crosses 12 (8 + 4).
		expect(cyclingCrossings([3, 0, 4], 5, 6)).toEqual([0, 2]);
	});

	it("starts at zero at the first chapter", () => {
		expect(runningStarts([10, 0, 7])).toEqual([0, 10, 10]);
		expect(cyclingCrossings([5, 5], 0, 10)).toEqual([1]);
	});

	it("marks one line for a line that crosses several multiples", () => {
		expect(cyclingCrossings([25], 0, 10)).toEqual([0]);
	});
});
