import { describe, expect, it } from "vitest";
import {
	hasFirstPersonInNarration,
	normalizeDialogueQuoteStyle,
	partitionQuoteSpans,
	type QuoteSpan,
} from "../recommend/quoteSpans";

function kinds(spans: QuoteSpan[]): string {
	return spans.map((s) => `${s.kind}:${s.start}-${s.end}`).join("|");
}

function narrationText(source: string, spans: QuoteSpan[]): string {
	return spans.filter((s) => s.kind === "narration").map((s) => source.slice(s.start, s.end)).join("");
}

function quotedText(source: string, spans: QuoteSpan[]): string {
	return spans.filter((s) => s.kind === "quoted").map((s) => source.slice(s.start, s.end)).join("");
}

describe("normalizeDialogueQuoteStyle", () => {
	it("defaults unknown values to double", () => {
		expect(normalizeDialogueQuoteStyle(undefined)).toBe("double");
		expect(normalizeDialogueQuoteStyle("double")).toBe("double");
		expect(normalizeDialogueQuoteStyle("single")).toBe("single");
		expect(normalizeDialogueQuoteStyle("weird")).toBe("double");
	});
});

describe("partitionQuoteSpans (double)", () => {
	it("keeps unquoted prose as narration", () => {
		const text = "I ran for the harbour.";
		const spans = partitionQuoteSpans(text, "double");
		expect(narrationText(text, spans)).toBe(text);
		expect(quotedText(text, spans)).toBe("");
	});

	it("partitions straight double quotes", () => {
		const text = `"Run!" I shouted.`;
		const spans = partitionQuoteSpans(text, "double");
		expect(quotedText(text, spans)).toBe("Run!");
		expect(narrationText(text, spans)).toContain("I shouted.");
		expect(hasFirstPersonInNarration(text, "double")).toBe(true);
	});

	it("partitions curly double quotes", () => {
		const text = "\u201CRun!\u201D I shouted.";
		const spans = partitionQuoteSpans(text, "double");
		expect(quotedText(text, spans)).toBe("Run!");
		expect(hasFirstPersonInNarration(text, "double")).toBe(true);
	});

	it("does not treat apostrophes as double-quote delimiters", () => {
		const text = `I know it's James' coat.`;
		const spans = partitionQuoteSpans(text, "double");
		expect(quotedText(text, spans)).toBe("");
		expect(hasFirstPersonInNarration(text, "double")).toBe(true);
	});

	it("resets quote state across blank lines", () => {
		const text = `"Hello," she said.\n\nI walked on.`;
		const spans = partitionQuoteSpans(text, "double");
		expect(hasFirstPersonInNarration(text, "double")).toBe(true);
		expect(kinds(spans).includes("quoted")).toBe(true);
	});
});

describe("partitionQuoteSpans (single) — possessive guards", () => {
	it("does not close on James' possessive inside dialogue", () => {
		const text = `I picked up the coat, 'this is James' coat.'`;
		const spans = partitionQuoteSpans(text, "single");
		expect(quotedText(text, spans)).toContain("James'");
		expect(quotedText(text, spans)).toContain("coat.");
		expect(hasFirstPersonInNarration(text, "single")).toBe(true);
		// Narration retains the leading first-person; quoted "this" is not narration-bound.
		expect(narrationText(text, spans)).toMatch(/I picked up the coat,/);
	});

	it("keeps it's James' cluster as narration when no dialogue open", () => {
		const text = `I know whose fault it is, it's James'.`;
		const spans = partitionQuoteSpans(text, "single");
		expect(quotedText(text, spans)).toBe("");
		expect(hasFirstPersonInNarration(text, "single")).toBe(true);
	});

	it("binds narration I after a single-quoted speech tag", () => {
		const text = `'Run!' I shouted.`;
		expect(hasFirstPersonInNarration(text, "single")).toBe(true);
		const spans = partitionQuoteSpans(text, "single");
		expect(quotedText(text, spans)).toBe("Run!");
	});

	it("does not bind quoted I'm to narration", () => {
		const text = `'I'm leaving,' I said.`;
		const spans = partitionQuoteSpans(text, "single");
		expect(quotedText(text, spans)).toContain("I'm leaving,");
		expect(hasFirstPersonInNarration(text, "single")).toBe(true);
		// Only one narration first-person (the tag), not the quoted I'm.
		const narration = narrationText(text, spans);
		expect(narration).toMatch(/I said/);
		expect(narration).not.toMatch(/I'm/);
	});
});
