/**
 * Recovery files: text that can't be saved safely is never lost (docs/safety-core.md §4).
 *
 * - Chapters:  `_sf-backup/recovery/<book>/<chapter> <yyyy-mm-dd hhmmss>.md` (the 0.17.1 rule)
 * - Codex:     `_sf-backup/recovery/_codex/<note> <yyyy-mm-dd hhmmss>.md`
 * - Pruned:    `_sf-backup/recovery/_pruned/<book or _codex>/<name> <yyyy-mm-dd hhmmss>.md`
 * - Leftovers: `<folder>/<name> (leftover <yyyy-mm-dd hhmmss>).md`, a copy of a leftover temporary file (Fix 2)
 *
 * Create-only: a name clash gets ` 2`, ` 3`... (decided by the exclusive create, not by looking
 * first). Every recovery returns its path; if the write fails the caller is told and the text stays
 * where it was. This module is the only caller of `createRecovery`.
 */
import { BackendError } from "./backend/types";
import { type FrontmatterRecord, stringifyYamlText } from "./frontmatter";
import { BACKUPS_FOLDER } from "./paths";
import type { Project } from "./project";

export const RECOVERY_ROOT = `${BACKUPS_FOLDER}/recovery`;
export const CODEX_RECOVERY_FOLDER = "_codex";
export const PRUNED_RECOVERY_FOLDER = "_pruned";
export const TEMP_RECOVERY_FOLDER = "_temp";

export type RecoveryResult = { ok: true; path: string } | { ok: false; error: Error };

const pad = (n: number) => String(n).padStart(2, "0");

/** `yyyy-mm-dd hhmmss` in local time. */
export function recoveryStamp(now: Date): string {
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, "-");

/** `<folder>/<name> <stamp>.md`, or `<name> <stamp> <n>.md` for n >= 2. */
function recoveryName(folder: string, name: string, now: Date, n: number): string {
	return `${folder}/${safeName(name)} ${recoveryStamp(now)}${n > 1 ? ` ${n}` : ""}.md`;
}

export function chapterRecoveryPath(bookFolderName: string, chapterBasename: string, now: Date, n = 1): string {
	return recoveryName(`${RECOVERY_ROOT}/${safeName(bookFolderName)}`, chapterBasename, now, n);
}
export function codexRecoveryPath(noteBasename: string, now: Date, n = 1): string {
	return recoveryName(`${RECOVERY_ROOT}/${CODEX_RECOVERY_FOLDER}`, noteBasename, now, n);
}
export function prunedRecoveryPath(scope: string, name: string, now: Date, n = 1): string {
	return recoveryName(`${RECOVERY_ROOT}/${PRUNED_RECOVERY_FOLDER}/${safeName(scope)}`, name, now, n);
}

/** Creates the first free `candidate(n)` with `text`. Returns its path; never overwrites. */
async function createFirstFree(project: Project, candidate: (n: number) => string, text: string | Uint8Array): Promise<RecoveryResult> {
	try {
		for (let n = 1; n < 10_000; n++) {
			const path = candidate(n);
			try {
				await project.fs.createRecovery(path, text);
			} catch (err) {
				if (err instanceof BackendError && err.code === "EEXIST") continue;
				throw err;
			}
			await project.refresh(path);
			return { ok: true, path };
		}
		throw new Error("no free recovery file name");
	} catch (err) {
		return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
	}
}

/** Saves an author's chapter text that could not be saved. `text` is stored exactly as given. */
export function recoverChapterText(project: Project, bookFolderName: string, chapterBasename: string, text: string, now = new Date()): Promise<RecoveryResult> {
	return createFirstFree(project, (n) => chapterRecoveryPath(bookFolderName, chapterBasename, now, n), text);
}

/** Saves an author's Codex note text that could not be saved. */
export function recoverCodexText(project: Project, noteBasename: string, text: string, now = new Date()): Promise<RecoveryResult> {
	return createFirstFree(project, (n) => codexRecoveryPath(noteBasename, now, n), text);
}

/** Saves a plot note that could not be saved, beside the book's chapter recoveries but named `<chapter> (plot note) <stamp>.md` so it can't be mistaken for chapter text. */
export function recoverPlotNote(project: Project, bookFolderName: string, chapterBasename: string, text: string, now = new Date()): Promise<RecoveryResult> {
	return createFirstFree(project, (n) => recoveryName(`${RECOVERY_ROOT}/${safeName(bookFolderName)}`, `${chapterBasename} (plot note)`, now, n), text);
}

/** The visible name of the copy of a leftover temporary file: `<folder>/<name> (leftover <stamp>).md`, ` 2`, ` 3`... on a clash. */
export function leftoverRecoveryPath(folder: string, name: string, now: Date, n = 1): string {
	return `${folder}/${safeName(name)} (leftover ${recoveryStamp(now)})${n > 1 ? ` ${n}` : ""}.md`;
}

/** The file-name prefix every copy of a leftover for `name` starts with (to recognise a copy made earlier). */
export const leftoverRecoveryPrefix = (name: string): string => `${safeName(name)} (leftover `;

/** Copies the exact bytes of a leftover temporary file into `folder` (create-only). The caller reads the copy back and checks it. */
export function recoverLeftoverBytes(project: Project, folder: string, name: string, bytes: Uint8Array, now = new Date()): Promise<RecoveryResult> {
	return createFirstFree(project, (n) => leftoverRecoveryPath(folder, name, now, n), bytes);
}

export interface PrunedRecord {
	/** A book folder name, or `_codex`. */
	scope: string;
	/** What was removed, e.g. the chapter filename or the Codex note's basename. */
	name: string;
	/** Where it was removed from, e.g. `_backstage/storyforge/ABC/novel.md`. */
	source: string;
	/** Why, in a sentence. */
	reason: string;
	/** Exactly what was removed, as plain data. */
	data: FrontmatterRecord;
}

/** The text of a `_pruned` file: a one-line YAML comment saying where from and why, then the data. */
export function prunedRecoveryText(record: PrunedRecord, now: Date): string {
	const one = (s: string) => s.replace(/\s+/g, " ").trim();
	const heading = `# Pruned from ${one(record.source)}: ${one(record.name)} (${one(record.reason)}) at ${recoveryStamp(now)}`;
	return `${heading}\n${stringifyYamlText(record.data) || "{}\n"}`;
}

/** Writes what is about to be pruned from a backstage file. Prune only if this resolves ok. */
export function recoverPrunedEntry(project: Project, record: PrunedRecord, now = new Date()): Promise<RecoveryResult> {
	return createFirstFree(project, (n) => prunedRecoveryPath(record.scope, record.name.replace(/\.md$/i, ""), now, n), prunedRecoveryText(record, now));
}
