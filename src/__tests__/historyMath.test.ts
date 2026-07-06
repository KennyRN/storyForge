import { describe, expect, it } from "vitest";
import { latestTotal, todayISOInEngland, wordsToday } from "../historyMath";

describe("todayISOInEngland", () => {
	it("formats a date as an ISO YYYY-MM-DD string", () => {
		const date = new Date(Date.UTC(2026, 6, 6, 12, 0, 0)); // 2026-07-06 noon UTC, safely mid-BST-day
		expect(todayISOInEngland(date)).toBe("2026-07-06");
	});
});

describe("wordsToday", () => {
	it("is the difference between today's total and the most recent prior day", () => {
		const totals = { "2026-07-01": 12040, "2026-07-02": 12610, "2026-07-03": 13115 };
		expect(wordsToday(totals, "2026-07-03")).toBe(505);
	});

	it("falls back to the most recent prior day when there is a gap", () => {
		const totals = { "2026-07-01": 12040, "2026-07-05": 13000 };
		expect(wordsToday(totals, "2026-07-05")).toBe(960);
	});

	it("returns today's total outright when there is no prior day", () => {
		const totals = { "2026-07-01": 500 };
		expect(wordsToday(totals, "2026-07-01")).toBe(500);
	});

	it("treats a day with no recorded total as 0", () => {
		const totals = { "2026-07-01": 500 };
		expect(wordsToday(totals, "2026-07-02")).toBe(-500);
	});
});

describe("latestTotal", () => {
	it("returns the total for the most recent date", () => {
		const totals = { "2026-07-01": 12040, "2026-07-03": 13115, "2026-07-02": 12610 };
		expect(latestTotal(totals)).toBe(13115);
	});

	it("returns 0 when there are no recorded totals", () => {
		expect(latestTotal({})).toBe(0);
	});
});
