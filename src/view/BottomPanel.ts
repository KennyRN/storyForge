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
import {
	ICON_FILTER_LIST,
	ICON_FOLDER,
	ICON_FOLDER_PLUS,
	ICON_HASHTAG_SQUARE_DUOTONE,
	ICON_PLUS_SQUARE,
	ICON_TAG_DUOTONE,
} from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { attachInlineRename, type ExtraMenuItem } from "./inlineRename";
import { attachCodexDragReorder, type CodexDragRowInfo } from "./dragReorderTree";
import { CodexSetTypeModal } from "./CodexSetTypeModal";
import { TagPickerModal } from "./TagPickerModal";
import {
	applySiblingReorder,
	displayedVaultTags,
	readVaultTags,
	setVaultTagPageOrder,
	siblingOrderAfterMove,
} from "../vaultTags";

export interface BottomPanelOptions {
	currentBookId: string | null;
	mode: CodexViewMode;
	collapsedPaths: ReadonlySet<string>;
	onToggleFolder: (folderId: string) => void;
	activeFilePath: string | null;
	highlightActiveChapter: boolean;
	onCreateFolder: () => void;
	onCreateFile: () => void;
	/** codexTypes ids currently filtering the tree — empty shows everything. */
	typeFilter: ReadonlySet<string>;
	onChangeTypeFilter: (next: string[]) => void;
	/** Vault `#tag` currently filtering the tree — session-only, single-select. Null shows everything (still AND'd with typeFilter). */
	tagFilter?: string | null;
	onChangeTagFilter?: (next: string | null) => void;
	/** Opens a Codex file's own note (distinct from onCreateFile) — the caller's own
	 * "one tab, and the active-leaf highlight actually follows the click" helper, same as
	 * onOpenChapter elsewhere, rather than this file reaching into app.workspace directly. */
	onOpenFile: (path: string) => void;
	/** Opens the Codex types registry. Pinned to this pane's own bottom-left corner (see
	 * renderCodexTypesCorner). The tag-shaped icon. Only the storyLibrary full-pane Codex tab
	 * passes this — the Chapter-layout Codex subpane, storyTelling, and other hosts omit it. */
	onOpenCodexTypes?: () => void;
	/** Opens the vault `#tag` manager. The hashtag next to types in the same corner. Same
	 * host gate as onOpenCodexTypes. */
	onOpenTags?: () => void;
}

export function renderBottomPanel(app: App, container: HTMLElement, options: BottomPanelOptions): void {
	container.empty();

	if (options.onOpenCodexTypes || options.onOpenTags) {
		renderCodexTypesCorner(container, options.onOpenCodexTypes, options.onOpenTags);
	}

	const body = container.createDiv({ cls: "sf-codex-body" });
	const rail = body.createDiv({ cls: "sf-codex-side-actions" });
	renderCodexActionButtons(rail, app, options, ["folder", "file", "filter"]);
	renderVaultTagRail(rail, app, options);

	const treeEl = body.createDiv({ cls: "sf-codex-tree" });
	const tree = getCodexView(app, options.currentBookId, options.mode, options.typeFilter, options.tagFilter);
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
					const tagFilter = options.tagFilter;
					if (tagFilter) {
						const info = rowInfo.find((row) => row.key === dragged.key);
						if (!info || info.parentKey !== target.parentId) return;
						const siblings = rowInfo.filter((row) => row.parentKey === info.parentKey).map((row) => row.key);
						const nextSiblings = siblingOrderAfterMove(siblings, dragged.key, target.beforeKey);
						const previous = readVaultTags(app).tags.find((entry) => entry.id === tagFilter)?.pageOrder ?? [];
						await setVaultTagPageOrder(app, tagFilter, applySiblingReorder(previous, nextSiblings));
						return;
					}
					await moveCodexItem(app, dragged.key, dragged.type, target.parentId, target.beforeKey);
				} catch (err) {
					new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
					renderBottomPanel(app, container, options);
				}
			})();
		},
	);
}

type CodexActionKind = "filter" | "file" | "folder";

function renderCodexActionButtons(
	parent: HTMLElement,
	app: App,
	options: BottomPanelOptions,
	order: CodexActionKind[],
): void {
	for (const kind of order) {
		if (kind === "filter") {
			const filterBtn = parent.createSpan({
				cls: `sf-codex-filter-btn${options.typeFilter.size > 0 ? " is-active" : ""}`,
				attr: { "aria-label": "Filter by type" },
			});
			setIcon(filterBtn, ICON_FILTER_LIST);
			bindPaneCornerButton(filterBtn, () => {
				new TagPickerModal(
					app,
					"codexTypes",
					Array.from(options.typeFilter),
					(nextIds) => options.onChangeTypeFilter(nextIds),
					false,
				).open();
			});
		} else if (kind === "file") {
			const newFileBtn = parent.createSpan({ cls: "sf-codex-new-file-btn", attr: { "aria-label": "New file" } });
			setIcon(newFileBtn, ICON_PLUS_SQUARE);
			bindPaneCornerButton(newFileBtn, () => options.onCreateFile());
		} else {
			const newFolderBtn = parent.createSpan({ cls: "sf-codex-new-folder-btn", attr: { "aria-label": "New folder" } });
			setIcon(newFolderBtn, ICON_FOLDER_PLUS);
			bindPaneCornerButton(newFolderBtn, () => options.onCreateFolder());
		}
	}
}

