import { describe, expect, it } from "vitest";
import { buildDetailsNoteBody, formatDetailsDateLine } from "../recommend/detailsNote";
import type { DetailHit } from "../recommend/types";

function makeHit(overrides: Partial<DetailHit>): DetailHit {
	return {
		id: "test-id",
		sentence: "She had amber eyes.",
		chapterFilename: "ch1.md",
		rawOffset: 0,
		rawEnd: 20,
		line: 1,
		tier: "solid",
		entityPath: "/Codex/Jane.md",
		entityName: "Jane",
		competingNames: [],
		lens: "description",
		trait: "eyes",
		negated: false,
		currentCodexFact: null,
		resolved: false,
		attribution: null,
		...overrides,
	};
}

describe("formatDetailsDateLine", () => {
	it("formats yyyy-mm-dd hh-mm in local time with hyphens", () => {
		const d = new Date(2026, 8, 3, 13, 26); // month is 0-indexed: 8 = September
		expect(formatDetailsDateLine(d)).toBe("date created: 2026-09-03 13-26");
	});

	it("zero-pads month, day, hour, minute", () => {
		const d = new Date(2026, 0, 5, 9, 7);
		expect(formatDetailsDateLine(d)).toBe("date created: 2026-01-05 09-07");
	});
});

describe("buildDetailsNoteBody", () => {
	it("starts with the date line", () => {
		const when = new Date(2026, 8, 3, 13, 26);
		const body = buildDetailsNoteBody([], when);
		expect(body.startsWith("date created: 2026-09-03 13-26")).toBe(true);
	});

	it("always includes ## details to capture even when there are no hits", () => {
		const body = buildDetailsNoteBody([], new Date(2026, 0, 1));
		expect(body).toContain("## details to capture");
	});

	it("omits ## holding area when there are no ambiguous hits", () => {
		const hits = [makeHit({ tier: "solid" }), makeHit({ tier: "grey", entityName: "Jane", id: "g1" })];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		expect(body).not.toContain("## holding area");
	});

	it("includes ## holding area only when there are ambiguous hits", () => {
		const hits = [
			makeHit({ tier: "solid" }),
			makeHit({ tier: "ambiguous", entityName: "The Harbour", entityPath: null, id: "a1", sentence: "The harbour waited." }),
		];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		expect(body).toContain("## holding area");
		expect(body).toContain("### The Harbour");
		expect(body).toContain("The harbour waited.");
	});

	it("groups hits by entity key and uses ### for entity name", () => {
		const hits = [
			makeHit({ sentence: "She had amber eyes.", id: "h1" }),
			makeHit({ sentence: "She walked toward the harbour.", id: "h2" }),
		];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		expect(body).toContain("### Jane");
		const janeIdx = body.indexOf("### Jane");
		const eye = body.indexOf("She had amber eyes.", janeIdx);
		const walk = body.indexOf("She walked toward the harbour.", janeIdx);
		expect(eye).toBeGreaterThan(janeIdx);
		expect(walk).toBeGreaterThan(janeIdx);
	});

	it("uses entityPath as the grouping key so two entities with same name but different paths are separate", () => {
		const hits = [
			makeHit({ entityPath: "/Codex/Jane-A.md", entityName: "Jane", id: "a", sentence: "Sentence A." }),
			makeHit({ entityPath: "/Codex/Jane-B.md", entityName: "Jane", id: "b", sentence: "Sentence B." }),
		];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		const count = (body.match(/### Jane/g) ?? []).length;
		expect(count).toBe(2);
	});

	it("skips resolved hits", () => {
		const hits = [
			makeHit({ id: "open", sentence: "She had amber eyes.", resolved: false }),
			makeHit({ id: "done", sentence: "Jane paused at the doorway.", resolved: true }),
		];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		expect(body).toContain("She had amber eyes.");
		expect(body).not.toContain("Jane paused at the doorway.");
	});

	it("does NOT include tier, lens, or trait metadata in the note body", () => {
		const hit = makeHit({ tier: "solid", lens: "description", trait: "XYZTRAITMETA", sentence: "She spoke quietly." });
		const body = buildDetailsNoteBody([hit], new Date(2026, 0, 1));
		expect(body).not.toContain("solid");
		expect(body).not.toContain("Description");
		expect(body).not.toContain("XYZTRAITMETA");
		expect(body).toContain("She spoke quietly.");
	});

	it("puts solid/grey in capture, ambiguous in holding", () => {
		const hits = [
			makeHit({ id: "s", tier: "solid", sentence: "Capture sentence." }),
			makeHit({ id: "a", tier: "ambiguous", entityName: "The Harbour", entityPath: null, sentence: "Holding sentence." }),
		];
		const body = buildDetailsNoteBody(hits, new Date(2026, 0, 1));
		const captureIdx = body.indexOf("## details to capture");
		const holdingIdx = body.indexOf("## holding area");
		const captureText = body.indexOf("Capture sentence.", captureIdx);
		const holdingText = body.indexOf("Holding sentence.", holdingIdx);
		expect(captureIdx).toBeGreaterThan(-1);
		expect(holdingIdx).toBeGreaterThan(captureIdx);
		expect(captureText).toBeGreaterThan(captureIdx);
		expect(captureText).toBeLessThan(holdingIdx);
		expect(holdingText).toBeGreaterThan(holdingIdx);
	});
});
