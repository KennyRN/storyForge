import { Facet, RangeSet, StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { setIcon } from "obsidian";
import { ICON_PLUS_SQUARE } from "../../icons";
import { chapterRangesField, setChapterRanges } from "../../manuscript/manuscriptState";

/**
 * Chapter headers and separators for the manuscript editor (continuous-mode manuscript brief §3.3–
 * §3.4). Titles are never document text: each chapter's numbered title is a block widget above its
 * first line. The separator line between chapters is folded away (its first line break hidden, so
 * it merges into the end of the chapter above), and the whole separator is one atomic range, so
 * the caret steps over a separator and its header as one unit.
 */

/** What a header needs from its host: rename and the chapter menu. Wired once per editor. */
export interface HeaderHooks {
	/** Called whenever a header's DOM is built: binds the right-click menu to `row`, swapping
	 * `label` for an input to rename. */
	decorate: (row: HTMLElement, label: HTMLElement, chapterId: string) => void;
	/** The quiet control after the last chapter, which appends a new one (brief §3.10). Null
	 * where chapters can't be created (the read-only surface on mobile): no control is drawn. */
	onAppend: (() => void) | null;
}

export const headerHooksFacet = Facet.define<HeaderHooks, HeaderHooks | null>({
	combine: (values) => values[0] ?? null,
});

/** Replaces the numbered display titles, keyed by chapter id. Redraws the headers only. */
export const setChapterTitles = StateEffect.define<ReadonlyMap<string, string>>();

export const chapterTitlesField = StateField.define<ReadonlyMap<string, string>>({
	create: () => new Map(),
	update(value, tr) {
		for (const effect of tr.effects) if (effect.is(setChapterTitles)) return effect.value;
		return value;
	},
});

class ChapterHeaderWidget extends WidgetType {
	constructor(
		readonly chapterId: string,
		readonly title: string,
		readonly first: boolean,
	) {
		super();
	}

	eq(other: ChapterHeaderWidget): boolean {
		return other.chapterId === this.chapterId && other.title === this.title && other.first === this.first;
	}

	toDOM(view: EditorView): HTMLElement {
		const doc = view.dom.ownerDocument;
		const row = doc.win.createDiv();
		row.className = this.first ? "sf-manuscript-header sf-manuscript-header-first" : "sf-manuscript-header";
		row.contentEditable = "false";
		const label = doc.win.createSpan();
		label.className = "sf-manuscript-header-title";
		label.textContent = this.title;
		row.appendChild(label);
		// Inert to left-click (brief §3.4): without this the browser would drop a native caret beside
		// the widget, which CodeMirror then picks up from the DOM selection. The rename input is the
		// one thing in here that must still take a click.
		row.addEventListener("mousedown", (event) => {
			if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
		});
		view.state.facet(headerHooksFacet)?.decorate(row, label, this.chapterId);
		return row;
	}

	/** The widget handles its own events, so CodeMirror never treats rename typing as document input. */
	ignoreEvent(): boolean {
		return true;
	}

	get estimatedHeight(): number {
		return 64;
	}
}

/** After the last chapter: appends a new one. Same glyph as the library's chapter 'New' button. */
class AppendChapterWidget extends WidgetType {
	eq(other: AppendChapterWidget): boolean {
		return other instanceof AppendChapterWidget;
	}

	toDOM(view: EditorView): HTMLElement {
		const doc = view.dom.ownerDocument;
		const row = doc.win.createDiv();
		row.className = "sf-manuscript-append";
		row.contentEditable = "false";
		const button = doc.win.createSpan();
		button.className = "sf-manuscript-append-button";
		button.setAttribute("aria-label", "New chapter");
		button.setAttribute("role", "button");
		button.tabIndex = 0;
		setIcon(button, ICON_PLUS_SQUARE);
		row.appendChild(button);
		row.addEventListener("mousedown", (event) => event.preventDefault());
		const append = (): void => view.state.facet(headerHooksFacet)?.onAppend?.();
		button.addEventListener("click", append);
		button.addEventListener("keydown", (event) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				append();
			}
		});
		return row;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

function buildDecorations(state: EditorState): DecorationSet {
	const ranges = state.field(chapterRangesField);
	const titles = state.field(chapterTitlesField);
	const decos: Range<Decoration>[] = [];
	ranges.forEach((r, i) => {
		if (i > 0) {
			// The separator's first line break: hiding it folds the empty separator line into the end
			// of the chapter above, leaving one real break before the next chapter's header.
			const prevEnd = ranges[i - 1].to;
			decos.push(Decoration.replace({}).range(prevEnd, prevEnd + 1));
		}
		const widget = new ChapterHeaderWidget(r.id, titles.get(r.id) ?? "", i === 0);
		decos.push(Decoration.widget({ widget, block: true, side: -1 }).range(r.from));
	});
	if (state.facet(headerHooksFacet)?.onAppend) {
		decos.push(Decoration.widget({ widget: new AppendChapterWidget(), block: true, side: 1 }).range(state.doc.length));
	}
	return Decoration.set(decos, true);
}

const headerDecorationsField = StateField.define<DecorationSet>({
	create: buildDecorations,
	update(value, tr) {
		const structural = tr.effects.some((e) => e.is(setChapterRanges) || e.is(setChapterTitles));
		return tr.docChanged || structural ? buildDecorations(tr.state) : value;
	},
	provide: (field) => EditorView.decorations.from(field),
});

function buildAtomic(state: EditorState): RangeSet<Decoration> {
	const ranges = state.field(chapterRangesField);
	const spans: Range<Decoration>[] = [];
	for (let i = 0; i + 1 < ranges.length; i++) spans.push(Decoration.mark({}).range(ranges[i].to, ranges[i + 1].from));
	return Decoration.set(spans, true);
}

const atomicField = StateField.define<RangeSet<Decoration>>({
	create: buildAtomic,
	update(value, tr) {
		return tr.docChanged || tr.effects.some((e) => e.is(setChapterRanges)) ? buildAtomic(tr.state) : value;
	},
	provide: (field) => EditorView.atomicRanges.of((view) => view.state.field(field)),
});

/** Headers, separators and atomic stepping. Needs `manuscriptStateExtensions` alongside. */
export function manuscriptHeaders(hooks: HeaderHooks, titles: ReadonlyMap<string, string>): Extension {
	return [headerHooksFacet.of(hooks), chapterTitlesField.init(() => titles), headerDecorationsField, atomicField];
}
