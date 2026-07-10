import { fromBijectiveBase26, toBijectiveBase26 } from "./letterCode";

/** Bijective base-26 value of the first 3-letter code ("aaa"), so index 0 maps to "aaa" and index 17575 maps to "zzz". */
const FIRST_TRIPLE_N = 26 + 26 ** 2 + 1;

function codeFromIndex(index: number): string {
	return toBijectiveBase26(index + FIRST_TRIPLE_N);
}

function indexFromCode(code: string): number | null {
	const n = fromBijectiveBase26(code);
	if (n === null) return null;
	const index = n - FIRST_TRIPLE_N;
	return index >= 0 ? index : null;
}

/**
 * Next `<bookId>_chapter-<xxx>` chapter id for `bookId`: a letter code (aaa,
 * aab, ... zzz, aaaa, aaab, ...) that never reuses a code already seen in
 * `existingChapterIds` for this book — even if that chapter's file was since
 * deleted — mirroring `nextBookFolderCode`'s "never reuse a gap" policy. The
 * code grows past "zzz" indefinitely, so there's no ceiling on chapter count.
 * `existingChapterIds` may contain ids for other books too; anything not
 * prefixed with this book's id is ignored.
 */
export function nextChapterCode(bookId: string, existingChapterIds: Iterable<string>): string {
	const prefix = `${bookId}_chapter-`;
	let maxIndex = -1;
	for (const id of existingChapterIds) {
		if (!id.startsWith(prefix)) continue;
		const idx = indexFromCode(id.slice(prefix.length));
		if (idx !== null && idx > maxIndex) maxIndex = idx;
	}
	const nextIdx = maxIndex + 1;
	return `${prefix}${codeFromIndex(nextIdx)}`;
}
