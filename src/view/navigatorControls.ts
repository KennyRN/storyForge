import { TFile, setIcon, setTooltip } from "obsidian";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { inkSlider } from "./inkSlider";
import { ICON_CONTINUOUS_MODE } from "../icons";

/**
 * Shared between the sidebar navigator (CodexFocusNavigator.ts) and the continuous read-through's
 * own view (ContinuousReadView.ts) — the sidebar is menus only (hand-off correction: the
 * manuscript itself belongs in the main editor pane, not the sidebar), so both surfaces need the
 * same continuous-toggle and read-only-tile building blocks, just wired to different actions.
 */

export interface ContinuousToggle {
	/** false while the mode is off (click to enter); true while the continuous read view is open
	 * (click to drop back into the single-chapter editor). Same icon either way; the active state
	 * is the hover colour held until the next click. */
	active: boolean;
	onToggle: () => void;
}

/**
 * The continuous-mode toggle, sitting in its own column to the left of the chapter selector (the
 * transport chevrons that used to share this column are gone — see CodexFocusNavigator.ts). Same
 * chrome as Story Context's chapter-card action icons (muted rest, no fill); only an activatable
 * control picks up hover, which is the storyTelling chapter highlight colour.
 */
export function renderContinuousToggle(col: HTMLElement, toggle: ContinuousToggle | null): void {
	col.empty();
	if (!toggle) return;

	const label = "continuous reading mode";
	const btn = col.createSpan({
		cls: "sf-navigator-transport-btn sf-navigator-transport-toggle",
		attr: { "aria-label": label, "aria-pressed": String(toggle.active) },
	});
	if (toggle.active) btn.addClass("is-active");
	setTooltip(btn, label);
	setIcon(btn, ICON_CONTINUOUS_MODE);
	// Ink bar (inkSlider.ts), as on the codex #tag rails: parked above the icon while off, sliding
	// down beside it when on and back up when off again. Both navigator states (off in the
	// selector, on in the continuous indicator) share the slot, so the slide carries across the
	// sidebar re-render that switching mode causes.
	const ink = inkSlider("storytelling-continuous");
	const onToggle = () => {
		ink.capture();
		toggle.onToggle();
	};
	btn.addEventListener("pointerdown", onToggle);
	makeAccessibleActivatable(btn, onToggle);
	ink.mount({ container: col, buttons: ".sf-navigator-transport-toggle", variant: "continuous" });
}

/** The continuous read view's read-only equivalent of the sidebar's draggable chapter tile — no
 * drag handle, and a click scrolls the read-through to that chapter rather than opening an
 * editor. */
export function renderIndicatorSlot(
	container: HTMLElement,
	file: TFile,
	isCurrent: boolean,
	titleFor: (file: TFile) => string,
	highlightActiveChapter: boolean,
	onScrollTo: (filename: string) => void,
): void {
	const tile = container.createDiv({ cls: "sf-row" });
	if (isCurrent && highlightActiveChapter) tile.addClass("sf-row-selected");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	tile.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		onScrollTo(file.name);
	});
	makeAccessibleActivatable(tile, () => onScrollTo(file.name));
}
