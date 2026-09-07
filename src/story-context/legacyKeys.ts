/**
 * Every Story Context formatting/behaviour setting was prefixed `recommend*` before the feature
 * was renamed to "Story Context". Rewrite any surviving legacy key onto its `storyContext*` name
 * — only when that name is a real setting (`isKnownKey`) and isn't already present — so an
 * upgrade, or an import of a settings/theme export written before the rename, keeps the user's
 * customisation instead of silently resetting it to defaults. Legacy keys are always dropped.
 * Mutates `raw`.
 */
export function remapLegacyStoryContextKeys(
	raw: Record<string, unknown>,
	isKnownKey: (key: string) => boolean,
): void {
	const legacyPrefix = "recommend";
	for (const key of Object.keys(raw)) {
		if (!key.startsWith(legacyPrefix)) continue;
		const renamed = `storyContext${key.slice(legacyPrefix.length)}`;
		if (isKnownKey(renamed)) {
			if (!(renamed in raw)) raw[renamed] = raw[key];
		}
		delete raw[key];
	}
}
