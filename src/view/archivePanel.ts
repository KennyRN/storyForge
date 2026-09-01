/**
 * Shared Archive list UI — embedded under Story Context (not a separate right-rail tab).
 */
import { Notice, TFile, setIcon, setTooltip } from "obsidian";
import type { App } from "obsidian";
import type StoryForgePlugin from "../main";
import { getArchivedChapters, unarchiveChapter, chapterDisplayTitle } from "../book";
import { getArchivedCodexItems, unarchiveCodexItem, type ArchivedCodexItem } from "../codex";
import { recordChapterUnarchive } from "../history";
import { ICON_BOOK_DUOTONE, ICON_CODEX, ICON_UNARCHIVE, ICON_X } from "../icons";
import { libraryChapterPath } from "../paths";
import { formatSingleLine } from "../titleNumbering";
import { excerpt } from "../wordCount";
import { makeAccessibleActivatable } from "./a11y";

export type ArchiveMode = "codex" | "novel";

export interface ArchivePanelHost {
	app: App;
	plugin: StoryForgePlugin;
	bookFolderName: string | null;
	mode: ArchiveMode;
	setMode: (mode: ArchiveMode) => void;
	/** Re-render after unarchive / mode change. */
	refresh: () => void;
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
	if (host.mode === "codex") renderCodex(el, host);
	else renderNovel(el, host);
}

function renderArchiveEmpty(el: HTMLElement, label: string): void {
	const empty = el.createDiv({
		cls: "sf-archive-empty",
		attr: { "aria-label": label },
	});
	setIcon(empty, ICON_X);
}

function renderCodex(el: HTMLElement, host: ArchivePanelHost): void {
	const archived = getArchivedCodexItems(host.app);
	if (archived.length === 0) {
		renderArchiveEmpty(el, "No archived codex items.");
		return;
	}
	const list = el.createDiv({ cls: "sf-archive-list" });
	for (const entry of archived) {
		renderCodexRow(list, entry, host);
	}
}

function renderCodexRow(list: HTMLElement, entry: ArchivedCodexItem, host: ArchivePanelHost): void {
	const row = list.createDiv({ cls: "sf-row" });
	const label =
		entry.type === "folder" ? `${entry.name} (folder with ${entry.childCount ?? 0} children)` : entry.name;
	row.createSpan({ cls: "sf-archive-label", text: label });
	if (entry.type === "file") void attachCodexExcerpt(host.app, row, entry.key);

	const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
	setIcon(unarchiveBtn, ICON_UNARCHIVE);
	const handle = async () => {
		try {
			await unarchiveCodexItem(host.app, entry.key);
			host.plugin.refreshStoryForgeViews();
			host.refresh();
		} catch (err) {
			new Notice(`storyForge: could not unarchive — ${err instanceof Error ? err.message : String(err)}`);
		}
	};
	unarchiveBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void handle();
	});
	makeAccessibleActivatable(unarchiveBtn, () => void handle());
}

function renderNovel(el: HTMLElement, host: ArchivePanelHost): void {
	if (!host.bookFolderName) {
		el.createDiv({ cls: "sf-empty", text: "Open a chapter to see this novel's archive." });
		return;
	}
	const archived = getArchivedChapters(host.app, host.bookFolderName);
	if (archived.length === 0) {
		renderArchiveEmpty(el, "No archived chapters.");
		return;
	}
	const list = el.createDiv({ cls: "sf-archive-list" });
	for (const entry of archived) {
		renderNovelRow(list, entry.bookFolderName, entry.filename, host);
	}
}

function renderNovelRow(
	list: HTMLElement,
	bookFolderName: string,
	filename: string,
	host: ArchivePanelHost,
): void {
	const row = list.createDiv({ cls: "sf-row" });
	const chapterLabel = formatSingleLine(chapterDisplayTitle(host.app, bookFolderName, filename));
	row.createSpan({ cls: "sf-archive-label", text: chapterLabel });
	void attachChapterExcerpt(host.app, row, bookFolderName, filename);

	const unarchiveBtn = row.createSpan({ cls: "sf-archive-unarchive-btn", attr: { "aria-label": "Unarchive" } });
	setIcon(unarchiveBtn, ICON_UNARCHIVE);
	const handle = async () => {
		try {
			await unarchiveChapter(host.app, bookFolderName, filename);
			await recordChapterUnarchive(host.app, bookFolderName, filename);
			host.plugin.refreshStoryForgeViews();
			host.refresh();
		} catch (err) {
			new Notice(`storyForge: could not unarchive — ${err instanceof Error ? err.message : String(err)}`);
		}
	};
	unarchiveBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		void handle();
	});
	makeAccessibleActivatable(unarchiveBtn, () => void handle());
}

async function attachCodexExcerpt(app: App, el: HTMLElement, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return;
	const preview = excerpt(await app.vault.cachedRead(file));
	if (preview) setTooltip(el, preview);
}

async function attachChapterExcerpt(
	app: App,
	el: HTMLElement,
	bookFolderName: string,
	filename: string,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(libraryChapterPath(bookFolderName, filename));
	if (!(file instanceof TFile)) return;
	const preview = excerpt(await app.vault.cachedRead(file));
	if (preview) setTooltip(el, preview);
}
