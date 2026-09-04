import { App, Notice, TFile, setIcon } from "obsidian";
import {
	archiveNotesItem,
	convertNotesNoteToFolder,
	displayedNotesVaultTags,
	getNotesEntryType,
	getNotesView,
	ideaTypeIcon,
	isDescendantFolder,
	moveNotesItem,
	readNotesFrontmatter,
	removeNotesFolder,
	renameNotesFolder,
	renameNotesNoteFile,
	type NotesTreeItem,
} from "../notes";
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
import { IdeaSetTypeModal } from "./IdeaSetTypeModal";
import { TagPickerModal } from "./TagPickerModal";
import { applySiblingReorder, readVaultTags, setVaultTagPageOrder, siblingOrderAfterMove } from "../vaultTags";

export interface IdeaShelfPanelOptions {
	collapsedPaths: ReadonlySet<string>;
	onToggleFolder: (folderId: string) => void;
	selectedPath: string | null;
	onCreateFolder: () => void;
	onCreateFile: () => void;
	typeFilter: ReadonlySet<string>;
	onChangeTypeFilter: (next: string[]) => void;
	tagFilter: string | null;
	onChangeTagFilter: (next: string | null) => void;
	onOpenFile: (path: string) => void;
	onOpenIdeaTypes?: () => void;
	onOpenTags?: () => void;
	onChanged: () => void;
}

export function renderIdeaShelfPanel(app: App, container: HTMLElement, options: IdeaShelfPanelOptions): void {
	container.empty();
	container.addClass("sf-bottom-panel");

	if (options.onOpenIdeaTypes || options.onOpenTags) {
		renderIdeaTypesCorner(container, options.onOpenIdeaTypes, options.onOpenTags);
	}

	const body = container.createDiv({ cls: "sf-codex-body" });
	const rail = body.createDiv({ cls: "sf-codex-side-actions" });
	renderActionButtons(rail, app, options);
	renderNotesTagRail(rail, app, options);

	const treeEl = body.createDiv({ cls: "sf-codex-tree" });
	const tree = getNotesView(app, options.typeFilter, options.tagFilter);
	if (!tree) {
		treeEl.createDiv({ cls: "sf-empty", text: "Nothing here yet." });
		return;
	}

	const rowInfo: CodexDragRowInfo[] = [];
	renderTreeChildren(
		app,
		treeEl,
		tree.children,
		options,
		null,
		rowInfo,
		0,
	);

	const { folders } = readNotesFrontmatter(app);
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
					} else {
						await moveNotesItem(app, dragged.key, dragged.type, target.parentId, target.beforeKey);
					}
					options.onChanged();
				} catch (err) {
					new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
					renderIdeaShelfPanel(app, container, options);
				}
			})();
		},
	);
}

function renderActionButtons(parent: HTMLElement, app: App, options: IdeaShelfPanelOptions): void {
	const newFolderBtn = parent.createSpan({ cls: "sf-codex-new-folder-btn", attr: { "aria-label": "New folder" } });
	setIcon(newFolderBtn, ICON_FOLDER_PLUS);
	bindPaneCornerButton(newFolderBtn, () => options.onCreateFolder());

	const newFileBtn = parent.createSpan({ cls: "sf-codex-new-file-btn", attr: { "aria-label": "New file" } });
	setIcon(newFileBtn, ICON_PLUS_SQUARE);
	bindPaneCornerButton(newFileBtn, () => options.onCreateFile());

	const filterBtn = parent.createSpan({
		cls: `sf-codex-filter-btn${options.typeFilter.size > 0 ? " is-active" : ""}`,
		attr: { "aria-label": "Filter by type" },
	});
	setIcon(filterBtn, ICON_FILTER_LIST);
	bindPaneCornerButton(filterBtn, () => {
		new TagPickerModal(
			app,
			"ideaTypes",
			Array.from(options.typeFilter),
			(nextIds) => options.onChangeTypeFilter(nextIds),
			false,
		).open();
	});
}

function renderNotesTagRail(parent: HTMLElement, app: App, options: IdeaShelfPanelOptions): void {
	const tags = displayedNotesVaultTags(app);
	if (tags.length === 0) return;
	const stack = parent.createDiv({ cls: "sf-codex-vault-tags" });
	const active = options.tagFilter;
	for (const tag of tags) {
		const btn = stack.createSpan({
			cls: `sf-codex-vault-tag-btn${active === tag.id ? " is-active" : ""}`,
			attr: { "aria-label": `Filter by #${tag.id}`, title: `#${tag.id}` },
		});
		setIcon(btn, tag.iconId);
		bindPaneCornerButton(btn, () => {
			options.onChangeTagFilter(active === tag.id ? null : tag.id);
		});
	}
}

