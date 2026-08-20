/**
 * Pure helpers for host API / right-rail ordering (unit-testable without Obsidian).
 */

export interface RightRailOrderEntry {
	viewType: string;
	orderHint: number;
}

/**
 * Story Context → registered (by orderHint). Archive and Forge-family companions both live
 * inside Story Context itself (RecommendationView.ts) rather than as their own right-rail tabs.
 */
export function buildRightRailTypeOrder(storyContext: string, registered: RightRailOrderEntry[]): string[] {
	const mid = [...registered]
		.sort((a, b) => a.orderHint - b.orderHint || a.viewType.localeCompare(b.viewType))
		.map((r) => r.viewType);
	return [storyContext, ...mid];
}

/** Missing tabs OK; relative order of present expected types must match. */
export function isCanonicalTypeOrder(expected: string[], actualPresentOrder: string[]): boolean {
	const present = expected.filter((t) => actualPresentOrder.includes(t));
	const actual = actualPresentOrder.filter((t) => expected.includes(t));
	return actual.join("\0") === present.join("\0");
}
