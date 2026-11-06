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
 * `scale` is the word count that fills the whole bar of a chapter with no target (the caller's longest chapter, say). It is raised
 * to at least the words, so nothing is drawn past the end. With a target the bar is drawn against its frame instead: `ratio`.
 */
export function computeDataBarState(words: number, target: number | null, scale?: number): DataBarState {
	const hasTarget = target !== null && target > 0;
	const full = Math.max(scale ?? 0, words);
	const pct = (n: number): number => (full > 0 ? Math.min(100, Math.max(0, (n / full) * 100)) : 0);
	if (words <= 0) return { kind: "sliver", fillPercent: 0, ratio: 0, framed: hasTarget };
	if (!hasTarget) return { kind: "fill", fillPercent: pct(words), ratio: 0, framed: false };
	const rounded = roundToSignificantFigures(words, significantFigures(target));
	if (rounded === target) return { kind: "fill", fillPercent: 0, ratio: 1, framed: true };
	return { kind: words > target ? "over" : "under", fillPercent: 0, ratio: words / target, framed: true };
}

/**
 * The width every chapter's frame has, as a percentage of the row (Brief 15 §1.2): the whole row when no chapter is past its target,
 * otherwise the row shrunk by the longest chapter's share of its target, so that chapter's bar just reaches the row's end. No minimum.
 */
export function frameWidthPercent(words: readonly number[], target: number | null): number {
	if (target === null || target <= 0) return 100;
	const longest = Math.max(1, ...words.map((w) => computeDataBarState(w, target).ratio));
	return 100 / longest;
}

export function dataBarLabel(title: string, words: number, target: number | null, state: DataBarState): string {
	const plan = state.kind === "over" ? ", over its plan" : state.kind === "under" ? ", under its plan" : target ? ", at its plan" : "";
	return `${title}: ${formatWordCount(words)}${plan}`;
}

export interface DataBarOptions {
	title: string;
	words: number;
	target: number | null;
	/** The word count that fills a bar with no target (the longest chapter). */
	scale?: number;
	/** The frame's width, % of the row (`frameWidthPercent`, the same for every bar in the overview). */
	framePercent?: number;
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
		const frame = opts.framePercent ?? 100;
		const inner = state.framed ? `calc(${frame}% - 8px)` : "0px";
		bar.style.setProperty("--sf-inner", inner);
		bar.style.setProperty("--sf-barw", state.kind === "sliver" ? "3px" : state.framed ? `calc(${inner} * ${state.ratio})` : `${state.fillPercent}%`);
		if (state.framed) {
			bar.style.setProperty("--sf-frame", `${frame}%`);
			bar.append(el("div", { class: "sf-bar-frame", attrs: { "aria-hidden": "true" } }));
		}
		bar.append(el("div", { class: "sf-bar-fill" }));
		if (opts.labelled !== false) bar.append(el("div", { class: "sf-bar-name", attrs: { "aria-hidden": "true" } }, el("span", { class: "sf-bar-name-text", text: opts.name })));
	} else if (state.kind !== "sliver") {
		const fill = el("div", { class: "sf-bar-fill" });
		fill.style.width = `${state.fillPercent}%`;
		bar.append(fill);
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
