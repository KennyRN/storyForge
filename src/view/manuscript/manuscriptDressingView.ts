import type { EditorState, Extension, Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { chapterIndexAt, chapterContaining } from "../../manuscript/manuscriptBoundaries";
import { scanComments, scanEmphasis, scanHeading, toggleEmphasis, type EmphasisKind } from "../../manuscript/manuscriptDressing";
import type { ChapterRange } from "../../manuscript/manuscriptModel";
import { chapterRangesField } from "../../manuscript/manuscriptState";
import { refreshTouched } from "./manuscriptGuides";

/**
 * The manuscript's prose dressing (continuous-mode manuscript brief §3.11): emphasis styled with its
 * markers hidden, heading lines styled with their `#` markers hidden — except on any line holding the
 * caret or a selection, where the markers show so they can be edited — and `%% %%` comments dimmed.
 * Nothing else is rendered. The classes are Obsidian's own Live Preview ones (`cm-em`, `cm-strong`,
 * `HyperMD-header-N`, `cm-header-N`, `cm-formatting-*`, `cm-comment`), so Obsidian's, the theme's,
 * storyForge's and formatForge's existing rules style them exactly as in the chapter editor.
 *
 * Only visible lines are decorated. Comments can span lines, so they're scanned per chapter and
 * cached, recomputed only for chapters an edit touches.
 */

const HIDE = Decoration.replace({});
const COMMENT = Decoration.mark({ class: "cm-comment" });
const CONTENT: Record<EmphasisKind, Decoration> = {
	em: Decoration.mark({ class: "cm-em" }),
	strong: Decoration.mark({ class: "cm-strong" }),
	"strong-em": Decoration.mark({ class: "cm-strong cm-em" }),
};
const MARKER: Record<EmphasisKind, Decoration> = {
	em: Decoration.mark({ class: "cm-formatting cm-formatting-em cm-em" }),
	strong: Decoration.mark({ class: "cm-formatting cm-formatting-strong cm-strong" }),
	"strong-em": Decoration.mark({ class: "cm-formatting cm-formatting-strong cm-formatting-em cm-strong cm-em" }),
};
const headingLine = (level: number) => Decoration.line({ class: `HyperMD-header HyperMD-header-${level}` });
const headingText = (level: number) => Decoration.mark({ class: `cm-header cm-header-${level}` });
const headingMarker = (level: number) =>
	Decoration.mark({ class: `cm-formatting cm-formatting-header cm-formatting-header-${level} cm-header cm-header-${level}` });

type Span = { from: number; to: number };

function chapterComments(state: EditorState, range: ChapterRange): Span[] {
	return scanComments(state.doc.sliceString(range.from, range.to));
}

class DressingPlugin {
	decorations: DecorationSet;
	/** Comment spans per chapter, relative to the chapter's start. */
	private readonly comments = new Map<string, Span[]>();

	constructor(view: EditorView) {
		for (const range of view.state.field(chapterRangesField)) this.comments.set(range.id, chapterComments(view.state, range));
		this.decorations = this.build(view);
	}

	update(update: ViewUpdate): void {
		if (update.docChanged) refreshTouched(update, this.comments, (range) => chapterComments(update.state, range));
		if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = this.build(update.view);
	}

	private build(view: EditorView): DecorationSet {
		const { state } = view;
		const { doc } = state;
		const ranges = state.field(chapterRangesField);
		const selected = state.selection.ranges.map((r) => ({ from: doc.lineAt(r.from).number, to: doc.lineAt(r.to).number }));
		const isActive = (lineNumber: number) => selected.some((s) => lineNumber >= s.from && lineNumber <= s.to);
		const decos: Range<Decoration>[] = [];

		for (const visible of view.visibleRanges) {
			let pos = visible.from;
			while (pos <= visible.to) {
				const line = doc.lineAt(pos);
				pos = line.to + 1;
				const k = chapterIndexAt(ranges, line.from);
				if (k === -1) continue; // the folded separator line
				const active = isActive(line.number);
				const chapterStart = ranges[k].from;
				const comments = (this.comments.get(ranges[k].id) ?? [])
					.map((c) => ({ from: Math.max(c.from + chapterStart, line.from), to: Math.min(c.to + chapterStart, line.to) }))
					.filter((c) => c.to > c.from);
				for (const c of comments) decos.push(COMMENT.range(c.from, c.to));

				const heading = scanHeading(line.text);
				if (heading) {
					const markerEnd = line.from + heading.markerEnd;
					decos.push(headingLine(heading.level).range(line.from));
					decos.push((active ? headingMarker(heading.level) : HIDE).range(line.from, markerEnd));
					if (line.to > markerEnd) decos.push(headingText(heading.level).range(markerEnd, line.to));
				}

				for (const span of scanEmphasis(line.text)) {
					const from = line.from + span.from;
					const to = line.from + span.to;
					if (comments.some((c) => from < c.to && to > c.from)) continue;
					const inner = { from: from + span.marker, to: to - span.marker };
					if (inner.to > inner.from) decos.push(CONTENT[span.kind].range(inner.from, inner.to));
					const marker = active ? MARKER[span.kind] : HIDE;
					decos.push(marker.range(from, inner.from), marker.range(inner.to, to));
				}
			}
		}
		return Decoration.set(decos, true);
	}
}

/** Mod-B / Mod-I: toggles `**` / `*` around the selection — within one chapter only, and never on
 * the read-only surface. */
function toggleCommand(marker: "**" | "*") {
	return (view: EditorView): boolean => {
		const { state } = view;
		if (state.readOnly) return false;
		const ranges = state.field(chapterRangesField);
		if (state.selection.ranges.some((r) => chapterContaining(ranges, r.from, r.to) === -1)) return true;
		view.dispatch({ ...toggleEmphasis(state, marker), userEvent: "input.format", scrollIntoView: true });
		return true;
	};
}

export const emphasisKeymap = [
	{ key: "Mod-b", run: toggleCommand("**") },
	{ key: "Mod-i", run: toggleCommand("*") },
];

export function manuscriptDressing(): Extension {
	return ViewPlugin.fromClass(DressingPlugin, { decorations: (v) => v.decorations });
}
