/** Nested-drag-safe lock so views skip `container.empty()` while a reorder gesture is live. */

let depth = 0;

export function beginDrag(): void {
	depth++;
}

export function endDrag(): void {
	depth = Math.max(0, depth - 1);
}

export function isDragInProgress(): boolean {
	return depth > 0;
}
