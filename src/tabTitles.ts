import { App, EventRef, MarkdownView, WorkspaceLeaf } from "obsidian";
import { bookFolderNameFromChapterPath, isLibraryChapterPath } from "./paths";
import { numberedChapterTitle } from "./book";
import { formatSingleLine } from "./titleNumbering";
import type { NumberingStyle } from "./numberingStyle";
import { debounce } from "./debounce";

/**
 * `tabHeaderInnerTitleEl` is an internal Obsidian property (not in the public
 * API) used by title-override community plugins to set a tab's visible label
 * without renaming the underlying file. Isolated to this one typed accessor.
 */
interface LeafWithTabHeader extends WorkspaceLeaf {
	tabHeaderInnerTitleEl?: HTMLElement;
}

function displayTitleForChapterPath(app: App, path: string, chapterNumberingStyle: NumberingStyle): string | null {
	const bookFolderName = bookFolderNameFromChapterPath(path);
	if (!bookFolderName) return null;
	const filename = path.split("/").pop();
	if (!filename) return null;
	const raw = numberedChapterTitle(app, bookFolderName, filename, chapterNumberingStyle);
	return formatSingleLine(raw);
}

export function refreshTabTitles(app: App, chapterNumberingStyle: NumberingStyle): void {
	const activeLeaf = app.workspace.getMostRecentLeaf();
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView) || !view.file) continue;
		if (!isLibraryChapterPath(view.file.path)) continue;

		const displayTitle = displayTitleForChapterPath(app, view.file.path, chapterNumberingStyle);
		if (!displayTitle) continue;

		(leaf as LeafWithTabHeader).tabHeaderInnerTitleEl?.setText(displayTitle);
		if (leaf === activeLeaf) {
			document.title = `${displayTitle} - ${app.vault.getName()}`;
		}
	}
}

/** `getChapterNumberingStyle` is read fresh on every refresh (not captured once at registration
 * time) so a settings change is picked up by the next debounced event, not just a future reload. */
export function registerTabTitleOverrides(
	app: App,
	register: (eventRef: EventRef) => void,
	getChapterNumberingStyle: () => NumberingStyle,
): void {
	const debouncedRefresh = debounce(() => refreshTabTitles(app, getChapterNumberingStyle()), 200);

	register(app.workspace.on("file-open", debouncedRefresh));
	register(app.workspace.on("active-leaf-change", debouncedRefresh));
	register(app.workspace.on("layout-change", debouncedRefresh));
	register(app.vault.on("rename", debouncedRefresh));
	register(app.metadataCache.on("changed", debouncedRefresh));

	refreshTabTitles(app, getChapterNumberingStyle());
}
