import type { App } from "obsidian";
import { getChapterEntry, readBookFrontmatter } from "../book";
import { codexTypeMatchesOrDescendsFrom } from "../codex";
import type { CastMember } from "./types";

export interface ResolvedNarrator {
	path: string;
	name: string;
}

/**
 * Resolve the chapter narrator for attribution.
 * Order: first per-chapter PoV → book-level default PoV → unset.
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

	const firstPov = chapter?.pov[0];
	const path = firstPov?.path ?? book?.defaultPovPath ?? null;
	if (!path) return null;

	const fromChapter = !!firstPov;
	const fallbackName = fromChapter ? firstPov.name : book?.defaultPovName;

	if (cast) {
		const member = cast.find(
			(c) => c.path === path && codexTypeMatchesOrDescendsFrom(c.type, "person"),
		);
		if (!member) return null;
		return { path: member.path, name: member.name };
	}

	return { path, name: fallbackName?.trim() || path };
}

/**
 * PoV names shown on the chapter card: the chapter list when set, otherwise the
 * resolved default narrator. When `cast` is supplied, paths that are no longer
 * in the live inventory are omitted.
 */
export function resolveDisplayedChapterPov(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	cast?: CastMember[],
): Array<{ path: string; name: string }> {
	const chapter = getChapterEntry(app, bookFolderName, chapterFilename);
	const chapterPov = chapter?.pov ?? [];
	if (chapterPov.length > 0) {
		if (!cast) return chapterPov.map((r) => ({ path: r.path, name: r.name }));
		const byPath = new Map(cast.map((c) => [c.path, c]));
		const live: Array<{ path: string; name: string }> = [];
		for (const ref of chapterPov) {
			const member = byPath.get(ref.path);
			if (!member) continue;
			live.push({ path: member.path, name: member.name });
		}
		return live;
	}
	const narrator = resolveChapterNarrator(app, bookFolderName, chapterFilename, cast);
	return narrator ? [narrator] : [];
}
