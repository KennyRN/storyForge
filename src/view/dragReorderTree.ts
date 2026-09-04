import { beginDrag, endDrag } from "./dragLock";

export interface CodexDragRowInfo {
	key: string;
	type: "file" | "folder";
	parentKey: string | null;
	/** Fired on a plain press-and-release (under DRAG_MOVE_THRESHOLD_PX) on this row — open the
	 * file / toggle the folder, wired here instead of as a separate `click` listener on the row
	 * element. `target` is the original pointerdown's target, e.g. so a folder row can tell a
	 * chevron press (toggle) apart from the rest of the row (open its linked note). See
	 * attachCodexDragReorder's own doc comment for why a real `click` event isn't used for this. */
	onClick?: (target: EventTarget | null) => void;
}

export interface CodexDropTarget {
	parentId: string | null;
	/** Insert immediately before this key, or at the end of the container if null. */
	beforeKey: string | null;
}

const NEST_BAND_TOP = 0.25;
const NEST_BAND_BOTTOM = 0.75;

/*
 * ── Revertable feature test — disabled, not deleted ──
 * The Codex tree's drag-and-drop used to require grabbing a narrow `.sf-drag-handle` grip icon on
 * each row. Replaced below by a whole-row "click to open/toggle, hold and move to reorder"
 * gesture (same drop-target logic, just detected differently) at the request that drag should
 * work from anywhere on the row rather than a thin handle. This old handle-based version is kept
 * here, commented out, as a fast revert path if the new gesture turns out to feel wrong in
 * practice — a future audit that finds this block should flag it for removal once the new
 * behaviour has proven itself out.
 *
 * export function attachCodexDragReorder(
 * 	container: HTMLElement,
 * 	rows: CodexDragRowInfo[],
 * 	isDescendant: (ancestorId: string, candidateId: string) => boolean,
 * 	onDrop: (dragged: { key: string; type: "file" | "folder" }, target: CodexDropTarget) => void,
 * ): void {
 * 	const rowByKey = new Map(rows.map((r) => [r.key, r]));
 *
 * 	function closestRow(target: EventTarget | null): HTMLElement | null {
 * 		if (!(target instanceof Element)) return null;
 * 		const row = target.closest<HTMLElement>(".sf-codex-folder-header, .sf-codex-file");
 * 		return row && container.contains(row) ? row : null;
 * 	}
 *
 * 	const rowElements = Array.from(container.querySelectorAll<HTMLElement>(".sf-codex-folder-header, .sf-codex-file"));
 *
 * 	for (const rowEl of rowElements) {
 * 		const handle = rowEl.querySelector<HTMLElement>(".sf-drag-handle");
 * 		const draggedKey = rowEl.dataset.key;
 * 		const draggedType = rowEl.dataset.type as "file" | "folder" | undefined;
 * 		if (!handle || !draggedKey || !draggedType || !rowByKey.has(draggedKey)) continue;
 *
 * 		handle.tabIndex = 0;
 * 		handle.setAttribute("role", "button");
 * 		if (!handle.hasAttribute("aria-label")) {
 * 			handle.setAttribute("aria-label", "Drag to reorder, or use arrow keys to move or change nesting");
 * 		}
 * 		handle.addEventListener("keydown", (event: KeyboardEvent) => {
 * 			const info = rowByKey.get(draggedKey);
 * 			if (!info) return;
 *
 * 			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
 * 				event.preventDefault();
 * 				const siblings = rows.filter((r) => r.parentKey === info.parentKey);
 * 				const index = siblings.findIndex((r) => r.key === draggedKey);
 * 				if (index === -1) return;
 * 				if (event.key === "ArrowUp") {
 * 					if (index === 0) return;
 * 					onDrop(
 * 						{ key: draggedKey, type: draggedType },
 * 						{ parentId: info.parentKey, beforeKey: siblings[index - 1].key },
 * 					);
 * 				} else {
 * 					if (index === siblings.length - 1) return;
 * 					onDrop(
 * 						{ key: draggedKey, type: draggedType },
 * 						{ parentId: info.parentKey, beforeKey: siblings[index + 2]?.key ?? null },
 * 					);
 * 				}
 * 			} else if (event.key === "ArrowLeft") {
 * 				// Outdent: re-parent to the grandparent, positioned right after the current parent.
 * 				event.preventDefault();
 * 				if (info.parentKey === null) return;
 * 				const parentInfo = rowByKey.get(info.parentKey);
 * 				const grandparentKey = parentInfo?.parentKey ?? null;
 * 				const grandSiblings = rows.filter((r) => r.parentKey === grandparentKey);
 * 				const parentIndex = grandSiblings.findIndex((r) => r.key === info.parentKey);
 * 				onDrop(
 * 					{ key: draggedKey, type: draggedType },
 * 					{ parentId: grandparentKey, beforeKey: grandSiblings[parentIndex + 1]?.key ?? null },
 * 				);
 * 			} else if (event.key === "ArrowRight") {
 * 				// Indent: nest under the previous sibling, if it's a folder.
 * 				event.preventDefault();
 * 				const siblings = rows.filter((r) => r.parentKey === info.parentKey);
 * 				const index = siblings.findIndex((r) => r.key === draggedKey);
 * 				const prevSibling = index > 0 ? siblings[index - 1] : null;
 * 				if (!prevSibling || prevSibling.type !== "folder") return;
 * 				onDrop({ key: draggedKey, type: draggedType }, { parentId: prevSibling.key, beforeKey: null });
 * 			}
 * 		});
 *
 * 		handle.addEventListener("pointerdown", (downEvent: PointerEvent) => {
 * 			if (downEvent.button !== 0 && downEvent.pointerType === "mouse") return;
 * 			downEvent.preventDefault();
 *
 * 			const pointerId = downEvent.pointerId;
 * 			handle.setPointerCapture(pointerId);
 * 			rowEl.classList.add("sf-dragging");
 * 			beginDrag();
 *
 * 			let hoveredEl: HTMLElement | null = null;
 * 			let pendingTarget: CodexDropTarget | null = null;
 *
 * 			const clearIndicator = () => {
 * 				hoveredEl?.classList.remove("sf-codex-drop-above", "sf-codex-drop-below", "sf-codex-drop-nest");
 * 				hoveredEl = null;
 * 			};
 *
 * 			const isValidHoverTarget = (hoveredKey: string): boolean => {
 * 				if (hoveredKey === draggedKey) return false;
 * 				if (draggedType === "folder" && isDescendant(draggedKey, hoveredKey)) return false;
 * 				return true;
 * 			};
 *
 * 			const onMove = (moveEvent: PointerEvent) => {
 * 				const row = closestRow(document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
 * 				const hoveredKey = row?.dataset.key;
 * 				const hoveredInfo = hoveredKey ? rowByKey.get(hoveredKey) : undefined;
 * 				if (!row || !hoveredKey || !hoveredInfo || !isValidHoverTarget(hoveredKey)) {
 * 					clearIndicator();
 * 					pendingTarget = null;
 * 					return;
 * 				}
 *
 * 				if (row !== hoveredEl) {
 * 					clearIndicator();
 * 					hoveredEl = row;
 * 				}
 *
 * 				const rect = row.getBoundingClientRect();
 * 				const relativeY = rect.height > 0 ? (moveEvent.clientY - rect.top) / rect.height : 0.5;
 * 				const hoveredType = row.dataset.type as "file" | "folder";
 *
 * 				if (hoveredType === "folder" && relativeY > NEST_BAND_TOP && relativeY < NEST_BAND_BOTTOM) {
 * 					row.classList.remove("sf-codex-drop-above", "sf-codex-drop-below");
 * 					row.classList.add("sf-codex-drop-nest");
 * 					pendingTarget = { parentId: hoveredKey, beforeKey: null };
 * 				} else if (relativeY <= NEST_BAND_TOP) {
 * 					row.classList.remove("sf-codex-drop-below", "sf-codex-drop-nest");
 * 					row.classList.add("sf-codex-drop-above");
 * 					pendingTarget = { parentId: hoveredInfo.parentKey, beforeKey: hoveredKey };
 * 				} else {
 * 					row.classList.remove("sf-codex-drop-above", "sf-codex-drop-nest");
 * 					row.classList.add("sf-codex-drop-below");
 * 					const siblings = rows.filter((r) => r.parentKey === hoveredInfo.parentKey);
 * 					const idx = siblings.findIndex((r) => r.key === hoveredKey);
 * 					const next = idx !== -1 ? siblings[idx + 1] : undefined;
 * 					pendingTarget = { parentId: hoveredInfo.parentKey, beforeKey: next?.key ?? null };
 * 				}
 * 			};
 *
 * 			const onUp = () => {
 * 				window.removeEventListener("pointermove", onMove);
 * 				window.removeEventListener("pointerup", onUp);
 * 				rowEl.classList.remove("sf-dragging");
 * 				clearIndicator();
 * 				try {
 * 					handle.releasePointerCapture(pointerId);
 * 				} catch {
 * 					/* already released *\/
 * 				}
 * 				endDrag();
 * 				if (pendingTarget) {
 * 					onDrop({ key: draggedKey, type: draggedType }, pendingTarget);
 * 				}
 * 			};
 *
 * 			window.addEventListener("pointermove", onMove);
 * 			window.addEventListener("pointerup", onUp);
 * 		});
 * 	}
 * }
 */

