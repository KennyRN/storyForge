import type { DetailHit } from "./types";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** `date created: yyyy-mm-dd hh-mm` in local time. */
export function formatDetailsDateLine(when: Date): string {
	const y = when.getFullYear();
	const mo = pad(when.getMonth() + 1);
	const d = pad(when.getDate());
	const h = pad(when.getHours());
	const mi = pad(when.getMinutes());
	return `date created: ${y}-${mo}-${d} ${h}-${mi}`;
}

/**
 * Builds the markdown body for a chapter details note.
 *
 * Structure:
 *   date created: yyyy-mm-dd hh-mm
 *
 *   ## details to capture
 *
 *   ### Entity Name
 *   Sentence one.
 *
 *   Sentence two.
 *
 *   ## holding area        ← only when there are ambiguous unresolved hits
 *
 *   ### Entity Name
 *   Sentence.
 *
 * Rules:
 * - Only unresolved hits.
 * - Capture section: solid + grey tiers.
 * - Holding section: ambiguous tier (omitted entirely when empty).
 * - Each sentence is its own paragraph; entity groups use ### headers.
 * - No tier / lens / trait metadata — just the sentence text.
 */
export function buildDetailsNoteBody(hits: DetailHit[], when: Date = new Date()): string {
	const unresolved = hits.filter((h) => !h.resolved);
	const captureHits = unresolved.filter((h) => h.tier !== "ambiguous");
	const holdingHits = unresolved.filter((h) => h.tier === "ambiguous");

	const lines: string[] = [formatDetailsDateLine(when), ""];

	lines.push("## details to capture", "");
	appendEntityGroups(lines, captureHits);

	if (holdingHits.length > 0) {
		lines.push("## holding area", "");
		appendEntityGroups(lines, holdingHits);
	}

	return lines.join("\n");
}

function appendEntityGroups(lines: string[], hits: DetailHit[]): void {
	const byEntity = new Map<string, { name: string; sentences: string[] }>();
	for (const hit of hits) {
		const key = hit.entityPath ?? hit.entityName;
		let group = byEntity.get(key);
		if (!group) {
			group = { name: hit.entityName, sentences: [] };
			byEntity.set(key, group);
		}
		group.sentences.push(hit.sentence);
	}

	for (const group of byEntity.values()) {
		lines.push(`### ${group.name}`, "");
		for (const sentence of group.sentences) {
			lines.push(sentence, "");
		}
	}
}
