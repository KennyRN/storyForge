/**
 * Shared chapter-creation core (hand-off brief §5.3) over book.ts's `createChapter` — the two
 * declared intents, decided at the moment of creation rather than inferred afterwards:
 * "continuing" (create, place on the spine, open to write) and "idea" (create off-spine,
 * lightly captured, no stolen focus). Both intents go through `computeChapterOrderAfterCreation`
 * for the placement decision itself.
 */
import type { App } from "obsidian";
import { createChapter, readBookFrontmatter, renameChapterTitle, writeBookChapterOrder } from "./book";
import { computeChapterOrderAfterCreation, type ChapterPlacement } from "./chapterPlacement";

/**
 * Creates a chapter and places it on the spine immediately after `anchorFilename` — or at the
 * end if there's no anchor (or it isn't found in chapter-order). Opens the file: a continuing
 * chapter is one the writer means to write into right away.
 */
export async function createContinuingChapter(
	app: App,
	bookFolderName: string,
	anchorFilename: string | null,
): Promise<{ filename: string; chapterId: string }> {
	const created = await createChapter(app, bookFolderName);
	const currentOrder = readBookFrontmatter(app, bookFolderName)?.chapterOrder ?? [];
	const placement: ChapterPlacement = anchorFilename ? { type: "after", anchor: anchorFilename } : { type: "append" };
	const nextOrder = computeChapterOrderAfterCreation(currentOrder, created.filename, placement);
	await writeBookChapterOrder(app, bookFolderName, nextOrder);
	return created;
}

/**
 * Creates a chapter as an idea — the "awaiting-a-future-chapter" state (hand-off brief §1). Left
 * off the spine (createChapter never adds to chapter-order on its own), optionally captured with
 * a one-line title so the idea shelf preview shows something meaningful. Does not open the file
 * or steal editor focus.
 */
export async function createIdeaChapter(
	app: App,
	bookFolderName: string,
	title?: string,
): Promise<{ filename: string; chapterId: string }> {
	const created = await createChapter(app, bookFolderName, { openFile: false });
	const trimmed = title?.trim();
	if (trimmed) {
		await renameChapterTitle(app, bookFolderName, created.filename, trimmed);
	}
	return created;
}
