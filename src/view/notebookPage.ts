/**
 * The one way a `.sf-notebook-page` gets created, in Story Context and in the settings preview's
 * mirror of it. Creating one marks the enclosing `.sf-story-context-view` with
 * NOTEBOOK_PAGE_PRESENT_CLASS, which styles.css uses in place of
 * `.sf-story-context-view:has(.sf-notebook-page)`: a `:has` over a subtree holding a live
 * CodeMirror editor can be re-evaluated on ordinary typing. Whoever removes the pages (an
 * `empty()` of the view, or a partial removal) clears the class with them.
 */
export const NOTEBOOK_PAGE_PRESENT_CLASS = "sf-story-context-view--notebook-page";

/** Appends a `.sf-notebook-page` (plus `modifiers`, e.g. "sf-dossier-page") to `parent`. */
export function createNotebookPage(parent: HTMLElement, modifiers = ""): HTMLDivElement {
	parent.closest(".sf-story-context-view")?.addClass(NOTEBOOK_PAGE_PRESENT_CLASS);
	return parent.createDiv({ cls: modifiers ? `sf-notebook-page ${modifiers}` : "sf-notebook-page" });
}
