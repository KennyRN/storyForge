import { storyContextSidecarPath } from "./paths";
import type { Project } from "./project";

/** Follows a chapter rename: moves the chapter's `story-details/` sidecar to the new chapter filename. */
export async function renameStoryDetailsSidecar(
	project: Project,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const oldPath = storyContextSidecarPath(bookFolderName, oldFilename);
	const newPath = storyContextSidecarPath(bookFolderName, newFilename);
	if (!project.isFile(oldPath)) return;
	await project.rename(oldPath, newPath);
}

/** Retires a chapter's `story-details/` sidecar (e.g. after the chapter file is deleted). */
export async function deleteStoryDetailsSidecar(project: Project, bookFolderName: string, chapterFilename: string): Promise<void> {
	const path = storyContextSidecarPath(bookFolderName, chapterFilename);
	if (project.exists(path)) await project.retire(path);
}
