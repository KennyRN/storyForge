import { defaultKeymap, history, historyKeymap, insertNewline, redo, undo } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { registerFocusedField } from "../commitOnClose";
import { trackWriting } from "../editor/lastWriting";
import { prose } from "../editor/dressingView";
import { typingAids, type TypingEditorOptions } from "../editor/typingAids";
import { FieldState, type FieldHooks } from "./fieldState";

/**
 * A field of the author's own words that lives in the project's files (a plot note, the synopsis, the description),
 * as a small plain-text CodeMirror editor (decision 47): it has its own undo history and takes all the typing aids (decision 53), so one
 * ⌘Z gives back exactly what was typed, which a browser text area can't do. Nothing is written while typing: the text
 * is committed when the field loses focus, and on every close route through `commitFocusedFields`; a commit the close
 * has to cut off is rescued into a recovery file. The commit is compare-then-write against what the field last saw on
 * disk; a conflict or refusal leaves the author's text in a recovery file and says so (docs/story-shape.md §5).
 *
 * The state machine is `FieldState`. These editors are **never connected to the prose writer or the session tracker**
 * (an architecture test fixes it): field text is written only through `FieldState` and `fieldWriter.ts`.
 */
export type FieldSpec = Omit<FieldHooks, "getText" | "setText"> & {
	readOnly: boolean;
	placeholder?: string;
	/** The typing aids' switches and lists, read at every keystroke (the same as a chapter's, decision 53). */
	typing: () => TypingEditorOptions;
};

export interface TextField {
	/** The wrapper: put it in the page. The editor inside is the multi-line text box. */
	element: HTMLElement;
	/** Shows a value from disk, unless the author is in the middle of typing. Replaces the history when it changes the text. */
	show(value: string): void;
	setReadOnly(readOnly: boolean): void;
	/** The text now in the editor. */
	text(): string;
	destroy(): void;
}

/** Fields made by one redraw of a view: destroyed together before the next, so no editor outlives its place on the page. */
export class FieldBin {
	private fields: TextField[] = [];
	add(field: TextField): void {
		this.fields.push(field);
	}
	clear(): void {
		for (const f of this.fields.splice(0)) f.destroy();
	}
}

export function textField(spec: FieldSpec, bin?: FieldBin): TextField {
	const wrapper = document.createElement("div");
	wrapper.className = "sf-note-field";
	let readOnly = spec.readOnly;
	let applying = false;
	let unregister: (() => void) | null = null;
	const access = new Compartment();
	const attributes = (): Extension => [
		EditorState.readOnly.of(readOnly),
		EditorView.contentAttributes.of({ "aria-label": spec.label, spellcheck: "true", autocorrect: "off", autocapitalize: "off", ...(readOnly ? { "aria-readonly": "true" } : {}) }),
	];

	const makeState = (doc: string): EditorState =>
		EditorState.create({
			doc,
			extensions: [
				history(),
				EditorView.lineWrapping,
				// Plain text: Return is a new line (no auto-indent), and Tab is not bound, so it leaves the field for the next control.
				keymap.of([{ key: "Enter", run: insertNewline }, ...historyKeymap, ...defaultKeymap]),
				...(spec.placeholder ? [placeholder(spec.placeholder)] : []),
				access.of(attributes()),
				// The same light dressing as the chapter editor (Brief 17): emphasis, highlights, their colours and the hidden markers. Display only: it adds
				// decorations, never changes the document, so what FieldState compares and writes is untouched (decision 47).
				prose(),
				typingAids(spec.typing, { field: true }),
				EditorView.updateListener.of((update) => {
					if (update.focusChanged) {
						if (update.view.hasFocus) onFocus();
						else onBlur();
					}
					if (update.docChanged && !applying) state.edited();
				}),
			],
		});

	const view: EditorView = new EditorView({ parent: wrapper, state: makeState("") });
	trackWriting(view); // the special-characters button puts a character in the field the author last wrote in
	const textNow = (): string => view.state.doc.toString();
	const state = new FieldState({
		...spec,
		getText: textNow,
		setText: (text) => {
			if (text === textNow()) return;
			applying = true;
			view.setState(makeState(text)); // a new state: the undo history starts again, so ⌘Z can never bring back replaced text
			applying = false;
		},
	});

	function onFocus(): void {
		unregister ??= registerFocusedField({ flush: () => state.flush(), rescue: () => state.rescue(), undo: () => undo(view), redo: () => redo(view) });
		state.focused();
	}
	function onBlur(): void {
		void state.flush().then(() => {
			if (view.hasFocus) return;
			unregister?.();
			unregister = null;
		});
	}

	const field: TextField = {
		element: wrapper,
		show(value) {
			state.showFromDisk(value, view.hasFocus);
		},
		setReadOnly(next) {
			readOnly = next;
			view.dispatch({ effects: access.reconfigure(attributes()) });
		},
		text: textNow,
		destroy() {
			unregister?.();
			unregister = null;
			view.destroy();
		},
	};
	bin?.add(field);
	return field;
}
