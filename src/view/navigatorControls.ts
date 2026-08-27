import { TFile, setIcon, setTooltip } from "obsidian";
import type { NavigatorSlot } from "../spineWindow";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import {
	ICON_CONTINUOUS_MODE,
	ICON_TRANSPORT_NEXT,
	ICON_TRANSPORT_PREVIOUS,
	ICON_TRANSPORT_TO_END,
	ICON_TRANSPORT_TO_START,
} from "../icons";

/**
 * Shared between the sidebar navigator (CodexFocusNavigator.ts) and the continuous read-through's
 * own view (ContinuousReadView.ts) — the sidebar is menus only (hand-off correction: the
 * manuscript itself belongs in the main editor pane, not the sidebar), so both surfaces need the
 * same transport and read-only-tile building blocks, just wired to different actions.
 */

export interface TransportActions {
	toStart: () => void;
	previous: () => void;
	next: () => void;
	toEnd: () => void;
}

export interface ContinuousToggle {
	/** false while the mode is off (click to enter); true while the continuous read view is open
	 * (click to drop back into the single-chapter editor). Same icon either way; the active state
	 * is the hover colour held until the next click. */
	active: boolean;
	onToggle: () => void;
}

/**
 * Four chapter-transport chevrons in a vertical stack (double-up, up, down, double-down) plus
 * the optional continuous-mode toggle. `leftCol` / `rightCol` sit either side of the chapter
 * list — not underneath it — so the circled-arrow row is gone. Same chrome as Story Context's
 * chapter-card action icons (muted rest, no fill); only an activatable control picks up hover,
 * which is the storyTelling chapter highlight colour.
 */
export function renderTransportChrome(
	leftCol: HTMLElement,
	rightCol: HTMLElement,
	currentIndex: number,
	lastIndex: number,
	actions: TransportActions,
	toggle: ContinuousToggle | null,
): void {
	leftCol.empty();
	rightCol.empty();

	const atStart = currentIndex <= 0;
	const atEnd = currentIndex >= lastIndex;

	addTransportButton(leftCol, ICON_TRANSPORT_TO_START, "first chapter", !atStart, actions.toStart);
	addTransportButton(leftCol, ICON_TRANSPORT_PREVIOUS, "previous chapter", !atStart, actions.previous);
	addTransportButton(leftCol, ICON_TRANSPORT_NEXT, "next chapter", !atEnd, actions.next);
	addTransportButton(leftCol, ICON_TRANSPORT_TO_END, "last chapter", !atEnd, actions.toEnd);

	if (toggle) {
		const label = "continuous reading mode";
		const btn = rightCol.createSpan({
			cls: "sf-navigator-transport-btn sf-navigator-transport-toggle",
			attr: { "aria-label": label, "aria-pressed": String(toggle.active) },
		});
		if (toggle.active) btn.addClass("is-active");
		setTooltip(btn, label);
		setIcon(btn, ICON_CONTINUOUS_MODE);
		btn.addEventListener("pointerdown", toggle.onToggle);
		makeAccessibleActivatable(btn, toggle.onToggle);
	}
}

function addTransportButton(container: HTMLElement, iconId: string, label: string, enabled: boolean, onClick: () => void): void {
	const btn = container.createSpan({ cls: "sf-navigator-transport-btn", attr: { "aria-label": label } });
	setTooltip(btn, label);
	if (!enabled) btn.addClass("sf-navigator-transport-btn-disabled");
	setIcon(btn, iconId);
	if (enabled) {
		// pointerdown, not click: this sidebar pane isn't always the focused/active one (the editor
		// usually is), and a plain "click" listener's first firing there was getting eaten by
		// Obsidian's own click-to-focus-the-pane handling — the button needed a second click before
		// it visibly did anything. pointerdown fires regardless, so one click is enough.
		btn.addEventListener("pointerdown", onClick);
		makeAccessibleActivatable(btn, onClick);
	}
}

/** The continuous read view's read-only equivalent of the sidebar's draggable chapter tile — no
 * drag handle, and a click scrolls the read-through to that chapter rather than opening an
 * editor. The create/empty slots collapse to the same plain placeholder; creating a new chapter
 * stays a sidebar-only affordance. */
export function renderIndicatorSlot(
	container: HTMLElement,
	slot: NavigatorSlot<TFile>,
	titleFor: (file: TFile) => string,
	highlightActiveChapter: boolean,
	onScrollTo: (filename: string) => void,
): void {
	if (slot.kind !== "chapter" || !slot.file) {
		const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-empty" });
		tile.createDiv({ cls: "sf-empty sf-empty-inline", text: "—" });
		return;
	}
	const file = slot.file;
	const tile = container.createDiv({ cls: "sf-row" });
	if (slot.isCurrent && highlightActiveChapter) tile.addClass("sf-row-selected");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	tile.addEventListener("click", () => onScrollTo(file.name));
	makeAccessibleActivatable(tile, () => onScrollTo(file.name));
}
