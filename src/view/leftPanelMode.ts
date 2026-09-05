/** Retired left-rail leaf; layouts that still name it are remapped onto `storyforge-view`. */
export const LEGACY_STORYTELLING_VIEW_TYPE = "storyforge-storytelling-view";

/** Focus Mode on Story Context follows the left-rail face (storytelling mode → on). */
export function focusModeForStorytellingMode(storytellingMode: boolean): boolean {
	return storytellingMode;
}

/** Vault-open / auto-focus landing: on → storytelling mode, off → storyforge. */
export function storytellingModeForAutoFocus(autoFocus: boolean): boolean {
	return autoFocus;
}

export function mapLegacyLeftRailViewType(type: string): string {
	return type === LEGACY_STORYTELLING_VIEW_TYPE ? "storyforge-view" : type;
}
