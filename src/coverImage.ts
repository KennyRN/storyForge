/**
 * Cover-filename safety, shared by book.ts (per-book covers under `_backstage/storyforge/<book>/`)
 * and series.ts (the series' own cover under `seriesBackstagePath()`) — one copy rather than two
 * drifting apart.
 */

/**
 * Cover files live directly in their owning backstage folder, so a cover name is only ever a bare
 * filename. Anything carrying a separator, a `..`, or a null byte is rejected rather than
 * normalised — a hand-edited `cover-image` must not be able to name a file outside that folder.
 */
export function safeCoverFilename(name: unknown): string | null {
	if (typeof name !== "string") return null;
	const trimmed = name.trim();
	if (!trimmed || trimmed === "." || trimmed === "..") return null;
	if (/[/\\\0]/.test(trimmed)) return null;
	return trimmed;
}

/** Cover extensions come from a picked file's name, so restrict them to a plain alphanumeric suffix. */
export function safeCoverExtension(extension: string): string {
	const normalized = extension.trim().toLowerCase();
	return /^[a-z0-9]{1,8}$/.test(normalized) ? normalized : "png";
}
