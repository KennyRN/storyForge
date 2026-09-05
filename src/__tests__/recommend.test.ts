import { describe, expect, it } from "vitest";
import { analyzeChapter, contentHash, demoteGoneMatchesToUnknown, hashId, stripMarkdownMapped } from "../recommend/engine";
import { applyIgnoredNames } from "../recommend/decisions";
import {
	normalizeFactKey,
	parseFactsFromNote,
	parseFactsFromSection,
	serializeFactsSection,
	setFactValue,
	emptyFacts,
} from "../recommend/facts";
import { buildRecommendSidecarContent, parseRecommendSidecar } from "../recommend/cache";
import { groupHitsByChapter, lensLabel } from "../recommend/hitGrouping";
import { buildLensRegistry } from "../recommend/lenses";
import { ensureNlp } from "../recommend/nlp";
import { hasFirstPersonInNarration } from "../recommend/quoteSpans";
import type { CastMember, ChapterRecommendReport } from "../recommend/types";

function person(path: string, name: string, factsBody: string, aliases: string[] = []): CastMember {
	const facts = parseFactsFromSection(factsBody, "Facts");
	return { path, name, aliases, type: "person", facts };
}

describe("applyIgnoredNames", () => {
	it("removes dismissed unknowns case-insensitively", () => {
		const report = {
			unknownNames: ["Aldric", "Zelda"],
			unknownNameHints: [{ name: "Aldric" }, { name: "Zelda" }],
		};
		applyIgnoredNames(report, ["aldric"]);
		expect(report.unknownNames).toEqual(["Zelda"]);
		expect(report.unknownNameHints.map((h) => h.name)).toEqual(["Zelda"]);
	});
});

