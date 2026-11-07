import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readBookSynopsis } from "../../core/book";
import { prose } from "../editor/dressingView";
import { el } from "../kit/dom";
import type { AppModel } from "../model";

/**
 * A novel's synopsis, read-only, in the series page's list (Tweaks 1 part 2, §4.5): a box of fixed size under the novel's bar, reaching down to the bottom of
 * its cover. A longer synopsis scrolls inside it; it is reached and scrolled by keyboard (it takes the tab stop and has a name), and at its end further scrolling
 * carries on to the page (the browser's own scroll chaining). It is never an editor and writes nothing: the synopsis is edited in the context panel (decision 140).
 */
export function synopsisBox(model: AppModel, book: string, title: string): HTMLElement {
	const box = el("div", { class: "sf-synopsis-box", attrs: { role: "region", tabindex: "0", "aria-label": `Synopsis of ${title}` } });
	const project = model.running?.opened.project;
	if (!project) return box;
	void readBookSynopsis(project, book).then((r) => {
		const text = r.status === "ok" ? r.text : "";
		if (!box.isConnected && !text) return;
		if (!text.trim()) return void box.append(el("span", { class: "sf-muted", text: "No synopsis" }));
		new EditorView({
			parent: box,
			state: EditorState.create({ doc: text, extensions: [prose(), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)] }),
		});
	});
	return box;
}
