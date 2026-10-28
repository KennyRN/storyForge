import { isolateHistory } from "@codemirror/commands";
import { EditorSelection, StateField, type Extension, type Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { aidChanges, type AidOptions } from "../../core/typing/aids";
import type { AidChange } from "../../core/typing/smartPunctuation";

/** A name correction the aid made: where it sits now, what was typed, and what it became. */
interface Correction {
	at: number;
	original: string;
	spelling: string;
	lowercase: boolean;
}

/** What the aids need to know, read afresh at every keystroke so a settings change applies at once. */
export interface TypingEditorOptions extends AidOptions {
	/**
	 * The author undid a name correction that had changed an all-lower-case word (the Mac's ⌘Z straight after it):
	 * the app may offer to stop correcting that name.
	 */
	onLowercaseCorrectionUndone?: (name: string) => void;
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
 * `aiding` says an aid's own edit is in flight, whose selection moves must not end the run.
 */
export function makeTypedRun(aiding: () => boolean): StateField<number | null> {
	return StateField.define<number | null>({
		create: () => null,
		update(value, tr) {
			if (!tr.docChanged) return tr.selection ? (aiding() ? value : null) : value;
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
}

/** The run field with nothing in flight (what the tests use). */
export const typedRun = makeTypedRun(() => false);

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

/** The aid's changes as one replacement that ends at the caret, so the browser can make it as a single edit. */
function oneReplacement(before: string, changes: readonly AidChange[]): { from: number; to: number; insert: string } {
	const from = Math.min(...changes.map((c) => c.from));
	const to = before.length;
	let insert = before.slice(from, to);
	for (const c of [...changes].sort((a, b) => b.from - a.from)) insert = insert.slice(0, c.from - from) + c.insert + insert.slice(c.to - from);
	return { from, to, insert };
}

/**
 * Makes the replacement the way the user would: select the range and insert text through the browser's own editing.
 * That keeps WebKit's spelling markers: when CodeMirror applies a change itself it rewrites the whole text node, and
 * WebKit then forgets every red underline in that paragraph and doesn't mark them again. CodeMirror sees the change in
 * the page and hands it to `inputHandler`, which records it as the aid's own step.
 */
function replaceInBrowser(view: EditorView, from: number, to: number, insert: string): boolean {
	try {
		const a = view.domAtPos(from);
		const b = view.domAtPos(to);
		const root = view.root as Document;
		const selection = typeof root.getSelection === "function" ? root.getSelection() : window.getSelection();
		if (!selection) return false;
		selection.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
		return document.execCommand("insertText", false, insert);
	} catch {
		return false;
	}
}

/**
 * The smart-punctuation aid for a CodeMirror editor. After a character is typed it asks the pure rules what, if
 * anything, to change, and applies that as **a second transaction**, isolated in the history, so ⌘Z undoes the aid's
 * change alone and leaves exactly what was typed (Brief 9 §1.2). It reacts to typing; it never takes over text input,
 * so composition, dictation, paste, drop, undo and reloads are left entirely alone.
 */
export function typingAids(options: () => TypingEditorOptions): Extension {
	/** An aid's edit has been made in the page and not yet recorded. */
	let aiding: { caret: number } | null = null;
	/** The last name correction, so an undo of it can be recognised (its place moves with later edits). */
	let lastCorrection: Correction | null = null;
	const run = makeTypedRun(() => aiding !== null);
	let pendingCorrection: Correction | null = null;

	/** Follows the last name correction through later edits, and says when it is undone. */
	const watchCorrection = (update: import("@codemirror/view").ViewUpdate, o: TypingEditorOptions): void => {
		if (!lastCorrection) return;
		for (const tr of update.transactions) {
			if (!tr.docChanged) continue;
			if (tr.isUserEvent("undo") && update.state.doc.sliceString(lastCorrection.at, lastCorrection.at + lastCorrection.original.length) === lastCorrection.original) {
				const done = lastCorrection;
				lastCorrection = null;
				if (done.lowercase) o.onLowercaseCorrectionUndone?.(done.spelling);
				return;
			}
			if (!(tr.isUserEvent("input.type") || tr.isUserEvent("undo") || tr.isUserEvent("redo"))) {
				lastCorrection = null; // a paste, a delete, a reload: the place can't be trusted
				return;
			}
			lastCorrection = { ...lastCorrection, at: tr.changes.mapPos(lastCorrection.at, -1) };
		}
	};

	return [
		run,
		// The browser made the aid's replacement; record it as the aid's own, isolated step.
		EditorView.inputHandler.of((view, from, to, text) => {
			if (!aiding) return false;
			const { caret } = aiding;
			aiding = null;
			lastCorrection = pendingCorrection;
			pendingCorrection = null;
			view.dispatch({ changes: { from, to, insert: text }, selection: EditorSelection.cursor(caret), userEvent: AID_EVENT, annotations: isolateHistory.of("full") });
			return true;
		}),
		EditorView.updateListener.of((update) => {
			const o = options();
			watchCorrection(update, o);
			if (!(o.smartPunctuation || o.nameAutocorrect) || update.transactions.length !== 1) return;
			const tr = update.transactions[0];
			const view = update.view;
			if (!typedCharacter(tr) || view.composing || view.compositionStarted) return;
			const sel = update.state.selection;
			if (sel.ranges.length !== 1 || !sel.main.empty) return;
			const head = sel.main.head;
			const before = update.state.doc.sliceString(0, head);
			const runStart = update.state.field(run) ?? head - 1;
			const changes = aidChanges(before, runStart, o);
			if (changes.length === 0) return;
			const corrected = changes.find((c) => c.name);
			if (corrected?.name) {
				const shiftBefore = changes.filter((c) => c.from < corrected.from).reduce((n, c) => n + c.insert.length - (c.to - c.from), 0);
				pendingCorrection = { at: corrected.from + shiftBefore, original: corrected.name.original, spelling: corrected.name.spelling, lowercase: corrected.name.lowercase };
			} else pendingCorrection = null;
			const state = update.state;
			const span = oneReplacement(before, changes);
			const caret = head + (span.insert.length - (span.to - span.from));
			const viaState = (): void => {
				lastCorrection = pendingCorrection;
				pendingCorrection = null;
				view.dispatch({
					changes: changes.map((c) => ({ from: c.from, to: c.to, insert: c.insert })),
					selection: EditorSelection.cursor(head + changes.reduce((n, c) => n + c.insert.length - (c.to - c.from), 0)),
					userEvent: AID_EVENT,
					annotations: isolateHistory.of("full"),
				});
			};
			// Not from inside the update that typed the character: straight afterwards, before anything is painted.
			queueMicrotask(() => {
				if (view.state !== state) return; // something else happened first: leave it alone
				aiding = { caret };
				if (!replaceInBrowser(view, span.from, span.to, span.insert)) {
					aiding = null;
					viaState();
					return;
				}
				// If the page change never reached `inputHandler`, make the change through the state instead.
				setTimeout(() => {
					if (aiding === null) return;
					aiding = null;
					const done = view.state.doc.sliceString(span.from, span.from + span.insert.length) === span.insert && view.state !== state;
					if (!done && view.state === state) viaState();
				}, 100);
			});
		}),
	];
}
