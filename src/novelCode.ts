import { nextGapFreeCode } from "./letterCode";

/**
 * Next sequential novel folder code: a gap-free letter sequence (aaa, aab,
 * ... zzz, aaaa, ...) — global across the vault (a vault holds one series,
 * so there's no per-series restart) — mirroring the plain letter part of
 * chapter codes. Never reuses a code already seen in `existingCodes`, even
 * if that book's folder was since deleted.
 */
export function nextNovelCode(existingCodes: Iterable<string>): string {
	return nextGapFreeCode("", existingCodes);
}
