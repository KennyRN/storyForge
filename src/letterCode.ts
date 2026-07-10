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
