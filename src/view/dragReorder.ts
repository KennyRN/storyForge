import { beginDrag, endDrag, isDragInProgress } from "./dragLock";

export interface DragZone {
	key: string;
	container: HTMLElement;
}

export type ReorderAxis = "vertical" | "horizontal";

/**
 * Pointer-based drag-to-reorder across one or more "zones" (each a distinct
 * container), so it works with both desktop mouse and mobile touch (unlike
 * HTML5 drag-and-drop) and supports dragging a row from one zone into
 * another — e.g. an unplaced chapter dragged up into the ordered list, or an
 * ordered chapter dragged down into the ring-fenced unplaced zone.
 *
 * Reorders the DOM live as the pointer moves. On release, reads the final
 * DOM order back out of each zone via each row's `data-key` and reports it.
 *
 * `axis` defaults to vertical (existing chapter/tag/series lists). Horizontal
 * is for left/right chip rows (PoV/location picker).
 */
export function makeReorderable(
	zones: DragZone[],
	rowSelector: string,
	handleSelector: string,
	onReorder: (zoneRowKeys: Record<string, string[]>) => void,
	axis: ReorderAxis = "vertical",
): void {
	function getRowsInZone(zone: DragZone): HTMLElement[] {
		return Array.from(zone.container.querySelectorAll<HTMLElement>(rowSelector));
	}

	function commitOrder(): void {
		const zoneRowKeys: Record<string, string[]> = {};
		for (const zone of zones) {
			zoneRowKeys[zone.key] = getRowsInZone(zone).map((r) => r.dataset.key ?? "");
		}
		onReorder(zoneRowKeys);
	}

	/** Keyboard equivalent of a one-step drag: swaps `row` with its previous/next sibling within its current zone. */
	function moveRowBy(row: HTMLElement, direction: -1 | 1): void {
		const zone = zones.find((z) => z.container === row.parentElement);
		if (!zone) return;
		const rows = getRowsInZone(zone);
		const index = rows.indexOf(row);
		const targetIndex = index + direction;
		if (index === -1 || targetIndex < 0 || targetIndex >= rows.length) return;
		if (isLocked(rows[targetIndex])) return;
		if (direction < 0) {
			zone.container.insertBefore(row, rows[targetIndex]);
		} else {
			zone.container.insertBefore(row, rows[targetIndex].nextElementSibling);
		}
		commitOrder();
	}

	function zoneForPoint(coord: number): DragZone {
		let best = zones[0];
		let bestDistance = Infinity;
		for (const zone of zones) {
			const rect = zone.container.getBoundingClientRect();
			const start = axis === "horizontal" ? rect.left : rect.top;
			const end = axis === "horizontal" ? rect.right : rect.bottom;
			if (coord >= start && coord <= end) return zone;
			const distance = coord < start ? start - coord : coord - end;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = zone;
			}
		}
		return best;
	}

	function isLocked(row: HTMLElement): boolean {
		return row.dataset.dragLocked === "true";
	}

	function bindRow(row: HTMLElement): void {
		if (isLocked(row)) return;
		const handle = row.querySelector<HTMLElement>(handleSelector);
		if (!handle) return;

		handle.tabIndex = 0;
		handle.setAttribute("role", "button");
		if (!handle.hasAttribute("aria-label")) {
			handle.setAttribute(
				"aria-label",
				axis === "horizontal"
					? "Drag to reorder, or use left and right arrow keys"
					: "Drag to reorder, or use arrow keys",
			);
		}
		handle.addEventListener("keydown", (event: KeyboardEvent) => {
			const prev = axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
			const next = axis === "horizontal" ? "ArrowRight" : "ArrowDown";
			if (event.key === prev) {
				event.preventDefault();
				moveRowBy(row, -1);
			} else if (event.key === next) {
				event.preventDefault();
				moveRowBy(row, 1);
			}
		});

		handle.addEventListener("pointerdown", (downEvent: PointerEvent) => {
			if (downEvent.button !== 0 && downEvent.pointerType === "mouse") return;
			// Belt-and-suspenders: refuse to start a second drag session on top of one the lock
			// thinks is still live (e.g. from a cancelled gesture some other edge case still let
			// through) — starting one anyway is exactly what produces the "two sessions fighting
			// over the same rows" jumble.
			if (isDragInProgress()) return;
			downEvent.preventDefault();

			row.classList.add("sf-dragging");
			beginDrag();

			let startCoord = axis === "horizontal" ? downEvent.clientX : downEvent.clientY;
			let startRect = row.getBoundingClientRect();

			const onMove = (moveEvent: PointerEvent) => {
				const pointerCoord = axis === "horizontal" ? moveEvent.clientX : moveEvent.clientY;
				const delta = pointerCoord - startCoord;
				row.style.transform = axis === "horizontal" ? `translateX(${delta}px)` : `translateY(${delta}px)`;

				const startEdge = axis === "horizontal" ? startRect.left : startRect.top;
				const size = axis === "horizontal" ? startRect.width : startRect.height;
				const currentCenter = startEdge + size / 2 + delta;
				const targetZone = zoneForPoint(currentCenter);
				const siblings = getRowsInZone(targetZone).filter((sibling) => sibling !== row);

				let insertBefore: HTMLElement | null = null;
				for (const sibling of siblings) {
					const rect = sibling.getBoundingClientRect();
					const siblingStart = axis === "horizontal" ? rect.left : rect.top;
					const siblingSize = axis === "horizontal" ? rect.width : rect.height;
					if (currentCenter < siblingStart + siblingSize / 2) {
						insertBefore = sibling;
						break;
					}
				}
				while (insertBefore && (isLocked(insertBefore) || insertBefore === row)) {
					insertBefore = insertBefore.nextElementSibling as HTMLElement | null;
				}

				const alreadyInPlace =
					row.parentElement === targetZone.container &&
					(insertBefore === null ? row.nextElementSibling === null : row.nextElementSibling === insertBefore);

				if (!alreadyInPlace) {
					if (insertBefore) {
						targetZone.container.insertBefore(row, insertBefore);
					} else {
						targetZone.container.appendChild(row);
					}
					// Re-baseline against the row's new resting position so the
					// translate offset doesn't accumulate across moves.
					row.style.transform = "";
					startRect = row.getBoundingClientRect();
					startCoord = pointerCoord;
				}
			};

			// storyForge app (Brief 5): no pointer capture. The window-level listeners below see the whole gesture,
			// including a pointer that leaves the list, and reparenting the row between zones cannot interrupt them.
			// The plugin captured the pointer and re-acquired it from a `lostpointercapture` handler after each
			// reparent; in WebKit (the app's engine) re-capturing inside that handler hangs the page.
			//
			// Cleanup runs on "pointercancel" too, not just "pointerup": the browser cancels (rather than ends) a
			// pointer sequence in some fairly common situations. Without it a cancelled drag leaves its
			// window-level listeners bound, and the next drag runs two reorder sessions at once.
			let cleaned = false;
			const onUp = () => {
				if (cleaned) return;
				cleaned = true;
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				row.classList.remove("sf-dragging");
				row.style.transform = "";
				endDrag();
				commitOrder();
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			window.addEventListener("pointercancel", onUp);
		});
	}

	for (const zone of zones) {
		for (const row of getRowsInZone(zone)) bindRow(row);
	}
}
