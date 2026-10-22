/**
 * Shared Archive list UI — embedded under Story Context (not a separate right-rail tab).
 */
import { Notice, TFile, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import type StoryForgePlugin from "../main";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle, writeBookArchiveOrder } from "../book";
import {
	getArchivedCodexItems,
	readCodexFrontmatter,
	reorderArchivedCodexItems,
	unarchiveCodexItem,
	type ArchivedCodexItem,
} from "../codex";
import { recordChapterUnarchive } from "../history";
import { ICON_BOOK_DUOTONE, ICON_CODEX, ICON_FOLDER, ICON_UNARCHIVE } from "../icons";
import { libraryChapterPath } from "../paths";
import { formatSingleLine } from "../core/titleNumbering";
import { excerpt } from "../core/wordCount";
import { makeAccessibleActivatable } from "./a11y";
import { attachCodexDragReorder, type CodexDragRowInfo } from "./dragReorderTree";
import { applySiblingReorder, siblingOrderAfterMove } from "../core/siblingOrder";
import { renderStampedIndexEmpty } from "./stampedCross";

export type ArchiveMode = "codex" | "novel";

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
	const row = el.createDiv({ cls: "sf-story-context-view__forge-row sf-archive-mode-row" });
	addArchiveModeIcon(row, host, "codex", ICON_CODEX, "codex");
	addArchiveModeIcon(row, host, "novel", ICON_BOOK_DUOTONE, "novel");
}

function addArchiveModeIcon(
	row: HTMLElement,
	host: ArchivePanelHost,
	mode: ArchiveMode,
	icon: string,
	label: string,
): void {
	const btn = row.createSpan({
		cls: `sf-story-context-view__forge-icon${host.mode === mode ? " is-active" : ""}`,
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
	}

	if (host.mode === "novel" && !host.bookFolderName) {
		el.createDiv({ cls: "sf-empty", text: "Open a chapter to see this novel's archive." });
		return;
	}

	const items = collectArchiveIndexItems(host);
	if (items.length === 0) {
		const emptyHost = asIndex ? el.createDiv({ cls: "sf-codex-tree" }) : el;
		const label =
			host.mode === "codex" ? "No archived codex items." : "No archived chapters.";
		renderStampedIndexEmpty(emptyHost, label);
		return;
	}

	if (asIndex) {
		const body = el.createDiv({ cls: "sf-codex-body" });
		body.createDiv({ cls: "sf-codex-side-actions" });
		const treeEl = body.createDiv({ cls: "sf-codex-tree" });
		renderArchiveRows(treeEl, items, host, true);
		return;
	}

	renderArchiveRows(el, items, host, false);
}

function collectArchiveIndexItems(host: ArchivePanelHost): ArchiveIndexItem[] {
	let items: ArchiveIndexItem[] = [];
	if (host.mode === "codex") {
		items = getArchivedCodexItems(host.app).map((entry) => archiveItemFromCodex(host.app, entry));
	} else if (host.bookFolderName) {
		const bookFolderName = host.bookFolderName;
		items = getArchivedChapters(host.app, bookFolderName).map((entry) => ({
			key: entry.filename,
			filePath: libraryChapterPath(bookFolderName, entry.filename),
			type: "file" as const,
			name: formatSingleLine(chapterDisplayTitle(host.app, bookFolderName, entry.filename)),
		}));
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

		const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "unarchive" } });
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
	const fullKeys = collectArchiveIndexItems(host).map((item) => item.key);
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
	if (!host.bookFolderName) return;
	await writeBookArchiveOrder(host.app, host.bookFolderName, nextKeys);
}

async function unarchiveItem(item: ArchiveIndexItem, host: ArchivePanelHost): Promise<void> {
	try {
		if (host.mode === "codex") {
			await unarchiveCodexItem(host.app, item.key);
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

export function archiveFilePathForKey(host: ArchivePanelHost, key: string | null): string | null {
	if (!key) return null;
	const item = collectArchiveIndexItems(host).find((entry) => entry.key === key);
	return item?.filePath ?? null;
}

async function attachCodexExcerpt(app: App, el: HTMLElement, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const preview = excerpt(await app.vault.cachedRead(file));
	if (preview) setTooltip(el, preview);
}
