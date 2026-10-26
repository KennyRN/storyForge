import { Annotation, EditorState, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import type { ProseSession } from "../../core/proseWriter";
import type { EditOrigin } from "../../core/sessions";
import { emphasisKeymap, prose } from "./dressingView";

/**
 * Where a transaction came from, by CodeMirror's user events. Anything it doesn't name is typing (IME composition and
 * dictation arrive as `input.type.compose` or plain `input.type`), so an unknown origin never flags a paste.
 */
export function originOf(tr: Transaction): EditOrigin {
	if (tr.isUserEvent("input.paste")) return "paste";
	if (tr.isUserEvent("input.drop")) return "drop";
	if (tr.isUserEvent("delete.cut")) return "cut";
	if (tr.isUserEvent("undo")) return "undo";
	if (tr.isUserEvent("redo")) return "redo";
	if (tr.isUserEvent("delete")) return "delete";
	if (tr.isUserEvent("input")) return "type";
	return "other";
}

/** The origin of an update: the first transaction that is not a reload (a paste outranks typing within one update). */
export function originOfUpdate(transactions: readonly Transaction[]): EditOrigin {
	const rank: EditOrigin[] = ["paste", "drop", "undo", "redo", "cut", "delete", "type", "other"];
	const origins = transactions.filter((t) => t.docChanged).map(originOf);
	return rank.find((o) => origins.includes(o)) ?? "type";
}

/** Marks a change that came from the writer (a reload from disk), so the editor does not hand it back as typing. */
export const fromWriter = Annotation.define<boolean>();

const common = [
	history(),
	drawSelection(),
	EditorView.lineWrapping,
	EditorView.contentAttributes.of({ spellcheck: "true", autocorrect: "off", autocapitalize: "off", "aria-label": "Text" }),
	search({ top: true }),
	prose(),
	keymap.of([...emphasisKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
];

export interface MountedEditor {
	view: EditorView;
	destroy(): void;
}

/**
 * One editor for one writing session: the session's body is the document (the frontmatter is never shown).
 * Typing goes to `session.setBody`; a reload from disk arrives as the minimal edit and is applied without
 * touching undo history or the caret (decision 21).
 */
export function mountSessionEditor(parent: HTMLElement, session: ProseSession): MountedEditor {
	const view = new EditorView({
		parent,
		state: EditorState.create({
			doc: session.body,
			extensions: [
				...common,
				EditorView.updateListener.of((update) => {
					if (!update.docChanged) return;
					if (update.transactions.some((t) => t.annotation(fromWriter))) return;
					session.setBody(update.state.doc.toString(), originOfUpdate(update.transactions));
				}),
			],
		}),
	});
	const off = session.onReload((e) => {
		if (!e.edit && view.state.doc.toString() === e.body) return;
		const apply = (spec: { from: number; to: number; insert: string }) => view.dispatch({ changes: spec, annotations: [fromWriter.of(true), Transaction.addToHistory.of(false)] });
		if (e.edit && e.edit.to <= view.state.doc.length) apply(e.edit);
		// Belt and braces: whatever the edit did, the document must now be the writer's body.
		if (view.state.doc.toString() !== e.body) apply({ from: 0, to: view.state.doc.length, insert: e.body });
	});
	return {
		view,
		destroy() {
			off();
			view.destroy();
		},
	};
}

/** A read-only view of text that has no session (an archived note, a project made by a newer storyForge). */
export function mountReadOnlyEditor(parent: HTMLElement, body: string): MountedEditor {
	const view = new EditorView({
		parent,
		state: EditorState.create({ doc: body, extensions: [...common, EditorState.readOnly.of(true), EditorView.editable.of(false)] }),
	});
	return { view, destroy: () => view.destroy() };
}

/** ⌘F: the find panel. */
export function openFind(view: EditorView): void {
	openSearchPanel(view);
}

/** ⌥⌘F: the find panel with the replace field focused (read-only editors have none, so this is find). */
export function openFindReplace(view: EditorView): void {
	openSearchPanel(view);
	const replace = view.dom.querySelector<HTMLInputElement>(".cm-search input[name=replace]");
	(replace ?? view.dom.querySelector<HTMLInputElement>(".cm-search input[name=search]"))?.focus();
}

export { undo, redo };
