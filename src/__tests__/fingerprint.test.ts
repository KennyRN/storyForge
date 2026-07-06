import { describe, expect, it } from "vitest";
import { extractFingerprint, fingerprintSimilarity, parseStoredFingerprintFromContent } from "../fingerprint";

describe("extractFingerprint", () => {
	it("takes the first and last paragraph, capped to one sentence", () => {
		const raw = [
			"The rain came sideways that morning, and Maren knew the glass had lied. It kept falling anyway.",
			"",
			"Middle paragraph, irrelevant to the fingerprint.",
			"",
			"By the time the wind dropped, three of the six were gone. Nobody spoke.",
		].join("\n");

		const fp = extractFingerprint(raw);
		expect(fp.opening).toBe("The rain came sideways that morning, and Maren knew the glass had lied.");
		expect(fp.closing).toBe("By the time the wind dropped, three of the six were gone.");
	});

	it("returns empty strings for content with no prose", () => {
		expect(extractFingerprint("")).toEqual({ opening: "", closing: "" });
		expect(extractFingerprint("---\nstatus: draft\n---\n")).toEqual({ opening: "", closing: "" });
	});

	it("caps a rambling sentence-less opening to ~40 words with an ellipsis", () => {
		const longParagraph = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
		const fp = extractFingerprint(longParagraph);
		expect(fp.opening.endsWith("…")).toBe(true);
		expect(fp.opening.split(/\s+/).length).toBe(40); // capped to 40 words, ellipsis appended to the last
	});

	it("uses the same single paragraph for both opening and closing", () => {
		const fp = extractFingerprint("Only one paragraph here.");
		expect(fp.opening).toBe(fp.closing);
	});
});

describe("fingerprintSimilarity", () => {
	it("scores identical fingerprints as 1", () => {
		const fp = { opening: "The rain came sideways.", closing: "Nobody spoke." };
		expect(fingerprintSimilarity(fp, fp)).toBe(1);
	});

	it("scores completely different fingerprints low", () => {
		const a = { opening: "The rain came sideways that morning.", closing: "Nobody spoke." };
		const b = { opening: "Completely unrelated sentence about spaceships.", closing: "The end." };
		expect(fingerprintSimilarity(a, b)).toBeLessThan(0.3);
	});

	it("treats two empty fingerprints as no match (0), not a perfect match", () => {
		const empty = { opening: "", closing: "" };
		expect(fingerprintSimilarity(empty, empty)).toBe(0);
	});
});

describe("parseStoredFingerprintFromContent", () => {
	it("round-trips opening/closing from a rendered sidecar body", () => {
		const body = [
			"---",
			"chapter: the-storm.md",
			"---",
			"",
			"<!-- AUTO-MAINTAINED BELOW -->",
			"",
			"## opening",
			"The rain came sideways that morning.",
			"",
			"## closing",
			"Nobody spoke.",
			"",
		].join("\n");

		expect(parseStoredFingerprintFromContent(body)).toEqual({
			opening: "The rain came sideways that morning.",
			closing: "Nobody spoke.",
		});
	});

	it("returns empty strings when the markers are missing", () => {
		expect(parseStoredFingerprintFromContent("---\nchapter: x.md\n---\n")).toEqual({
			opening: "",
			closing: "",
		});
	});
});
