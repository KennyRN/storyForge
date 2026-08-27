import { libraryChapterPath } from "./paths";

/**
 * Path the center editor should open when the storyTelling sidebar is showing —
 * persisted chapter if that file still exists, otherwise the book's first placed
 * chapter. Null when there is no book, or the book has nothing to open.
 */
export function resolveStorytellingCenterPath(
	selectedNovel: string | null,
	selectedObject: string | null,
	fileExists: (path: string) => boolean,
	firstOrderedFilename: string | null,
): string | null {
	if (!selectedNovel) return null;
	if (selectedObject) {
		const selectedPath = libraryChapterPath(selectedNovel, selectedObject);
		if (fileExists(selectedPath)) return selectedPath;
	}
	if (firstOrderedFilename) return libraryChapterPath(selectedNovel, firstOrderedFilename);
	return null;
}
