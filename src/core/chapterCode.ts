import { nextGapFreeCode } from "./letterCode";

/**
 * Next `<bookId>_chapter-<xxx>` chapter id for `bookId`: a letter code (aaa,
 * aab, ... zzz, aaaa, aaab, ...) that never reuses a code already seen in
 * `existingChapterIds` for this book — even if that chapter's file was since
 * deleted — mirroring `nextNovelCode`'s "never reuse a gap" policy. The code
 * grows past "zzz" indefinitely, so there's no ceiling on chapter count.
 * `existingChapterIds` may contain ids for other books too; anything not
 * prefixed with this book's id is ignored.
 */
export function nextChapterCode(bookId: string, existingChapterIds: Iterable<string>): string {
	return nextGapFreeCode(`${bookId}_chapter-`, existingChapterIds);
}
