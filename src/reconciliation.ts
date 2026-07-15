import { App, Plugin, TFile, TFolder } from "obsidian";
import {
	LIBRARY_ROOT,
	bookBackstagePath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	isCodexNotePath,
	isLibraryChapterPath,
} from "./paths";
import { readBookFrontmatter, writeBookChapterOrder, renameChapterEntry, rekeyChapterPovReferences } from "./book";
import { renameSeriesBookEntry } from "./series";
import { rekeyCodexNotePath } from "./codex";
import { renameChapterSidecar } from "./chapterSidecar";
import { renameBackstagePath } from "./writeGuard";

/** Live rename handling: chapters and book folders. Registered once at plugin load. */
export function registerReconciliationEvents(app: App, plugin: Plugin): void {
	plugin.registerEvent(
		app.vault.on("rename", async (file, oldPath) => {
			if (file instanceof TFile && isLibraryChapterPath(oldPath) && isLibraryChapterPath(file.path)) {
				await handleChapterRename(app, oldPath, file.path);
				return;
			}
			if (file instanceof TFile && isCodexNotePath(oldPath)) {
				await handleCodexNoteRename(app, oldPath, file.path);
				return;
			}
			if (file instanceof TFolder) {
				await handleBookFolderRename(app, oldPath, file.path);
			}
		}),
	);
}

/** Fires for renames done via this plugin's own Codex UI and via Obsidian's native file explorer alike. */
async function handleCodexNoteRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const rekeyedPath = isCodexNotePath(newPath) ? newPath : null;
	await rekeyCodexNotePath(app, oldPath, rekeyedPath);
	await rekeyChapterPovReferences(app, oldPath, rekeyedPath);
}

async function handleChapterRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const oldBook = bookFolderNameFromChapterPath(oldPath);
	const newBook = bookFolderNameFromChapterPath(newPath);
	const oldFilename = chapterFilenameFromPath(oldPath);
	const newFilename = chapterFilenameFromPath(newPath);
	if (!oldBook || !newBook || oldBook !== newBook || !oldFilename || !newFilename) return;

	const fm = readBookFrontmatter(app, oldBook);
	if (fm) {
		const newOrder = fm.chapterOrder.map((entry) => (entry === oldFilename ? newFilename : entry));
		await writeBookChapterOrder(app, oldBook, newOrder);
	}
	await renameChapterEntry(app, oldBook, oldFilename, newFilename);
	await renameChapterSidecar(app, oldBook, oldFilename, newFilename);
}

async function handleBookFolderRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const libraryPrefix = `${LIBRARY_ROOT}/`;
	if (!oldPath.startsWith(libraryPrefix) || !newPath.startsWith(libraryPrefix)) return;
	const oldName = oldPath.slice(libraryPrefix.length);
	const newName = newPath.slice(libraryPrefix.length);
	if (oldName.includes("/") || newName.includes("/")) return; // only top-level book folders

	const oldBackstage = bookBackstagePath(oldName);
	const newBackstage = bookBackstagePath(newName);
	if (app.vault.getAbstractFileByPath(oldBackstage)) {
		await renameBackstagePath(app.vault, oldBackstage, newBackstage);
	}
	await renameSeriesBookEntry(app, oldName, newName);
}
