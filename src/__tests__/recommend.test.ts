import { describe, expect, it } from "vitest";
import { analyzeChapter, contentHash, hashId, stripMarkdownMapped } from "../recommend/engine";
import {
	normalizeFactKey,
	parseFactsFromNote,
	parseFactsFromSection,
	serializeFactsSection,
	setFactValue,
	emptyFacts,
} from "../recommend/facts";
import { buildRecommendSidecarContent, parseRecommendSidecar } from "../recommend/cache";
import { groupHitsByChapter, lensLabel } from "../recommend/continuity";
import { buildLensRegistry } from "../recommend/lenses";
import { ensureNlp } from "../recommend/nlp";
import type { CastMember, ChapterRecommendReport } from "../recommend/types";

function person(path: string, name: string, factsBody: string, aliases: string[] = []): CastMember {
	const facts = parseFactsFromSection(factsBody, "Facts");
	return { path, name, aliases, type: "person", facts };
}

describe("normalizeFactKey", () => {
	it("prefers British spelling", () => {
		expect(normalizeFactKey("eye color")).toBe("eye colour");
	});
});

describe("facts parse", () => {
	it("parses current and was lines", () => {
		const facts = parseFactsFromSection("eye colour (was): green\neye colour: amber\nhair: dark\n", "Facts");
		expect(facts.entries["eye colour"]?.value).toBe("amber");
		expect(facts.entries["eye colour"]?.was).toEqual(["green"]);
		expect(facts.entries.hair?.value).toBe("dark");
	});

	it("serializes for stub seeding without writing into notes", () => {
		let facts = emptyFacts("Traits");
		facts = setFactValue(facts, "eye colour", "green", false);
		const body = serializeFactsSection(facts);
		expect(body).toContain("eye colour: green");
		const note = `---\naliases: [Bob]\n---\n\n## Traits\n${body}\n`;
		const parsed = parseFactsFromNote(note, "Traits");
		expect(parsed.entries["eye colour"]?.value).toBe("green");
	});
});

describe("stripMarkdownMapped", () => {
	it("maps offsets past frontmatter to raw lines", () => {
		const raw = "---\ntitle: x\n---\n\nAldric rose.\n";
		const stripped = stripMarkdownMapped(raw);
		expect(stripped.text).toContain("Aldric rose.");
		const idx = stripped.text.indexOf("Aldric");
		const rawIdx = stripped.toRaw(idx);
		expect(raw.slice(rawIdx, rawIdx + 6)).toBe("Aldric");
		expect(rawIdx).toBeGreaterThan(10);
	});
});

