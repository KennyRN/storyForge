/**
 * Tidying the app's own leftover temporary files at open (docs/temp-tidy.md, decisions 31, 33 and 39).
 *
 * A crash, force-quit or power cut can leave `.<target>.<hex id>.tmp` beside a file. It may hold the author's newest
 * words, so nothing that differs from the file beside it is ever simply removed: it is copied into recovery, the copy
 * is read back and checked, and only then is the leftover removed. A backup's temporary zip and a copy identical to
 * the file beside it hold nothing unique and are removed. Only names the app itself makes are touched, and only if
 * they are at least a minute older than this open, so a save in flight or a file just synced is left alone.
 *
 * This module is the only caller of `removeTemp` (test/architecture.test.ts). It writes only through `recovery.ts`.
 */
import { BackendError } from "./backend/types";
import { isCodexNotePath, isLibraryChapterPath } from "./paths";
import type { Project } from "./project";
import { CODEX_RECOVERY_FOLDER, RECOVERY_ROOT, TEMP_RECOVERY_FOLDER, leftoverRecoveryPrefix, recoverLeftoverBytes } from "./recovery";

/** A leftover younger than this (at open) is left alone. */
export const TEMP_MIN_AGE_MS = 60_000;
/** Bigger than this and not a zip: not copied, left and reported. */
const MAX_COPY_BYTES = 64 * 1024 * 1024;

export type LeftoverKind = "chapter" | "codex" | "structural" | "binary" | "recovery-file";

export interface TidyReport {
	/** Removed because nothing in them was unique: a backup's temporary zip, a copy identical to the file beside it, a copy already in recovery. */
	removed: { path: string; why: "partial-zip" | "identical" | "already-copied" }[];
	/** Copied into recovery, checked, then removed. `newer`: newer than the file beside it (or nothing is beside it), so it may hold words that were never saved. */
	recovered: { leftover: string; recoveryPath: string; newer: boolean; kind: LeftoverKind }[];
	/** Left where they are, with why: a step failed, or it could not be classified. `remembered`: reported once and not reported again. */
	left: { path: string; reason: string; remembered: boolean }[];
	/** Younger than a minute: not touched. */
	young: number;
	/** A read-only project: found, and nothing was moved or removed. */
	foundReadOnly: string[];
	/** Keys of unclassifiable leftovers reported now, for the caller to remember (machine settings). */
	newlyReported: string[];
}

export const emptyTidyReport = (): TidyReport => ({ removed: [], recovered: [], left: [], young: 0, foundReadOnly: [], newlyReported: [] });

export const tidyHappened = (r: TidyReport): boolean => r.removed.length + r.recovered.length + r.left.length + r.foundReadOnly.length > 0;

export interface TidyOptions {
	now: Date;
	readOnly: boolean;
	/** Unclassifiable leftovers already reported (their keys), so a second open finds nothing to do. */
	seen?: ReadonlySet<string>;
}

/** The key an unclassifiable leftover is remembered by: it changes if the file does. */
export const leftoverKey = (path: string, size: number, mtimeMs: number): string => `${path}|${size}|${Math.round(mtimeMs)}`;

const base = (p: string): string => p.slice(p.lastIndexOf("/") + 1);
const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** `.ch-a1.md.<id>.tmp` to `ch-a1.md`. */
export function targetNameOf(tempName: string): string {
	return tempName.slice(1).replace(/\.[0-9a-f]+\.tmp$/, "");
}

export async function tidyTemporaryFiles(project: Project, options: TidyOptions): Promise<TidyReport> {
	const report = emptyTidyReport();
	let listed;
	try {
		listed = await project.fs.listTempLeftovers();
	} catch {
		return report; // a backend that can't list has nothing to tidy
	}
	const nowMs = options.now.getTime();
	const old = listed.filter((t) => {
		const aged = nowMs - t.mtimeMs >= TEMP_MIN_AGE_MS;
		if (!aged) report.young += 1;
		return aged;
	});
	if (options.readOnly) {
		report.foundReadOnly = old.map((t) => t.path);
		return report;
	}
	for (const t of old) {
		try {
			await tidyOne(project, t, options, report);
		} catch (err) {
			report.left.push({ path: t.path, reason: `couldn't be tidied: ${err instanceof Error ? err.message : String(err)}`, remembered: false });
		}
	}
	return report;
}

