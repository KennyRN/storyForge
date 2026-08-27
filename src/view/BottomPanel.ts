import { App, Notice, TFile, setIcon } from "obsidian";
import {
	archiveCodexItem,
	codexTypeIcon,
	convertCodexNoteToFolder,
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
import { ICON_CODEX, ICON_FILTER_LIST, ICON_FOLDER, ICON_FOLDER_PLUS, ICON_PLUS_SQUARE, ICON_TAG_DUOTONE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { attachCodexDragReorder, type CodexDragRowInfo } from "./dragReorderTree";
import { CodexSetTypeModal } from "./CodexSetTypeModal";
import { TagPickerModal } from "./TagPickerModal";

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
	/** codexTypes ids currently filtering the tree — empty shows everything. */
	typeFilter: ReadonlySet<string>;
	onChangeTypeFilter: (next: string[]) => void;
	/** Opens a Codex file's own note (distinct from onCreateFile) — the caller's own
	 * "one tab, and the active-leaf highlight actually follows the click" helper, same as
	 * onOpenChapter elsewhere, rather than this file reaching into app.workspace directly. */
	onOpenFile: (path: string) => void;
	/** Story library only — opens the Codex types registry. Pinned to this pane's own
	 * bottom-left corner (see renderCodexTypesCorner), not the header row. */
	onOpenCodexTypes?: () => void;
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
		const filterBtn = header.createSpan({
			cls: `sf-codex-filter-btn${options.typeFilter.size > 0 ? " is-active" : ""}`,
			attr: { "aria-label": "Filter by type" },
		});
		setIcon(filterBtn, ICON_FILTER_LIST);
		const openFilter = () => {
			new TagPickerModal(
				app,
				"codexTypes",
				Array.from(options.typeFilter),
				(nextIds) => options.onChangeTypeFilter(nextIds),
				false,
			).open();
		};
		filterBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			openFilter();
		});
		makeAccessibleActivatable(filterBtn, openFilter);

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

	if (options.onOpenCodexTypes) {
		renderCodexTypesCorner(container, options.onOpenCodexTypes);
	}

	if (isCodexHidden) return;

	const treeEl = container.createDiv({ cls: "sf-codex-tree" });
	const tree = getCodexView(app, options.currentBookId, options.mode, options.typeFilter);
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
		options.onOpenFile,
		null,
		rowInfo,
		0,
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

/**
 * Codex-types hover icon — pinned to the bottom-left of the Codex pane itself (the
 * `.sf-bottom-panel` root), not the header and not the storyLibrary view. The tree is the
 * scroller (see `.sf-codex-tree`); this sits outside that overflow so it stays put.
 */
function renderCodexTypesCorner(container: HTMLElement, onOpenCodexTypes: () => void): void {
	const corner = container.createDiv({ cls: "sf-codex-pane-corner" });
	const typesBtn = corner.createSpan({ cls: "sf-codex-types-btn", attr: { "aria-label": "Codex types" } });
	setIcon(typesBtn, ICON_TAG_DUOTONE);
	typesBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		onOpenCodexTypes();
	});
	makeAccessibleActivatable(typesBtn, onOpenCodexTypes);
}

