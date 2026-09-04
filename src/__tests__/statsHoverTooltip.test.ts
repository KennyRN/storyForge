import { describe, expect, it } from "vitest";
import { formatStatsHoverTooltip } from "../view/StatsPanel";

describe("formatStatsHoverTooltip", () => {
	it("lists daily/weekly then chapter/novel, all lowercase, with a blank spacer line", () => {
		expect(
			formatStatsHoverTooltip({
				daily: 312,
				weekly: 1204,
				chapter: 890,
				story: 45000,
			}),
		).toBe("wordcount\ndaily: 312\nweekly: 1,204\n\nchapter: 890\nnovel: 45,000");
	});
});
