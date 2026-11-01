/**
 * Panel widths (Fix 5, decisions 76 and 77). Pure: the window's width is passed in.
 * Stored figures are in the chosen unit; what is drawn is worked out from them each time, so a small
 * window narrows the panels for display only and never changes a stored figure.
 */
export type WidthUnit = "px" | "percent";
export type Panel = "story" | "library" | "lore";

/** In pixels. The shared range is what both kinds of panel allow, used while the same-width switch is on. */
export const WIDTH_LIMITS = {
	left: { min: 200, max: 640 },
	lore: { min: 280, max: 640 },
	shared: { min: 280, max: 640 },
	workspaceMin: 360,
} as const;

export const DEFAULT_LEFT_WIDTH_PX = 288;
export const DEFAULT_LORE_WIDTH_PX = 400;
export const DEFAULT_WIDTH_UNIT: WidthUnit = "percent";

export interface PanelWidths {
	/** Each in `unit`: pixels as whole numbers, percent to one decimal place. */
	story: number;
	library: number;
	lore: number;
	unit: WidthUnit;
	linked: boolean;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const toPx = (value: number, unit: WidthUnit, win: number): number => (unit === "px" ? Math.round(value) : Math.round((win * value) / 100));
export const fromPx = (px: number, unit: WidthUnit, win: number): number => (unit === "px" ? Math.round(px) : round1((px / win) * 100));

export type Range = { min: number; max: number };

/** The pixel range a panel's width may be set within. */
export function rangePx(panel: Panel, linked: boolean): Range {
	if (linked) return WIDTH_LIMITS.shared;
	return panel === "lore" ? WIDTH_LIMITS.lore : WIDTH_LIMITS.left;
}

/** The same range in `unit` at this window width, for showing beside a field and for checking a typed figure. */
export function rangeIn(panel: Panel, linked: boolean, unit: WidthUnit, win: number): Range {
	const r = rangePx(panel, linked);
	// Percent bounds are rounded inwards so every figure inside them converts to a legal pixel width.
	if (unit === "px") return r;
	return { min: Math.ceil((r.min / win) * 1000) / 10, max: Math.floor((r.max / win) * 1000) / 10 };
}

export const clampPx = (panel: Panel, linked: boolean, px: number): number => {
	const r = rangePx(panel, linked);
	return Math.min(r.max, Math.max(r.min, px));
};

/**
 * The widths to draw, in pixels. Stored figures are clamped to their panel's limits first, then, if the window can't
 * hold them beside the workspace's minimum, narrowed: equally while the switch is on, the context panel first while off.
 */
export function displayWidths(w: PanelWidths, face: "storytelling" | "storyforge", loreHidden: boolean, win: number): { left: number; lore: number } {
	const leftStored = face === "storytelling" ? w.story : w.library;
	let left = clampPx("story", w.linked, toPx(leftStored, w.unit, win));
	let lore = loreHidden ? 0 : clampPx("lore", w.linked, toPx(w.lore, w.unit, win));
	const over = left + lore - (win - WIDTH_LIMITS.workspaceMin);
	if (over <= 0) return { left, lore };
	if (loreHidden) return { left: Math.max(WIDTH_LIMITS.left.min, left - over), lore };
	if (w.linked) {
		const floor = WIDTH_LIMITS.shared.min; // equal panels can't go below the context panel's minimum
		const each = Math.max(floor, Math.min(left, lore) - Math.ceil(over / 2));
		return { left: each, lore: each };
	}
	const loreCut = Math.min(over, lore - WIDTH_LIMITS.lore.min);
	lore -= loreCut;
	left = Math.max(WIDTH_LIMITS.left.min, left - (over - loreCut));
	return { left, lore };
}

/** Whether the panels drawn are narrower than set. */
export function isNarrowed(w: PanelWidths, face: "storytelling" | "storyforge", loreHidden: boolean, win: number): boolean {
	const d = displayWidths(w, face, loreHidden, win);
	const leftSet = clampPx("story", w.linked, toPx(face === "storytelling" ? w.story : w.library, w.unit, win));
	const loreSet = loreHidden ? 0 : clampPx("lore", w.linked, toPx(w.lore, w.unit, win));
	return d.left < leftSet || d.lore < loreSet;
}

/** Changing the unit converts each stored figure at this window width, so nothing moves. */
export function convertUnit(w: PanelWidths, unit: WidthUnit, win: number): PanelWidths {
	if (unit === w.unit) return w;
	const c = (v: number): number => fromPx(toPx(v, w.unit, win), unit, win);
	return { ...w, story: c(w.story), library: c(w.library), lore: c(w.lore), unit };
}
