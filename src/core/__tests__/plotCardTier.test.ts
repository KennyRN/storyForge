import { describe, expect, it } from "vitest";
import { plotCardTooltip } from "../plotCardTier";

describe("plotCardTooltip", () => {
	it("is the count alone for an empty description", () => {
		expect(plotCardTooltip(3412, "")).toBe("3,412");
	});

	it("is the count alone for a whitespace-only description", () => {
		expect(plotCardTooltip(3412, "  \n\t\n ")).toBe("3,412");
	});

	it("joins the count and a single-line description with a colon", () => {
		expect(plotCardTooltip(3412, "Maren crosses the causeway.")).toBe("3,412: Maren crosses the causeway.");
	});

	it("uses only the first paragraph of a multi-line description", () => {
		expect(plotCardTooltip(3412, "Maren crosses the causeway.\nThe tide turns.\r\nLater.")).toBe(
			"3,412: Maren crosses the causeway.",
		);
	});

	it("skips leading blank lines before taking the first paragraph", () => {
		expect(plotCardTooltip(0, "\n\n  Maren crosses the causeway.\nThe tide turns.")).toBe(
			"0: Maren crosses the causeway.",
		);
	});
});
