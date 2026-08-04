import type { App } from "obsidian";
import { getChapterEntry, readBookFrontmatter } from "../book";
import type { CastMember } from "./types";

export interface ResolvedNarrator {
	path: string;
	name: string;
}

/**
 * Resolve the chapter narrator for attribution.
 * Order: per-chapter PoV → book-level default PoV → unset.
 * When `cast` is supplied, the path must resolve to a Codex person entry.
 */
export function resolveChapterNarrator(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	cast?: CastMember[],
): ResolvedNarrator | null {
	const chapter = getChapterEntry(app, bookFolderName, chapterFilename);
	const book = readBookFrontmatter(app, bookFolderName);

	const path = chapter?.povPath ?? book?.defaultPovPath ?? null;
	if (!path) return null;

	const fromChapter = !!chapter?.povPath;
	const fallbackName = fromChapter ? chapter?.povName : book?.defaultPovName;

	if (cast) {
		const member = cast.find((c) => c.path === path && c.type === "person");
		if (!member) return null;
		return { path: member.path, name: member.name };
	}

	return { path, name: fallbackName?.trim() || path };
}
