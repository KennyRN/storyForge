import { describe, expect, it } from "vitest";
import { analyzeChapter } from "../recommend/engine";
import {
	acknowledgeFactChange,
	normalizeFactKey,
	parseFactsFromNote,
	parseFactsFromSection,
	serializeFactsSection,
	setFactValue,
	writeFactsIntoNote,
	emptyFacts,
} from "../recommend/facts";
import { buildRecommendSidecarContent, parseRecommendSidecar } from "../recommend/cache";
import { buildContinuityTimelines, formatContinuityLine } from "../recommend/continuity";
import type { ChapterRecommendReport, CodexEntryInput } from "../recommend/types";

function person(path: string, name: string, factsBody: string, aliases: string[] = []): CodexEntryInput {
	const facts = parseFactsFromSection(factsBody, "Facts");
	return { path, name, aliases, type: "person", facts };
}

describe("normalizeFactKey", () => {
	it("prefers British spelling", () => {
		expect(normalizeFactKey("eye color")).toBe("eye colour");
	});
});

describe("facts parse/upsert", () => {
	it("parses current and was lines", () => {
		const facts = parseFactsFromSection("eye colour (was): green\neye colour: amber\nhair: dark\n", "Facts");
		expect(facts.entries["eye colour"]?.value).toBe("amber");
		expect(facts.entries["eye colour"]?.was).toEqual(["green"]);
		expect(facts.entries.hair?.value).toBe("dark");
	});

	it("round-trips through note body with custom heading", () => {
		const raw = "---\naliases: [Bob]\n---\n\nLore about Bob.\n";
		let facts = emptyFacts("Traits");
		facts = setFactValue(facts, "eye colour", "green", false);
		const written = writeFactsIntoNote(raw, facts);
		expect(written).toContain("## Traits");
		expect(written).toContain("eye colour: green");
		const parsed = parseFactsFromNote(written, "Traits");
		expect(parsed.entries["eye colour"]?.value).toBe("green");
	});

	it("acknowledge pushes previous value into was", () => {
		let facts = emptyFacts("Facts");
		facts = setFactValue(facts, "eye colour", "green", false);
		facts = acknowledgeFactChange(facts, "eye colour", "amber");
		expect(facts.entries["eye colour"]?.value).toBe("amber");
		expect(facts.entries["eye colour"]?.was).toEqual(["green"]);
		expect(serializeFactsSection(facts)).toContain("eye colour (was): green");
	});
});

describe("analyzeChapter", () => {
	const jane = person("Codex/Jane.md", "Jane", "eye colour: green\n");
	const alexA = person("Codex/Alex.md", "Alex", "", ["Alex"]);
	const alexandra = person("Codex/Alexandra.md", "Alexandra", "", ["Alex"]);

	it("matches longer names first and lists characters", () => {
		const prose = "Jane walked into the room. Mary Ann waved.";
		const maryAnn = person("Codex/Mary Ann.md", "Mary Ann", "");
		const mary = person("Codex/Mary.md", "Mary", "");
		const report = analyzeChapter(prose, [jane, maryAnn, mary], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.matched.map((m) => m.name).sort()).toEqual(["Jane", "Mary Ann"]);
		expect(report.matched.find((m) => m.name === "Mary")).toBeUndefined();
	});

	it("marks ambiguous shared aliases", () => {
		const prose = "Alex opened the door.";
		const report = analyzeChapter(prose, [alexA, alexandra], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const hits = report.matched.filter((m) => m.matchedAs.includes("Alex") || m.name === "Alex" || m.name === "Alexandra");
		expect(hits.length).toBe(2);
		expect(hits.every((h) => h.ambiguousWith.length > 0)).toBe(true);
	});

	it("prefers existing plot for synopsis", () => {
		const report = analyzeChapter("First sentence. Second sentence.", [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "Custom plot notes",
			includeUnknownNames: false,
		});
		expect(report.synopsisHeuristic).toBe("Custom plot notes");
	});

	it("detects eye colour conflict", () => {
		const prose = "Jane's eyes were amber in the light.";
		const report = analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const conflict = report.factChecks.find((r) => r.key === "eye colour");
		expect(conflict?.status).toBe("conflict");
		expect(conflict?.codexValue).toBe("green");
		expect(conflict?.chapterValue.toLowerCase()).toContain("amber");
	});

	it("treats was-history as acknowledged", () => {
		const janeHist = person("Codex/Jane.md", "Jane", "eye colour (was): green\neye colour: amber\n");
		const prose = "Jane's eyes were green that morning.";
		const report = analyzeChapter(prose, [janeHist], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const row = report.factChecks.find((r) => r.key === "eye colour");
		expect(row?.status).toBe("acknowledged");
	});

	it("lists unknown proper names", () => {
		const prose = "Zelda met Jane at the harbour.";
		const report = analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Zelda");
		expect(report.unknownNames).not.toContain("Jane");
	});
});

describe("recommend cache", () => {
	it("round-trips report JSON", () => {
		const report: ChapterRecommendReport = {
			chapterFilename: "ch1.md",
			contentHash: "abc",
			synopsisHeuristic: "Once upon a time",
			matched: [],
			unknownNames: ["Zelda"],
			descriptions: [],
			factChecks: [],
		};
		const raw = buildRecommendSidecarContent(report);
		const parsed = parseRecommendSidecar(raw);
		expect(parsed?.chapterFilename).toBe("ch1.md");
		expect(parsed?.unknownNames).toEqual(["Zelda"]);
		expect(parsed?.contentHash).toBe("abc");
	});
});

describe("continuity", () => {
	it("aggregates fact drift across chapters", () => {
		const mk = (filename: string, value: string, status: "ok" | "conflict" | "acknowledged"): ChapterRecommendReport => ({
			chapterFilename: filename,
			contentHash: filename,
			synopsisHeuristic: "",
			matched: [],
			unknownNames: [],
			descriptions: [],
			factChecks: [
				{
					path: "Codex/Jane.md",
					name: "Jane",
					key: "eye colour",
					displayKey: "eye colour",
					codexValue: "green",
					chapterValue: value,
					status,
				},
			],
		});
		const timelines = buildContinuityTimelines(
			[
				{ filename: "a.md", label: "Ch 1" },
				{ filename: "b.md", label: "Ch 2" },
				{ filename: "c.md", label: "Ch 3" },
			],
			new Map([
				["a.md", mk("a.md", "green", "ok")],
				["b.md", mk("b.md", "amber", "conflict")],
				["c.md", mk("c.md", "amber", "acknowledged")],
			]),
		);
		expect(timelines).toHaveLength(1);
		expect(timelines[0].hasConflict).toBe(true);
		expect(timelines[0].steps.map((s) => s.value)).toEqual(["green", "amber", "amber"]);
		expect(formatContinuityLine(timelines[0])).toContain("eye colour");
		expect(formatContinuityLine(timelines[0])).toContain("[!]");
	});
});
