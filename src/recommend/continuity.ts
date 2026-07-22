import type { ChapterRecommendReport, ContinuityStep, ContinuityTimeline, FactCheckStatus } from "./types";

export interface ChapterLabel {
	filename: string;
	label: string;
}

/**
 * Aggregates per-chapter fact checks into per-(path, key) timelines
 * following the given chapter order.
 */
export function buildContinuityTimelines(
	orderedChapters: ChapterLabel[],
	reportsByFilename: Map<string, ChapterRecommendReport>,
): ContinuityTimeline[] {
	const buckets = new Map<string, ContinuityTimeline>();

	for (const chapter of orderedChapters) {
		const report = reportsByFilename.get(chapter.filename);
		if (!report) continue;
		for (const row of report.factChecks) {
			const id = `${row.path}::${row.key}`;
			let timeline = buckets.get(id);
			if (!timeline) {
				timeline = {
					path: row.path,
					name: row.name,
					key: row.key,
					displayKey: row.displayKey,
					steps: [],
					hasConflict: false,
				};
				buckets.set(id, timeline);
			}
			const step: ContinuityStep = {
				chapterFilename: chapter.filename,
				chapterLabel: chapter.label,
				value: row.chapterValue,
				status: row.status,
			};
			// Collapse consecutive identical values with same status
			const prev = timeline.steps[timeline.steps.length - 1];
			if (prev && prev.value.toLowerCase() === step.value.toLowerCase() && prev.status === step.status) {
				prev.chapterLabel = step.chapterLabel;
				prev.chapterFilename = step.chapterFilename;
			} else {
				timeline.steps.push(step);
			}
			if (row.status === "conflict") timeline.hasConflict = true;
		}
	}

	const list = Array.from(buckets.values()).filter((t) => t.steps.length > 0);
	list.sort((a, b) => {
		if (a.hasConflict !== b.hasConflict) return a.hasConflict ? -1 : 1;
		const byName = a.name.localeCompare(b.name);
		if (byName !== 0) return byName;
		return a.displayKey.localeCompare(b.displayKey);
	});
	return list;
}

export function formatContinuityLine(timeline: ContinuityTimeline): string {
	const parts = timeline.steps.map((s) => {
		const mark = statusMark(s.status);
		return `${s.chapterLabel} ${s.value}${mark}`;
	});
	return `${timeline.name} · ${timeline.displayKey}: ${parts.join(" → ")}`;
}

function statusMark(status: FactCheckStatus): string {
	if (status === "conflict") return " [!]";
	if (status === "acknowledged") return " [acknowledged]";
	if (status === "ok") return "";
	return " [?]";
}
