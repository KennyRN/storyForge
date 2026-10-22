import { describe, expect, it } from "vitest";
import { normalizeDialogueQuoteStyle } from "../dialogueQuoteStyle";

describe("normalizeDialogueQuoteStyle", () => {
	it("keeps 'single' and defaults everything else to 'double'", () => {
		expect(normalizeDialogueQuoteStyle("single")).toBe("single");
		expect(normalizeDialogueQuoteStyle("double")).toBe("double");
		expect(normalizeDialogueQuoteStyle(undefined)).toBe("double");
		expect(normalizeDialogueQuoteStyle("curly")).toBe("double");
	});
});