describe("demoteGoneMatchesToUnknown", () => {
	function reportWith(unknown: string[] = [], matched: ChapterRecommendReport["matched"] = []): ChapterRecommendReport {
		return {
			chapterFilename: "ch1.md",
			contentHash: "x",
			synopsisHeuristic: "",
			matched,
			unknownNames: [...unknown],
			unknownNameHints: unknown.map((name) => ({ name })),
			hits: [],
			sentenceKeys: [],
		};
	}

	it("adds a gone Codex match whose name still appears in the chapter", () => {
		const report = reportWith();
		demoteGoneMatchesToUnknown(
			report,
			[{ path: "Codex/Jane.md", name: "Jane", type: "person", matchedAs: ["Jane"], ambiguousWith: [] }],
			[],
			"Jane walked into the room.",
		);
		expect(report.unknownNames).toEqual(["Jane"]);
		expect(report.unknownNameHints).toEqual([{ name: "Jane" }]);
	});

	it("resurfaces a name NER would miss when it previously matched via gazetteer", () => {
		const report = reportWith();
		demoteGoneMatchesToUnknown(
			report,
			[{ path: "Codex/Harbour.md", name: "the harbour", type: "place", matchedAs: ["the harbour"], ambiguousWith: [] }],
			[],
			"They met at the harbour before dawn.",
		);
		expect(report.unknownNames).toEqual(["the harbour"]);
	});

	it("does not demote a match whose Codex file is still live", () => {
		const report = reportWith();
		demoteGoneMatchesToUnknown(
			report,
			[{ path: "Codex/Jane.md", name: "Jane", type: "person", matchedAs: ["Jane"], ambiguousWith: [] }],
			[{ path: "Codex/Jane.md", name: "Jane" }],
			"Jane walked into the room.",
		);
		expect(report.unknownNames).toEqual([]);
	});

	it("does not demote a PoV-only inject whose name is absent from the chapter", () => {
		const report = reportWith();
		demoteGoneMatchesToUnknown(
			report,
			[{ path: "Codex/Alex.md", name: "Alex", type: "person", matchedAs: ["PoV"], ambiguousWith: [] }],
			[],
			"I ran towards London.",
		);
		expect(report.unknownNames).toEqual([]);
	});

	it("skips names already in unknown or still matched under another entry", () => {
		const report = reportWith(["Jane"], [
			{ path: "Codex/Jane-II.md", name: "Jane", type: "person", matchedAs: ["Jane"], ambiguousWith: [] },
		]);
		demoteGoneMatchesToUnknown(
			report,
			[{ path: "Codex/Jane.md", name: "Jane", type: "person", matchedAs: ["Jane"], ambiguousWith: [] }],
			[{ path: "Codex/Jane-II.md", name: "Jane" }],
			"Jane walked into the room.",
		);
		expect(report.unknownNames).toEqual(["Jane"]);
	});
});

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

	it("serializes for lore-entry seeding without writing into notes", () => {
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

	it("treats a YAML alias as the same Codex note (one matched path, not unknown)", async () => {
		await ensureNlp();
		const arsenal = person("Codex/Arsenal.md", "Arsenal", "", ["The Gunners"]);
		const prose = "The Gunners walked onto the pitch.";
		const report = await analyzeChapter(prose, [arsenal], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.matched).toHaveLength(1);
		expect(report.matched[0].path).toBe("Codex/Arsenal.md");
		expect(report.matched[0].name).toBe("Arsenal");
		expect(report.matched[0].matchedAs).toContain("The Gunners");
		expect(report.unknownNames).not.toContain("The Gunners");
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

	it("keeps a capitalised generic noun tail on an invented name (Winster River)", async () => {
		await ensureNlp();
		const prose = "Finally, we came out upon the banks of the Winster River.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Winster River");
		expect(report.unknownNames).not.toContain("Winster");
	});

	it("drops sentence-initial common English words from unknown names", async () => {
		await ensureNlp();
		const prose =
			'Anger filled the room. Rescue arrived too late. Words failed him. Worse came later. "Rescue the girl," he said.';
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).not.toContain("Anger");
		expect(report.unknownNames).not.toContain("Rescue");
		expect(report.unknownNames).not.toContain("Words");
		expect(report.unknownNames).not.toContain("Worse");
	});

	it("drops a lone common English word but keeps a multi-word run of them", async () => {
		await ensureNlp();
		// Standalone "Anger" (capitalised emphasis on an ordinary word) is noise
		// on its own and dropped. "Sudden Anger" is a two-word unbridged run —
		// per the broadened filter, multi-word common-word runs stand as
		// candidates (same shape as a real name like "Three Bridge"), so it
		// surfaces and the writer dismisses it if it isn't one.
		const prose =
			"But Anger remained. The Anger rose. Her Anger was clear. — Anger flared. Sudden Anger took her.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).not.toContain("Anger");
		expect(report.unknownNames).toContain("Sudden Anger");
	});

	it("keeps a numeral-qualified place name (Three Bridge)", async () => {
		await ensureNlp();
		const prose = "Not that you could tell this far from the main streets through Three Bridge.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Three Bridge");
	});

	it("keeps bridged multi-word titles even when parts are common English", async () => {
		await ensureNlp();
		const prose = "They joined the Cult of the Snake.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Cult of the Snake");
	});

	it("keeps mid-sentence invented names that wink tags as PROPN", async () => {
		await ensureNlp();
		const prose = "Then Aldric walked in.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Aldric");
	});

	it("joins hyphenated proper names into one unknown candidate", async () => {
		await ensureNlp();
		const prose = "The Demi-Human fled.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames).toContain("Demi-Human");
		expect(report.unknownNames).not.toContain("Demi");
		expect(report.unknownNames).not.toContain("Human");
	});

	it("drops pronoun contractions from unknown names", async () => {
		await ensureNlp();
		const prose = "I'm Safe now. I'm fine.";
		const report = await analyzeChapter(prose, [jane], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: true,
		});
		expect(report.unknownNames.some((n) => /I'm/i.test(n))).toBe(false);
		expect(report.unknownNames).not.toContain("I'm Safe");
		expect(report.unknownNames).not.toContain("I'm");
	});
});

