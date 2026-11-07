import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

/**
 * The editor's emphasis command (decision 25). What the dressing draws is worked out from the markdown parse
 * (`dressingPlan.ts`, Brief 20); this file keeps only ⌘B and ⌘I.
 */

/**
 * Mod-B / Mod-I: toggles `marker` (`**` or `*`) around each selection. Unwraps when the selection
 * is already wrapped — markers just outside it, or just inside it — otherwise wraps it; an empty
 * selection gets a pair of markers with the caret between them.
 */
export function toggleEmphasis(state: EditorState, marker: "**" | "*"): TransactionSpec {
	const n = marker.length;
	const { doc } = state;
	// A lone `*` must not mistake one half of a `**` for its own marker.
	const isMarkerAt = (pos: number): boolean =>
		pos >= 0 &&
		pos + n <= doc.length &&
		doc.sliceString(pos, pos + n) === marker &&
		(n === 2 || (doc.sliceString(pos - 1, pos) !== "*" && doc.sliceString(pos + 1, pos + 2) !== "*"));
	return state.changeByRange((range) => {
		if (range.empty) {
			return {
				changes: { from: range.from, insert: marker + marker },
				range: EditorSelection.cursor(range.from + n),
			};
		}
		if (isMarkerAt(range.from - n) && isMarkerAt(range.to)) {
			return {
				changes: [
					{ from: range.from - n, to: range.from },
					{ from: range.to, to: range.to + n },
				],
				range: EditorSelection.range(range.from - n, range.to - n),
			};
		}
		if (range.to - range.from >= 2 * n && isMarkerAt(range.from) && isMarkerAt(range.to - n)) {
			return {
				changes: [
					{ from: range.from, to: range.from + n },
					{ from: range.to - n, to: range.to },
				],
				range: EditorSelection.range(range.from, range.to - 2 * n),
			};
		}
		return {
			changes: [
				{ from: range.from, insert: marker },
				{ from: range.to, insert: marker },
			],
			range: EditorSelection.range(range.from + n, range.to + n),
		};
	});
}
