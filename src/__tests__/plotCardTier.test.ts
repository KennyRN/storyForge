import { describe, expect, it } from "vitest";
import {
	nextPlotCardTier,
	plotCardTooltip,
	readPlotCardTier,
	seedPlotCardTiers,
	withPlotCardTier,
} from "../view/plotCardTier";

describe("nextPlotCardTier", () => {
	it("cycles extended → collapsed → bar → extended", () => {
		expect(nextPlotCardTier("extended")).toBe("collapsed");
		expect(nextPlotCardTier("collapsed")).toBe("bar");
		expect(nextPlotCardTier("bar")).toBe("extended");
	});

	it("returns to the starting tier after three activations", () => {
		let tier = nextPlotCardTier("extended");
		tier = nextPlotCardTier(tier);
		tier = nextPlotCardTier(tier);
		expect(tier).toBe("extended");
	});
});

describe("readPlotCardTier / withPlotCardTier", () => {
	it("treats an absent key (or no map at all) as extended", () => {
		expect(readPlotCardTier(undefined, "book/ch1.md")).toBe("extended");
		expect(readPlotCardTier({ "book/ch2.md": "bar" }, "book/ch1.md")).toBe("extended");
	});

	it("stores non-extended tiers and drops the key for extended", () => {
		const bar = withPlotCardTier({}, "book/ch1.md", "bar");
		expect(bar).toEqual({ "book/ch1.md": "bar" });
		expect(withPlotCardTier(bar, "book/ch1.md", "extended")).toEqual({});
	});

	it("does not mutate the map it was given", () => {
		const original = { "book/ch1.md": "collapsed" as const };
		withPlotCardTier(original, "book/ch1.md", "bar");
		expect(original).toEqual({ "book/ch1.md": "collapsed" });
	});
});

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

describe("seedPlotCardTiers", () => {
	it("seeds nothing from an empty list", () => {
		expect(seedPlotCardTiers([])).toEqual({});
	});

	it("makes every collapsed key tier 2 (collapsed)", () => {
		expect(seedPlotCardTiers(["book/ch1.md", "book/ch3.md"])).toEqual({
			"book/ch1.md": "collapsed",
			"book/ch3.md": "collapsed",
		});
	});
});