describe("first-person narrator attribution", () => {
	const narrator = person("Codex/Alex.md", "Alex", "");
	const other = person("Codex/Jane.md", "Jane", "eye colour: green\n");
	const narratorOpt = { path: narrator.path, name: narrator.name };

	it("binds I ran towards London to the narrator at solid tier", async () => {
		await ensureNlp();
		// Whereabouts needs motion + prep + capitalised place ("for the harbour" does not fire a lens).
		const prose = "I ran towards London.";
		const report = await analyzeChapter(prose, [narrator, other], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		const hit = report.hits.find((h) => h.entityPath === narrator.path);
		expect(hit).toBeTruthy();
		expect(hit!.tier).toBe("solid");
		expect(hit!.sentence).toContain("I ran towards London");
	});

	it("does not bind quoted I won't; binds narration I flinched", async () => {
		await ensureNlp();
		const prose = `"I won't," she said, and I flinched.`;
		const report = await analyzeChapter(prose, [narrator, other], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		const narratorHits = report.hits.filter((h) => h.entityPath === narrator.path);
		expect(narratorHits.length).toBeGreaterThan(0);
		expect(narratorHits.every((h) => h.tier === "solid")).toBe(true);
		expect(narratorHits.some((h) => /flinched/i.test(h.sentence))).toBe(true);
		// Quoted first-person alone must not invent a hit without narration binding.
		expect(narratorHits.every((h) => hasFirstPersonInNarration(h.sentence, "double"))).toBe(true);
	});

	it("binds narration tag in Run I shouted", async () => {
		await ensureNlp();
		// Avoid `!` inside quotes — wink may split before the speech tag.
		const prose = `"Run," I shouted.`;
		const report = await analyzeChapter(prose, [narrator], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		const hit = report.hits.find((h) => h.entityPath === narrator.path && h.lens === "dialogue");
		expect(hit).toBeTruthy();
		expect(hit!.tier).toBe("solid");
	});

	it("binds I said tag while quoted I'm routes via speaker tag", async () => {
		await ensureNlp();
		const prose = `"I'm leaving," I said.`;
		const report = await analyzeChapter(prose, [narrator], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		const hit = report.hits.find((h) => h.entityPath === narrator.path && h.lens === "dialogue");
		expect(hit).toBeTruthy();
		expect(hit!.tier).toBe("solid");
	});

	it("keeps single-quote possessive guards with narrator binding intact", async () => {
		await ensureNlp();
		const prose = `I picked up the coat, 'this is James' coat.' I flinched.`;
		const report = await analyzeChapter(prose, [narrator], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "single",
		});
		const hit = report.hits.find((h) => h.entityPath === narrator.path && /flinched/i.test(h.sentence));
		expect(hit).toBeTruthy();
		expect(hit!.tier).toBe("solid");
	});

	it("still tiers she-only sentences via existing third-person coref", async () => {
		await ensureNlp();
		const prose = "Jane entered the hall. Her luminous eyes flashed.";
		const report = await analyzeChapter(prose, [other], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		const grey = report.hits.find((h) => h.tier === "grey" && h.sentence.toLowerCase().includes("luminous"));
		expect(grey).toBeTruthy();
		expect(grey!.entityName).toBe("Jane");
	});

	it("is inert when narrator is unset", async () => {
		await ensureNlp();
		const prose = "I ran towards London.";
		const report = await analyzeChapter(prose, [narrator], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: null,
			dialogueQuotes: "double",
		});
		expect(report.hits.filter((h) => h.entityPath === narrator.path)).toHaveLength(0);
	});

	it("lists the PoV in matched even when their name never appears", async () => {
		await ensureNlp();
		const prose = "I ran towards London.";
		const report = await analyzeChapter(prose, [narrator, other], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			dialogueQuotes: "double",
		});
		expect(report.matched.find((m) => m.path === narrator.path)).toMatchObject({
			name: "Alex",
			type: "person",
			matchedAs: ["PoV"],
		});
		expect(report.matched.find((m) => m.path === other.path)).toBeUndefined();
	});

	it("lists every PoV in matched even when their names never appear", async () => {
		await ensureNlp();
		const prose = "I ran towards London.";
		const report = await analyzeChapter(prose, [narrator, other], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			povRefs: [
				{ path: narrator.path, name: narrator.name },
				{ path: other.path, name: other.name },
			],
			dialogueQuotes: "double",
		});
		expect(report.matched.map((m) => m.path).sort()).toEqual([narrator.path, other.path].sort());
		expect(report.matched.find((m) => m.path === other.path)).toMatchObject({
			name: "Jane",
			matchedAs: ["PoV"],
		});
	});

	it("does not inject a PoV whose Codex file is no longer in the inventory", async () => {
		await ensureNlp();
		const prose = "I ran towards London.";
		const report = await analyzeChapter(prose, [narrator], {
			chapterFilename: "ch1.md",
			existingPlot: "",
			includeUnknownNames: false,
			narrator: narratorOpt,
			povRefs: [
				{ path: narrator.path, name: narrator.name },
				{ path: other.path, name: other.name },
			],
			dialogueQuotes: "double",
		});
		expect(report.matched.map((m) => m.path)).toEqual([narrator.path]);
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
