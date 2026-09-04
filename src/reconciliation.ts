import { App, Plugin, TFile, TFolder } from "obsidian";
import {
	LIBRARY_ROOT,
	bookBackstagePath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	chapterSidecarPath,
	isCodexNotePath,
	isLibraryChapterPath,
	isNotesArchiveNotePath,
	isNotesNotePath,
	recommendSidecarPath,
} from "./paths";
import {
	getChapterEntry,
	insertChapterEntry,
	readBookFrontmatter,
	writeBookChapterOrder,
	renameChapterEntry,
	removeChapterEntry,
	rekeyChapterPovReferences,
	rekeyChapterLocationReferences,
} from "./book";
import { renameSeriesBookEntry } from "./series";
import { rekeyCodexNotePath } from "./codex";
import { rekeyNotesNotePath } from "./notes";
import { deleteChapterSidecar, renameChapterSidecar } from "./chapterSidecar";
import { deleteRecommendCache, renameRecommendSidecar } from "./recommend/cache";
import { modifyBackstageFrontmatter, renameBackstagePath } from "./writeGuard";

/** Live rename/delete handling for chapters and book folders. Registered once at plugin load.
 *
 * Cross-book chapter moves and chapter deletes are intentionally behind-the-scenes: the
 * library pane is scoped to a single novel, so users trigger these via Obsidian's file
 * explorer (or other vault tools). We listen to vault `rename` / `delete` and keep
 * novel.md + sidecars in sync without any library-pane UI for those operations.
 */
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
			if (file instanceof TFile && (isNotesNotePath(oldPath) || isNotesArchiveNotePath(oldPath))) {
				await handleNotesNoteRename(app, oldPath, file.path);
				return;
			}
			if (file instanceof TFolder) {
				await handleBookFolderRename(app, oldPath, file.path);
			}
		}),
	);
	plugin.registerEvent(
		app.vault.on("delete", async (file) => {
			if (!(file instanceof TFile) || !isLibraryChapterPath(file.path)) return;
			await handleChapterDelete(app, file.path);
		}),
	);
}

/** Fires for renames done via this plugin's own Codex UI and via Obsidian's native file explorer alike. */
async function handleCodexNoteRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const rekeyedPath = isCodexNotePath(newPath) ? newPath : null;
	await rekeyCodexNotePath(app, oldPath, rekeyedPath);
	await rekeyChapterPovReferences(app, oldPath, rekeyedPath);
	await rekeyChapterLocationReferences(app, oldPath, rekeyedPath);
}

async function handleNotesNoteRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const rekeyedPath = isNotesNotePath(newPath) || isNotesArchiveNotePath(newPath) ? newPath : null;
	await rekeyNotesNotePath(app, oldPath, rekeyedPath);
}

async function handleChapterRename(app: App, oldPath: string, newPath: string): Promise<void> {
	const oldBook = bookFolderNameFromChapterPath(oldPath);
	const newBook = bookFolderNameFromChapterPath(newPath);
	const oldFilename = chapterFilenameFromPath(oldPath);
	const newFilename = chapterFilenameFromPath(newPath);
	if (!oldBook || !newBook || !oldFilename || !newFilename) return;

	if (oldBook !== newBook) {
		await handleChapterCrossBookMove(app, oldBook, newBook, oldFilename, newFilename);
		return;
	}

	const fm = readBookFrontmatter(app, oldBook);
	if (fm) {
		const newOrder = fm.chapterOrder.map((entry) => (entry === oldFilename ? newFilename : entry));
		await writeBookChapterOrder(app, oldBook, newOrder);
	}
	await renameChapterEntry(app, oldBook, oldFilename, newFilename);
	await renameChapterSidecar(app, oldBook, oldFilename, newFilename);
	await renameRecommendSidecar(app, oldBook, oldFilename, newFilename);
}

/**
 * Chapter file moved between library book folders (e.g. via file explorer — not the
 * single-novel library pane). Transfers the novel.md entry to the destination as
 * unplaced and moves fingerprint/recommend sidecars with it.
 */
async function handleChapterCrossBookMove(
	app: App,
	oldBook: string,
	newBook: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const entry = getChapterEntry(app, oldBook, oldFilename);
	await removeChapterEntry(app, oldBook, oldFilename);
	if (entry) {
		await insertChapterEntry(app, newBook, newFilename, {
			...entry,
			chapterTitle: entry.chapterTitle,
		});
	}

	const oldFp = chapterSidecarPath(oldBook, oldFilename);
	const newFp = chapterSidecarPath(newBook, newFilename);
	if (app.vault.getAbstractFileByPath(oldFp)) {
		await renameBackstagePath(app.vault, oldFp, newFp);
		await modifyBackstageFrontmatter(app, app.vault, newFp, "---\n---\n", (fm) => {
			Object.assign(fm, { chapter: newFilename });
		});
	}

	const oldRec = recommendSidecarPath(oldBook, oldFilename);
	const newRec = recommendSidecarPath(newBook, newFilename);
	if (app.vault.getAbstractFileByPath(oldRec)) {
		await renameBackstagePath(app.vault, oldRec, newRec);
	}
}

async function handleChapterDelete(app: App, path: string): Promise<void> {
	const book = bookFolderNameFromChapterPath(path);
	const filename = chapterFilenameFromPath(path);
	if (!book || !filename) return;
	await removeChapterEntry(app, book, filename);
	await deleteChapterSidecar(app, book, filename);
	await deleteRecommendCache(app, book, filename);
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
