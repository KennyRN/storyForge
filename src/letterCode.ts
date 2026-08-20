/**
 * Bijective base-26 letters, spreadsheet-column style: 1->"a", 26->"z",
 * 27->"aa", 702->"zz", 703->"aaa", ... Unlike a plain base-26 encoding, this
 * has no leading-zero ambiguity, so it can grow to any length with no ceiling.
 */
export function toBijectiveBase26(n: number): string {
	let value = n;
	let out = "";
	while (value > 0) {
		value--;
		out = String.fromCharCode(97 + (value % 26)) + out;
		value = Math.floor(value / 26);
	}
	return out;
}

/** Inverse of {@link toBijectiveBase26}. Returns null if `code` isn't all lowercase a-z letters. */
export function fromBijectiveBase26(code: string): number | null {
	if (!/^[a-z]+$/.test(code)) return null;
	let n = 0;
	for (const ch of code) {
		n = n * 26 + (ch.charCodeAt(0) - 96);
	}
	return n;
}

/** Bijective base-26 value of the first 3-letter code ("aaa"), so index 0 maps to "aaa" and index 17575 maps to "zzz". */
const FIRST_TRIPLE_N = 26 + 26 ** 2 + 1;

/**
 * Next `<prefix><xxx>` code in a gap-free letter sequence starting at "aaa"
 * (aaa, aab, ... zzz, aaaa, aaab, ...) that never reuses a code already seen
 * in `existingIds` for this prefix — even if that entry was since deleted.
 * The code grows past "zzz" indefinitely, so there's no ceiling. `existingIds`
 * may contain ids with other prefixes too; anything not starting with `prefix`
 * is ignored. Pass `prefix: ""` for a bare sequential code with no grouping
 * prefix. Shared by chapterCode.ts and novelCode.ts.
 */
export function nextGapFreeCode(prefix: string, existingIds: Iterable<string>): string {
	let maxIndex = -1;
	for (const id of existingIds) {
		if (!id.startsWith(prefix)) continue;
		const n = fromBijectiveBase26(id.slice(prefix.length));
		if (n === null) continue;
		const idx = n - FIRST_TRIPLE_N;
		if (idx >= 0 && idx > maxIndex) maxIndex = idx;
	}
	const nextIdx = maxIndex + 1;
	return `${prefix}${toBijectiveBase26(nextIdx + FIRST_TRIPLE_N)}`;
}
