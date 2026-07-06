import type { Fingerprint } from "./fingerprint";
import { fingerprintSimilarity } from "./fingerprint";

/** A chapter orphan's best fingerprint-matched candidate, surfaced for user confirmation — never auto-applied. */
export interface OrphanCandidate {
	orphan: string;
	bestMatch: string | null;
	score: number;
}

/** Tier 1: unambiguous — an orphan's name exactly matches an unplaced file's name. Safe to auto-resolve. */
export function matchOrphansExact(orphans: string[], unplacedNames: string[]): Map<string, string> {
	const unplacedSet = new Set(unplacedNames);
	const matches = new Map<string, string>();
	for (const orphan of orphans) {
		if (unplacedSet.has(orphan)) matches.set(orphan, orphan);
	}
	return matches;
}

/** Tier 2: fingerprint similarity ranking. Always surfaced for confirmation, never applied silently. */
export function matchOrphansByFingerprint(
	orphans: Array<{ name: string; fingerprint: Fingerprint }>,
	unplaced: Array<{ name: string; fingerprint: Fingerprint }>,
	threshold = 0.3,
): OrphanCandidate[] {
	return orphans.map((orphan) => {
		let best: { name: string; score: number } | null = null;
		for (const candidate of unplaced) {
			const score = fingerprintSimilarity(orphan.fingerprint, candidate.fingerprint);
			if (!best || score > best.score) best = { name: candidate.name, score };
		}
		if (best && best.score >= threshold) {
			return { orphan: orphan.name, bestMatch: best.name, score: best.score };
		}
		return { orphan: orphan.name, bestMatch: null, score: best?.score ?? 0 };
	});
}
