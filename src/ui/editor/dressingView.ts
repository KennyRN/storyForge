import type { Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { scanComments, scanEmphasis, scanHighlights, scanHeading, toggleEmphasis, type EmphasisKind } from "./dressing";

/**
 * The prose dressing (decision 25), ported from 0.17.1's manuscript editor and simplified because one
 * file is one editor: emphasis styled with its markers hidden, heading lines styled with their `#` markers
 * hidden, except on any line holding the caret or a selection, where the markers show so they can be
 * edited; `%% %%` comments dimmed. Nothing else is rendered. Only visible lines are decorated; comments
 * can span lines, so they are scanned over the whole text and cached until it changes.
 *
 * The classes are storyForge's own (`sf-em`, `sf-strong`, `sf-marker`, `sf-heading`, `sf-comment`), styled
 * from the purposes in editor.css.
 */

const HIDE = Decoration.replace({});
const COMMENT = Decoration.mark({ class: "sf-comment" });
const CONTENT: Record<EmphasisKind, Decoration> = {
	em: Decoration.mark({ class: "sf-em" }),
	strong: Decoration.mark({ class: "sf-strong" }),
	"strong-em": Decoration.mark({ class: "sf-strong sf-em" }),
};
const MARKER: Record<EmphasisKind, Decoration> = {
	em: Decoration.mark({ class: "sf-marker sf-em" }),
	strong: Decoration.mark({ class: "sf-marker sf-strong" }),
	"strong-em": Decoration.mark({ class: "sf-marker sf-strong sf-em" }),
};
/** `==highlight==` (Brief 17): a solid fill with bg0 text; the part under a selection gives way (option A) so the selection layer behind the text shows, with the text in fg. */
const HIGHLIGHT = Decoration.mark({ class: "sf-highlight" });
const HIGHLIGHT_SELECTED = Decoration.mark({ class: "sf-highlight-selected" });
const HIGHLIGHT_MARKER = Decoration.mark({ class: "sf-marker" });
/** Emphasis wholly inside the unselected part of a highlight: its text is bg0 too, so it always reads on the fill (its weight and italic are kept). */
const CONTENT_IN_HIGHLIGHT: Record<EmphasisKind, Decoration> = {
	em: Decoration.mark({ class: "sf-em sf-in-highlight" }),
	strong: Decoration.mark({ class: "sf-strong sf-in-highlight" }),
	"strong-em": Decoration.mark({ class: "sf-strong sf-em sf-in-highlight" }),
};
const headingLine = (level: number) => Decoration.line({ class: `sf-heading sf-heading-${level}` });
const headingText = (level: number) => Decoration.mark({ class: `sf-heading-text sf-heading-${level}` });
const headingMarker = (level: number) => Decoration.mark({ class: `sf-marker sf-heading-text sf-heading-${level}` });

type Span = { from: number; to: number };

class DressingPlugin {
	decorations: DecorationSet;
	private comments: Span[];

	constructor(view: EditorView) {
		this.comments = scanComments(view.state.doc.toString());
		this.decorations = this.build(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) this.comments = scanComments(update.state.doc.toString());
		if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build(update.view);
	}

	private build(view: EditorView): DecorationSet {
		const { state } = view;
		const { doc } = state;
		const selected = state.selection.ranges.map((r) => ({ from: doc.lineAt(r.from).number, to: doc.lineAt(r.to).number }));
		const isActive = (lineNumber: number) => selected.some((s) => lineNumber >= s.from && lineNumber <= s.to);
		const decos: Range<Decoration>[] = [];
		const selections = state.selection.ranges.filter((r) => !r.empty);

		for (const visible of view.visibleRanges) {
			let pos = visible.from;
			while (pos <= visible.to) {
				const line = doc.lineAt(pos);
				pos = line.to + 1;
				const active = isActive(line.number);
				const comments = this.comments.map((c) => ({ from: Math.max(c.from, line.from), to: Math.min(c.to, line.to) })).filter((c) => c.to > c.from);
				for (const c of comments) decos.push(COMMENT.range(c.from, c.to));

				const heading = scanHeading(line.text);
				if (heading) {
					const markerEnd = line.from + heading.markerEnd;
					decos.push(headingLine(heading.level).range(line.from));
					decos.push((active ? headingMarker(heading.level) : HIDE).range(line.from, markerEnd));
					if (line.to > markerEnd) decos.push(headingText(heading.level).range(markerEnd, line.to));
				}

				// Highlights first: the unselected parts of their content, which emphasis inside them is checked against.
				const unselected: Span[] = [];
				for (const h of scanHighlights(line.text)) {
					const from = line.from + h.from;
					const to = line.from + h.to;
					if (comments.some((c) => from < c.to && to > c.from)) continue;
					const inner = { from: from + 2, to: to - 2 };
					const marker = active ? HIGHLIGHT_MARKER : HIDE;
					decos.push(marker.range(from, inner.from), marker.range(inner.to, to));
					let cursor = inner.from;
					const cuts = selections.map((r) => ({ from: Math.max(r.from, inner.from), to: Math.min(r.to, inner.to) })).filter((c) => c.to > c.from).sort((a, b) => a.from - b.from);
					for (const c of cuts) {
						if (c.from > cursor) unselected.push({ from: cursor, to: c.from });
						decos.push(HIGHLIGHT_SELECTED.range(c.from, c.to));
						cursor = Math.max(cursor, c.to);
					}
					if (cursor < inner.to) unselected.push({ from: cursor, to: inner.to });
				}
				for (const part of unselected) decos.push(HIGHLIGHT.range(part.from, part.to));

				for (const span of scanEmphasis(line.text)) {
					const from = line.from + span.from;
					const to = line.from + span.to;
					if (comments.some((c) => from < c.to && to > c.from)) continue;
					const inner = { from: from + span.marker, to: to - span.marker };
					const inHighlight = unselected.some((p) => inner.from >= p.from && inner.to <= p.to);
					if (inner.to > inner.from) decos.push((inHighlight ? CONTENT_IN_HIGHLIGHT : CONTENT)[span.kind].range(inner.from, inner.to));
					const marker = active ? MARKER[span.kind] : HIDE;
					decos.push(marker.range(from, inner.from), marker.range(inner.to, to));
				}
			}
		}
		return Decoration.set(decos, true);
	}
}

/** ⌘B / ⌘I: toggles `**` / `*` around the selection; never in a read-only editor. */
function toggleCommand(marker: "**" | "*") {
	return (view: EditorView): boolean => {
		if (view.state.readOnly) return false;
		view.dispatch({ ...toggleEmphasis(view.state, marker), userEvent: "input.format", scrollIntoView: true });
		return true;
	};
}

export const emphasisKeymap = [
	{ key: "Mod-b", run: toggleCommand("**") },
	{ key: "Mod-i", run: toggleCommand("*") },
];

export function prose(): Extension {
	return ViewPlugin.fromClass(DressingPlugin, { decorations: (v) => v.decorations });
}
