import { getBookChapters } from "./book";
import { libraryChapterPath } from "./paths";
import type { Project } from "./project";
import { getSeriesBooks } from "./series";

/**
 * The words on the page now (Tweaks 3, after Kenny's look): from the project's index, at both levels, so a series' figure is the sum of its novels' and is never less
 * than any one of them. A novel's is its placed chapters' (the figure the novel tab's "Novel Length" shows); a series' is every novel's, placed or not.
 */
export function novelWordsNow(project: Project, book: string): number {
	return getBookChapters(project, book).ordered.reduce((sum, c) => sum + project.wordCount(libraryChapterPath(book, c.name)), 0);
}

export function seriesWordsNow(project: Project): number {
	const { ordered, unplaced } = getSeriesBooks(project);
	return [...ordered, ...unplaced].reduce((sum, f) => sum + novelWordsNow(project, f.name), 0);
}
