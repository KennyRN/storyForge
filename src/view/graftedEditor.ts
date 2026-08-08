import { App, MarkdownView, TFile, WorkspaceLeaf, WorkspaceSplit } from "obsidian";

/**
 * Grafts a real, live, auto-saving Obsidian editor — a genuine `WorkspaceLeaf` running a genuine
 * `MarkdownView` — into an arbitrary container element, so continuous mode's click-to-edit can stay
 * inline in the scroll instead of leaving to a separate pane (continuous-mode inline-editor
 * research brief §2–§3).
 *
 * There is no *public* API for this — `Editor`/`MarkdownView` have no standalone constructor
 * outside a real `WorkspaceLeaf`, and `Workspace.createLeafInParent` only accepts a `WorkspaceSplit`
 * already in Obsidian's own layout tree. The technique here (documented in the research brief,
 * used in the wild by Hover Editor for popovers and by Daily Notes Editor for this exact continuous-
 * editing shape) grafts a freshly constructed `WorkspaceSplit` in by overriding just its
 * `getRoot`/`getContainer` — both ordinary, overridable instance methods — to point at the real
 * root, then asks the real, public `createLeafInParent` for a leaf inside it. Everything downstream
 * of that (`openFile`, the editor, saving) is entirely ordinary, unpatched Obsidian.
 *
 * The one unofficial step is `WorkspaceSplit`'s constructor argument shape, which isn't declared in
 * the public typings even though the class itself is exported and public — if a future Obsidian
 * changes it, construction simply throws, which is the most detectable failure point available and
 * exactly what the `try`/`catch` here is for.
 *
 * No prototype is patched, nothing is written against the global `app`, and this file performs no
 * vault writes of any kind — persistence is entirely the grafted `MarkdownView`'s own `TextFileView`
 * save machinery (`requestSave`'s 2-second debounce while typing, a save on `leaf.detach()`),
 * exactly as if the file had been opened normally.
 */

/** The one member real plugins graft against that isn't part of the public `WorkspaceItem`/
 * `WorkspaceSplit` surface — every other operation here uses fully public, documented API. */
interface GraftableSplit extends WorkspaceSplit {
	containerEl: HTMLElement;
}

export interface GraftedEditorHandle {
	leaf: WorkspaceLeaf;
	view: MarkdownView;
	/** Detaches the leaf (triggering Obsidian's own close-save path) and removes the grafted split's
	 * DOM node. Safe to call more than once. */
	destroy: () => void;
}

/**
 * Makes the grafted editor grow with its content instead of scrolling internally — CodeMirror 6
 * decides which lines are worth actually rendering based on its scroller's *measured* viewport, so
 * an honest `height: auto` in CSS isn't sufficient on its own: a scroller that starts at zero
 * height gives CM6 nothing to measure, and it may render nothing at all rather than the whole
 * chapter (this was the "editor box appears but stays empty" failure — the `.sf-grafted-editor`
 * CSS's `min-height: 4em` floor was the only thing giving the box any size at all).
 *
 * Forces a generously oversized starting height so CM6 has room to render the whole chapter at
 * least once, then a `ResizeObserver` on the rendered content snaps the scroller down to its real
 * height and keeps it in sync as the reader types.
 */
function makeAutoHeight(containerEl: HTMLElement): () => void {
	const scroller = containerEl.querySelector<HTMLElement>(".cm-scroller");
	const content = containerEl.querySelector<HTMLElement>(".cm-content");
	if (!scroller || !content) return () => {};

	scroller.style.height = "20000px";

	const sync = (): void => {
		if (content.scrollHeight > 0) scroller.style.height = `${content.scrollHeight + 24}px`;
	};
	const resizeObserver = new ResizeObserver(sync);
	resizeObserver.observe(content);

	return () => resizeObserver.disconnect();
}

/**
 * Mounts `file` into `container` as a real, editable `MarkdownView` in Live Preview, caret placed
 * at `cursorOffset`. Returns null (logging the cause) on any failure — callers must fall back to
 * opening the file in a real tab rather than leaving `container` half-mounted.
 */
export async function graftEditor(
	app: App,
	container: HTMLElement,
	file: TFile,
	cursorOffset: number,
): Promise<GraftedEditorHandle | null> {
	let split: GraftableSplit | null = null;
	try {
		// WorkspaceSplit is an exported public class; only its constructor's argument shape is
		// undeclared in the public typings — this is the one unofficial line in the whole technique.
		const SplitCtor = WorkspaceSplit as unknown as new (workspace: App["workspace"], direction: "vertical" | "horizontal") => GraftableSplit;
		split = new SplitCtor(app.workspace, "vertical");

		// A freshly constructed split has no real parent, so its inherited getRoot()/getContainer()
		// (which walk up `.parent`) can't resolve anything sane. Overriding them on this one instance
		// — not on the prototype — points a leaf created inside it at the real layout tree with zero
		// blast radius outside this one graft.
		const realRoot = app.workspace.rootSplit;
		const realContainer = realRoot.getContainer();
		split.getRoot = () => realRoot;
		split.getContainer = () => realContainer;

		// Obsidian's own workspace chrome (.workspace-split/.workspace-leaf/.cm-scroller, …) is built
		// on a chain of height:100%/flex-fill rules that only resolves because the real workspace is
		// absolutely positioned to fill the window. Grafted into an ordinary content-flow <div> with
		// no defined height, that chain resolves against nothing and collapses to zero — this class is
		// the CSS hook (styles.css) that forces the whole chain to auto-height and drops the internal
		// CM6 scrollbar, since this editor has to grow with the rest of the continuous scroll instead
		// of scrolling internally.
		split.containerEl.addClass("sf-grafted-editor");
		container.appendChild(split.containerEl);

		const leaf = app.workspace.createLeafInParent(split, 0);
		// Live Preview, not source mode — visually closest to the rendered markup it's replacing,
		// minimising the jolt of the rendered-to-editable transition. `source` is an undocumented
		// state key; a wrong value just degrades to source mode rather than failing, so it needs no
		// guard of its own.
		await leaf.openFile(file, { active: true, state: { mode: "source", source: false } });

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			throw new Error("grafted leaf did not produce a MarkdownView");
		}

		// Without this, clicking a wikilink inside the grafted editor navigates *this* leaf to the
		// target file, silently replacing the chapter being edited.
		leaf.setPinned(true);
		view.editor.setCursor(view.editor.offsetToPos(cursorOffset));
		view.editor.focus();

		const containerEl = split.containerEl;
		const stopAutoHeight = makeAutoHeight(containerEl);
		return {
			leaf,
			view,
			destroy: () => {
				stopAutoHeight();
				leaf.detach();
				containerEl.remove();
			},
		};
	} catch (err) {
		console.error("storyForge: could not graft an inline editor — falling back", err);
		split?.containerEl.remove();
		return null;
	}
}
