import { isolateHistory } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

/**
 * Where the special-characters button puts a character (Brief 10, decision 56): the editor the author last wrote in, not a
 * position. The editors that count are the chapter, a Codex note in either slot, and the plot-note, synopsis and
 * description fields; each registers itself with `track` when it is made, and the last one to take focus is the target.
 * The place inside it is that editor's own selection, which it keeps when focus goes elsewhere (to the button, a menu).
 *
 * The character goes in as typing (`userEvent: "input.type"`), through the editor's own state, so it travels the same path
 * a keystroke does: the prose writer and the session counter for a chapter or note (typing, never a paste), `FieldState`
 * for a field; one ⌘Z takes it back. Nothing here reaches a file.
 */
/** The character is typing to the session counter and the aids (never a paste), and its own undo step, so one ⌘Z takes back just it. */
export const INSERTION_EVENT = "input.type";

export type WritingState = { ok: true } | { ok: false; reason: string };

let last: EditorView | null = null;
/** Before any editor has been focused: the open chapter, if it has one. */
let fallback: () => EditorView | null = () => null;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());

/** Registers an editor as a place the author writes. Nothing to undo: a destroyed editor is simply no longer in the page. */
export function trackWriting(view: EditorView): void {
	const here = (): void => {
		if (last === view) return;
		last = view;
		notify();
	};
	view.dom.addEventListener("focusin", here);
	// A read-only editor can't take focus, but the author is still there: a press in it counts too.
	view.dom.addEventListener("pointerdown", here, true);
}

/** An editor was just opened for the author (it is focused if it can be): it is where they are. */
export function arriveWriting(view: EditorView): void {
	if (last === view) return;
	last = view;
	notify();
}

export function setWritingFallback(fn: () => EditorView | null): void {
	fallback = fn;
}

export function onWritingChange(fn: () => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/**
 * For the interface tests only: makes the tracker forget where the author was, so the "no editor focused yet" state can be
 * reached. It is `undefined` in a production build (the whole object is compiled out; test/releaseBuild.test.ts looks for
 * its marker), so nothing in the shipped app can call it. A project closing needs no reset: its editors are gone, so the
 * last place reads as closed until the next editor is opened.
 */
export const writingTestHooks = import.meta.env.PROD
	? undefined
	: {
			sfWritingTestHookForget(): void {
				last = null;
				notify();
			},
		};

/** The editor a character would go into now, and whether it can: not covered by an overview, not read-only, not gone. */
export function writingState(): { view: EditorView | null; state: WritingState } {
	const view = last ?? fallback();
	if (!view) return { view: null, state: { ok: false, reason: "Open a chapter to put a character in." } };
	if (!view.dom.isConnected) return { view: null, state: { ok: false, reason: "The place you were writing in has closed." } };
	if (view.dom.closest("[inert]")) return { view, state: { ok: false, reason: "Close the overview to put a character in." } };
	if (view.state.readOnly || !view.contentDOM.isContentEditable) return { view, state: { ok: false, reason: "This text is read-only." } };
	return { view, state: { ok: true } };
}

/** Puts `text` in at that editor's selection (replacing it) as typing, then gives it focus with the caret just after. */
export function insertWriting(text: string): boolean {
	const { view, state } = writingState();
	if (!view || !state.ok) return false;
	const { from, to } = view.state.selection.main;
	view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: INSERTION_EVENT, annotations: isolateHistory.of("full"), scrollIntoView: true });
	view.focus();
	return true;
}
