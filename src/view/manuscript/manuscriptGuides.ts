import type { EditorState, Extension, Range } from "@codemirror/state";
import { BlockType, Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { cyclingGuideBadgeDeco, cyclingGuideLineDeco } from "../../cyclingGuide";
import { cyclingCrossings, lineWordCounts, runningStarts } from "../../manuscript/manuscriptCycling";
import { findOpeningWordsBoundary } from "../../openingWordsRegion";
import type { ChapterRange } from "../../manuscript/manuscriptModel";
import { chapterRangesField, setChapterRanges } from "../../manuscript/manuscriptState";

/** The scroller class switched on while the manuscript has depth bands to paint. */
const DEPTH_ACTIVE_CLASS = "sf-manuscript-depth-active";

/** Where a chapter's depth band stops, relative to the chapter's start: the first line of the
 * paragraph after the region, or null for "the end of the chapter". */
type BandEnd = { endRel: number | null };

/** The depth-guide region of one chapter, by the shared rule (openingWordsRegion.ts), or null when
 * the chapter is shorter than the target. */
function chapterBand(state: EditorState, range: ChapterRange, targetWords: number): BandEnd | null {
	const doc = state.doc;
	const first = doc.lineAt(range.from).number;
	const last = doc.lineAt(range.to).number;
	const boundary = findOpeningWordsBoundary(last - first + 1, (i) => doc.line(first + i - 1).text, targetWords);
	if (boundary === null) return null;
	return { endRel: boundary.nextTextLine === null ? null : doc.line(first + boundary.nextTextLine - 1).from - range.from };
}

/**
 * Brings a per-chapter cache up to date after a document change: recomputes the chapters the change
 * touched (all of them after a spine rebuild, plus any new ones) and drops chapters that are gone.
 * Typing therefore costs one chapter's recount, never the whole book's.
 */
function refreshTouched<T>(update: ViewUpdate, cache: Map<string, T>, compute: (range: ChapterRange) => T): void {
	const ranges = update.state.field(chapterRangesField);
	const rebuilt = update.transactions.some((tr) => tr.effects.some((e) => e.is(setChapterRanges)));
	const before = new Map(update.startState.field(chapterRangesField).map((r) => [r.id, r]));
	const live = new Set<string>();
	for (const range of ranges) {
		live.add(range.id);
		const old = before.get(range.id);
		if (rebuilt || !old || !cache.has(range.id) || update.changes.touchesRange(old.from, old.to)) cache.set(range.id, compute(range));
	}
	for (const id of Array.from(cache.keys())) if (!live.has(id)) cache.delete(id);
}

/** Top of the text line at `pos`, below any block widget (a chapter header) joined into its block. */
function textTop(view: EditorView, pos: number): number {
	const block = view.lineBlockAt(pos);
	if (Array.isArray(block.type)) {
		for (const part of block.type) if (part.type === BlockType.Text && pos >= part.from && pos <= part.to) return part.top;
	}
	return block.top;
}

/**
 * The depth guide in the manuscript (continuous-mode manuscript brief §3.8): a band at the start of
 * every placed chapter (the 'chapters covered' setting doesn't apply here), by exactly the
 * chapter editor's rule. It paints the way openingWords.ts does — on the scroller's own background,
 * which reaches under a classic scrollbar gutter where a CodeMirror layer would clip — generalised
 * from one background layer to one per band on or near screen, each positioned from the heightmap
 * as the manuscript scrolls.
 *
 * Regions are cached per chapter and recomputed only for chapters an edit touches.
 */
class DepthGuidePlugin {
	private readonly regions = new Map<string, BandEnd | null>();
	private readonly onScroll = (): void => this.schedule();

	constructor(
		private readonly view: EditorView,
		private readonly targetWords: number,
	) {
		for (const range of view.state.field(chapterRangesField)) this.regions.set(range.id, chapterBand(view.state, range, targetWords));
		view.scrollDOM.classList.add(DEPTH_ACTIVE_CLASS);
		view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
		this.schedule();
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) this.recomputeTouched(update);
		if (update.docChanged || update.geometryChanged || update.viewportChanged) this.schedule();
	}

	destroy(): void {
		const scroller = this.view.scrollDOM;
		scroller.removeEventListener("scroll", this.onScroll);
		scroller.classList.remove(DEPTH_ACTIVE_CLASS);
		scroller.style.removeProperty("background-image");
		scroller.style.removeProperty("background-size");
		scroller.style.removeProperty("background-position");
	}

	private recomputeTouched(update: ViewUpdate): void {
		refreshTouched(update, this.regions, (range) => chapterBand(update.state, range, this.targetWords));
	}

	private schedule(): void {
		this.view.requestMeasure({
			key: this,
			read: (view) => {
				const { from, to } = view.viewport;
				const offset = view.documentTop - view.scrollDOM.getBoundingClientRect().top;
				const bands: { y: number; h: number }[] = [];
				for (const range of view.state.field(chapterRangesField)) {
					if (range.to < from || range.from > to) continue;
					const region = this.regions.get(range.id);
					if (!region) continue;
					const top = textTop(view, range.from);
					const bottom = region.endRel === null ? view.lineBlockAt(range.to).bottom : textTop(view, range.from + region.endRel);
					if (bottom > top) bands.push({ y: offset + top, h: bottom - top });
				}
				return bands;
			},
			write: (bands, view) => {
				const style = view.scrollDOM.style;
				if (bands.length === 0) {
					style.setProperty("background-image", "none");
					return;
				}
				style.setProperty("background-image", bands.map(() => "var(--sf-opening-words-pattern)").join(", "));
				style.setProperty("background-size", bands.map((b) => `100% ${b.h}px`).join(", "));
				style.setProperty("background-position", bands.map((b) => `0 ${b.y}px`).join(", "));
			},
		});
	}
}

