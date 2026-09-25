import { EditorView, layer, RectangleMarker, type LayerMarker } from "@codemirror/view";
import { countWordsInLine } from "./wordCount";
import { isChapterEditor } from "./cyclingGuide";

/**
 * How many opening words a diagonal-pattern background marks as "the first page" - roughly what an
 * agent/editor reads first. Hardcoded for now; the plan is to make this user-configurable (or
 * deselectable) once the look is settled.
 */
export const DEFAULT_OPENING_WORDS_TARGET = 300;

/**
 * Last CM6 line number of the paragraph containing the `targetWords`-th word - i.e. the boundary is
 * pushed forward to the next blank line (or the end of the document) rather than cutting a paragraph
 * in half. Returns null if the chapter doesn't have `targetWords` words yet.
 */
function findOpeningWordsEndLine(view: EditorView, targetWords: number): number | null {
	const doc = view.state.doc;
	let cumulative = 0;
	let crossingLine = -1;
	for (let i = 1; i <= doc.lines; i++) {
		cumulative += countWordsInLine(doc.line(i).text);
		if (cumulative >= targetWords) {
			crossingLine = i;
			break;
		}
	}
	if (crossingLine === -1) return null;

	let endLine = crossingLine;
	while (endLine < doc.lines && doc.line(endLine + 1).text.trim() !== "") {
		endLine++;
	}
	return endLine;
}

/**
 * One continuous rectangle spanning the full editor width, from the top of the document through the
 * end of the opening paragraph - a single box rather than a per-line/per-paragraph decoration, so the
 * diagonal pattern painted on it (in CSS) never seams or breaks stride at a line boundary.
 */
function buildOpeningWordsMarkers(view: EditorView, targetWords: number): readonly LayerMarker[] {
	if (!isChapterEditor(view)) return [];
	const endLine = findOpeningWordsEndLine(view, targetWords);
	if (endLine === null) return [];

	// RectangleMarker/layer coordinates are relative to the scroller's own top-left corner (0,0),
	// same as `lineBlockAt`'s own document-height space - so the top of the document is literally 0,
	// no translation needed. For the bottom: `endLine` deliberately stops at the paragraph's last line
	// of actual text, one line short of the blank separator line that follows it - CM6 line boxes are
	// contiguous with no gap between them, so stopping there leaves that blank line's own height as an
	// unpatterned strip sitting right at the boundary. Skip past it (and any further blank lines) to
	// wherever the next paragraph's real text starts - or the end of the document - so nothing
	// unpatterned sits between the fill and the rest of the (intentionally plain) manuscript.
	const doc = view.state.doc;
	const top = view.lineBlockAt(0).top;
	let nextTextLine = endLine + 1;
	while (nextTextLine <= doc.lines && doc.line(nextTextLine).text.trim() === "") nextTextLine++;
	const bottom = nextTextLine <= doc.lines ? view.lineBlockAt(doc.line(nextTextLine).from).top : view.contentHeight;

	const scrollerRect = view.scrollDOM.getBoundingClientRect();
	// clientWidth excludes a reserved-but-currently-empty scrollbar gutter; getBoundingClientRect
	// doesn't, so the pattern still reaches the pane's true right edge when no scrollbar is drawn.
	const width = scrollerRect.width;
	return [new RectangleMarker("sf-opening-words-fill", 0, top, width, bottom - top)];
}

/**
 * A CM6 layer (same "rectangle behind the text" mechanism CM6 itself uses for selection
 * backgrounds) painting the "opening words" diagonal-pattern editor background, from the top of the
 * chapter through the end of the paragraph containing the `targetWords`-th word.
 */
export function createOpeningWordsLayer(targetWords: number) {
	return layer({
		above: false,
		class: "sf-opening-words-layer",
		markers: (view) => buildOpeningWordsMarkers(view, targetWords),
		update: (update) => update.docChanged,
	});
}
