import { App, MarkdownView, TFile, WorkspaceLeaf, WorkspaceSplit } from "obsidian";

/**
 * Grafts a real, live, auto-saving Obsidian editor — a genuine `WorkspaceLeaf` running a genuine
 * `MarkdownView` — into an arbitrary container element, so continuous mode's click-to-edit can stay
 * inline in the scroll instead of leaving to a separate pane (continuous-mode inline-editor
 * research brief §2–§3).
 *
 * Story Context's notebook/codex pages do not use this class. They call `mountContextEditor`
 * (contextEditor.ts), which mounts the same leaf technique under `.sf-context-editor` so the two
 * features do not share CSS.
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

export interface MountLeafEditorOptions {
	/** CSS class on the grafted split. Continuous click-to-edit uses `sf-grafted-editor`;
	 * Story Context uses `sf-context-editor`. Never both. */
	className: string;
	active?: boolean;
	activateOnPointer?: boolean;
}

/**
 * Shared leaf-graft used by continuous click-to-edit and Story Context. Callers pick the
 * className; they must not share stylesheet hooks.
 */
export async function mountLeafEditor(
	app: App,
	container: HTMLElement,
	file: TFile,
	cursorOffset: number,
	options: MountLeafEditorOptions,
): Promise<GraftedEditorHandle | null> {
	let split: GraftableSplit | null = null;
	try {
		const SplitCtor = WorkspaceSplit as unknown as new (workspace: App["workspace"], direction: "vertical" | "horizontal") => GraftableSplit;
		split = new SplitCtor(app.workspace, "vertical");

		const realRoot = app.workspace.rootSplit;
		const realContainer = realRoot.getContainer();
		split.getRoot = () => realRoot;
		split.getContainer = () => realContainer;

		split.containerEl.addClass(options.className);
		container.appendChild(split.containerEl);

		const leaf = app.workspace.createLeafInParent(split, 0);
		await leaf.openFile(file, { active: options.active !== false, state: { mode: "source", source: false } });
		await leaf.loadIfDeferred();

		const view = leaf.view;
		if (!(view instanceof MarkdownView)) {
			throw new Error("grafted leaf did not produce a MarkdownView");
		}

		leaf.setPinned(true);
		view.editor.setCursor(view.editor.offsetToPos(cursorOffset));

		const containerEl = split.containerEl;
		const activatePane = (evt?: Event): void => {
			evt?.stopPropagation();
			if (app.workspace.activeLeaf !== leaf) {
				app.workspace.setActiveLeaf(leaf, { focus: true });
			}
			view.editor.focus();
		};
		if (options.activateOnPointer) {
			containerEl.addEventListener("pointerdown", activatePane, true);
			activatePane();
		}

		return {
			leaf,
			view,
			destroy: () => {
				if (options.activateOnPointer) containerEl.removeEventListener("pointerdown", activatePane, true);
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

/**
 * Continuous-mode click-to-edit. Mounts under `.sf-grafted-editor` only.
 *
 * Deliberately does not focus the editor itself — focusing scrolls the caret into view, and the
 * caller (`ContinuousReadView.editChapter`) needs a chance to correct the outer continuous scroll's
 * position first (research brief §7). Callers must call `handle.view.editor.focus()` themselves
 * once any correction is done.
 */
export async function graftEditor(
	app: App,
	container: HTMLElement,
	file: TFile,
	cursorOffset: number,
): Promise<GraftedEditorHandle | null> {
	return mountLeafEditor(app, container, file, cursorOffset, { className: "sf-grafted-editor" });
}