describe("analyzeChapter (dossier engine)", () => {
	const jane = person("Codex/Jane.md", "Jane", "eye colour: green\n");

	it("matches longer names first and lists characters", async () => {
		await ensureNlp();
		const prose = "Jane walked into the room. Mary Ann waved.";
		const maryAnn = person("Codex/Mary Ann.md", "Mary Ann", "");
		const mary = person("Codex/Mary.md", "Mary", "");
		const report = await analyzeChapter(prose, [jane, maryAnn, mary], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.matched.map((m) => m.name).sort()).toEqual(["Jane", "Mary Ann"]);
		expect(report.matched.find((m) => m.name === "Mary")).toBeUndefined();
	});

	it("marks ambiguous shared aliases", async () => {
		await ensureNlp();
		const alexA = person("Codex/Alex.md", "Alex", "", ["Alex"]);
		const alexandra = person("Codex/Alexandra.md", "Alexandra", "", ["Alex"]);
		const prose = "Alex opened the door.";
		const report = await analyzeChapter(prose, [alexA, alexandra], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const hits = report.matched.filter(
			(m) => m.matchedAs.includes("Alex") || m.name === "Alex" || m.name === "Alexandra",
		);
		expect(hits.length).toBe(2);
		expect(hits.every((h) => h.ambiguousWith.length > 0)).toBe(true);
	});

	it("prefers existing plot for synopsis", async () => {
		await ensureNlp();
		const report = await analyzeChapter("First sentence. Second sentence.", [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "Custom plot notes",
			includeUnknownNames: false,
		});
		expect(report.synopsisHeuristic).toBe("Custom plot notes");
	});

	it("surfaces description sentences without value-conflict scoring", async () => {
		await ensureNlp();
		const prose = "Jane's eyes were amber in the light.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const hit = report.hits.find((h) => h.lens === "description" && h.entityName === "Jane");
		expect(hit).toBeTruthy();
		expect(hit!.tier).toBe("solid");
		expect(hit!.sentence.toLowerCase()).toContain("amber");
		expect(hit!.currentCodexFact?.value).toBe("green");
		expect(hit!.negated).toBe(false);
	});

	it("keeps negation visible on description hits", async () => {
		await ensureNlp();
		const prose = "Jane's eyes were not green.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const hit = report.hits.find((h) => h.lens === "description");
		expect(hit).toBeTruthy();
		expect(hit!.negated).toBe(true);
	});

	it("tiers pronoun sentences as grey when one prior name is in window", async () => {
		await ensureNlp();
		const prose = "Jane entered the hall. Her luminous eyes flashed.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
		});
		const grey = report.hits.find((h) => h.tier === "grey" && h.sentence.toLowerCase().includes("luminous"));
		expect(grey).toBeTruthy();
		expect(grey!.entityName).toBe("Jane");
	});

	it("detects unknown proper nouns including sentence-initial invented names", async () => {
		await ensureNlp();
		const prose = "Aldric met Jane at the harbour.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Aldric");
		expect(report.unknownNames).not.toContain("Jane");
	});
});

describe("lenses registry", () => {
	it("ships five extensible lenses", () => {
		const lenses = buildLensRegistry();
		expect(lenses.map((l) => l.id)).toEqual([
			"description",
			"whereabouts",
			"relationships",
			"dialogue",
			"emotion",
		]);
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
			unknownNameHints: [{ name: "Zelda" }],
			hits: [],
			sentenceKeys: [],
		};
		const raw = buildRecommendSidecarContent(report, []);
		const parsed = parseRecommendSidecar(raw);
		expect(parsed?.chapterFilename).toBe("ch1.md");
		expect(parsed?.unknownNames).toEqual(["Zelda"]);
		expect(parsed?.contentHash).toBe("abc");
	});
});

describe("dossier grouping", () => {
	it("groups hits in chapter order", () => {
		const groups = groupHitsByChapter(
			[
				{ filename: "a.md", label: "Ch 1" },
				{ filename: "b.md", label: "Ch 2" },
			],
			[
				{
					id: "1",
					sentence: "Later.",
					chapterFilename: "b.md",
					rawOffset: 0,
					rawEnd: 1,
					line: 1,
					tier: "solid",
					entityPath: "Codex/Jane.md",
					entityName: "Jane",
					competingNames: [],
					lens: "emotion",
					trait: "glad",
					negated: false,
					currentCodexFact: null,
					resolved: false,
					attribution: null,
				},
				{
					id: "2",
					sentence: "First.",
					chapterFilename: "a.md",
					rawOffset: 0,
					rawEnd: 1,
					line: 1,
					tier: "solid",
					entityPath: "Codex/Jane.md",
					entityName: "Jane",
					competingNames: [],
					lens: "description",
					trait: "eyes",
					negated: false,
					currentCodexFact: null,
					resolved: false,
					attribution: null,
				},
			],
		);
		expect(groups.map((g) => g.chapter.filename)).toEqual(["a.md", "b.md"]);
		expect(lensLabel("description")).toBe("Description");
	});
});

describe("hashId", () => {
	it("is stable for the same entity+sentence", () => {
		expect(hashId("Codex/Jane.md", "Her eyes were green.")).toBe(
			hashId("Codex/Jane.md", "Her eyes were green."),
		);
		expect(hashId("Codex/Jane.md", "A")).not.toBe(hashId("Codex/Jane.md", "B"));
		expect(contentHash(["a"])).toBe(contentHash(["a"]));
	});
});