/** The manuscript's depth guide at `targetWords` (DEPTH_GUIDE_WORDS for the chosen level). */
export function manuscriptDepthGuide(targetWords: number): Extension {
	return ViewPlugin.define((view) => new DepthGuidePlugin(view, targetWords));
}

interface ChapterCount {
	lines: number[];
	total: number;
}

function countChapter(state: EditorState, range: ChapterRange): ChapterCount {
	const lines = lineWordCounts(state.doc.sliceString(range.from, range.to));
	return { lines, total: lines.reduce((sum, n) => sum + n, 0) };
}

/**
 * The cycling guide in the manuscript (continuous-mode manuscript brief §3.9): one count across the
 * whole book in spine order, from zero at the first placed chapter, never reset at a chapter break —
 * so a guide line can land anywhere, including just after a chapter's first paragraph. Same line and
 * badge as the chapter editor's guide.
 *
 * Per-chapter line counts are cached and an edit recounts only the chapters it touches; the guide
 * lines are drawn only for chapters in CodeMirror's viewport, each starting from the running total
 * of the chapters before it.
 */
class CyclingGuidePlugin {
	decorations: DecorationSet;
	private readonly counts = new Map<string, ChapterCount>();

	constructor(
		view: EditorView,
		private readonly interval: number,
	) {
		for (const range of view.state.field(chapterRangesField)) this.counts.set(range.id, countChapter(view.state, range));
		this.decorations = this.build(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) refreshTouched(update, this.counts, (range) => countChapter(update.state, range));
		if (update.docChanged || update.viewportChanged) this.decorations = this.build(update.view);
	}

	private build(view: EditorView): DecorationSet {
		const { doc } = view.state;
		const { from, to } = view.viewport;
		const ranges = view.state.field(chapterRangesField);
		const starts = runningStarts(ranges.map((r) => this.counts.get(r.id)?.total ?? 0));
		const decos: Range<Decoration>[] = [];
		ranges.forEach((range, k) => {
			if (range.to < from || range.from > to) return;
			const count = this.counts.get(range.id);
			if (!count) return;
			const firstLine = doc.lineAt(range.from).number;
			for (const i of cyclingCrossings(count.lines, starts[k], this.interval)) {
				const line = doc.line(firstLine + i);
				decos.push(cyclingGuideLineDeco.range(line.from), cyclingGuideBadgeDeco.range(line.to));
			}
		});
		return Decoration.set(decos, true);
	}
}

/** The manuscript's book-wide cycling guide every `interval` words (CYCLING_GUIDE_INTERVAL_WORDS). */
export function manuscriptCyclingGuide(interval: number): Extension {
	return ViewPlugin.fromClass(
		class extends CyclingGuidePlugin {
			constructor(view: EditorView) {
				super(view, interval);
			}
		},
		{ decorations: (v) => v.decorations },
	);
}
