/**
 * Shared Archive list UI — embedded under Story Context (not a separate right-rail tab).
 */
import { Notice, TFile, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import type StoryForgePlugin from "../main";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle, writeBookArchiveOrder } from "../book";
import {
	getArchivedCodexItems,
	getCodexEntryType,
	readCodexFrontmatter,
	reorderArchivedCodexItems,
	unarchiveCodexItem,
	type ArchivedCodexItem,
} from "../codex";
import { recordChapterUnarchive } from "../history";
import {
	collectArchivedNotes,
	displayedNotesVaultTags,
	getNotesEntryType,
	reorderArchivedNotes,
	unarchiveNotesNote,
} from "../notes";
import {
	ICON_BOOK_DUOTONE,
	ICON_CODEX,
	ICON_FILTER_LIST,
	ICON_FOLDER,
	ICON_HASHTAG_SQUARE_DUOTONE,
	ICON_NOTEBOOK_DUOTONE,
	ICON_TAG_DUOTONE,
	ICON_UNARCHIVE,
} from "../icons";
import { libraryChapterPath } from "../paths";
import { formatSingleLine } from "../titleNumbering";
import { excerpt } from "../wordCount";
import { makeAccessibleActivatable } from "./a11y";
import { attachCodexDragReorder, type CodexDragRowInfo } from "./dragReorderTree";
import { applySiblingReorder, displayedVaultTags, filterVisiblePathsByTag, siblingOrderAfterMove } from "../vaultTags";
import { TagPickerModal } from "./TagPickerModal";
import { renderStampedIndexEmpty } from "./stampedCross";

export type ArchiveMode = "codex" | "novel" | "notes";

export interface ArchivePanelHost {
	app: App;
	plugin: StoryForgePlugin;
	bookFolderName: string | null;
	mode: ArchiveMode;
	setMode: (mode: ArchiveMode) => void;
	/** Re-render after unarchive / mode change. */
	refresh: () => void;
	selectedKey?: string | null;
	onSelect?: (key: string) => void;
	typeFilter?: ReadonlySet<string>;
	onChangeTypeFilter?: (next: string[]) => void;
	tagFilter?: string | null;
	onChangeTagFilter?: (next: string | null) => void;
	onOpenTypes?: () => void;
	onOpenTags?: () => void;
}

interface ArchiveIndexItem {
	key: string;
	filePath: string | null;
	type: "file" | "folder";
	name: string;
}

/** Renders Codex / Novel mode icons + archive list into `el` (no panel chrome header). */
export function renderArchivePanel(el: HTMLElement, host: ArchivePanelHost): void {
	renderArchiveModeIcons(el, host);
	renderArchiveList(el, host);
}

/** Mode-icon row — Codex globe and duo-book (Novel), same visual language as Forge-family
 * member icons. Mount in a non-scrolling region so they stay put. */
export function renderArchiveModeIcons(el: HTMLElement, host: ArchivePanelHost): void {
	const row = el.createDiv({ cls: "sf-recommend-view__forge-row sf-archive-mode-row" });
	addArchiveModeIcon(row, host, "codex", ICON_CODEX, "Codex");
	addArchiveModeIcon(row, host, "novel", ICON_BOOK_DUOTONE, "Novel");
	addArchiveModeIcon(row, host, "notes", ICON_NOTEBOOK_DUOTONE, "Notebook");
}

function addArchiveModeIcon(
	row: HTMLElement,
	host: ArchivePanelHost,
	mode: ArchiveMode,
	icon: string,
	label: string,
): void {
	const btn = row.createSpan({
		cls: `sf-recommend-view__forge-icon${host.mode === mode ? " is-active" : ""}`,
		attr: { role: "button", tabindex: "0", "aria-label": label },
	});
	setIcon(btn, icon);
	setTooltip(btn, label);
	const select = () => {
		host.setMode(mode);
		host.refresh();
	};
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		select();
	});
	makeAccessibleActivatable(btn, select);
}

/** @deprecated Use renderArchiveModeIcons — kept so older call sites that imported the tab strip
 * still type-check; forwards to the icon row. */
export function renderArchiveTabs(el: HTMLElement, host: ArchivePanelHost): void {
	renderArchiveModeIcons(el, host);
}

/** List for the active tab — mount in the scrolling region. */
export function renderArchiveList(el: HTMLElement, host: ArchivePanelHost): void {
	renderArchiveIndex(el, host, false);
}