function renderIdeaTypesCorner(
	container: HTMLElement,
	onOpenIdeaTypes?: () => void,
	onOpenTags?: () => void,
): void {
	const corner = container.createDiv({ cls: "sf-codex-pane-corner" });
	if (onOpenIdeaTypes) {
		const typesBtn = corner.createSpan({
			cls: "sf-codex-types-btn",
			attr: { "aria-label": "Notebook types" },
		});
		setIcon(typesBtn, ICON_TAG_DUOTONE);
		bindPaneCornerButton(typesBtn, onOpenIdeaTypes);
	}
	if (onOpenTags) {
		const tagsBtn = corner.createSpan({
			cls: "sf-codex-tags-btn",
			attr: { "aria-label": "Notebook tags" },
		});
		setIcon(tagsBtn, ICON_HASHTAG_SQUARE_DUOTONE);
		bindPaneCornerButton(tagsBtn, onOpenTags);
	}
}

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
	items: NotesTreeItem[],
	options: IdeaShelfPanelOptions,
	parentKey: string | null,
	rowInfo: CodexDragRowInfo[],
	depth: number,
): void {
	for (const item of items) {
		if (item.type === "folder") {
			const linkedPath = item.path;
			const folderEl = container.createDiv({ cls: "sf-codex-folder" });
			folderEl.setCssProps({ "--sf-codex-depth": String(depth) });
			const headerEl = folderEl.createDiv({ cls: "sf-codex-folder-header" });
			headerEl.dataset.key = item.id;
			headerEl.dataset.type = "folder";

			const contentEl = headerEl.createDiv({ cls: "sf-codex-row-content" });
			const collapsed = options.collapsedPaths.has(item.id);
			const folderNameEl = contentEl.createSpan({ cls: "sf-codex-folder-name", text: item.name });
			folderNameEl.addClass("sf-styled-heading");
			let folderToggleEl: HTMLElement | null = null;
			if (linkedPath) {
				headerEl.addClass("sf-codex-lore-folder");
				if (options.selectedPath === linkedPath) headerEl.addClass("sf-row-selected");
				folderToggleEl = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon sf-codex-folder-toggle" });
				setIcon(folderToggleEl, ICON_FOLDER);
				folderToggleEl.setAttr("aria-label", collapsed ? "Expand folder" : "Collapse folder");
				const entryType = getNotesEntryType(app, linkedPath);
				if (entryType) {
					const typeIconEl = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
					setIcon(typeIconEl, ideaTypeIcon(entryType) ?? "circle-help");
				}
			} else {
				const folderIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(folderIcon, ICON_FOLDER);
			}
			rowInfo.push({
				key: item.id,
				type: "folder",
				parentKey,
				onClick: (target) => {
					if (linkedPath) {
						if (folderToggleEl?.contains(target as Node)) {
							options.onToggleFolder(item.id);
							return;
						}
						options.onOpenFile(linkedPath);
						return;
					}
					options.onToggleFolder(item.id);
				},
			});

			const folderMenuItems: ExtraMenuItem[] = [
				{
					title: "Archive Entire Folder",
					onClick: () => {
						void archiveNotesItem(app, item.id).then(() => options.onChanged());
					},
				},
				{
					title: "Remove Folder and Keep Items",
					onClick: () => {
						void removeNotesFolder(app, item.id).then(() => options.onChanged());
					},
				},
			];
			if (linkedPath) {
				folderMenuItems.push({
					title: "Set as...",
					onClick: () => new IdeaSetTypeModal(app, linkedPath).open(),
				});
			}
			attachInlineRename({
				row: headerEl,
				label: folderNameEl,
				getCurrentTitle: () => item.name,
				onCommit: async (name) => {
					if (linkedPath) {
						const file = app.vault.getAbstractFileByPath(linkedPath);
						if (file instanceof TFile) await renameNotesNoteFile(app, file, name);
						return;
					}
					await renameNotesFolder(app, item.id, name);
				},
				extraMenuItems: folderMenuItems,
			});

			if (!collapsed) {
				const childrenEl = folderEl.createDiv({ cls: "sf-codex-folder-children" });
				if (item.children.length > 0) {
					folderEl.addClass("sf-codex-folder--with-indicator");
					childrenEl.createDiv({ cls: "sf-codex-folder-indicator" });
				}
				renderTreeChildren(app, childrenEl, item.children, options, item.id, rowInfo, depth + 1);
			}
		} else {
			const fileEl = container.createDiv({ cls: "sf-codex-file" });
			fileEl.setCssProps({ "--sf-codex-depth": String(depth) });
			fileEl.dataset.key = item.path;
			fileEl.dataset.type = "file";
			rowInfo.push({ key: item.path, type: "file", parentKey, onClick: () => options.onOpenFile(item.path) });
			if (options.selectedPath === item.path) fileEl.addClass("sf-row-selected");
			const contentEl = fileEl.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
			const label = contentEl.createSpan({ cls: "sf-codex-file-name", text: item.name });
			const entryType = getNotesEntryType(app, item.path);
			if (entryType) {
				const typeIcon = contentEl.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(typeIcon, ideaTypeIcon(entryType) ?? "circle-help");
			}
			attachInlineRename({
				row: fileEl,
				label,
				getCurrentTitle: () => item.name,
				onCommit: async (name) => {
					const file = app.vault.getAbstractFileByPath(item.path);
					if (file instanceof TFile) await renameNotesNoteFile(app, file, name);
				},
				extraMenuItems: [
					{
						title: "Archive",
						onClick: () => {
							void archiveNotesItem(app, item.path).then(() => options.onChanged());
						},
					},
					{ title: "Set as...", onClick: () => new IdeaSetTypeModal(app, item.path).open() },
					{
						title: "Convert to folder",
						onClick: () => {
							void convertNotesNoteToFolder(app, item.path).then(() => options.onChanged());
						},
					},
				],
			});
		}
	}
}
