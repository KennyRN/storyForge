const CODE_LETTER_COUNT = 26;
const CODE_LENGTH = 3;
const MAX_CODE_INDEX = CODE_LETTER_COUNT ** CODE_LENGTH; // 17576

function tripleFromIndex(index: number): string {
	let n = index;
	const chars: string[] = [];
	for (let i = 0; i < CODE_LENGTH; i++) {
		chars.unshift(String.fromCharCode("a".charCodeAt(0) + (n % CODE_LETTER_COUNT)));
		n = Math.floor(n / CODE_LETTER_COUNT);
	}
	return chars.join("");
}

function indexFromTriple(triple: string): number | null {
	if (!/^[a-z]{3}$/.test(triple)) return null;
	let n = 0;
	for (const ch of triple) {
		n = n * CODE_LETTER_COUNT + (ch.charCodeAt(0) - "a".charCodeAt(0));
	}
	return n;
}

/**
 * Next `<bookId>_chapter-<xxx>` chapter id for `bookId`: a base-26 triple
 * (aaa, aab, ... zzz) that never reuses a triple already seen in
 * `existingChapterIds` for this book — even if that chapter's file was since
 * deleted — mirroring `nextBookFolderCode`'s "never reuse a gap" policy.
 * `existingChapterIds` may contain ids for other books too; anything not
 * prefixed with this book's id is ignored.
 */
export function nextChapterCode(bookId: string, existingChapterIds: Iterable<string>): string {
	const prefix = `${bookId}_chapter-`;
	let maxIndex = -1;
	for (const id of existingChapterIds) {
		if (!id.startsWith(prefix)) continue;
		const idx = indexFromTriple(id.slice(prefix.length));
		if (idx !== null && idx > maxIndex) maxIndex = idx;
	}
	const nextIdx = maxIndex + 1;
	if (nextIdx >= MAX_CODE_INDEX) {
		throw new Error(`storyForge: exhausted chapter codes for book "${bookId}"`);
	}
	return `${prefix}${tripleFromIndex(nextIdx)}`;
}
