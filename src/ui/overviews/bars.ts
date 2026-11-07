import { formatWordCount } from "../../core/wordCount";
import { el } from "../kit/dom";
import { attachTooltip } from "../kit/tooltip";

/** How a data bar is drawn. Pure, so the table in docs/numbers.md §5 is testable without a DOM. */
export interface DataBarState {
	kind: "sliver" | "fill" | "under" | "over";
	/** 0-100: the fill's width as a share of the bar's scale (a bar with no target, which has no frame). */
	fillPercent: number;
	/** Words ÷ target: 1 at the target (Decision 28's rounding), 0 with no words or no target. The fill's width in the frame's inner width. */
	ratio: number;
	/** The bar sits in a frame whose inner width is the target (Brief 15): there is a target. */
	framed: boolean;
	/** The chapter is past MAX_SCALE times its target (decision 154): its bar runs to the row's end with a cut end, a shape, never colour alone. */
	cut: boolean;
}

/** The most the frames shrink for an overrun (decision 154): a third of the row. A chapter past this many times its target runs to the row's end, cut. */
export const MAX_SCALE = 3;

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
 * `scale` is the word count that fills the whole bar of a chapter with no target (the caller's longest chapter, say). It is raised
 * to at least the words, so nothing is drawn past the end. With a target the bar is drawn against its frame instead: `ratio`.
 */
export function computeDataBarState(words: number, target: number | null, scale?: number): DataBarState {
	const hasTarget = target !== null && target > 0;
	const full = Math.max(scale ?? 0, words);
	const pct = (n: number): number => (full > 0 ? Math.min(100, Math.max(0, (n / full) * 100)) : 0);
	if (words <= 0) return { kind: "sliver", fillPercent: 0, ratio: 0, framed: hasTarget, cut: false };
	if (!hasTarget) return { kind: "fill", fillPercent: pct(words), ratio: 0, framed: false, cut: false };
	const rounded = roundToSignificantFigures(words, significantFigures(target));
	if (rounded === target) return { kind: "fill", fillPercent: 0, ratio: 1, framed: true, cut: false };
	return { kind: words > target ? "over" : "under", fillPercent: 0, ratio: words / target, framed: true, cut: words / target > MAX_SCALE };
}

/**
 * How many targets wide the row is (Fix 11, decision 154): 1 when no chapter is past its target, otherwise the longest chapter's ratio, never more than
 * MAX_SCALE. Every frame is the row divided by this (a third at the most), so the frames share one width and their ends line up; the longest bar ends at the
 * row's end. A chapter past MAX_SCALE targets runs to the row's end with a cut end.
 */
export function chapterScale(words: readonly number[], target: number | null): number {
	if (target === null || target <= 0) return 1;
	return Math.min(MAX_SCALE, Math.max(1, ...words.map((w) => computeDataBarState(w, target).ratio)));
}

export function dataBarLabel(title: string, words: number, target: number | null, state: DataBarState): string {
	const plan = state.cut ? `, over its plan of ${formatWordCount(target ?? 0)}` : state.kind === "over" ? ", over its plan" : state.kind === "under" ? ", under its plan" : target ? ", at its plan" : "";
	return `${title}: ${formatWordCount(words)}${plan}`;
}

export interface DataBarOptions {
	title: string;
	words: number;
	target: number | null;
	/** The word count that fills a bar with no target (the longest chapter). */
	scale?: number;
	/** How many targets wide the row is (`chapterScale`, the same for every bar in the overview): the frames are the row divided by it. */
	targets?: number;
	/** The chapter's name, drawn over the bar: one line, cut short with "…" at the further of the frame's inner end and the bar's end. */
	name?: string;
	/** Tooltip text, read each time it shows; defaults to the word count. */
	tooltip?: string | (() => string);
	/** Called when the pointer or keyboard first reaches the bar (to start a lazy read). */
	onHover?: () => void;
	/** False draws no name over the bar (the context panel's chapters, Brief 19): the title stays the tooltip and the accessible name. */
	labelled?: boolean;
}

/**
 * The chapter bar (Brief 15): a solid bar in the data colour, 34px, in a grey0 frame 4px larger on every side whose inner width is
 * the chapter's planned length. Short of the target the grey left over is the shortfall; past it the bar runs on, solid, out of the
 * frame's end. A chapter with no target has no frame. The name is one colour over the bar (and over the frame's grey where the bar is
 * shorter than the name), cut short at the further of the frame's inner end and the bar's end. All of it is hidden from a screen
 * reader; the bar carries the label.
 */
export function dataBar(opts: DataBarOptions): HTMLElement {
	const state = computeDataBarState(opts.words, opts.target, opts.scale);
	const chapter = opts.name !== undefined;
	const bar = el("div", { class: `sf-bar sf-bar--${state.kind}${chapter ? " sf-bar--chapter" : ""}${chapter && !state.framed ? " sf-bar--plain" : ""}`, attrs: { role: "img", "aria-label": dataBarLabel(opts.title, opts.words, opts.target, state) } });
	if (chapter) {
		// Fix 11: with no chapter past its target (scale 1) the frame is the row and the bar is a share of its inner width; past it (scale > 1) the frames are the row divided
		// by the scale (a third at the most) and the longest bar, which runs out of its frame, ends exactly at the row's end (the 4px at the bar's start is the frame's padding).
		const scale = Math.max(1, opts.targets ?? 1);
		const inner = scale > 1 ? `calc((100% - 4px) / ${scale})` : "calc(100% - 8px)";
		bar.style.setProperty("--sf-inner", state.framed ? inner : "0px");
		bar.style.setProperty("--sf-barw", state.kind === "sliver" ? "3px" : state.framed ? `min(calc(var(--sf-inner) * ${state.ratio}), calc(100% - 4px))` : `${state.fillPercent}%`);
		if (state.framed) {
			bar.style.setProperty("--sf-frame", scale > 1 ? "min(100%, calc(var(--sf-inner) + 8px))" : "100%");
			bar.append(el("div", { class: "sf-bar-frame", attrs: { "aria-hidden": "true" } }));
		}
		if (state.cut) bar.classList.add("sf-bar--cut");
		bar.append(el("div", { class: "sf-bar-fill" }));
		if (opts.labelled !== false) bar.append(el("div", { class: "sf-bar-name", attrs: { "aria-hidden": "true" } }, el("span", { class: "sf-bar-name-text", text: opts.name })));
	} else if (state.kind !== "sliver") {
		const fill = el("div", { class: "sf-bar-fill" });
		fill.style.width = `${state.fillPercent}%`;
		bar.append(fill);
	}
	const planned = state.cut ? `\nplanned: ${formatWordCount(opts.target ?? 0)}` : ""; // a cut bar says its true target (decision 154)
	const base = opts.tooltip ?? formatWordCount(opts.words);
	attachTooltip(bar, typeof base === "function" ? () => base() + planned : base + planned);
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
