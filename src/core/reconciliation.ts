/**
 * What the data layer does when something is renamed or deleted outside it (a chapter file moved in
 * a file manager, a Codex note deleted, a book folder renamed): it re-keys the metadata that
 * follows those files. This is the logic that used to sit behind the plugin's vault `rename` /
 * `delete` events; the event wiring is gone. Whoever notices the change (the file watcher, in a
 * later piece of work) calls these, after refreshing the index with `applyChange`.
 *
 * Everything here only edits backstage metadata (novel/series/codex files and sidecars); none of it
 * touches a chapter or Codex note.
 */
import {
	CODEX_ROOT,
	LIBRARY_ROOT,
	bookBackstagePath,
	bookFolderNameFromChapterPath,
	chapterFilenameFromPath,
	chapterSidecarPath,
	isCodexNotePath,
	isLibraryChapterPath,
	storyContextSidecarPath,
} from "./paths";
import {
	getChapterEntry,
	insertChapterEntry,
	pruneMissingChapterCodexRefs,
	readBookFrontmatter,
	rekeyChapterLocationReferences,
	rekeyChapterPovReferences,
	removeChapterEntry,
	renameChapterEntry,
	writeBookChapterOrder,
} from "./book";
import { pruneMissingCodexNotes, rekeyCodexNotePath } from "./codex";
import { deleteChapterSidecar, renameChapterSidecar } from "./chapterSidecar";
import { deleteStoryDetailsSidecar, renameStoryDetailsSidecar } from "./storyDetailsSidecar";
import { renameSeriesBookEntry } from "./series";
import type { Project } from "./project";

/** A file or folder at `oldPath` is now at `newPath`. Dispatches to the matching handler. */
export async function reconcileRename(project: Project, oldPath: string, newPath: string, isFolder: boolean): Promise<void> {
	if (!isFolder && isLibraryChapterPath(oldPath) && isLibraryChapterPath(newPath)) {
		await handleChapterRename(project, oldPath, newPath);
		return;
	}
	if (!isFolder && isCodexNotePath(oldPath)) {
		await handleCodexNoteRename(project, oldPath, newPath);
		return;
	}
	if (isFolder) await handleBookFolderRename(project, oldPath, newPath);
}

/** The file at `path` is gone. */
export async function reconcileDelete(project: Project, path: string): Promise<void> {
	if (isLibraryChapterPath(path)) {
		await handleChapterDelete(project, path);
		return;
	}
	if (isCodexNotePath(path)) {
		await rekeyCodexNotePath(project, path, null);
		await rekeyChapterPovReferences(project, path, null);
		await rekeyChapterLocationReferences(project, path, null);
	}
}

/** Something under `Codex/` changed on disk: drop references to notes that no longer exist. */
export async function reconcileExternalCodexChange(project: Project): Promise<void> {
	await pruneMissingCodexNotes(project);
	await pruneMissingChapterCodexRefs(project);
}

/** True for a path the Codex reconciliation cares about. */
export function isCodexReconciliationPath(path: string): boolean {
	return path === CODEX_ROOT || isCodexNotePath(path) || path.startsWith(`${CODEX_ROOT}/`);
}

export async function handleCodexNoteRename(project: Project, oldPath: string, newPath: string): Promise<void> {
	const rekeyedPath = isCodexNotePath(newPath) ? newPath : null;
	await rekeyCodexNotePath(project, oldPath, rekeyedPath);
	await rekeyChapterPovReferences(project, oldPath, rekeyedPath);
	await rekeyChapterLocationReferences(project, oldPath, rekeyedPath);
}

export async function handleChapterRename(project: Project, oldPath: string, newPath: string): Promise<void> {
	const oldBook = bookFolderNameFromChapterPath(oldPath);
	const newBook = bookFolderNameFromChapterPath(newPath);
	const oldFilename = chapterFilenameFromPath(oldPath);
	const newFilename = chapterFilenameFromPath(newPath);
	if (!oldBook || !newBook || !oldFilename || !newFilename) return;

	if (oldBook !== newBook) {
		await handleChapterCrossBookMove(project, oldBook, newBook, oldFilename, newFilename);
		return;
	}

	const fm = readBookFrontmatter(project, oldBook);
	if (fm) {
		const newOrder = fm.chapterOrder.map((entry) => (entry === oldFilename ? newFilename : entry));
		await writeBookChapterOrder(project, oldBook, newOrder);
	}
	await renameChapterEntry(project, oldBook, oldFilename, newFilename);
	await renameChapterSidecar(project, oldBook, oldFilename, newFilename);
	await renameStoryDetailsSidecar(project, oldBook, oldFilename, newFilename);
}

/**
 * Chapter file moved between library book folders. Transfers the novel.md entry to the
 * destination as unplaced and moves its sidecars with it.
 */
export async function handleChapterCrossBookMove(
	project: Project,
	oldBook: string,
	newBook: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const entry = getChapterEntry(project, oldBook, oldFilename);
	await removeChapterEntry(project, oldBook, oldFilename);
	if (entry) {
		await insertChapterEntry(project, newBook, newFilename, {
			...entry,
			chapterTitle: entry.chapterTitle,
		});
	}

	const oldFp = chapterSidecarPath(oldBook, oldFilename);
	const newFp = chapterSidecarPath(newBook, newFilename);
	if (project.exists(oldFp)) {
		await project.rename(oldFp, newFp);
		await project.modifyFrontmatter(newFp, "---\n---\n", (fm) => {
			Object.assign(fm, { chapter: newFilename });
		});
	}

	const oldRec = storyContextSidecarPath(oldBook, oldFilename);
	const newRec = storyContextSidecarPath(newBook, newFilename);
	if (project.exists(oldRec)) {
		await project.rename(oldRec, newRec);
	}
}

export async function handleChapterDelete(project: Project, path: string): Promise<void> {
	const book = bookFolderNameFromChapterPath(path);
	const filename = chapterFilenameFromPath(path);
	if (!book || !filename) return;
	await removeChapterEntry(project, book, filename);
	await deleteChapterSidecar(project, book, filename);
	await deleteStoryDetailsSidecar(project, book, filename);
}

export async function handleBookFolderRename(project: Project, oldPath: string, newPath: string): Promise<void> {
	const libraryPrefix = `${LIBRARY_ROOT}/`;
	if (!oldPath.startsWith(libraryPrefix) || !newPath.startsWith(libraryPrefix)) return;
	const oldName = oldPath.slice(libraryPrefix.length);
	const newName = newPath.slice(libraryPrefix.length);
	if (oldName.includes("/") || newName.includes("/")) return; // only top-level book folders

	const oldBackstage = bookBackstagePath(oldName);
	const newBackstage = bookBackstagePath(newName);
	if (project.exists(oldBackstage)) {
		await project.rename(oldBackstage, newBackstage);
	}
	await renameSeriesBookEntry(project, oldName, newName);
}
