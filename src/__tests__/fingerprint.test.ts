import { describe, expect, it } from "vitest";
import { extractFingerprint } from "../fingerprint";

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
