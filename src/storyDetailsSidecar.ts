import { App, TFile } from "obsidian";
import { storyContextSidecarPath } from "./core/paths";
import { deleteBackstagePath, renameBackstagePath } from "./writeGuard";

/** Follows a chapter rename: moves the chapter's `story-details/` sidecar to the new chapter filename. */
export async function renameStoryDetailsSidecar(
	app: App,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const oldPath = storyContextSidecarPath(bookFolderName, oldFilename);
	const newPath = storyContextSidecarPath(bookFolderName, newFilename);
	const file = app.vault.getAbstractFileByPath(oldPath);
	if (!(file instanceof TFile)) return;
	await renameBackstagePath(app.vault, oldPath, newPath);
}

/** Deletes a chapter's `story-details/` sidecar (e.g. after the chapter file is deleted). */
export async function deleteStoryDetailsSidecar(app: App, bookFolderName: string, chapterFilename: string): Promise<void> {
	await deleteBackstagePath(app, storyContextSidecarPath(bookFolderName, chapterFilename));
}
