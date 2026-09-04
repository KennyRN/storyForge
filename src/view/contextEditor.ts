import type { App, TFile } from "obsidian";
import { mountLeafEditor, type GraftedEditorHandle } from "./graftedEditor";

export type ContextEditorHandle = GraftedEditorHandle;

/**
 * Story Context notebook-page / codex-page editor. Same WorkspaceLeaf graft as continuous
 * click-to-edit, but a separate CSS class (`.sf-context-editor`) so those panes never pick up
 * `.sf-grafted-editor` rules written for the centre-pane continuous scroll.
 *
 * `active: false` keeps the chapter in the centre pane as the workspace's active file.
 */
export async function mountContextEditor(
	app: App,
	container: HTMLElement,
	file: TFile,
): Promise<ContextEditorHandle | null> {
	return mountLeafEditor(app, container, file, 0, {
		className: "sf-context-editor",
		active: false,
		activateOnPointer: true,
	});
}
