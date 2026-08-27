type RecommendMode = "novel" | "chapter" | "details" | "dossier";
export type RecommendTab = RecommendMode | "forge" | "archive";

/** Exactly one Story Context tab is active. Forge family and Archive sit beside the
 * Novel/Chapter/Details/Dossier modes, so those mode tabs must not stay highlighted while
 * either overlay is showing. */
export function isRecommendTabActive(
	tab: RecommendTab,
	state: { forgeFamilyExpanded: boolean; showingArchive: boolean; mode: RecommendMode },
): boolean {
	if (state.forgeFamilyExpanded) return tab === "forge";
	if (state.showingArchive) return tab === "archive";
	return tab === state.mode;
}