function renderVaultTagRail(parent: HTMLElement, app: App, options: BottomPanelOptions): void {
	if (!options.onChangeTagFilter) return;
	const tags = displayedVaultTags(app);
	if (tags.length === 0) return;
	const stack = parent.createDiv({ cls: "sf-codex-vault-tags" });
	const active = options.tagFilter ?? null;
	for (const tag of tags) {
		const btn = stack.createSpan({
			cls: `sf-codex-vault-tag-btn${active === tag.id ? " is-active" : ""}`,
			attr: { "aria-label": `Filter by #${tag.id}`, title: `#${tag.id}` },
		});
		setIcon(btn, tag.iconId);
		bindPaneCornerButton(btn, () => {
			options.onChangeTagFilter?.(active === tag.id ? null : tag.id);
		});
	}
}

/**
 * Codex-types / vault-tags hover icons — pinned to the bottom-left of the Codex pane itself
 * (the `.sf-bottom-panel` root), not the storyLibrary view. The tree is the scroller
 * (see `.sf-codex-tree`); this sits outside that overflow so it stays put.
 *
 * Tag-shaped icon → Codex types. Hashtag → vault `#tag` manager.
 */
function renderCodexTypesCorner(
	container: HTMLElement,
	onOpenCodexTypes?: () => void,
	onOpenTags?: () => void,
): void {
	const corner = container.createDiv({ cls: "sf-codex-pane-corner" });
	if (onOpenCodexTypes) {
		const typesBtn = corner.createSpan({
			cls: "sf-codex-types-btn",
			attr: { "aria-label": "Codex types" },
		});
		setIcon(typesBtn, ICON_TAG_DUOTONE);
		bindPaneCornerButton(typesBtn, onOpenCodexTypes);
	}

	if (onOpenTags) {
		const tagsBtn = corner.createSpan({
			cls: "sf-codex-tags-btn",
			attr: { "aria-label": "Vault tags" },
		});
		setIcon(tagsBtn, ICON_HASHTAG_SQUARE_DUOTONE);
		bindPaneCornerButton(tagsBtn, onOpenTags);
	}
}

/** pointerdown, not click: an unfocused sidebar swallows the first `click` (same as
 * navigatorControls.ts transport buttons). */
function bindPaneCornerButton(btn: HTMLElement, onActivate: () => void): void {
	btn.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		onActivate();
	});
	makeAccessibleActivatable(btn, onActivate);
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
			const folderNameEl = contentEl.createSpan({ cls: "sf-codex-folder-name", text: item.name });
			folderNameEl.addClass("sf-styled-heading");
			// A Lore Entry folder (linkedPath set) is also a real note — its own type icon shows
			// the same way a file row's would, so it still reads as "a Person/Place/…" at a glance.
			// A plain folder gets a generic folder icon instead, in the same slot, so the two read
			// as visibly different kinds of row rather than an element folder just missing its icon.
			// Lore folders also keep a folder icon *before* that type icon: the folder icon
			// expands/collapses, and the rest of the row opens the note.
			let folderToggleEl: HTMLElement | null = null;
			if (linkedPath) {
				headerEl.addClass("sf-codex-lore-folder");
				if (highlightActiveChapter && activeFilePath === linkedPath) {
					headerEl.addClass("sf-row-selected");
				}
				folderToggleEl = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon sf-codex-folder-toggle" });
				setIcon(folderToggleEl, ICON_FOLDER);
				folderToggleEl.setAttr("aria-label", collapsed ? "Expand folder" : "Collapse folder");
				const entryType = getCodexEntryType(app, linkedPath);
				if (entryType) {
					const typeIconEl = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
					setIcon(typeIconEl, codexTypeIcon(entryType) ?? "circle-help");
				}
			} else {
				const folderIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(folderIcon, ICON_FOLDER);
			}
			// Routed through attachCodexDragReorder's own pointerdown/pointerup gesture (via
			// onClick below) rather than a `click` listener here — see that file's doc comment for
			// why: a plain `click`'s first firing in an unfocused sidebar gets swallowed by
			// Obsidian's own click-to-focus handling. On a Lore Entry folder the folder icon
			// toggles collapse and the rest of the row (including a type icon) opens the note.
			// Plain (non-linked) folders keep toggling on any click.
			rowInfo.push({
				key: item.id,
				type: "folder",
				parentKey,
				onClick: (target) => {
					if (linkedPath) {
						if (folderToggleEl?.contains(target as Node)) {
							onToggleFolder(item.id);
							return;
						}
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
					folderEl.addClass("sf-codex-folder--with-indicator");
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
