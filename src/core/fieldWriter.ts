/**
 * Writes of the author's own words outside the chapter editor (plot notes now; the synopsis and
 * description follow): compare-then-write against what the field last showed, inside the same lock
 * as the write. Whatever can't land goes to a recovery file (through recovery.ts, the only caller of
 * `createRecovery`) and the caller is told, so nothing typed is ever lost (docs/story-shape.md §5).
 */
import { FieldConflictError, writeChapterPlot } from "./book";
import type { Project } from "./project";
import { type RecoveryResult, recoverPlotNote } from "./recovery";

export type FieldResult =
	| { status: "written" | "unchanged" }
	/** The disk changed since the field was seen: nothing written, the text is in `recovery`, `current` is what's on disk now. */
	| { status: "conflict"; current: string; recovery: RecoveryResult }
	/** The write was refused or failed (unreadable frontmatter, guard, read-only): the text is in `recovery`. */
	| { status: "refused"; error: Error; recovery: RecoveryResult };

const normal = (text: string): string => (text.trim() === "" ? "" : text.trimEnd());

export async function commitPlotNote(project: Project, book: string, filename: string, expected: string, next: string, now = new Date()): Promise<FieldResult> {
	if (normal(next) === expected) return { status: "unchanged" };
	const basename = filename.replace(/\.md$/i, "");
	try {
		await writeChapterPlot(project, book, filename, next, expected);
		return { status: "written" };
	} catch (err) {
		const recovery = await recoverPlotNote(project, book, basename, next, now);
		if (err instanceof FieldConflictError) return { status: "conflict", current: err.current, recovery };
		return { status: "refused", error: err instanceof Error ? err : new Error(String(err)), recovery };
	}
}
