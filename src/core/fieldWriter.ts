/**
 * Writes of the author's own words outside the chapter editor (plot notes now; the synopsis and
 * description follow): compare-then-write against what the field last showed, inside the same lock
 * as the write. Whatever can't land goes to a recovery file (through recovery.ts, the only caller of
 * `createRecovery`) and the caller is told, so nothing typed is ever lost (docs/story-shape.md §5).
 */
import { FieldConflictError, writeBookSynopsis, writeChapterPlot } from "./book";
import { writeSeriesDescription } from "./series";
import type { Project } from "./project";
import { type RecoveryResult, recoverFieldText, recoverPlotNote } from "./recovery";

export type FieldResult =
	| { status: "written" }
	| { status: "unchanged" }
	/** The disk changed since the field was seen: nothing written, the text is in `recovery`, `current` is what's on disk now. */
	| { status: "conflict"; current: string; recovery: RecoveryResult }
	/** The write was refused or failed (unreadable frontmatter, guard, read-only): the text is in `recovery`. */
	| { status: "refused"; error: Error; recovery: RecoveryResult };

const normal = (text: string): string => (text.trim() === "" ? "" : text.trimEnd());

async function commit(write: () => Promise<void>, recover: () => Promise<RecoveryResult>): Promise<FieldResult> {
	try {
		await write();
		return { status: "written" };
	} catch (err) {
		const recovery = await recover();
		if (err instanceof FieldConflictError) return { status: "conflict", current: err.current, recovery };
		return { status: "refused", error: err instanceof Error ? err : new Error(String(err)), recovery };
	}
}

export async function commitPlotNote(project: Project, book: string, filename: string, expected: string, next: string, now = new Date()): Promise<FieldResult> {
	if (normal(next) === expected) return { status: "unchanged" };
	return commit(() => writeChapterPlot(project, book, filename, next, expected), () => recoverPlotNote(project, book, filename.replace(/\.md$/i, ""), next, now));
}

export async function commitSynopsis(project: Project, book: string, expected: string, next: string, now = new Date()): Promise<FieldResult> {
	if (next.trim() === expected) return { status: "unchanged" };
	return commit(() => writeBookSynopsis(project, book, next, expected), () => recoverFieldText(project, `${book} synopsis`, next, now));
}

export async function commitDescription(project: Project, expected: string, next: string, now = new Date()): Promise<FieldResult> {
	if (next.trim() === expected) return { status: "unchanged" };
	return commit(() => writeSeriesDescription(project, next, expected), () => recoverFieldText(project, "series description", next, now));
}

/** Saves text from a plot note that could not be written (a throw, or the close cutting the commit off) to a recovery file. */
export const rescuePlotNote = (project: Project, book: string, filename: string, text: string, now = new Date()): Promise<RecoveryResult> => recoverPlotNote(project, book, filename.replace(/\.md$/i, ""), text, now);
export const rescueSynopsis = (project: Project, book: string, text: string, now = new Date()): Promise<RecoveryResult> => recoverFieldText(project, `${book} synopsis`, text, now);
export const rescueDescription = (project: Project, text: string, now = new Date()): Promise<RecoveryResult> => recoverFieldText(project, "series description", text, now);
