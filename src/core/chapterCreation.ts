/**
 * Shared chapter-creation core over book.ts's `createChapter`: create a chapter and place it on the
 * spine. Opening the new chapter is the caller's job (the data layer never touches the interface).
 */
import { createChapter, readBookFrontmatter, writeBookChapterOrder } from "./book";
import { computeChapterOrderAfterCreation, type ChapterPlacement } from "./chapterPlacement";
import type { Project } from "./project";

/**
 * Creates a chapter and places it on the spine immediately after `anchorFilename` — or at the
 * end if there's no anchor (or it isn't found in chapter-order).
 */
export async function createContinuingChapter(
	project: Project,
	bookFolderName: string,
	anchorFilename: string | null,
): Promise<{ filename: string; chapterId: string; path: string }> {
	const created = await createChapter(project, bookFolderName);
	const currentOrder = readBookFrontmatter(project, bookFolderName)?.chapterOrder ?? [];
	const placement: ChapterPlacement = anchorFilename ? { type: "after", anchor: anchorFilename } : { type: "append" };
	const nextOrder = computeChapterOrderAfterCreation(currentOrder, created.filename, placement);
	await writeBookChapterOrder(project, bookFolderName, nextOrder);
	return created;
}
