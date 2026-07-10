export interface CodexDragRowInfo {
	key: string;
	type: "file" | "folder";
	parentKey: string | null;
}

export interface CodexDropTarget {
	parentId: string | null;
	/** Insert immediately before this key, or at the end of the container if null. */
	beforeKey: string | null;
}

const NEST_BAND_TOP = 0.25;
const NEST_BAND_BOTTOM = 0.75;

/**
 * Tree-aware drag-and-drop for the Codex tree: reordering AND drag-to-nest (dropping onto a
 * folder reparents into it). Deliberately a different mechanism from `dragReorder.ts`'s flat,
 * pre-declared-zone live-DOM-move approach — a collapsed folder's children aren't even in the
 * DOM here, so hit-testing via `elementFromPoint` against whatever rows are currently rendered,
 * with a single persist-and-re-render on drop, is the better fit.
 *
 * Splits each hovered row into three vertical bands: the middle 50% is a "nest inside" target
 * (only valid when the row is a folder), the outer bands are "insert above/below" at that row's
 * own level. Dropping onto the dragged item itself, or (for a dragged folder) onto any of its
 * own descendants, is never a valid target — no indicator is shown and no drop occurs.
 */
export function attachCodexDragReorder(
	container: HTMLElement,
	rows: CodexDragRowInfo[],
	isDescendant: (ancestorId: string, candidateId: string) => boolean,
	onDrop: (dragged: { key: string; type: "file" | "folder" }, target: CodexDropTarget) => void,
): void {
	const rowByKey = new Map(rows.map((r) => [r.key, r]));

	function closestRow(target: EventTarget | null): HTMLElement | null {
		if (!(target instanceof Element)) return null;
		const row = target.closest<HTMLElement>(".sf-codex-folder-header, .sf-codex-file");
		return row && container.contains(row) ? row : null;
	}

	const rowElements = Array.from(container.querySelectorAll<HTMLElement>(".sf-codex-folder-header, .sf-codex-file"));

	for (const rowEl of rowElements) {
		const handle = rowEl.querySelector<HTMLElement>(".sf-drag-handle");
		const draggedKey = rowEl.dataset.key;
		const draggedType = rowEl.dataset.type as "file" | "folder" | undefined;
		if (!handle || !draggedKey || !draggedType || !rowByKey.has(draggedKey)) continue;

		handle.tabIndex = 0;
		handle.setAttribute("role", "button");
		if (!handle.hasAttribute("aria-label")) {
			handle.setAttribute("aria-label", "Drag to reorder, or use arrow keys to move or change nesting");
		}
		handle.addEventListener("keydown", (event: KeyboardEvent) => {
			const info = rowByKey.get(draggedKey);
			if (!info) return;

			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				const siblings = rows.filter((r) => r.parentKey === info.parentKey);
				const index = siblings.findIndex((r) => r.key === draggedKey);
				if (index === -1) return;
				if (event.key === "ArrowUp") {
					if (index === 0) return;
					onDrop(
						{ key: draggedKey, type: draggedType },
						{ parentId: info.parentKey, beforeKey: siblings[index - 1].key },
					);
				} else {
					if (index === siblings.length - 1) return;
					onDrop(
						{ key: draggedKey, type: draggedType },
						{ parentId: info.parentKey, beforeKey: siblings[index + 2]?.key ?? null },
					);
				}
			} else if (event.key === "ArrowLeft") {
				// Outdent: re-parent to the grandparent, positioned right after the current parent.
				event.preventDefault();
				if (info.parentKey === null) return;
				const parentInfo = rowByKey.get(info.parentKey);
				const grandparentKey = parentInfo?.parentKey ?? null;
				const grandSiblings = rows.filter((r) => r.parentKey === grandparentKey);
				const parentIndex = grandSiblings.findIndex((r) => r.key === info.parentKey);
				onDrop(
					{ key: draggedKey, type: draggedType },
					{ parentId: grandparentKey, beforeKey: grandSiblings[parentIndex + 1]?.key ?? null },
				);
			} else if (event.key === "ArrowRight") {
				// Indent: nest under the previous sibling, if it's a folder.
				event.preventDefault();
				const siblings = rows.filter((r) => r.parentKey === info.parentKey);
				const index = siblings.findIndex((r) => r.key === draggedKey);
				const prevSibling = index > 0 ? siblings[index - 1] : null;
				if (!prevSibling || prevSibling.type !== "folder") return;
				onDrop({ key: draggedKey, type: draggedType }, { parentId: prevSibling.key, beforeKey: null });
			}
		});

		handle.addEventListener("pointerdown", (downEvent: PointerEvent) => {
			if (downEvent.button !== 0 && downEvent.pointerType === "mouse") return;
			downEvent.preventDefault();

			const pointerId = downEvent.pointerId;
			handle.setPointerCapture(pointerId);
			rowEl.classList.add("sf-dragging");

			let hoveredEl: HTMLElement | null = null;
			let pendingTarget: CodexDropTarget | null = null;

			const clearIndicator = () => {
				hoveredEl?.classList.remove("sf-codex-drop-above", "sf-codex-drop-below", "sf-codex-drop-nest");
				hoveredEl = null;
			};

			const isValidHoverTarget = (hoveredKey: string): boolean => {
				if (hoveredKey === draggedKey) return false;
				if (draggedType === "folder" && isDescendant(draggedKey, hoveredKey)) return false;
				return true;
			};

			const onMove = (moveEvent: PointerEvent) => {
				const row = closestRow(document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
				const hoveredKey = row?.dataset.key;
				const hoveredInfo = hoveredKey ? rowByKey.get(hoveredKey) : undefined;
				if (!row || !hoveredKey || !hoveredInfo || !isValidHoverTarget(hoveredKey)) {
					clearIndicator();
					pendingTarget = null;
					return;
				}

				if (row !== hoveredEl) {
					clearIndicator();
					hoveredEl = row;
				}

				const rect = row.getBoundingClientRect();
				const relativeY = rect.height > 0 ? (moveEvent.clientY - rect.top) / rect.height : 0.5;
				const hoveredType = row.dataset.type as "file" | "folder";

				if (hoveredType === "folder" && relativeY > NEST_BAND_TOP && relativeY < NEST_BAND_BOTTOM) {
					row.classList.remove("sf-codex-drop-above", "sf-codex-drop-below");
					row.classList.add("sf-codex-drop-nest");
					pendingTarget = { parentId: hoveredKey, beforeKey: null };
				} else if (relativeY <= NEST_BAND_TOP) {
					row.classList.remove("sf-codex-drop-below", "sf-codex-drop-nest");
					row.classList.add("sf-codex-drop-above");
					pendingTarget = { parentId: hoveredInfo.parentKey, beforeKey: hoveredKey };
				} else {
					row.classList.remove("sf-codex-drop-above", "sf-codex-drop-nest");
					row.classList.add("sf-codex-drop-below");
					const siblings = rows.filter((r) => r.parentKey === hoveredInfo.parentKey);
					const idx = siblings.findIndex((r) => r.key === hoveredKey);
					const next = idx !== -1 ? siblings[idx + 1] : undefined;
					pendingTarget = { parentId: hoveredInfo.parentKey, beforeKey: next?.key ?? null };
				}
			};

			const onUp = () => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				rowEl.classList.remove("sf-dragging");
				clearIndicator();
				try {
					handle.releasePointerCapture(pointerId);
				} catch {
					/* already released */
				}
				if (pendingTarget) {
					onDrop({ key: draggedKey, type: draggedType }, pendingTarget);
				}
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		});
	}
}
