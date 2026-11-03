import { formatWordCount } from "../../core/wordCount";
import { el } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";

/** How a data bar is drawn. Pure, so the table in docs/numbers.md §5 is testable without a DOM. */
export interface DataBarState {
	kind: "sliver" | "fill" | "under" | "over";
	/** 0-100: the fill's width (the blue part, for "over"). */
	fillPercent: number;
	/** 0-100: where the target sits, for "under" and "over". */
	targetPercent: number;
	/** 0-100: the end of the orange part, for "over". */
	overPercent: number;
}

/** Rounds `n` to `figures` significant figures. */
export function roundToSignificantFigures(n: number, figures: number): number {
	if (n <= 0 || figures < 1) return n;
	const unit = 10 ** (Math.floor(Math.log10(n)) - (figures - 1));
	return Math.round(n / unit) * unit;
}

/** The target's significant figures: its digits without trailing zeros (1500 has two). */
export function significantFigures(target: number): number {
	return String(Math.round(target)).replace(/0+$/, "").length || 1;
}

/**
 * `scale` is the word count that fills the whole bar (the caller's longest chapter, say). It is raised
 * to at least the target and the words, so nothing is drawn past the end.
 */
export function computeDataBarState(words: number, target: number | null, scale?: number): DataBarState {
	const hasTarget = target !== null && target > 0;
	const full = Math.max(scale ?? 0, words, hasTarget ? target : 0);
	const pct = (n: number): number => (full > 0 ? Math.min(100, Math.max(0, (n / full) * 100)) : 0);
	if (words <= 0) return { kind: "sliver", fillPercent: 0, targetPercent: 0, overPercent: 0 };
	if (!hasTarget) return { kind: "fill", fillPercent: pct(words), targetPercent: 0, overPercent: 0 };
	const rounded = roundToSignificantFigures(words, significantFigures(target));
	if (rounded === target) return { kind: "fill", fillPercent: pct(words), targetPercent: 0, overPercent: 0 };
	if (words > target) return { kind: "over", fillPercent: pct(target), targetPercent: pct(target), overPercent: pct(words) };
	return { kind: "under", fillPercent: pct(words), targetPercent: pct(target), overPercent: 0 };
}

export function dataBarLabel(title: string, words: number, target: number | null, state: DataBarState): string {
	const plan = state.kind === "over" ? ", over its plan" : state.kind === "under" ? ", under its plan" : target ? ", at its plan" : "";
	return `${title}: ${formatWordCount(words)}${plan}`;
}

const SVG = "http://www.w3.org/2000/svg";

function marker(percent: number): SVGSVGElement {
	const svg = document.createElementNS(SVG, "svg");
	svg.setAttribute("class", "sf-bar-marker");
	svg.setAttribute("width", "2");
	svg.setAttribute("height", "100%");
	svg.setAttribute("aria-hidden", "true");
	svg.style.left = `${percent}%`;
	// At the very end of the bar the marker would be half clipped: draw it inside the edge.
	if (percent >= 99) svg.style.marginLeft = "-2px";
	const line = document.createElementNS(SVG, "line");
	for (const [k, v] of Object.entries({ x1: "1", x2: "1", y1: "0", y2: "100%", "stroke-width": "2", "stroke-linecap": "round", "stroke-dasharray": "3 3" })) line.setAttribute(k, v);
	svg.append(line);
	return svg;
}

export interface DataBarOptions {
	title: string;
	words: number;
	target: number | null;
	scale?: number;
	/** The chapter's name, drawn over the bar (Brief 14): one line, cut short with "…" at the bar's full width. */
	name?: string;
	/** Tooltip text, read each time it shows; defaults to the word count. */
	tooltip?: string | (() => string);
	/** Called when the pointer or keyboard first reaches the bar (to start a lazy read). */
	onHover?: () => void;
}

/**
 * The chapter bar: the data colour (blue) only. A dashed marker in that colour short of the target; past it, dots in that colour
 * from the target to the word count, flush with the fill (pattern, not colour, says "over"). The name is drawn once, in dark text
 * with a 2px outer stroke in the data colour, over the fill, the dots and the empty track alike. Where dots (or the marker) lie
 * beyond the fill, a clearance layer under the name (the same text, stroked wide in the track's colour, clipped to start at the fill's
 * edge) knocks them out for 3px beyond the stroke round every letter, so a dot never touches a letter. The fill's edge and the dots'
 * start are snapped to whole CSS pixels (`round()`), so they meet without a soft seam. All of it is hidden from a screen reader;
 * the bar carries the label.
 */
export function dataBar(opts: DataBarOptions): HTMLElement {
	const state = computeDataBarState(opts.words, opts.target, opts.scale);
	const chapter = opts.name !== undefined;
	const bar = el("div", { class: `sf-bar sf-bar--${state.kind}${chapter ? " sf-bar--chapter" : ""}`, attrs: { role: "img", "aria-label": dataBarLabel(opts.title, opts.words, opts.target, state) } });
	/** A percentage of the bar's width as whole CSS pixels (a chapter bar only, so the series bars are untouched). */
	const snap = (percent: number): string => (chapter ? `round(nearest, ${percent}%, 1px)` : `${percent}%`);
	if (state.kind !== "sliver") {
		const fill = el("div", { class: "sf-bar-fill" });
		fill.style.width = chapter ? `calc(${snap(state.fillPercent)})` : `${state.fillPercent}%`;
		bar.append(fill);
	}
	if (state.kind === "over") {
		const dots = el("div", { class: "sf-bar-dots", attrs: { "aria-hidden": "true" } });
		dots.style.left = `calc(${snap(state.targetPercent)})`;
		// Whole dots only: the last one is kept if its centre is at or before the edge (a column every 4px, so the width is 4n+1).
		dots.style.width = `calc(round(down, calc(${snap(state.overPercent)} - ${snap(state.targetPercent)} - 1px), 4px) + 1px)`;
		bar.append(dots);
	}
	if (state.kind === "under") bar.append(marker(state.targetPercent));
	if (chapter) {
		if (state.kind === "over" || state.kind === "under") {
			const clear = el("div", { class: "sf-bar-name sf-bar-name--clear", attrs: { "aria-hidden": "true" } }, el("span", { class: "sf-bar-name-text", text: opts.name }));
			clear.style.clipPath = `inset(0 0 0 ${snap(state.fillPercent)})`;
			bar.append(clear);
		}
		bar.append(el("div", { class: "sf-bar-name", attrs: { "aria-hidden": "true" } }, el("span", { class: "sf-bar-name-text", text: opts.name })));
	}
	attachTooltip(bar, opts.tooltip ?? formatWordCount(opts.words));
	if (opts.onHover) for (const type of ["pointerenter", "focus"]) bar.addEventListener(type, opts.onHover, { once: true });
	return bar;
}

/** The series overview's bar: only a fill (or the sliver), no target. */
export function plainBar(title: string, words: number, fillPercent: number, sliver: boolean): HTMLElement {
	const bar = el("div", { class: `sf-bar ${sliver ? "sf-bar--sliver" : "sf-bar--fill"}`, attrs: { role: "img", "aria-label": `${title}: ${formatWordCount(words)}` } });
	if (!sliver) {
		const fill = el("div", { class: "sf-bar-fill" });
		fill.style.width = `${fillPercent}%`;
		bar.append(fill);
	}
	attachTooltip(bar, formatWordCount(words));
	return bar;
}
