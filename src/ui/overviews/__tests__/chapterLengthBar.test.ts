import { describe, expect, it } from "vitest";
import { chapterLengthBarState } from "../bars";

describe("chapterLengthBarState (Brief 20, decision 160): the data bars' own rules", () => {
	it("no planned length means nothing is shown", () => {
		expect(chapterLengthBarState(500, null).shown).toBe(false);
		expect(chapterLengthBarState(500, 0).shown).toBe(false);
	});
	it("no words is the rail only", () => {
		expect(chapterLengthBarState(0, 2500)).toMatchObject({ shown: true, kind: "empty", ratio: 0, scale: 1, cut: false });
	});
	it("under the target the bar is a share of the rail; at it (decision 28's rounding) it meets the rail's inner edge", () => {
		expect(chapterLengthBarState(1250, 2500)).toMatchObject({ kind: "under", ratio: 0.5, scale: 1, cut: false });
		expect(chapterLengthBarState(2500, 2500)).toMatchObject({ kind: "fill", ratio: 1, scale: 1 });
		expect(chapterLengthBarState(2470, 2500)).toMatchObject({ kind: "fill", ratio: 1 }); // 2,470 rounds to 2,500 at the target's two significant figures
	});
	it("overrun shortens the rail, to a third at the most; past three times the target the end is cut", () => {
		expect(chapterLengthBarState(3750, 2500)).toMatchObject({ kind: "over", ratio: 1.5, scale: 1.5, cut: false });
		expect(chapterLengthBarState(7500, 2500)).toMatchObject({ scale: 3, cut: false });
		expect(chapterLengthBarState(9000, 2500)).toMatchObject({ scale: 3, cut: true });
	});
	it("the screen reader's name says the words and the plan, and the bar carries no other text", () => {
		expect(chapterLengthBarState(1200, 2500).label).toBe("Chapter length: 1,200 of 2,500 words");
	});
});
