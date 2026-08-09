/** Nested-drag-safe lock so views skip `container.empty()` while a reorder gesture is live. */

let depth = 0;
let lastBeginAt = 0;

/** If something ever leaks a `beginDrag()` with no matching `endDrag()` (an unhandled pointer
 * event, a modal torn down mid-gesture, etc.), the lock would otherwise stay stuck forever —
 * every render() anywhere that guards on `isDragInProgress()` silently no-ops from then on, with
 * no way to recover short of reloading the plugin. Auto-clear after a stale window so a leak is a
 * brief glitch instead of a permanent lockup. Legitimate drags finish in well under this. */
const STALE_LOCK_MS = 15_000;

export function beginDrag(): void {
	depth++;
	lastBeginAt = Date.now();
}

export function endDrag(): void {
	depth = Math.max(0, depth - 1);
}

export function isDragInProgress(): boolean {
	if (depth > 0 && Date.now() - lastBeginAt > STALE_LOCK_MS) {
		depth = 0;
	}
	return depth > 0;
}
