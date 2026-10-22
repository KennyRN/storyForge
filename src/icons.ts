/**
 * Obsidian-side icon helpers. The icon ids, SVGs and the custom icon table live in core/icons.ts
 * (no Obsidian dependency); this file registers them with Obsidian and holds the one DOM helper.
 */
import { addIcon } from "obsidian";
import { CUSTOM_ICONS } from "./core/icons";

export * from "./core/icons";

/** Registers storyForge's custom Lucide-style icons so `setIcon` can address them by id. */
export function registerCustomIcons(): void {
	for (const [id, svg] of CUSTOM_ICONS) addIcon(id, svg);
}

/** Garden Icons (garden--number-fill-16) — a hash/number glyph, the "set a number" control icon
 * (TopPanel.ts's Novel-tab planned novel/chapter length rows). Four stroked lines, not a solid
 * shape, so — same reason the Charm chevrons above are painted rather than run through `setIcon`
 * (Obsidian's `.svg-icon` is fill-only) — this is drawn directly via setNumberFillIcon instead of
 * being registered through addIcon. */
const NUMBER_FILL_D = "M2.5 5.5h12m-13 5h12m-1.5-9l-3 13m-2-13l-3 13";

export function setNumberFillIcon(el: HTMLElement): void {
	el.empty();
	el.createSvg("svg", {
		attr: { viewBox: "0 0 16 16", width: "16", height: "16", fill: "none", "aria-hidden": "true" },
	}).createSvg("path", {
		attr: {
			fill: "currentColor",
			stroke: "currentColor",
			"stroke-linecap": "round",
			"stroke-width": "2",
			d: NUMBER_FILL_D,
		},
	});
}

