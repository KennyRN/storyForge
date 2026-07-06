import { App, TFile, setIcon } from "obsidian";
import { getCodexView, type CodexTreeItem, type CodexViewMode } from "../codex";
import { ICON_CODEX } from "../icons";

export interface BottomPanelOptions {
	currentBookId: string | null;
	mode: CodexViewMode;
	onToggleMode: () => void;
	collapsedPaths: ReadonlySet<string>;
	onToggleFolder: (path: string) => void;
}

export function renderBottomPanel(app: App, container: HTMLElement, options: BottomPanelOptions): void {
	container.empty();

	const isHidden = options.mode === "hidden";
	const header = container.createDiv({ cls: "sf-bottom-header" });
	if (isHidden) header.addClass("sf-codex-hidden");
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_CODEX);
	header.createSpan({
		cls: "sf-codex-toggle",
		text: isHidden ? "codex hidden" : "Codex",
	});
	header.addEventListener("click", () => options.onToggleMode());

	if (isHidden) return;

	const treeEl = container.createDiv({ cls: "sf-codex-tree" });
	const tree = getCodexView(app, options.currentBookId, options.mode);
	if (!tree) {
		treeEl.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
		return;
	}
	renderTreeChildren(app, treeEl, tree.children, options.collapsedPaths, options.onToggleFolder);
}

function renderTreeChildren(
	app: App,
	container: HTMLElement,
	items: CodexTreeItem[],
	collapsedPaths: ReadonlySet<string>,
	onToggleFolder: (path: string) => void,
): void {
	for (const item of items) {
		if (item.type === "folder") {
			const folderEl = container.createDiv({ cls: "sf-codex-folder" });
			const headerEl = folderEl.createDiv({ cls: "sf-codex-folder-header" });
			const collapsed = collapsedPaths.has(item.path);
			const chevron = headerEl.createSpan({ cls: "sf-codex-chevron" });
			setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
			headerEl.createSpan({ cls: "sf-codex-folder-name", text: item.name });
			headerEl.addEventListener("click", () => onToggleFolder(item.path));

			if (!collapsed) {
				const childrenEl = folderEl.createDiv({ cls: "sf-codex-folder-children" });
				renderTreeChildren(app, childrenEl, item.children, collapsedPaths, onToggleFolder);
			}
		} else {
			const fileEl = container.createDiv({ cls: "sf-codex-file" });
			fileEl.createSpan({ text: item.name });
			fileEl.addEventListener("click", () => {
				const file = app.vault.getAbstractFileByPath(item.path);
				if (file instanceof TFile) {
					void app.workspace.getLeaf(false).openFile(file);
				}
			});
		}
	}
}
