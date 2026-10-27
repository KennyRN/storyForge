import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, StateField, type Extension, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { smartPunctuationChanges } from "../../core/typing/smartPunctuation";

/** What the aids need to know, read afresh at every keystroke so a settings change applies at once. */
export interface TypingEditorOptions {
	smartPunctuation: boolean;
	/** The lower-case words that begin with an apostrophe. */
	elisions: ReadonlySet<string>;
}

/**
 * The user event of an aid's own transaction. It is under `input`, so the session tracker counts it as typing and
 * never as a paste (decision 34); and the history makes it its own step (`isolateHistory`).
 */
export const AID_EVENT = "input.type.aid";

const isAid = (tr: Transaction): boolean => tr.isUserEvent(AID_EVENT);

/**
 * Where the current unbroken run of typed text began, or null. An aid may only change text inside the run
 * (docs/typing-aids.md §2): moving the caret, a click, Return, a paste, a drop, a cut, undo, redo, a reload from disk
 * and every other change end it. Typing (an aid's own change included) and Backspace within the run keep it.
 */
export const typedRun = StateField.define<number | null>({
	create: () => null,
	update(value, tr) {
		if (!tr.docChanged) return tr.selection ? null : value;
		const typing = tr.isUserEvent("input.type");
		const backspace = tr.isUserEvent("delete.backward");
		if (!typing && !backspace) return null;
		let first = -1;
		let firstB = -1;
		tr.changes.iterChangedRanges((fromA, _toA, fromB) => {
			if (first === -1) {
				first = fromA;
				firstB = fromB;
			}
		});
		if (value !== null && first >= value) return tr.changes.mapPos(value, -1);
		return typing ? firstB : null;
	},
});

/** Exactly one plain character was typed at a single caret, and nothing else happened in the update. */
function typedCharacter(tr: Transaction): boolean {
	if (!tr.docChanged || !tr.isUserEvent("input.type") || tr.isUserEvent("input.type.compose") || isAid(tr)) return false;
	let inserted = 0;
	let count = 0;
	tr.changes.iterChanges((_fa, _ta, _fb, _tb, text) => {
		count++;
		inserted += text.length;
	});
	return count === 1 && inserted === 1;
}

/**
 * The smart-punctuation aid for a CodeMirror editor. After a character is typed it asks the pure rules what, if
 * anything, to change, and applies that as **a second transaction**, isolated in the history, so ⌘Z undoes the aid's
 * change alone and leaves exactly what was typed (Brief 9 §1.2). It reacts to typing; it never takes over text input,
 * so composition, dictation, paste, drop, undo and reloads are left entirely alone.
 */
export function typingAids(options: () => TypingEditorOptions): Extension {
	return [
		typedRun,
		EditorView.updateListener.of((update) => {
			const o = options();
			if (!o.smartPunctuation || update.transactions.length !== 1) return;
			const tr = update.transactions[0];
			const view = update.view;
			if (!typedCharacter(tr) || view.composing || view.compositionStarted) return;
			const sel = update.state.selection;
			if (sel.ranges.length !== 1 || !sel.main.empty) return;
			const head = sel.main.head;
			const before = update.state.doc.sliceString(0, head);
			const runStart = update.state.field(typedRun) ?? head - 1;
			const changes = smartPunctuationChanges(before, runStart, { elisions: o.elisions });
			if (changes.length === 0) return;
			const state = update.state;
			// Not from inside the update that typed the character: straight afterwards, before anything is painted.
			queueMicrotask(() => {
				if (view.state !== state) return; // something else happened first: leave it alone
				const shift = changes.reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
				view.dispatch({
					changes: changes.map((c) => ({ from: c.from, to: c.to, insert: c.insert })),
					selection: EditorSelection.cursor(head + shift),
					userEvent: AID_EVENT,
					annotations: isolateHistory.of("full"),
				});
			});
		}),
	];
}
