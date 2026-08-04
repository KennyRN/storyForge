import type { App } from "obsidian";
import { getChapterEntry } from "../book";
import type { CastMember } from "./types";

export interface ResolvedNarrator {
	path: string;
	name: string;
}

/**
 * Resolve the chapter narrator for attribution from per-chapter PoV.
 * When `cast` is supplied, the path must resolve to a Codex person entry.
 * (Book-level default PoV is layered on in a later step.)
 */
export function resolveChapterNarrator(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	cast?: CastMember[],
): ResolvedNarrator | null {
	const chapter = getChapterEntry(app, bookFolderName, chapterFilename);
	const path = chapter?.povPath ?? null;
	if (!path) return null;

	if (cast) {
		const member = cast.find((c) => c.path === path && c.type === "person");
		if (!member) return null;
		return { path: member.path, name: member.name };
	}

	return { path, name: chapter?.povName?.trim() || path };
}
