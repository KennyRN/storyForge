/**
 * Pure decisions for keeping the manuscript editor and the chapter files in step
 * (continuous-mode manuscript brief §3.5–§3.6). manuscriptWriter.ts does the I/O; this decides.
 */

/** What to do when a chapter file changed on disk. */
export type DiskChangeAction =
	/** Our own write echoing back, or nothing new: ignore. */
	| "ignore"
	/** Changed elsewhere, no unsaved local edits: replace the chapter from disk. */
	| "reload"
	/** Changed elsewhere with unsaved local edits: disk wins in the surface, and the local text
	 * goes to a recovery file first. Never merge; never overwrite disk. */
	| "recover-then-reload";

export function decideDiskChange(input: {
	/** The file's text as just read from disk. */
	disk: string;
	/** What the editor last knew the file to hold. */
	knownDisk: string;
	/** Text a write is in flight with, if any — its modify event can arrive before the write resolves. */
	inFlight: string | null;
	/** Whether the chapter's text in the editor differs from `knownDisk`'s body. */
	dirty: boolean;
}): DiskChangeAction {
	if (input.disk === input.knownDisk || input.disk === input.inFlight) return "ignore";
	return input.dirty ? "recover-then-reload" : "reload";
}

/** Vault path for a recovery file: `_sf-backup/recovery/<book>/<chapter> <yyyy-mm-dd hhmmss>.md`.
 * `root` is the backup folder; the timestamp keeps successive recoveries of one chapter apart. */
export function recoveryFilePath(root: string, bookFolderName: string, chapterBasename: string, now: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	const safe = chapterBasename.replace(/[\\/:*?"<>|]/g, "-");
	return `${root}/recovery/${bookFolderName}/${safe} ${stamp}.md`;
}

/**
 * The smallest single replacement turning `before` into `after`: common prefix and suffix kept,
 * the middle replaced. A spine rebuild applied this way leaves undo history and positions outside
 * the changed stretch intact, where a whole-document replace would throw them away.
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
