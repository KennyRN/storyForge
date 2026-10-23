/**
 * Pure helpers for the prose writer (docs/safety-core.md §3): splitting a chapter or Codex note
 * into frontmatter and body and rebuilding it, and the two decisions ported from 0.17.1's
 * continuous mode (`manuscriptModel.ts`, `manuscriptSync.ts`). No I/O.
 */

/** Everything about a file that isn't its editable body, held aside on load and re-attached verbatim on save. */
export interface ProseShape {
	/** The YAML block, fences and the line break after the closing fence included, or "". */
	frontmatter: string;
	/** The file's line-ending style. The editor body always uses "\n"; this restores it on save. */
	eol: "\n" | "\r\n";
	/** Whether the file's body ended in a line break (which is not shown as an extra empty line). */
	trailingNewline: boolean;
}

/**
 * Splits YAML frontmatter off the top of a file, line-ending agnostic. The opening fence must be the
 * file's first line and the closing fence a line of exactly "---"; anything else means there's no
 * frontmatter and the whole file is body. Returned verbatim, so `frontmatter + rest === raw`.
 */
export function splitFrontmatter(raw: string): { frontmatter: string; rest: string } {
	const open = /^---\r?\n/.exec(raw);
	if (!open) return { frontmatter: "", rest: raw };
	let lineStart = open[0].length;
	while (lineStart <= raw.length) {
		const nl = raw.indexOf("\n", lineStart);
		const lineEnd = nl === -1 ? raw.length : nl;
		const line = raw.slice(lineStart, lineEnd).replace(/\r$/, "");
		if (line === "---") {
			const end = nl === -1 ? raw.length : nl + 1;
			return { frontmatter: raw.slice(0, end), rest: raw.slice(end) };
		}
		if (nl === -1) break;
		lineStart = nl + 1;
	}
	return { frontmatter: "", rest: raw };
}

/** Reads a file into its editable body (always "\n" line breaks) and the shape needed to rebuild it. */
export function parseProseFile(raw: string): { shape: ProseShape; body: string } {
	const { frontmatter, rest } = splitFrontmatter(raw);
	const firstBreak = rest.indexOf("\n");
	const eol: ProseShape["eol"] = firstBreak > 0 && rest[firstBreak - 1] === "\r" ? "\r\n" : "\n";
	let body = rest.replace(/\r\n?/g, "\n");
	const trailingNewline = body.endsWith("\n");
	if (trailingNewline) body = body.slice(0, -1);
	return { shape: { frontmatter, eol, trailingNewline }, body };
}

/** Rebuilds a file from an edited body and the shape it was loaded with (0.17.1's `serialiseChapterFile`). */
export function serialiseProseFile(shape: ProseShape, body: string): string {
	const withEnding = shape.trailingNewline ? `${body}\n` : body;
	return shape.frontmatter + (shape.eol === "\n" ? withEnding : withEnding.replace(/\n/g, "\r\n"));
}

/** What to do when a file changed on disk (0.17.1 `decideDiskChange`, unchanged). */
export type DiskChangeAction =
	/** Our own write echoing back, or nothing new: ignore. */
	| "ignore"
	/** Changed elsewhere, no unsaved local edits: replace the text from disk. */
	| "reload"
	/** Changed elsewhere with unsaved local edits: the local text goes to a recovery file first,
	 * then the disk text replaces it. Never merge; never overwrite disk. */
	| "recover-then-reload";

export function decideDiskChange(input: {
	/** The file's text as just read from disk. */
	disk: string;
	/** What the editor last knew the file to hold. */
	knownDisk: string;
	/** Text a write is in flight with, if any: its modify event can arrive before the write resolves. */
	inFlight: string | null;
	/** Whether the text in the editor differs from `knownDisk`'s body. */
	dirty: boolean;
}): DiskChangeAction {
	if (input.disk === input.knownDisk || input.disk === input.inFlight) return "ignore";
	return input.dirty ? "recover-then-reload" : "reload";
}

/**
 * The smallest single replacement turning `before` into `after`: common prefix and suffix kept, the
 * middle replaced. Applied by an editor it leaves undo history and the caret outside the changed
 * stretch intact, where a whole-document replace would throw them away.
 */
export function minimalReplacement(before: string, after: string): { from: number; to: number; insert: string } | null {
	if (before === after) return null;
	let start = 0;
	const max = Math.min(before.length, after.length);
	while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
	let endBefore = before.length;
	let endAfter = after.length;
	while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {
		endBefore--;
		endAfter--;
	}
	return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}
