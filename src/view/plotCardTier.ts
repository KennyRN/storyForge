/**
 * Pure state and text helpers for the Novel overview page's three-tier chapter cards
 * (NovelPanel.ts's renderNovelPlot, wide layout only) — deliberately DOM-free so they can be unit
 * tested without a live Obsidian environment, the same way novelLengthBar.ts and seriesNovelBar.ts
 * are. The right sidebar's Novel tab keeps its own two-state collapse (collapsedPlotChapterKeys)
 * and uses none of this.
 */
import { formatWordCount } from "../wordCount";

/**
 * "bar": the data bar and title only. "collapsed": the data bar and the description (the card's
 * long-standing collapsed state). "extended": the data bar, the PoV/Location/Length rows and the
 * description.
 */
export type PlotCardTier = "bar" | "collapsed" | "extended";

/** The stored tiers, keyed `${bookFolderName}/${filename}`. Only non-extended cards are stored —
 * an absent key means extended, so a new chapter starts extended. */
export type PlotCardTierMap = Record<string, Exclude<PlotCardTier, "extended">>;

/** One activation's step: extended → collapsed → bar → extended. */
export function nextPlotCardTier(tier: PlotCardTier): PlotCardTier {
	switch (tier) {
		case "extended":
			return "collapsed";
		case "collapsed":
			return "bar";
		case "bar":
			return "extended";
	}
}

export function readPlotCardTier(tiers: PlotCardTierMap | undefined, key: string): PlotCardTier {
	return tiers?.[key] ?? "extended";
}

/** A copy of `tiers` with `key` set to `tier` — removed outright when `tier` is extended. */
export function withPlotCardTier(tiers: PlotCardTierMap | undefined, key: string, tier: PlotCardTier): PlotCardTierMap {
	const next: PlotCardTierMap = { ...(tiers ?? {}) };
	if (tier === "extended") delete next[key];
	else next[key] = tier;
	return next;
}

/**
 * The data bar's tooltip: `<word count>: <first paragraph of the description>`, or the count
 * alone when the description is empty or whitespace. The first paragraph is everything before
 * the first line break once leading whitespace (blank lines included) is trimmed.
 */
export function plotCardTooltip(wordCount: number, description: string): string {
	const count = formatWordCount(wordCount);
	const firstParagraph = description.trimStart().split(/\r?\n/, 1)[0].trimEnd();
	return firstParagraph ? `${count}: ${firstParagraph}` : count;
}

/** The one-time seed from the sidebar's collapsed list: every collapsed key becomes "collapsed". */
export function seedPlotCardTiers(collapsedKeys: readonly string[]): PlotCardTierMap {
	const tiers: PlotCardTierMap = {};
	for (const key of collapsedKeys) tiers[key] = "collapsed";
	return tiers;
}
