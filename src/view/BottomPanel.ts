import { App, Notice, TFile, setIcon } from "obsidian";
import {
	archiveCodexItem,
	codexTypeIcon,
	getCodexEntryType,
	getCodexView,
	isDescendantFolder,
	moveCodexItem,
	readCodexFrontmatter,
	removeCodexFolder,
	renameCodexFolder,
	renameCodexNoteFile,
	type CodexTreeItem,
	type CodexViewMode,
} from "../codex";
import { ICON_CODEX, ICON_FOLDER_PLUS, ICON_PLUS_SQUARE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename } from "./inlineRename";
import { attachCodexDragReorder, type CodexDragRowInfo } from "./dragReorderTree";
import { CodexSetTypeModal } from "./CodexSetTypeModal";

export interface BottomPanelOptions {
	currentBookId: string | null;
	mode: CodexViewMode;
	onToggleMode: () => void;
	collapsedPaths: ReadonlySet<string>;
	onToggleFolder: (folderId: string) => void;
	activeFilePath: string | null;
	highlightActiveChapter: boolean;
	onCreateFolder: () => void;
	onCreateFile: () => void;
}

export function renderBottomPanel(app: App, container: HTMLElement, options: BottomPanelOptions): void {
	container.empty();

	const isCodexHidden = options.mode === "codexHidden";
	const header = container.createDiv({ cls: "sf-bottom-header" });
	if (isCodexHidden) header.addClass("sf-codex-hidden");
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_CODEX);
	header.createSpan({
		cls: "sf-header-codex",
		text: isCodexHidden ? "codex hidden" : "Codex",
	});
	header.addEventListener("click", () => options.onToggleMode());

	if (!isCodexHidden) {
		const newFileBtn = header.createSpan({ cls: "sf-codex-new-file-btn", attr: { "aria-label": "New file" } });
		setIcon(newFileBtn, ICON_PLUS_SQUARE);
		newFileBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			options.onCreateFile();
		});
		makeAccessibleActivatable(newFileBtn, () => options.onCreateFile());

		const newFolderBtn = header.createSpan({ cls: "sf-codex-new-folder-btn", attr: { "aria-label": "New folder" } });
		setIcon(newFolderBtn, ICON_FOLDER_PLUS);
		newFolderBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			options.onCreateFolder();
		});
		makeAccessibleActivatable(newFolderBtn, () => options.onCreateFolder());
	}

	if (isCodexHidden) return;

	const treeEl = container.createDiv({ cls: "sf-codex-tree" });
	const tree = getCodexView(app, options.currentBookId, options.mode);
	if (!tree) {
		treeEl.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
		return;
	}

	const rowInfo: CodexDragRowInfo[] = [];
	renderTreeChildren(
		app,
		treeEl,
		tree.children,
		options.collapsedPaths,
		options.onToggleFolder,
		options.activeFilePath,
		options.highlightActiveChapter,
		null,
		rowInfo,
	);

	const { folders } = readCodexFrontmatter(app);
	attachCodexDragReorder(
		treeEl,
		rowInfo,
		(ancestorId, candidateId) => isDescendantFolder(folders, ancestorId, candidateId),
		(dragged, target) => {
			void (async () => {
				try {
					await moveCodexItem(app, dragged.key, dragged.type, target.parentId, target.beforeKey);
				} catch (err) {
					new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
					renderBottomPanel(app, container, options);
				}
			})();
		},
	);
}

function renderTreeChildren(
	app: App,
	container: HTMLElement,
	items: CodexTreeItem[],
	collapsedPaths: ReadonlySet<string>,
	onToggleFolder: (folderId: string) => void,
	activeFilePath: string | null,
	highlightActiveChapter: boolean,
	parentKey: string | null,
	rowInfo: CodexDragRowInfo[],
): void {
	for (const item of items) {
		if (item.type === "folder") {
			const folderEl = container.createDiv({ cls: "sf-codex-folder" });
			const headerEl = folderEl.createDiv({ cls: "sf-codex-folder-header" });
			headerEl.dataset.key = item.id;
			headerEl.dataset.type = "folder";
			rowInfo.push({ key: item.id, type: "folder", parentKey });

			const handle = headerEl.createSpan({ cls: "sf-drag-handle" });
			setIcon(handle, "grip-vertical");

			const collapsed = collapsedPaths.has(item.id);
			const chevron = headerEl.createSpan({ cls: "sf-codex-chevron" });
			chevron.toggleClass("sf-codex-chevron-collapsed", collapsed);
			const folderNameEl = headerEl.createSpan({ cls: "sf-codex-folder-name", text: item.name });
			folderNameEl.addClass("sf-styled-heading");
			headerEl.addEventListener("click", (e) => {
				if (headerEl.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
				onToggleFolder(item.id);
			});

			attachInlineRename({
				row: headerEl,
				label: folderNameEl,
				getCurrentTitle: () => item.name,
				onCommit: (name) => renameCodexFolder(app, item.id, name),
				extraMenuItems: [
					{ title: "Archive Entire Folder", onClick: () => archiveCodexItem(app, item.id) },
					{ title: "Remove Folder and Keep Items", onClick: () => removeCodexFolder(app, item.id) },
				],
			});

			if (!collapsed) {
				const childrenEl = folderEl.createDiv({ cls: "sf-codex-folder-children" });
				childrenEl.createDiv({ cls: "sf-codex-folder-indicator" });
				renderTreeChildren(
					app,
					childrenEl,
					item.children,
					collapsedPaths,
					onToggleFolder,
					activeFilePath,
					highlightActiveChapter,
					item.id,
					rowInfo,
				);
			}
		} else {
			const fileEl = container.createDiv({ cls: "sf-codex-file" });
			fileEl.dataset.key = item.path;
			fileEl.dataset.type = "file";
			rowInfo.push({ key: item.path, type: "file", parentKey });

			const handle = fileEl.createSpan({ cls: "sf-drag-handle" });
			setIcon(handle, "grip-vertical");

			if (highlightActiveChapter && activeFilePath === item.path) {
				fileEl.addClass("sf-row-selected");
			}
			const label = fileEl.createSpan({ text: item.name });
			const entryType = getCodexEntryType(app, item.path);
			if (entryType) {
				const typeIcon = fileEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(typeIcon, codexTypeIcon(entryType) ?? "circle-help");
			}
			fileEl.addEventListener("click", (e) => {
				if (fileEl.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
				const file = app.vault.getAbstractFileByPath(item.path);
				if (file instanceof TFile) {
					void app.workspace.getLeaf(false).openFile(file);
				}
			});

			attachInlineRename({
				row: fileEl,
				label,
				getCurrentTitle: () => item.name,
				onCommit: async (name) => {
					const file = app.vault.getAbstractFileByPath(item.path);
					if (file instanceof TFile) await renameCodexNoteFile(app, file, name);
				},
				extraMenuItems: [
					{ title: "Archive", onClick: () => archiveCodexItem(app, item.path) },
					{ title: "Set as...", onClick: () => new CodexSetTypeModal(app, item.path).open() },
				],
			});
		}
	}
}