async function tidyOne(project: Project, t: { path: string; size: number; mtimeMs: number }, options: TidyOptions, report: TidyReport): Promise<void> {
	const dir = dirOf(t.path);
	const targetName = targetNameOf(base(t.path));
	const targetPath = `${dir}/${targetName}`;
	const expected = { size: t.size, mtimeMs: t.mtimeMs };
	const remove = (why: TidyReport["removed"][number]["why"]) => project.fs.removeTemp(t.path, expected).then(() => void report.removed.push({ path: t.path, why }));
	const left = (reason: string, remember = false) => {
		const key = leftoverKey(t.path, t.size, t.mtimeMs);
		if (remember) {
			if (options.seen?.has(key)) return;
			report.newlyReported.push(key);
		}
		report.left.push({ path: t.path, reason, remembered: remember });
	};

	// Classify by what it sits beside.
	let kind: LeftoverKind;
	let folder: string;
	if (t.path.startsWith("_sf-backup/")) {
		if (dir === "_sf-backup" && /\.zip$/i.test(targetName)) return void (await remove("partial-zip")); // only ever a partial or duplicate copy of files that still exist
		if (dir.startsWith(`${RECOVERY_ROOT}/`) && /\.md$/i.test(targetName)) {
			kind = "recovery-file";
			folder = dir;
		} else return left("it isn't beside a backup or a recovery file, so it can't be classified", true);
	} else if (isLibraryChapterPath(targetPath)) {
		kind = "chapter";
		folder = `${RECOVERY_ROOT}/${dir.split("/")[1]}`;
	} else if (isCodexNotePath(targetPath)) {
		kind = "codex";
		folder = `${RECOVERY_ROOT}/${CODEX_RECOVERY_FOLDER}`;
	} else {
		kind = "structural"; // refined below once the bytes are read
		folder = `${RECOVERY_ROOT}/${TEMP_RECOVERY_FOLDER}`;
	}
	if (t.size > MAX_COPY_BYTES) return left(`it is larger than ${MAX_COPY_BYTES / 1024 / 1024} MB, so it was not copied`, true);

	const bytes = await project.readBinary(t.path);
	if (kind === "structural" && !isUtf8(bytes)) kind = "binary";

	// Nothing unique in a copy of the file beside it.
	const beside = await project.readBinary(targetPath).catch(() => null);
	if (beside && sameBytes(beside, bytes)) return void (await remove("identical"));

	// A copy made earlier (a removal that failed last time): remove the leftover, make no second copy.
	const display = recoveryDisplayName(targetName);
	const prefix = leftoverRecoveryPrefix(display);
	for (const entry of project.list(folder)) {
		if (entry.kind !== "file" || !base(entry.path).startsWith(prefix)) continue;
		const existing = await project.readBinary(entry.path).catch(() => null);
		if (existing && sameBytes(existing, bytes)) return void (await remove("already-copied"));
	}

	// Copy (create-only, synced by the backend), read it back, check it is unchanged, and only then remove.
	const copied = await recoverLeftoverBytes(project, folder, display, bytes, options.now);
	if (!copied.ok) return left(`it could not be copied into recovery (${copied.error.message}), so it was kept`);
	const back = await project.readBinary(copied.path).catch(() => null);
	if (!back || !sameBytes(back, bytes)) return left(`its copy ${copied.path} did not read back identical, so the original was kept`);
	const sibling = await project.fs.stat(targetPath).catch(() => null);
	const newer = !sibling || t.mtimeMs > sibling.mtimeMs;
	try {
		await project.fs.removeTemp(t.path, expected);
	} catch (err) {
		const why = err instanceof BackendError && err.code === "ECHANGED" ? "it changed after it was listed" : err instanceof Error ? err.message : String(err);
		return left(`copied to ${copied.path}, but not removed (${why})`);
	}
	report.recovered.push({ leftover: t.path, recoveryPath: copied.path, newer, kind });
}

/** `project.md` to `project`; a name with another extension keeps it (`cover.png`), since the copy is always a `.md`. */
function recoveryDisplayName(targetName: string): string {
	return targetName.replace(/\.md$/i, "");
}

function isUtf8(bytes: Uint8Array): boolean {
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}
