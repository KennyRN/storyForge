import { describe, expect, it } from "vitest";
import { applyHashNumbering, formatSingleLine, splitTitleSubtitle } from "../titleNumbering";

describe("applyHashNumbering", () => {
	it("passes through titles with no '#' unchanged", () => {
		expect(applyHashNumbering(["Prologue", "Interlude"])).toEqual(["Prologue", "Interlude"]);
	});

	it("numbers sequential '#' titles", () => {
		expect(applyHashNumbering(["Chapter #", "Chapter #", "Chapter #"])).toEqual([
			"Chapter 1",
			"Chapter 2",
			"Chapter 3",
		]);
	});

	it("only counts titles containing '#', skipping others in between", () => {
		expect(applyHashNumbering(["Prologue", "Chapter #", "Interlude", "Chapter #"])).toEqual([
			"Prologue",
			"Chapter 1",
			"Interlude",
			"Chapter 2",
		]);
	});

	it("replaces every '#' in one title with the same number", () => {
		expect(applyHashNumbering(["Prologue", "Chapter #", "Ch # (Part #)"])).toEqual([
			"Prologue",
			"Chapter 1",
			"Ch 2 (Part 2)",
		]);
	});

	it("returns an empty array for empty input", () => {
		expect(applyHashNumbering([])).toEqual([]);
	});
});

describe("splitTitleSubtitle", () => {
	it("returns a null subtitle when there is no '//'", () => {
		expect(splitTitleSubtitle("My Book")).toEqual({ title: "My Book", subtitle: null });
	});

	it("splits on the first '//' and trims both sides", () => {
		expect(splitTitleSubtitle("My Book // A Subtitle")).toEqual({ title: "My Book", subtitle: "A Subtitle" });
	});

	it("trims even with no surrounding spaces", () => {
		expect(splitTitleSubtitle("My Book//A Subtitle")).toEqual({ title: "My Book", subtitle: "A Subtitle" });
	});

	it("treats an empty subtitle after trimming as null", () => {
		expect(splitTitleSubtitle("My Book // ")).toEqual({ title: "My Book", subtitle: null });
	});

	it("folds a second '//' into the subtitle text", () => {
		expect(splitTitleSubtitle("My Book // Sub // Extra")).toEqual({ title: "My Book", subtitle: "Sub // Extra" });
	});
});

describe("formatSingleLine", () => {
	it("joins title and subtitle with a colon", () => {
		expect(formatSingleLine("My Book // A Subtitle")).toBe("My Book: A Subtitle");
	});

	it("returns just the title when there is no subtitle", () => {
		expect(formatSingleLine("My Book")).toBe("My Book");
	});

	it("returns the subtitle alone when the title is empty", () => {
		expect(formatSingleLine("// Subtitle only")).toBe("Subtitle only");
	});
});
