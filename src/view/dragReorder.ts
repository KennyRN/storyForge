export interface DragZone {
	key: string;
	container: HTMLElement;
}

/**
 * Pointer-based drag-to-reorder across one or more "zones" (each a distinct
 * container), so it works with both desktop mouse and mobile touch (unlike
 * HTML5 drag-and-drop) and supports dragging a row from one zone into
 * another — e.g. an unplaced chapter dragged up into the ordered list, or an
 * ordered chapter dragged down into the ring-fenced unplaced zone.
 *
 * Reorders the DOM live as the pointer moves. On release, reads the final
 * DOM order back out of each zone via each row's `data-key` and reports it.
 */
export function makeReorderable(
	zones: DragZone[],
	rowSelector: string,
	handleSelector: string,
	onReorder: (zoneRowKeys: Record<string, string[]>) => void,
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
		if (direction < 0) {
			zone.container.insertBefore(row, rows[targetIndex]);
		} else {
			zone.container.insertBefore(row, rows[targetIndex].nextElementSibling);
		}
		commitOrder();
	}

	function zoneForPoint(clientY: number): DragZone {
		let best = zones[0];
		let bestDistance = Infinity;
		for (const zone of zones) {
			const rect = zone.container.getBoundingClientRect();
			if (clientY >= rect.top && clientY <= rect.bottom) return zone;
			const distance = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = zone;
			}
		}
		return best;
	}

	function bindRow(row: HTMLElement): void {
		const handle = row.querySelector<HTMLElement>(handleSelector) ?? row;

		handle.tabIndex = 0;
		handle.setAttribute("role", "button");
		if (!handle.hasAttribute("aria-label")) {
			handle.setAttribute("aria-label", "Drag to reorder, or use arrow keys");
		}
		handle.addEventListener("keydown", (event: KeyboardEvent) => {
			if (event.key === "ArrowUp") {
				event.preventDefault();
				moveRowBy(row, -1);
			} else if (event.key === "ArrowDown") {
				event.preventDefault();
				moveRowBy(row, 1);
			}
		});

		handle.addEventListener("pointerdown", (downEvent: PointerEvent) => {
			if (downEvent.button !== 0 && downEvent.pointerType === "mouse") return;
			downEvent.preventDefault();

			const pointerId = downEvent.pointerId;
			handle.setPointerCapture(pointerId);
			row.classList.add("sf-dragging");

			let startY = downEvent.clientY;
			let startRect = row.getBoundingClientRect();

			const onMove = (moveEvent: PointerEvent) => {
				const deltaY = moveEvent.clientY - startY;
				row.style.transform = `translateY(${deltaY}px)`;

				const currentCenter = startRect.top + startRect.height / 2 + deltaY;
				const targetZone = zoneForPoint(currentCenter);
				const siblings = getRowsInZone(targetZone).filter((sibling) => sibling !== row);

				let insertBefore: HTMLElement | null = null;
				for (const sibling of siblings) {
					const rect = sibling.getBoundingClientRect();
					if (currentCenter < rect.top + rect.height / 2) {
						insertBefore = sibling;
						break;
					}
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
					// translateY offset doesn't accumulate across moves.
					row.style.transform = "";
					startRect = row.getBoundingClientRect();
					startY = moveEvent.clientY;
				}
			};

			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				row.classList.remove("sf-dragging");
				row.style.transform = "";
				try {
					handle.releasePointerCapture(pointerId);
				} catch {
					/* already released */
				}
				commitOrder();
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		});
	}

	for (const zone of zones) {
		for (const row of getRowsInZone(zone)) bindRow(row);
	}
}
