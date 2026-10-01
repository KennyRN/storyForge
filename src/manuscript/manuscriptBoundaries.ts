import type { ChapterRange } from "./manuscriptModel";

/**
 * The manuscript editor's chapter-boundary rules (continuous-mode manuscript brief §3.3) as pure
 * decisions over chapter ranges. manuscriptState.ts's transaction filter applies them, so structure
 * holds by construction rather than by every caller remembering to check.
 *
 * A position belongs to a chapter when it lies within that chapter's range, ends included: the
 * caret at the end of chapter N types into N, at the start of N + 1 into N + 1. Positions strictly
 * inside a separator belong to no chapter; the view's atomic ranges stop the caret resting there.
 */

/** Index of the chapter whose range contains `pos`, or -1 when `pos` is inside a separator. Binary
 * search: a book has hundreds of chapters at most, but this runs on every keystroke. */
export function chapterIndexAt(ranges: readonly ChapterRange[], pos: number): number {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const r = ranges[mid];
		if (pos < r.from) hi = mid - 1;
		else if (pos > r.to) lo = mid + 1;
		else return mid;
	}
	return -1;
}

/** Index of the chapter wholly containing the replaced span `[from, to]`, or -1 when the span
 * touches or crosses a separator. */
export function chapterContaining(ranges: readonly ChapterRange[], from: number, to: number): number {
	const i = chapterIndexAt(ranges, from);
	return i !== -1 && to <= ranges[i].to ? i : -1;
}

/**
 * What to do with one replaced span of an edit:
 * - "allow": it sits inside one chapter.
 * - "boundary": it lies entirely within a single separator — what Backspace at a chapter's start or
 *   Delete at a chapter's end produces (CodeMirror widens a character delete over the atomic
 *   separator). Those keys do nothing, silently.
 * - "refuse": it crosses a separator. Refused whole, with a notice.
 */
export type ChangeVerdict = "allow" | "boundary" | "refuse";

export function classifyChange(ranges: readonly ChapterRange[], from: number, to: number): ChangeVerdict {
	if (chapterContaining(ranges, from, to) !== -1) return "allow";
	// Within one separator: from at or after chapter k's end, to at or before chapter k + 1's start.
	const k = lastChapterEndingBy(ranges, from);
	if (k !== -1 && k + 1 < ranges.length && from < ranges[k + 1].from && to <= ranges[k + 1].from && to > from) {
		return "boundary";
	}
	return "refuse";
}

/** The last chapter whose range ends at or before `pos`, or -1. */
function lastChapterEndingBy(ranges: readonly ChapterRange[], pos: number): number {
	let lo = 0;
	let hi = ranges.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid].to <= pos) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

/**
 * Folds every replaced span of one edit into a single verdict: any refusal refuses the whole edit;
 * otherwise any boundary span makes it a silent no-op; otherwise it's allowed.
 */
export function classifyEdit(ranges: readonly ChapterRange[], spans: readonly { from: number; to: number }[]): ChangeVerdict {
	let verdict: ChangeVerdict = "allow";
	for (const span of spans) {
		const v = classifyChange(ranges, span.from, span.to);
		if (v === "refuse") return "refuse";
		if (v === "boundary") verdict = "boundary";
	}
	return verdict;
}

/** The ids of the chapters an allowed edit touches, in spine order — which chapters need saving and
 * recounting. */
export function chaptersTouched(ranges: readonly ChapterRange[], spans: readonly { from: number; to: number }[]): string[] {
	const touched = new Set<number>();
	for (const span of spans) {
		const i = chapterContaining(ranges, span.from, span.to);
		if (i !== -1) touched.add(i);
	}
	return Array.from(touched)
		.sort((a, b) => a - b)
		.map((i) => ranges[i].id);
}

/** The separator spans between chapters, `[end of N, start of N + 1]`: the caret steps over each as
 * one unit, and the header for N + 1 is drawn there. */
export function separatorSpans(ranges: readonly ChapterRange[]): { from: number; to: number }[] {
	const spans: { from: number; to: number }[] = [];
	for (let i = 0; i + 1 < ranges.length; i++) spans.push({ from: ranges[i].to, to: ranges[i + 1].from });
	return spans;
}