/** Notebook-style archive index: types/#tags, filter rail, drag-reorder, selection. */
export function renderArchiveIndex(el: HTMLElement, host: ArchivePanelHost, asIndex = true): void {
	if (asIndex) {
		el.empty();
		el.addClass("sf-bottom-panel");
		if (host.onOpenTypes || host.onOpenTags) {
			renderArchiveTypesCorner(el, host);
		}
	}

	if (host.mode === "novel" && !host.bookFolderName) {
		el.createDiv({ cls: "sf-empty", text: "Open a chapter to see this novel's archive." });
		return;
	}

	const items = collectArchiveIndexItems(host);
	if (items.length === 0) {
		const emptyHost = asIndex ? el.createDiv({ cls: "sf-codex-tree" }) : el;
		const label =
			host.mode === "codex"
				? "No archived codex items."
				: host.mode === "notes"
					? "No archived notes."
					: "No archived chapters.";
		renderStampedIndexEmpty(emptyHost, label);
		return;
	}

	if (asIndex) {
		const body = el.createDiv({ cls: "sf-codex-body" });
		const rail = body.createDiv({ cls: "sf-codex-side-actions" });
		renderArchiveFilterRail(rail, host);
		const treeEl = body.createDiv({ cls: "sf-codex-tree" });
		renderArchiveRows(treeEl, items, host, true);
		return;
	}

	renderArchiveRows(el, items, host, false);
}

function collectArchiveIndexItems(host: ArchivePanelHost): ArchiveIndexItem[] {
	const typeFilter = host.typeFilter ?? new Set<string>();
	const tagFilter = host.tagFilter ?? null;
	let items: ArchiveIndexItem[] = [];
	if (host.mode === "codex") {
		items = getArchivedCodexItems(host.app).map((entry) => archiveItemFromCodex(host.app, entry));
		if (typeFilter.size > 0) {
			items = items.filter((item) => {
				if (!item.filePath) return false;
				const type = getCodexEntryType(host.app, item.filePath);
				return Boolean(type && typeFilter.has(type));
			});
		}
	} else if (host.mode === "notes") {
		items = collectArchivedNotes(host.app).map((entry) => ({
			key: entry.path,
			filePath: entry.path,
			type: "file" as const,
			name: entry.name,
		}));
		if (typeFilter.size > 0) {
			items = items.filter((item) => {
				if (!item.filePath) return false;
				const type = getNotesEntryType(host.app, item.filePath);
				return Boolean(type && typeFilter.has(type));
			});
		}
	} else if (host.bookFolderName) {
		const bookFolderName = host.bookFolderName;
		items = getArchivedChapters(host.app, bookFolderName).map((entry) => ({
			key: entry.filename,
			filePath: libraryChapterPath(bookFolderName, entry.filename),
			type: "file" as const,
			name: formatSingleLine(chapterDisplayTitle(host.app, bookFolderName, entry.filename)),
		}));
	}
	if (tagFilter) {
		const visible = new Set(items.map((item) => item.filePath).filter((path): path is string => Boolean(path)));
		const tagged = filterVisiblePathsByTag(host.app, visible, tagFilter);
		items = items.filter((item) => item.filePath && tagged.has(item.filePath));
	}
	return items;
}

function archiveItemFromCodex(app: App, entry: ArchivedCodexItem): ArchiveIndexItem {
	if (entry.type === "folder") {
		const linked = readCodexFrontmatter(app).folders[entry.key]?.linkedNotePath ?? null;
		return {
			key: entry.key,
			filePath: linked,
			type: "folder",
			name: `${entry.name} (folder with ${entry.childCount ?? 0} children)`,
		};
	}
	return { key: entry.key, filePath: entry.key, type: "file", name: entry.name };
}

function renderArchiveTypesCorner(container: HTMLElement, host: ArchivePanelHost): void {
	const corner = container.createDiv({ cls: "sf-codex-pane-corner" });
	if (host.onOpenTypes) {
		const typesBtn = corner.createSpan({
			cls: "sf-codex-types-btn",
			attr: { "aria-label": "Archive types" },
		});
		setIcon(typesBtn, ICON_TAG_DUOTONE);
		bindArchiveButton(typesBtn, host.onOpenTypes);
	}
	if (host.onOpenTags) {
		const tagsBtn = corner.createSpan({
			cls: "sf-codex-tags-btn",
			attr: { "aria-label": host.mode === "notes" ? "Notebook tags" : "Vault tags" },
		});
		setIcon(tagsBtn, ICON_HASHTAG_SQUARE_DUOTONE);
		bindArchiveButton(tagsBtn, host.onOpenTags);
	}
}

function renderArchiveFilterRail(parent: HTMLElement, host: ArchivePanelHost): void {
	if (host.mode !== "novel" && host.onChangeTypeFilter) {
		const typeFilter = host.typeFilter ?? new Set<string>();
		const filterBtn = parent.createSpan({
			cls: `sf-codex-filter-btn${typeFilter.size > 0 ? " is-active" : ""}`,
			attr: { "aria-label": "Filter by type" },
		});
		setIcon(filterBtn, ICON_FILTER_LIST);
		bindArchiveButton(filterBtn, () => {
			new TagPickerModal(
				host.app,
				host.mode === "notes" ? "ideaTypes" : "codexTypes",
				Array.from(typeFilter),
				(nextIds) => host.onChangeTypeFilter?.(nextIds),
				false,
			).open();
		});
	}
	const tags = host.mode === "notes" ? displayedNotesVaultTags(host.app) : displayedVaultTags(host.app);
	if (tags.length === 0 || !host.onChangeTagFilter) return;
	const stack = parent.createDiv({ cls: "sf-codex-vault-tags" });
	const active = host.tagFilter ?? null;
	for (const tag of tags) {
		const btn = stack.createSpan({
			cls: `sf-codex-vault-tag-btn${active === tag.id ? " is-active" : ""}`,
			attr: { "aria-label": `Filter by #${tag.id}`, title: `#${tag.id}` },
		});
		setIcon(btn, tag.iconId);
		bindArchiveButton(btn, () => {
			host.onChangeTagFilter?.(active === tag.id ? null : tag.id);
		});
	}
}

