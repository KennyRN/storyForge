import type { SaveResult } from "../../core/proseWriter";
import type { NoticeInput } from "../kit/notices";

export interface NoticeContext {
	/** Reveals a project-relative path in Finder. */
	reveal: (path: string) => void;
}

const nameOf = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");

const revealAction = (path: string, ctx: NoticeContext) => [{ label: "Reveal", onClick: () => ctx.reveal(path), dismiss: false }];

/** Keys of notices a later successful save of the same file clears (the trouble is over). */
export const troubleKeys = (path: string): string[] => [`error:${path}`, `recovery-failed:${path}`];

export interface SaveOutcomeNotices {
	/** Notices to show. */
	show: NoticeInput[];
	/** Keys to clear first: the file saved, so earlier trouble with it is over. */
	clear: string[];
}

/**
 * What the author is told about a save (docs/interface.md §4.1 and §5.4). Saving that works says nothing,
 * except a failed backup and, once per file, normalised line endings. Anything that is about the author's
 * words is sticky and names the file and where the text went.
 */
export function noticesForSave(result: SaveResult, ctx: NoticeContext): SaveOutcomeNotices {
	const name = nameOf(result.path);
	const show: NoticeInput[] = [];
	let clear: string[] = [];
	switch (result.kind) {
		case "unchanged":
			break;
		case "saved":
			clear = troubleKeys(result.path);
			if (result.backup && !result.backup.ok) show.push({ key: `backup:${result.path}`, sticky: true, text: `The backup before saving ${name} failed. Your text was saved.` });
			if (result.normalizedLineEndings) show.push({ key: `endings:${result.path}`, text: `${name} had mixed line endings, so they were made consistent.` });
			break;
		case "conflict":
			show.push({ key: `conflict:${result.path}`, sticky: true, text: `${name} changed on disk while you were typing. The file on disk is kept, and your text is saved at ${result.recoveryPath}.`, actions: revealAction(result.recoveryPath, ctx) });
			break;
		case "refused":
			show.push({ key: `refused:${result.path}`, sticky: true, text: `storyForge could not save ${name}: ${result.reason}. Your text is saved at ${result.recoveryPath}.`, actions: revealAction(result.recoveryPath, ctx) });
			break;
		case "error":
			if (result.recoveryPath) show.push({ key: `error:${result.path}`, sticky: true, text: `${name} could not be saved (${result.error.message}). Your text is saved at ${result.recoveryPath}.`, actions: revealAction(result.recoveryPath, ctx) });
			else show.push({ key: `error:${result.path}`, sticky: true, text: `${name} could not be saved (${result.error.message}). Your text is still in the editor, and storyForge will try again.` });
			break;
		case "recovery-failed":
			show.push({ key: `recovery-failed:${result.path}`, sticky: true, pinned: true, text: `${name} could not be saved, and no copy could be kept. Your text is still in the editor.` });
			break;
	}
	return { show, clear };
}

/** The notice for an outside change that arrived over unsaved text (the writer kept the author's text in a recovery file). */
export function noticeForOutsideChange(path: string, recoveryPath: string, ctx: NoticeContext): NoticeInput {
	return { key: `outside:${path}`, sticky: true, text: `${nameOf(path)} changed on disk while you had unsaved text. The new version is shown, and your text is saved at ${recoveryPath}.`, actions: revealAction(recoveryPath, ctx) };
}

/** The quiet banner above a read-only editor, from the writer's reason. */
export function readOnlyBanner(reason: string): string {
	if (/newer storyForge/i.test(reason)) return "This project was made by a newer storyForge. Update the app to edit it.";
	if (/archived/i.test(reason)) return "Archived. Unarchive it to edit.";
	if (/icloud/i.test(reason)) return "Downloading from iCloud…";
	return `Read-only: ${reason}`;
}
