/** Matches Obsidian EmptyView copy, including the older "Plugin no longer active. ..." prefix. */
const GONE_AWAY_VIEW_TYPE_RE = /\(([^)]+)\) has gone away/;

export function viewTypeFromGoneAwayText(text: string): string | null {
	return GONE_AWAY_VIEW_TYPE_RE.exec(text)?.[1] ?? null;
}

export function isGoneAwayPlaceholder(text: string): boolean {
	return /has gone away/.test(text);
}

/**
 * Recover the original custom view type from EmptyView chrome: the gone-away sentence,
 * a tab title that is still the raw view-type id, or `getViewState().type`.
 */
export function viewTypeFromLeafChrome(text: string, knownTypes: readonly string[]): string | null {
	const fromMessage = viewTypeFromGoneAwayText(text);
	if (fromMessage && knownTypes.includes(fromMessage)) return fromMessage;
	const sorted = [...knownTypes].sort((a, b) => b.length - a.length);
	for (const type of sorted) {
		if (text.includes(type)) return type;
	}
	return null;
}