function renderArchiveRows(
	el: HTMLElement,
	items: ArchiveIndexItem[],
	host: ArchivePanelHost,
	asIndex: boolean,
): void {
	const list = asIndex ? el : el.createDiv({ cls: "sf-archive-list" });
	const rowInfo: CodexDragRowInfo[] = [];
	for (const item of items) {
		const row = list.createDiv({ cls: asIndex ? "sf-codex-file" : "sf-row" });
		row.dataset.key = item.key;
		row.dataset.type = item.type;
		if (host.selectedKey === item.key) row.addClass("sf-row-selected");
		if (asIndex) {
			const content = row.createDiv({ cls: "sf-codex-row-content sf-codex-row-content--file" });
			if (item.type === "folder") {
				const icon = content.createSpan({ cls: "sf-icon sf-codex-type-icon" });
				setIcon(icon, ICON_FOLDER);
			}
			content.createSpan({ cls: "sf-row-text", text: item.name });
		} else {
			row.createSpan({ cls: "sf-archive-label", text: item.name });
		}
		if (item.filePath) void attachCodexExcerpt(host.app, row, item.filePath);

		const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
		setIcon(unarchiveBtn, ICON_UNARCHIVE);
		const unarchive = () => void unarchiveItem(item, host);
		unarchiveBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			unarchive();
		});
		makeAccessibleActivatable(unarchiveBtn, unarchive);

		rowInfo.push({
			key: item.key,
			type: item.type,
			parentKey: null,
			onClick: (target) => {
				if (unarchiveBtn.contains(target as Node)) return;
				host.onSelect?.(item.key);
				if (!asIndex) host.refresh();
			},
		});
	}

	if (!asIndex) return;
	const fullKeys = collectArchiveIndexItems({ ...host, typeFilter: new Set(), tagFilter: null }).map((item) => item.key);
	attachCodexDragReorder(
		list,
		rowInfo,
		() => false,
		(dragged, target) => {
			void (async () => {
				try {
					const visible = items.map((item) => item.key);
					const nextVisible = siblingOrderAfterMove(visible, dragged.key, target.beforeKey);
					const nextFull = applySiblingReorder(fullKeys, nextVisible);
					await persistArchiveOrder(host, nextFull);
					host.refresh();
				} catch (err) {
					new Notice(`storyForge: could not save the new order — ${err instanceof Error ? err.message : String(err)}`);
					host.refresh();
				}
			})();
		},
	);
}

async function persistArchiveOrder(host: ArchivePanelHost, nextKeys: string[]): Promise<void> {
	if (host.mode === "codex") {
		await reorderArchivedCodexItems(host.app, nextKeys);
		return;
	}
	if (host.mode === "notes") {
		await reorderArchivedNotes(host.app, nextKeys);
		return;
	}
	if (!host.bookFolderName) return;
	await writeBookArchiveOrder(host.app, host.bookFolderName, nextKeys);
}

async function unarchiveItem(item: ArchiveIndexItem, host: ArchivePanelHost): Promise<void> {
	try {
		if (host.mode === "codex") {
			await unarchiveCodexItem(host.app, item.key);
		} else if (host.mode === "notes") {
			await unarchiveNotesNote(host.app, item.key);
		} else if (host.bookFolderName) {
			await unarchiveChapter(host.app, host.bookFolderName, item.key);
			await recordChapterUnarchive(host.app, host.bookFolderName, item.key);
		}
		host.plugin.refreshStoryForgeViews();
		host.refresh();
	} catch (err) {
		new Notice(`storyForge: could not unarchive — ${err instanceof Error ? err.message : String(err)}`);
	}
}

function bindArchiveButton(btn: HTMLElement, onActivate: () => void): void {
	btn.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		onActivate();
	});
	makeAccessibleActivatable(btn, onActivate);
}

export function archiveFilePathForKey(host: ArchivePanelHost, key: string | null): string | null {
	if (!key) return null;
	const item = collectArchiveIndexItems({ ...host, typeFilter: new Set(), tagFilter: null }).find((entry) => entry.key === key);
	return item?.filePath ?? null;
}

async function attachCodexExcerpt(app: App, el: HTMLElement, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const preview = excerpt(await app.vault.cachedRead(file));
	if (preview) setTooltip(el, preview);
}
