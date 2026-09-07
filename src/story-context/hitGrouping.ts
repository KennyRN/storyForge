/**
 * Dossier pull helpers — the Continuity tab is absorbed into entity search
 * (read-in-order across the book). No value-timeline / conflict scoring.
 */

import type { DetailHit } from "./types";

export interface ChapterLabel {
	filename: string;
	label: string;
}

/** Group dossier hits by chapter, preserving chapter order. */
export function groupHitsByChapter(
	orderedChapters: ChapterLabel[],
	hits: DetailHit[],
): Array<{ chapter: ChapterLabel; hits: DetailHit[] }> {
	const byFile = new Map<string, DetailHit[]>();
	for (const hit of hits) {
		let list = byFile.get(hit.chapterFilename);
		if (!list) {
			list = [];
			byFile.set(hit.chapterFilename, list);
		}
		list.push(hit);
	}
	const groups: Array<{ chapter: ChapterLabel; hits: DetailHit[] }> = [];
	for (const chapter of orderedChapters) {
		const chapterHits = byFile.get(chapter.filename);
		if (chapterHits && chapterHits.length > 0) {
			groups.push({ chapter, hits: chapterHits });
		}
	}
	return groups;
}

export function lensLabel(lens: string): string {
	switch (lens) {
		case "description":
			return "Description";
		case "whereabouts":
			return "Whereabouts";
		case "relationships":
			return "Relationships";
		case "dialogue":
			return "Dialogue";
		case "emotion":
			return "Emotion";
		default:
			return lens;
	}
}
