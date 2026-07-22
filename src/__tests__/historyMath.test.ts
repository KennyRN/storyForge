import { describe, expect, it } from "vitest";
import {
	addDaysISO,
	dailyNetsForRange,
	latestTotal,
	mostRecentMondayISO,
	sumNetsThisWeek,
	todayISOInEngland,
	weeklyNetsFromDaily,
	wordsThisWeek,
	wordsToday,
} from "../historyMath";

describe("todayISOInEngland", () => {
	it("formats a date as an ISO YYYY-MM-DD string", () => {
		const date = new Date(Date.UTC(2026, 6, 6, 12, 0, 0)); // 2026-07-06 noon UTC, safely mid-BST-day
		expect(todayISOInEngland(date)).toBe("2026-07-06");
	});
});

describe("addDaysISO", () => {
	it("adds and subtracts calendar days", () => {
		expect(addDaysISO("2026-07-19", 1)).toBe("2026-07-20");
		expect(addDaysISO("2026-07-19", -2)).toBe("2026-07-17");
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

describe("mostRecentMondayISO", () => {
	it("returns the same date when it's already a Monday", () => {
		expect(mostRecentMondayISO("2024-01-01")).toBe("2024-01-01"); // known Monday
	});

	it("returns the prior Monday for a mid-week date", () => {
		expect(mostRecentMondayISO("2024-01-03")).toBe("2024-01-01"); // Wednesday
	});

	it("returns the prior Monday for a Sunday (end of week)", () => {
		expect(mostRecentMondayISO("2024-01-07")).toBe("2024-01-01"); // Sunday
	});
});

describe("wordsThisWeek", () => {
	it("is the difference between today's total and the total from before this week's Monday", () => {
		const totals = { "2023-12-31": 900, "2024-01-01": 1000, "2024-01-02": 1200, "2024-01-03": 1500 };
		expect(wordsThisWeek(totals, "2024-01-03")).toBe(600);
	});

	it("falls back to today's total outright when there is no record before this week's Monday", () => {
		const totals = { "2024-01-01": 100, "2024-01-03": 400 };
		expect(wordsThisWeek(totals, "2024-01-03")).toBe(400);
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

describe("dailyNetsForRange", () => {
	it("fills missing days with 0", () => {
		expect(dailyNetsForRange({ "2024-01-01": 10, "2024-01-03": 5 }, "2024-01-01", "2024-01-03")).toEqual([
			{ date: "2024-01-01", net: 10 },
			{ date: "2024-01-02", net: 0 },
			{ date: "2024-01-03", net: 5 },
		]);
	});
});

describe("weeklyNetsFromDaily", () => {
	it("sums day nets into Monday-start weeks", () => {
		const days = dailyNetsForRange(
			{ "2024-01-01": 100, "2024-01-02": 50, "2024-01-08": 20 },
			"2024-01-01",
			"2024-01-08",
		);
		expect(weeklyNetsFromDaily(days)).toEqual([
			{ weekStart: "2024-01-01", net: 150 },
			{ weekStart: "2024-01-08", net: 20 },
		]);
	});
});

describe("sumNetsThisWeek", () => {
	it("sums nets from this week's Monday through today", () => {
		const nets = { "2023-12-31": 9, "2024-01-01": 100, "2024-01-02": 50, "2024-01-03": 25 };
		expect(sumNetsThisWeek(nets, "2024-01-03")).toBe(175);
	});
});
