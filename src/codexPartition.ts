export interface CodexNote {
	path: string;
	bookIds: string[]; // from the `book:` frontmatter key; empty = universal
}

/**
 * Partitions codex notes into the Codex view (universal + scoped to the
 * current book) and the file-hidden view (scoped to any *other* book — not
 * to be confused with the Codex *panel's* separate codexHidden collapse
 * state). A note with no `book:` key never appears in fileHidden; a note
 * scoped to `b` never appears in fileHidden either. When no book is active,
 * Codex shows only universal notes and fileHidden shows everything scoped.
 */
export function partitionCodexNotes(
	notes: CodexNote[],
	currentBookId: string | null,
): { codex: CodexNote[]; fileHidden: CodexNote[] } {
	const codex: CodexNote[] = [];
	const fileHidden: CodexNote[] = [];
	for (const note of notes) {
		const isUniversal = note.bookIds.length === 0;
		const isCurrent = currentBookId !== null && note.bookIds.includes(currentBookId);
		if (isUniversal || isCurrent) {
			codex.push(note);
		} else {
			fileHidden.push(note);
		}
	}
	return { codex, fileHidden };
}

/** A `book:` id matching no known book is surfaced, never touched — same philosophy as an orphaned chapter. */
export function findUnknownScopedNotes(notes: CodexNote[], knownBookIds: ReadonlySet<string>): CodexNote[] {
	return notes.filter((note) => note.bookIds.some((id) => !knownBookIds.has(id)));
}
