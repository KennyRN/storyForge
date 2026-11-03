import { EditorState, type ChangeSet } from "@codemirror/state";
import { EditorView, drawSelection } from "@codemirror/view";
import { prose } from "../editor/dressingView";
import type { AppModel } from "../model";

/**
 * The chosen chapter's text, read-only, in the context panel (Brief 14 §1.6): the same light dressing as the chapter editor
 * (decision 25), selectable and copyable but never an editor. It shows the open session's current text, not the file on disk, so
 * words typed but not yet saved are there, and follows that session live: the editor that holds the chapter tells it each change
 * (`EditorHost.watchText`), and a change is applied to this copy as the same change, never by retyping the text.
 *
 * It is **never connected to the prose writer or the session tracker** (an architecture test fixes it, as decision 47 did for the
 * fields): it holds no session, can't call `setBody` and writes nothing. The only editor module it uses is the dressing.
 * One file, one editor (decision 19) holds: the only editor of the chapter stays the storytelling side's.
 */
export interface ChapterText {
	element: HTMLElement;
	/** The text now in this copy. */
	text(): string;
	destroy(): void;
}

export function mountChapterText(model: AppModel, path: string, label: string): ChapterText {
	const element = document.createElement("div");
	element.className = "sf-chapter-text";
	const view = new EditorView({
		parent: element,
		state: EditorState.create({
			doc: "",
			extensions: [
				prose(),
				drawSelection(),
				EditorView.lineWrapping,
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
				EditorView.contentAttributes.of({ "aria-label": label, "aria-readonly": "true", tabindex: "0", spellcheck: "false" }),
			],
		}),
	});
	const setAll = (text: string): void => {
		if (view.state.doc.toString() === text) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
	};
	const applying = (changes: ChangeSet, lengthBefore: number): void => {
		// The same change, when this copy is where the writer's document was; otherwise (a missed update) the whole text again.
		if (view.state.doc.length === lengthBefore) view.dispatch({ changes });
		else setAll(model.editors?.liveText(path) ?? "");
	};
	const stop = model.editors?.watchText(path, { update: applying, reset: (text) => setAll(text ?? "") }) ?? (() => undefined);
	return {
		element,
		text: () => view.state.doc.toString(),
		destroy() {
			stop();
			view.destroy();
		},
	};
}
