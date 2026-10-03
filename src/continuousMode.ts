/**
 * Pure logic for codex-focus's continuous mode (hand-off brief §2): the entry gate and landing
 * chapter. The manuscript editor itself lives in view/manuscript/, with its own DOM-free decisions
 * in src/manuscript/.
 */

/**
 * Continuous mode's self-gate (hand-off brief §2.1): offered only once there's more than one
 * placed chapter to traverse — nothing to read continuously otherwise. Same discipline as the
 * `[+]` tile and the (future) idea inbox: a categorical gate, not a tuned number.
 */
export function canEnterContinuousMode(placedCount: number): boolean {
	return placedCount > 1;
}

/**
 * Where to land on entry (hand-off brief §2.4): the reader's current chapter if it's still on the
 * placed spine, otherwise the first placed chapter. Returns null only when there are no placed
 * chapters at all (callers must already have checked `canEnterContinuousMode`).
 */
export function resolveEntryChapter(ordered: string[], activeChapterFilename: string | null): string | null {
	if (ordered.length === 0) return null;
	if (activeChapterFilename && ordered.includes(activeChapterFilename)) return activeChapterFilename;
	return ordered[0];
}
