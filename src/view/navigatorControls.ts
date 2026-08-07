import { TFile, setIcon } from "obsidian";
import type { NavigatorSlot } from "../spineWindow";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import {
	ICON_CONTINUOUS_MODE,
	ICON_CONTINUOUS_MODE_EXIT,
	ICON_TRANSPORT_NEXT,
	ICON_TRANSPORT_PREVIOUS,
	ICON_TRANSPORT_TO_END,
	ICON_TRANSPORT_TO_START,
} from "../icons";

/**
 * Shared between the sidebar navigator (CodexFocusNavigator.ts) and the continuous read-through's
 * own view (ContinuousReadView.ts) — the sidebar is menus only (hand-off correction: the
 * manuscript itself belongs in the main editor pane, not the sidebar), so both surfaces need the
 * same transport-row and read-only-tile building blocks, just wired to different actions.
 */

export interface TransportActions {
	toStart: () => void;
	previous: () => void;
	next: () => void;
	toEnd: () => void;
}

export interface ContinuousToggle {
	/** false in the sidebar (always just a launcher); true in the continuous read view (a way back
	 * out to the single-chapter editor). Decides which of the two icons shows. */
	active: boolean;
	onToggle: () => void;
}

/**
 * The four transport buttons — shared between the sidebar (open-file) and the continuous read
 * view (scroll-to); only what each button *does* differs. The optional fifth control is
 * continuous mode's launcher/exit, deliberately set apart from the four transport buttons with
 * its own divider rather than reading as a fifth step among them.
 */
export function renderTransportRow(
	container: HTMLElement,
	currentIndex: number,
	lastIndex: number,
	actions: TransportActions,
	toggle: ContinuousToggle | null,
): void {
	const atStart = currentIndex <= 0;
	const atEnd = currentIndex >= lastIndex;

	const buttons = container.createDiv({ cls: "sf-navigator-transport-buttons" });

	addTransportButton(buttons, ICON_TRANSPORT_TO_START, "To start", !atStart, actions.toStart);
	addTransportButton(buttons, ICON_TRANSPORT_PREVIOUS, "Previous chapter", !atStart, actions.previous);
	if (toggle) {
		const label = toggle.active ? "Exit continuous mode" : "Read continuously";
		const btn = buttons.createSpan({
			cls: "sf-navigator-transport-btn sf-navigator-transport-toggle",
			attr: { "aria-label": label },
		});
		setIcon(btn, toggle.active ? ICON_CONTINUOUS_MODE_EXIT : ICON_CONTINUOUS_MODE);
		btn.addEventListener("click", toggle.onToggle);
		makeAccessibleActivatable(btn, toggle.onToggle);
	}
	addTransportButton(buttons, ICON_TRANSPORT_NEXT, "Next chapter", !atEnd, actions.next);
	addTransportButton(buttons, ICON_TRANSPORT_TO_END, "To end", !atEnd, actions.toEnd);
}

function addTransportButton(container: HTMLElement, iconId: string, label: string, enabled: boolean, onClick: () => void): void {
	const btn = container.createSpan({ cls: "sf-navigator-transport-btn", attr: { "aria-label": label } });
	if (!enabled) btn.addClass("sf-navigator-transport-btn-disabled");
	setIcon(btn, iconId);
	if (enabled) {
		btn.addEventListener("click", onClick);
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
