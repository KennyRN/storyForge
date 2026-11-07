import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { protectedRangesFromTree, type Range } from "../../core/typing/protectedText";

/** How long an aid will wait for the parse to reach the caret (Kenny's ruling, Brief 20): a keystroke can't wait longer than this. */
export const PARSE_BUDGET_MS = 20;

/**
 * The protected ranges at the caret, from the editor's own parse tree (never from a scan of the text). `null` when the parse
 * hasn't reached the caret within the budget (a very long chapter just opened): the aid then does nothing for that
 * keystroke, so a character is left exactly as typed, never wrongly changed.
 */
export function protectedAt(state: EditorState, head: number, budget = PARSE_BUDGET_MS): Range[] | null {
	const tree = ensureSyntaxTree(state, head, budget);
	return tree ? protectedRangesFromTree(tree, (a, b) => state.sliceDoc(a, b)) : null;
}
