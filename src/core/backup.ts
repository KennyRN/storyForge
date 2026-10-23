/**
 * Backups (docs/safety-core.md §5): zip files created in `_sf-backup/`, never overwritten, never
 * removed. Ports 0.17.1's `backup.ts` onto the backend: same file names, same compression rules,
 * same exclusions. This module is the only caller of `createBackup`.
 *
 * Four kinds:
 * - **session**: once per prose-writing session, before the first save. The backup scope.
 * - **automatic**: when due (`isBackupDue`). The backup scope.
 * - **full**: when asked. Everything except `.trash/` and `_sf-backup/`, hidden folders included.
 * - **pre-rewrite**: exactly the files a link rewrite will change, plus the note being renamed.
 *
 * The **backup scope** is `_story-library/`, `Codex/`, `notes/` and `_backstage/` (which holds the
 * cover images). 0.17.1's automatic backups zipped the whole vault; the scope is one function
 * (`inBackupScope`) so that decision can be changed in one place.
 */
import { zipSync, type Zippable } from "fflate";
import { BackendError } from "./backend/types";
import { BACKUPS_FOLDER, LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT } from "./paths";
import { foldKey, icloudPlaceholderTarget, isHiddenPath } from "./pathRules";

export { icloudPlaceholderTarget };
import type { Project } from "./project";

export type AutomaticBackupFrequency = "every-open" | "daily" | "weekly";
export type BackupKind = "session" | "automatic" | "full" | "pre-rewrite";

export interface BackupResult {
	kind: BackupKind;
	/** Project-relative path of the zip. */
	path: string;
	/** Files in the zip. */
	fileCount: number;
	/** iCloud placeholders (files not downloaded) the backup could not include. */
	notIncluded: string[];
}

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Extensions that are already compressed and gain nothing from deflate; stored instead of deflated. */
const PRE_COMPRESSED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "mp3", "m4a", "ogg", "mp4", "webm", "woff", "woff2", "zip", "7z", "gz"]);