function renderTreeChildren(
	app: App,
	container: HTMLElement,
	items: CodexTreeItem[],
	collapsedPaths: ReadonlySet<string>,
	onToggleFolder: (folderId: string) => void,
	activeFilePath: string | null,
	highlightActiveChapter: boolean,
	onOpenFile: (path: string) => void,
	parentKey: string | null,
	rowInfo: CodexDragRowInfo[],
	depth: number,
): void {
	for (const item of items) {
		if (item.type === "folder") {
			const linkedPath = item.path;
			const folderEl = container.createDiv({ cls: "sf-codex-folder" });
			// Read by both this folder's own row (for its content's indent) and its children
			// wrapper (for the guide line's X) — set once here, on their common ancestor, rather
			// than on the header alone, since CSS custom properties only inherit to descendants.
			folderEl.setCssProps({ "--sf-codex-depth": String(depth) });
			const headerEl = folderEl.createDiv({ cls: "sf-codex-folder-header" });
			headerEl.dataset.key = item.id;
			headerEl.dataset.type = "folder";

			const contentEl = headerEl.createDiv({ cls: "sf-codex-row-content" });
			const collapsed = collapsedPaths.has(item.id);
			const chevron = contentEl.createSpan({ cls: "sf-codex-chevron" });
			chevron.toggleClass("sf-codex-chevron-collapsed", collapsed);
			const folderNameEl = contentEl.createSpan({ cls: "sf-codex-folder-name", text: item.name });
			folderNameEl.addClass("sf-styled-heading");
			// A Lore Entry folder (linkedPath set) is also a real note — its own type icon shows
			// the same way a file row's would, so it still reads as "a Person/Place/…" at a glance.
			// A plain folder gets a generic folder icon instead, in the same slot, so the two read
			// as visibly different kinds of row rather than an element folder just missing its icon.
			if (linkedPath) {
				headerEl.addClass("sf-codex-lore-folder");
				if (highlightActiveChapter && activeFilePath === linkedPath) {
					headerEl.addClass("sf-row-selected");
				}
				const entryType = getCodexEntryType(app, linkedPath);
				if (entryType) {
					const typeIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
					setIcon(typeIcon, codexTypeIcon(entryType) ?? "circle-help");
				}
			} else {
				const folderIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(folderIcon, ICON_FOLDER);
			}
			// Routed through attachCodexDragReorder's own pointerdown/pointerup gesture (via
			// onClick below) rather than a `click` listener here — see that file's doc comment for
			// why: a plain `click`'s first firing in an unfocused sidebar gets swallowed by
			// Obsidian's own click-to-focus handling. Only the chevron toggles collapse on a Lore
			// Entry folder — everywhere else on the row opens its note, same as clicking a plain
			// file. Plain (non-linked) folders keep toggling on any click, same as always.
			rowInfo.push({
				key: item.id,
				type: "folder",
				parentKey,
				onClick: (target) => {
					if (linkedPath && !chevron.contains(target as Node)) {
						onOpenFile(linkedPath);
						return;
					}
					onToggleFolder(item.id);
				},
			});

			const folderMenuItems: ExtraMenuItem[] = [
				{ title: "Archive Entire Folder", onClick: () => archiveCodexItem(app, item.id) },
				{ title: "Remove Folder and Keep Items", onClick: () => removeCodexFolder(app, item.id) },
			];
			if (linkedPath) {
				folderMenuItems.push({ title: "Set as...", onClick: () => new CodexSetTypeModal(app, linkedPath).open() });
			}
			attachInlineRename({
				row: headerEl,
				label: folderNameEl,
				getCurrentTitle: () => item.name,
				// A Lore Entry folder's name is always its note's own basename (see
				// resolveCodexTree's doc comment) — renaming here renames the note itself, not a
				// separate stored folder name, so the two can never drift apart.
				onCommit: async (name) => {
					if (linkedPath) {
						const file = app.vault.getAbstractFileByPath(linkedPath);
						if (file instanceof TFile) await renameCodexNoteFile(app, file, name);
						return;
					}
					await renameCodexFolder(app, item.id, name);
				},
				extraMenuItems: folderMenuItems,
			});

			if (!collapsed) {
				const childrenEl = folderEl.createDiv({ cls: "sf-codex-folder-children" });
				// Only draw the guide line when there's something under it — an empty folder just
				// shows its (expanded) chevron with nothing hanging off it.
				if (item.children.length > 0) {
					childrenEl.createDiv({ cls: "sf-codex-folder-indicator" });
				}
				renderTreeChildren(
					app,
					childrenEl,
					item.children,
					collapsedPaths,
					onToggleFolder,
					activeFilePath,
					highlightActiveChapter,
					onOpenFile,
					item.id,
					rowInfo,
					depth + 1,
				);
			}
		} else {
			const fileEl = container.createDiv({ cls: "sf-codex-file" });
			fileEl.setCssProps({ "--sf-codex-depth": String(depth) });
			fileEl.dataset.key = item.path;
			fileEl.dataset.type = "file";
			// See the folder branch's own rowInfo.push comment — routed through
			// attachCodexDragReorder's pointerdown/pointerup gesture, not a separate `click` listener.
			rowInfo.push({ key: item.path, type: "file", parentKey, onClick: () => onOpenFile(item.path) });

			if (highlightActiveChapter && activeFilePath === item.path) {
				fileEl.addClass("sf-row-selected");
			}
			const contentEl = fileEl.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
			const label = contentEl.createSpan({ cls: "sf-codex-file-name", text: item.name });
			const entryType = getCodexEntryType(app, item.path);
			if (entryType) {
				const typeIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(typeIcon, codexTypeIcon(entryType) ?? "circle-help");
			}

			// Turns this note into a Lore Entry folder in place (e.g. a group other entries — its
			// members — can be filed inside) — see convertCodexNoteToFolder's own doc comment.
			const convertMenuItem: ExtraMenuItem = {
				title: "Convert to folder",
				onClick: () => void convertCodexNoteToFolder(app, item.path),
			};
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
					convertMenuItem,
				],
			});
		}
	}
}