/** Below this point, drags below this many pixels of pointer movement count as a click, not a
 * drag — small enough that a deliberate reorder gesture is never mistaken for a click, large
 * enough that a normal click's tiny incidental jitter never gets mistaken for a drag. */
const DRAG_MOVE_THRESHOLD_PX = 6;

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
 *
 * No grip handle: the whole row is both the click target (open the file / toggle the folder, via
 * each row's own `onClick` in CodexDragRowInfo — see there) and the drag target. A `pointerdown`
 * starts tracking without committing to either interpretation; only once the pointer has moved
 * past DRAG_MOVE_THRESHOLD_PX does this become a drag (locking in `beginDrag()`, the dragging
 * visual, and the drop-target bands below) — a press-and-release under that threshold instead
 * fires `onClick` directly from this same gesture's `pointerup`, deliberately NOT a separate
 * `click` listener on the row: Obsidian's own click-to-focus-the-pane handling swallows a plain
 * `click`'s first firing in an unfocused sidebar (the same issue the transport buttons had —
 * see navigatorControls.ts), but raw pointerdown/pointerup events aren't affected, so acting
 * directly on pointerup sidesteps it entirely.
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
		const draggedKey = rowEl.dataset.key;
		const draggedType = rowEl.dataset.type as "file" | "folder" | undefined;
		if (!draggedKey || !draggedType || !rowByKey.has(draggedKey)) continue;

		rowEl.tabIndex = 0;
		if (!rowEl.hasAttribute("aria-keyshortcuts")) {
			rowEl.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown ArrowLeft ArrowRight");
		}
		rowEl.addEventListener("keydown", (event: KeyboardEvent) => {
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

		rowEl.addEventListener("pointerdown", (downEvent: PointerEvent) => {
			if (downEvent.button !== 0 && downEvent.pointerType === "mouse") return;
			// Leave inline-rename inputs, the chevron's own click target, and any icon-action button
			// (delete, etc.) entirely alone — those have their own click handling, and starting drag
			// tracking on top of them would only get in the way.
			const startTarget = downEvent.target as HTMLElement | null;
			if (startTarget?.closest("input, .sf-icon-action")) return;

			// Deliberately NOT calling preventDefault() here, before we even know this is a drag —
			// doing so used to block the pane's own normal focus-on-click for *every* interaction
			// with a row (Obsidian's own activation logic treats a prevented pointerdown as "already
			// handled" and skips activating the leaf), which produced a "takes several clicks before
			// anything responds" experience — the same family of bug as the transport buttons
			// needing pointerdown over click, but caused by suppressing default here instead. Only
			// call it once beginIfPastThreshold below has confirmed a real drag, so a plain click
			// behaves exactly as if this listener weren't here at all.
			const startX = downEvent.clientX;
			const startY = downEvent.clientY;
			const pointerId = downEvent.pointerId;
			let dragging = false;
			let hoveredEl: HTMLElement | null = null;
			let pendingTarget: CodexDropTarget | null = null;

			// Held for the *entire* press-to-release window, not just the confirmed-drag portion —
			// a click's own onClick (below) can trigger a full re-render (e.g. opening a file fires
			// a later 'file-open'/'active-leaf-change' that the view responds to with a full
			// container.empty()), and if that render happened to land in the narrow gap between a
			// *later* gesture's pointerdown and its threshold being crossed, it would wipe the row
			// out from under that in-progress drag before it ever locked in — every drag attempt
			// right after any click would silently fail. Locking from pointerdown means any such
			// render is deferred (via render()'s own isDragInProgress() guard) until this gesture
			// has fully resolved, whatever it turns out to be. Released right before onClick fires
			// (not just at the very end) so the render onClick itself triggers isn't suppressed.
			beginDrag();
			let gestureLockReleased = false;
			const releaseGestureLock = () => {
				if (gestureLockReleased) return;
				gestureLockReleased = true;
				endDrag();
			};

			const clearIndicator = () => {
				hoveredEl?.classList.remove("sf-codex-drop-above", "sf-codex-drop-below", "sf-codex-drop-nest");
				hoveredEl = null;
			};

			const isValidHoverTarget = (hoveredKey: string): boolean => {
				if (hoveredKey === draggedKey) return false;
				if (draggedType === "folder" && isDescendant(draggedKey, hoveredKey)) return false;
				return true;
			};

			const beginIfPastThreshold = (moveEvent: PointerEvent): boolean => {
				if (dragging) return true;
				const dx = moveEvent.clientX - startX;
				const dy = moveEvent.clientY - startY;
				if (Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_PX) return false;
				dragging = true;
				// Only now — a real drag, not a click — do we suppress text-selection/drag-ghost for
				// the rest of the gesture. See the pointerdown handler's own comment for why this
				// isn't called any earlier.
				moveEvent.preventDefault();
				rowEl.setPointerCapture(pointerId);
				rowEl.classList.add("sf-dragging");
				// Forces a "grabbing" cursor over the whole document for as long as the drag lasts —
				// on the body rather than just this row, since the pointer spends most of the drag
				// hovering *other* rows (drop targets), which would otherwise show their own
				// cursor (pointer, text, etc.) instead.
				document.body.classList.add("sf-codex-drag-active");
				return true;
			};

			const onMove = (moveEvent: PointerEvent) => {
				if (!beginIfPastThreshold(moveEvent)) return;

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
					let next = idx !== -1 ? siblings[idx + 1] : undefined;
					if (next?.key === draggedKey) next = idx !== -1 ? siblings[idx + 2] : undefined;
					pendingTarget = { parentId: hoveredInfo.parentKey, beforeKey: next?.key ?? null };
				}
			};

			const onUp = (upEvent: PointerEvent) => {
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
				window.removeEventListener("pointercancel", onUp);
				if (!dragging) {
					// A plain press-and-release under the drag threshold — fire the row's own click
					// behaviour (open the file / toggle the folder) right here, on this same
					// pointerdown-rooted gesture, rather than a separate `click` listener elsewhere that
					// would be just as vulnerable to the "first click on an unfocused pane does nothing"
					// issue this file's own doc comment explains. Only for a genuine pointerup, not a
					// pointercancel — an aborted gesture is not a click. Release the gesture lock
					// *before* calling onClick, not after, so a render onClick itself triggers (e.g.
					// opening a file, toggling a folder) isn't suppressed by our own lock.
					releaseGestureLock();
					if (upEvent.type === "pointerup") {
						rowByKey.get(draggedKey)?.onClick?.(startTarget);
					}
					return;
				}
				rowEl.classList.remove("sf-dragging");
				document.body.classList.remove("sf-codex-drag-active");
				clearIndicator();
				try {
					rowEl.releasePointerCapture(pointerId);
				} catch {
					/* already released */
				}
				releaseGestureLock();
				if (pendingTarget) {
					onDrop({ key: draggedKey, type: draggedType }, pendingTarget);
				}
			};

			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
			// e.g. losing pointer capture mid-drag (alt-tab, a native context menu popping up) —
			// without this, the drag state (and the forced cursor) could get stuck on indefinitely.
			window.addEventListener("pointercancel", onUp);
		});
	}
}