export function isPreCompressed(filePath: string): boolean {
	const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
	return PRE_COMPRESSED_EXTENSIONS.has(ext);
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const datePart = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const timePart = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const safeName = (name: string) => name.replace(ILLEGAL_FILENAME_CHARS, "-");

/** `yyyymmdd - <project>.zip`, or `yyyymmdd-hhmmss - <project>.zip` when `includeTime` is set. */
export function formatBackupFilename(projectName: string, when: Date, includeTime: boolean): string {
	return `${datePart(when)}${includeTime ? `-${timePart(when)}` : ""} - ${safeName(projectName)}.zip`;
}

/** `yyyymmdd-hhmmss - <project> - full.zip`, the manual full backup. */
export function formatFullBackupFilename(projectName: string, when: Date): string {
	return `${datePart(when)}-${timePart(when)} - ${safeName(projectName)} - full.zip`;
}

/** `yyyymmdd-hhmmss - <project> - pre-rewrite.zip`, taken before a link rewrite. */
export function formatPreRewriteBackupFilename(projectName: string, when: Date): string {
	return `${datePart(when)}-${timePart(when)} - ${safeName(projectName)} - pre-rewrite.zip`;
}

/**
 * Whether an automatic backup is due, by 0.17.1's rule: "every-open" runs when the project opens
 * (and only then), with the time in its name; "daily" and "weekly" run when at least 24 h / 7 days
 * have passed since the last one (0 = never). Settings and scheduling arrive in Brief 4.
 */
export function isBackupDue(input: {
	frequency: AutomaticBackupFrequency;
	/** Epoch ms of the last automatic backup; 0 if there never was one. */
	lastBackupAt: number;
	now: number;
	trigger: "open" | "interval";
}): { due: boolean; includeTime: boolean } {
	if (input.frequency === "every-open") return { due: input.trigger === "open", includeTime: true };
	const threshold = (input.frequency === "daily" ? 24 : 24 * 7) * 60 * 60 * 1000;
	return { due: input.lastBackupAt === 0 || input.now - input.lastBackupAt >= threshold, includeTime: false };
}

const SCOPE_ROOTS = [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT, "_backstage"].map((r) => r.toLowerCase());

/** True for a file the session and automatic backups include. */
export function inBackupScope(path: string): boolean {
	const key = foldKey(path);
	if (!SCOPE_ROOTS.some((r) => key.startsWith(`${r}/`))) return false;
	return !isHiddenPath(path);
}

function inFullBackup(path: string): boolean {
	const key = foldKey(path);
	const first = key.split("/")[0];
	return first !== ".trash" && first !== BACKUPS_FOLDER.toLowerCase();
}

interface Running {
	kind: BackupKind;
	startedAt: number;
	promise: Promise<BackupResult>;
}

export interface BackupServiceOptions {
	/** The project's name as used in zip file names (normally the folder name). */
	projectName: string;
	now?: () => Date;
}

/** The backup was abandoned (the app is closing) before anything was written under a backup name. */
export class BackupAbandonedError extends Error {
	constructor() {
		super("the backup was abandoned because the app is closing");
		this.name = "BackupAbandonedError";
	}
}

export class BackupService {
	private abandoned = false;
	private creating: Promise<unknown> | null = null;
	/** The most recently requested backup (running, or queued behind the running one). */
	private running: Running | null = null;
	private tail: Promise<unknown> = Promise.resolve();
	private readonly now: () => Date;
	private readonly createdAt: number;

	constructor(
		private readonly project: Project,
		private readonly options: BackupServiceOptions,
	) {
		this.now = options.now ?? (() => new Date());
		this.createdAt = this.now().getTime();
	}

	/**
	 * The app is closing: stop any backup that has not started writing, let one that is writing finish
	 * (it is a single atomic create), and refuse new ones. The session backup is exempt: closing flushes
	 * the author's last typing, and that save wants its backup. Resolves when nothing is being written.
	 */
	async abandon(): Promise<void> {
		this.abandoned = true;
		await this.creating?.catch(() => undefined); // one atomic create: allowed to finish
	}

	/**
	 * Session or automatic backup (the backup scope). Never two at once: if a backup is running that
	 * covers at least as much and started no earlier than `since` (default: when this service was
	 * created, i.e. when the project was opened), its result is reused; otherwise this one waits its
	 * turn. A running **full** backup therefore satisfies a session or automatic request.
	 */
	runScoped(kind: "session" | "automatic", opts: { includeTime?: boolean; since?: number } = {}): Promise<BackupResult> {
		const since = opts.since ?? this.createdAt;
		const running = this.running;
		if (running && (running.kind === "full" || running.kind === kind) && running.startedAt >= since) return running.promise;
		return this.start(kind, (when) => this.build(kind, when, formatBackupFilename(this.options.projectName, when, opts.includeTime ?? kind === "session"), inBackupScope));
	}

	/** The manual full backup. Waits for a running session or automatic backup, then runs its own. */
	runFull(): Promise<BackupResult> {
		const running = this.running;
		if (running?.kind === "full") return running.promise;
		return this.start("full", (when) => this.build("full", when, formatFullBackupFilename(this.options.projectName, when), inFullBackup));
	}

	/** Exactly `files` (project paths), taken before a link rewrite. Always runs its own backup, after any running one. */
	runPreRewrite(files: readonly string[]): Promise<BackupResult> {
		const wanted = new Set(files.map((f) => foldKey(f)));
		return this.start("pre-rewrite", (when) => this.build("pre-rewrite", when, formatPreRewriteBackupFilename(this.options.projectName, when), (p) => wanted.has(foldKey(p)), files));
	}

	private start(kind: BackupKind, make: (when: Date) => Promise<BackupResult>): Promise<BackupResult> {
		const previous = this.tail;
		// Until it actually starts, a queued backup counts as starting "later than any request".
		const entry: Running = { kind, startedAt: Number.POSITIVE_INFINITY, promise: undefined as unknown as Promise<BackupResult> };
		this.running = entry;
		entry.promise = previous
			.then(
				() => undefined,
				() => undefined,
			)
			.then(() => {
				const when = this.now();
				entry.startedAt = when.getTime();
				return make(when);
			})
			.finally(() => {
				if (this.running === entry) this.running = null;
			});
		this.tail = entry.promise.catch(() => undefined);
		return entry.promise;
	}

	private async build(kind: BackupKind, when: Date, filename: string, include: (path: string) => boolean, mustContain: readonly string[] = []): Promise<BackupResult> {
		const entries: Zippable = {};
		const notIncluded: string[] = [];
		const present = new Set<string>();
		for await (const e of this.project.fs.scan()) {
			if (this.abandoned && kind !== "session") throw new BackupAbandonedError();
			if (e.kind !== "file") continue;
			const placeholder = icloudPlaceholderTarget(e.path);
			if (placeholder !== null) {
				if (inFullBackup(placeholder) && (kind === "full" || (kind === "pre-rewrite" ? include(placeholder) : inBackupScope(placeholder)))) notIncluded.push(placeholder);
				continue;
			}
			if (!include(e.path) || !inFullBackup(e.path)) continue;
			const data = await this.project.fs.readBinary(e.path);
			entries[e.path] = [data, { level: isPreCompressed(e.path) ? 0 : 6, ...zipTime(e.mtimeMs) }];
			present.add(foldKey(e.path));
		}
		const missing = mustContain.filter((f) => !present.has(foldKey(f)) && !notIncluded.some((n) => foldKey(n) === foldKey(f)));
		if (missing.length) throw new Error(`can't back up files that are missing: ${missing.join(", ")}`);
		const zip = zipSync(entries);
		// Abandoning is clean: nothing has been written yet. Once the zip is being created, that is one atomic
		// step (a temp file renamed into place, or removed), so it is allowed to finish.
		if (this.abandoned && kind !== "session") throw new BackupAbandonedError();
		const creating = this.createUnique(filename, zip);
		this.creating = creating;
		const path = await creating.finally(() => (this.creating = null));
		await this.project.refresh(path);
		return { kind, path, fileCount: Object.keys(entries).length, notIncluded: notIncluded.sort() };
	}

	/** Creates the zip without ever overwriting: a taken name gets ` 2`, ` 3`... before the extension. */
	private async createUnique(filename: string, data: Uint8Array): Promise<string> {
		const stem = filename.slice(0, -".zip".length);
		for (let n = 1; n < 10_000; n++) {
			const path = `${BACKUPS_FOLDER}/${n === 1 ? stem : `${stem} ${n}`}.zip`;
			try {
				await this.project.fs.createBackup(path, data);
				return path;
			} catch (err) {
				if (err instanceof BackendError && err.code === "EEXIST") continue;
				throw err;
			}
		}
		throw new Error("no free backup file name");
	}
}

function zipTime(mtimeMs: number): { mtime?: number } {
	const year = new Date(mtimeMs).getFullYear();
	return year >= 1980 && year <= 2099 ? { mtime: mtimeMs } : {};
}
