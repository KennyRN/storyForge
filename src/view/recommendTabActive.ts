type RecommendMode = "novel" | "chapter";
export type RecommendTab = RecommendMode | "forge" | "archive" | "ideas";

/** Exactly one Story Context tab is active. Forge family, Archive, and Notebook sit beside the
 * Novel/Chapter modes, so those mode tabs must not stay highlighted while
 * any overlay is showing. */
export function isRecommendTabActive(
	tab: RecommendTab,
	state: {
		forgeFamilyExpanded: boolean;
		showingArchive: boolean;
		showingIdeas: boolean;
		mode: RecommendMode;
	},
): boolean {
	if (state.forgeFamilyExpanded) return tab === "forge";
	if (state.showingArchive) return tab === "archive";
	if (state.showingIdeas) return tab === "ideas";
	return tab === state.mode;
}
