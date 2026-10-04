import {
	Annotation,
	EditorState,
	StateEffect,
	StateField,
	Transaction,
	type ChangeSpec,
	type Extension,
	type TransactionSpec,
} from "@codemirror/state";
import { classifyEdit } from "./manuscriptBoundaries";
import type { ChapterRange } from "./manuscriptModel";

/**
 * The manuscript editor's chapter structure as CodeMirror state (continuous-mode manuscript brief
 * §3.2–§3.3). Depends on @codemirror/state only — no view, no DOM — so the boundary filter is
 * tested against real transactions.
 */

/** Marks a transaction as structural: load, reload from disk, new chapter, spine rebuild. These
 * bypass the boundary filter and never enter undo history (undo must never delete a file). */
export const structuralAnnotation = Annotation.define<true>();

/** Replaces the chapter ranges outright, for structural transactions that change which chapters
 * exist (a rebuild or a new chapter); ordinary edits map the ranges instead. */
export const setChapterRanges = StateEffect.define<ChapterRange[]>();

/** Attached to the empty transaction that replaces a refused cross-chapter edit, so the view can
 * show the notice. The state itself is untouched. */
export const editRefused = StateEffect.define<null>();

/**
 * Every placed chapter's range, mapped through every transaction. A chapter's start maps backwards
 * and its end forwards, so text inserted at either edge joins that chapter — which, with the
 * separator sitting strictly between ranges, is exactly "the caret at the end of N types into N, at
 * the start of N + 1 into N + 1".
 */
export const chapterRangesField = StateField.define<readonly ChapterRange[]>({
	create: () => [],
	update(value, tr) {
		for (const effect of tr.effects) if (effect.is(setChapterRanges)) return effect.value;
		if (!tr.docChanged) return value;
		return value.map((r) => ({ id: r.id, from: tr.changes.mapPos(r.from, -1), to: tr.changes.mapPos(r.to, 1) }));
	},
});

/** The edit's replaced spans, in the start document's coordinates. */
function replacedSpans(tr: Transaction): { from: number; to: number }[] {
	const spans: { from: number; to: number }[] = [];
	tr.changes.iterChangedRanges((fromA, toA) => spans.push({ from: fromA, to: toA }));
	return spans;
}

/**
 * The §3.3 boundary rules, enforced on every non-structural transaction: an edit inside one chapter
 * passes; Backspace at a chapter's start or Delete at its end (a delete confined to a separator)
 * becomes a silent no-op; anything crossing a separator is refused whole, flagged with `editRefused`.
 */
const boundaryFilter = EditorState.transactionFilter.of((tr) => {
	if (!tr.docChanged || tr.annotation(structuralAnnotation)) return tr;
	const ranges = tr.startState.field(chapterRangesField, false);
	if (!ranges || ranges.length === 0) return tr;
	const verdict = classifyEdit(ranges, replacedSpans(tr));
	if (verdict === "allow") return tr;
	return verdict === "refuse" ? { effects: editRefused.of(null) } : {};
});

/** The state-level half of the manuscript: the ranges field, seeded with the ranges the document
 * was assembled with, and the boundary filter. */
export function manuscriptStateExtensions(initialRanges: ChapterRange[]): Extension {
	return [chapterRangesField.init(() => initialRanges), boundaryFilter];
}

/** A structural transaction spec: bypasses the boundary filter, stays out of undo history, and
 * optionally replaces the chapter ranges. */
export function structuralSpec(changes: ChangeSpec | undefined, ranges?: ChapterRange[], extra?: TransactionSpec): TransactionSpec {
	const extraEffects = extra?.effects === undefined ? [] : extra.effects instanceof StateEffect ? [extra.effects] : extra.effects;
	return {
		...extra,
		changes,
		effects: ranges ? [setChapterRanges.of(ranges), ...extraEffects] : extraEffects,
		annotations: [structuralAnnotation.of(true), Transaction.addToHistory.of(false)],
	};
}
