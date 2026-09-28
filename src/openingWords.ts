import { App, editorInfoField } from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { countWordsInLine } from "./wordCount";
import { isChapterEditor } from "./cyclingGuide";
import { bookFolderNameFromChapterPath, chapterFilenameFromPath } from "./paths";
import { getBookChapters } from "./book";

/** The scroller class toggled while a chapter has an "opening words" (depth guide) region to paint. */
const ACTIVE_CLASS = "sf-opening-words-active";
/** Document-space height (px) of the region, from the top of the chapter through the boundary. */
const HEIGHT_PROP = "--sf-opening-words-height";
/** Live `-scrollTop` (px), kept in sync with scrolling so the region tracks the text underneath it. */
const OFFSET_PROP = "--sf-opening-words-offset";

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
 * Document-space height (from the top of the chapter) of the "opening words" region, extended past
 * `endLine` (the paragraph's last line of actual text) through any blank separator line(s) to wherever
 * the next paragraph's real text starts - or the end of the document - so nothing unpatterned sits
 * between the region and the rest of the (intentionally plain) manuscript.
 */
function findOpeningWordsRegionHeight(view: EditorView, targetWords: number): number | null {
	const endLine = findOpeningWordsEndLine(view, targetWords);
	if (endLine === null) return null;

	const doc = view.state.doc;
	let nextTextLine = endLine + 1;
	while (nextTextLine <= doc.lines && doc.line(nextTextLine).text.trim() === "") nextTextLine++;
	return nextTextLine <= doc.lines ? view.lineBlockAt(doc.line(nextTextLine).from).top : view.contentHeight;
}

/**
 * True if `path`'s chapter sits among the first `chaptersCovered` chapters of its book, in the book's
 * own chapter order (same order/source `numberedChapterTitle` uses) - the "depth guide" setting only
 * shows the region for a book's early chapters, per the "chapters covered" setting.
 */
function isWithinCoveredChapters(app: App, path: string, chaptersCovered: number): boolean {
	if (chaptersCovered <= 0) return false;
	const bookFolderName = bookFolderNameFromChapterPath(path);
	const filename = chapterFilenameFromPath(path);
	if (!bookFolderName || !filename) return false;
	const { ordered, unplaced } = getBookChapters(app, bookFolderName);
	const idx = [...ordered, ...unplaced].findIndex((file) => file.name === filename);
	return idx !== -1 && idx < chaptersCovered;
}

/**
 * Paints the "opening words" (depth guide) diagonal-pattern background on the chapter editor's own
 * scroller (`.cm-scroller`), not on anything living inside its scrolled content.
 *
 * A scroll container clips its *content* - including CM6 decorations/layers, however they're
 * positioned - to the scrollport, which sits inside the space a classic (non-overlay) scrollbar
 * reserves. That reservation is invisible on macOS's overlay scrollbars (nothing to clip against) but
 * real on Windows/Linux, where it silently ate the right edge of an earlier layer-based version of
 * this fill. The scroller's *own* background is different: painted across its border box (confirmed
 * empirically - see the plugin's dev notes), it reaches under a reserved gutter the same way the
 * editor's normal background already does.
 *
 * The tradeoff is that only `background-attachment: scroll` (the default - tied to the box) reaches
 * the gutter; `background-attachment: local` (tied to the scrolled content, which is what "moves with
 * the text" ordinarily means) was verified to clip at the scrollport exactly like a layer does, gutter
 * or not. So the background is pinned to the box, sized to the region's document-space height via
 * `--sf-opening-words-height` (published here, recomputed on doc/geometry changes), and its vertical
 * position is corrected on every scroll (rAF-throttled) via `--sf-opening-words-offset` - i.e. the
 * pattern's "scrolling with the content" is simulated in JS rather than delegated to the browser.
 *
 * `chaptersCovered` (settings > guides > depth) gates this to a book's early chapters only; that check
 * needs a vault/frontmatter read (`getBookChapters`), so it's cached per file path rather than redone
 * on every keystroke - only re-evaluated when the editor's underlying file actually changes.
 */
class OpeningWordsPlugin {
	private readonly scroller: HTMLElement;
	private readonly onScroll: () => void;
	private rafHandle: number | null = null;
	private cachedPath: string | null = null;
	private cachedWithinCoverage = false;

	constructor(
		private readonly view: EditorView,
		private readonly app: App,
		private readonly targetWords: number,
		private readonly chaptersCovered: number,
	) {
		this.scroller = view.scrollDOM;
		this.onScroll = () => this.scheduleOffsetUpdate();
		this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
		this.updateRegion();
		this.updateOffset();
	}

	update(update: ViewUpdate): void {
		if (update.docChanged || update.geometryChanged) {
			this.updateRegion();
			this.updateOffset();
		}
	}

	destroy(): void {
		this.scroller.removeEventListener("scroll", this.onScroll);
		if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
		this.clearRegion();
		this.scroller.style.removeProperty(OFFSET_PROP);
	}

	private updateRegion(): void {
		if (!isChapterEditor(this.view)) {
			this.cachedPath = null;
			this.clearRegion();
			return;
		}
		const path = this.view.state.field(editorInfoField, false)?.file?.path ?? null;
		if (!path) {
			this.clearRegion();
			return;
		}
		if (path !== this.cachedPath) {
			this.cachedPath = path;
			this.cachedWithinCoverage = isWithinCoveredChapters(this.app, path, this.chaptersCovered);
		}
		if (!this.cachedWithinCoverage) {
			this.clearRegion();
			return;
		}

		const height = findOpeningWordsRegionHeight(this.view, this.targetWords);
		if (height === null) {
			this.clearRegion();
			return;
		}
		this.scroller.classList.add(ACTIVE_CLASS);
		this.scroller.style.setProperty(HEIGHT_PROP, `${height}px`);
	}

	private clearRegion(): void {
		this.scroller.classList.remove(ACTIVE_CLASS);
		this.scroller.style.removeProperty(HEIGHT_PROP);
	}

	private scheduleOffsetUpdate(): void {
		if (this.rafHandle !== null) return;
		this.rafHandle = requestAnimationFrame(() => {
			this.rafHandle = null;
			this.updateOffset();
		});
	}

	private updateOffset(): void {
		this.scroller.style.setProperty(OFFSET_PROP, `${-this.scroller.scrollTop}px`);
	}
}

/**
 * Creates the CM6 extension that drives the "opening words" (depth guide) chapter-editor background.
 * `targetWords` and `chaptersCovered` come from settings > guides > depth (depthGuideLevel /
 * depthGuideChaptersCovered) - the caller rebuilds this extension whenever either changes.
 */
export function createOpeningWordsBackground(app: App, targetWords: number, chaptersCovered: number) {
	return ViewPlugin.define((view) => new OpeningWordsPlugin(view, app, targetWords, chaptersCovered));
}
