import type { EditorState, Extension } from "@codemirror/state";
import { BlockType, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
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
		const state = update.state;
		const ranges = state.field(chapterRangesField);
		const rebuilt = update.transactions.some((tr) => tr.effects.some((e) => e.is(setChapterRanges)));
		const before = new Map(update.startState.field(chapterRangesField).map((r) => [r.id, r]));
		const live = new Set<string>();
		for (const range of ranges) {
			live.add(range.id);
			const old = before.get(range.id);
			if (rebuilt || !old || !this.regions.has(range.id) || update.changes.touchesRange(old.from, old.to)) {
				this.regions.set(range.id, chapterBand(state, range, this.targetWords));
			}
		}
		for (const id of Array.from(this.regions.keys())) if (!live.has(id)) this.regions.delete(id);
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
