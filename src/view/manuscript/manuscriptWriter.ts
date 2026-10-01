import { Notice, type App, type TFile } from "obsidian";
import { serialiseChapterFile } from "../../manuscript/manuscriptModel";
import { decideDiskChange, recoveryFilePath } from "../../manuscript/manuscriptSync";
import { BACKUPS_FOLDER } from "../../paths";
import { ForbiddenWriteError, writeBackupText, writeManuscriptChapterBody } from "../../writeGuard";
import type { ManuscriptSurface } from "./ManuscriptSurface";

/** Matches Obsidian's own editor: a chapter saves this long after the last change to it. */
const SAVE_DELAY_MS = 2000;

export interface ManuscriptWriterOptions {
	app: App;
	bookFolderName: string;
	surface: ManuscriptSurface;
	/** Runs before the first save of the continuous-mode session; resolves even if the backup
	 * fails (the caller reports that), so a failed backup never costs the author their typing. */
	ensureSessionBackup: () => Promise<void>;
}

/**
 * Persists the manuscript editor's chapters (continuous-mode manuscript brief §3.5–§3.6). The only
 * module allowed to import writeGuard.ts's `writeManuscriptChapterBody` — the single prose write
 * path (manuscriptGuard.test.ts enforces that).
 *
 * Saves are per chapter, 2 s after the last change to it, and every pending save is flushed on
 * demand (view close, book switch, exit, plugin unload, quit). A save writes against the file's
 * last-known text; if the file changed underneath, the disk wins and the local text goes to a
 * recovery file — never merged, never overwritten. All work on one chapter (saves and incoming
 * disk changes) runs one at a time, in order.
 */
export class ManuscriptWriter {
	private readonly timers = new Map<TFile, number>();
	/** Text a write is in flight with: its modify event can arrive before the write resolves. */
	private readonly inFlight = new Map<TFile, string>();
	private readonly chains = new Map<TFile, Promise<void>>();

	constructor(private readonly options: ManuscriptWriterOptions) {}

	/** The author edited these chapters: (re)start each one's save delay. */
	noteEdited(files: TFile[]): void {
		for (const file of files) {
			const existing = this.timers.get(file);
			if (existing !== undefined) window.clearTimeout(existing);
			this.timers.set(
				file,
				window.setTimeout(() => {
					this.timers.delete(file);
					void this.enqueue(file, () => this.save(file, false));
				}, SAVE_DELAY_MS),
			);
		}
	}

	/**
	 * Saves every chapter with unsaved text now, and resolves once all of it is on disk (or in a
	 * recovery file). Anything that can't be saved at this point is recovered rather than retried:
	 * a flush is the last chance before the editor goes away.
	 */
	async flushAll(): Promise<void> {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
		const { surface } = this.options;
		const pending = surface.files().filter((file) => surface.isDirty(file));
		await Promise.all(pending.map((file) => this.enqueue(file, () => this.save(file, true))));
		await Promise.all(Array.from(this.chains.values()));
	}

	/** A chapter file of this book changed on disk (brief §3.6). */
	onDiskChanged(file: TFile, raw: string): Promise<void> {
		return this.enqueue(file, async () => {
			const { surface } = this.options;
			const disk = surface.diskState(file);
			if (!disk) return;
			const action = decideDiskChange({
				disk: raw,
				knownDisk: disk.raw,
				inFlight: this.inFlight.get(file) ?? null,
				dirty: surface.isDirty(file),
			});
			if (action === "ignore") return;
			if (action === "recover-then-reload") {
				const body = surface.currentBody(file) ?? "";
				const path = await this.recover(file, body);
				if (!path) return; // couldn't keep the local text safe: leave it in the editor
				this.cancelTimer(file);
				new Notice(`storyForge: '${file.basename}' changed outside continuous mode. Your unsaved text from here is in ${path}.`, 10000);
			}
			surface.reloadFromDisk(file, raw);
		});
	}

	/** Stops pending timers without saving — only after `flushAll` has run. */
	dispose(): void {
		for (const timer of this.timers.values()) window.clearTimeout(timer);
		this.timers.clear();
	}

	private cancelTimer(file: TFile): void {
		const timer = this.timers.get(file);
		if (timer !== undefined) window.clearTimeout(timer);
		this.timers.delete(file);
	}

	private enqueue(file: TFile, task: () => Promise<void>): Promise<void> {
		const prev = this.chains.get(file) ?? Promise.resolve();
		const run = prev.then(task, task).catch((err) => console.error("storyForge: manuscript save failed", err));
		this.chains.set(file, run);
		void run.then(() => {
			if (this.chains.get(file) === run) this.chains.delete(file);
		});
		return run;
	}

	/**
	 * Writes one chapter if its text differs from disk. `recoverOnFailure`: a failed write (disk
	 * error) goes to a recovery file instead of waiting for the next edit to retry. A refused write
	 * (the chapter left the spine or the vault meanwhile) and a conflict always do.
	 */
	private async save(file: TFile, recoverOnFailure: boolean): Promise<void> {
		const { app, bookFolderName, surface } = this.options;
		const body = surface.currentBody(file);
		const disk = surface.diskState(file);
		if (body === null || !disk || body === disk.body) return;

		await this.options.ensureSessionBackup();
		const next = serialiseChapterFile(disk.shape, body);
		this.inFlight.set(file, next);
		try {
			const result = await writeManuscriptChapterBody(app, file, bookFolderName, disk.raw, next);
			if (result.status === "conflict") {
				const path = await this.recover(file, body);
				if (!path) return;
				surface.reloadFromDisk(file, result.disk);
				new Notice(`storyForge: '${file.basename}' changed outside continuous mode. Your unsaved text from here is in ${path}.`, 10000);
				return;
			}
			surface.markWritten(file, next, body);
		} catch (err) {
			if (!(err instanceof ForbiddenWriteError) && !recoverOnFailure) {
				new Notice(`storyForge: couldn't save '${file.basename}' — ${(err as Error).message}. It will try again.`);
				return;
			}
			const path = await this.recover(file, body);
			if (path) new Notice(`storyForge: couldn't save '${file.basename}'. Your text is in ${path}.`, 10000);
		} finally {
			this.inFlight.delete(file);
		}
	}

	/** Writes `body` to a fresh recovery file under the backup root. Returns its path, or null (with
	 * a notice) if even that failed. */
	private async recover(file: TFile, body: string): Promise<string | null> {
		const { app, bookFolderName } = this.options;
		const base = recoveryFilePath(BACKUPS_FOLDER, bookFolderName, file.basename, new Date());
		let path = base;
		for (let n = 2; app.vault.getAbstractFileByPath(path); n++) path = base.replace(/\.md$/, ` ${n}.md`);
		try {
			await writeBackupText(app.vault, path, body);
			return path;
		} catch (err) {
			new Notice(`storyForge: couldn't write a recovery file for '${file.basename}' — ${(err as Error).message}. The text is still in the editor.`, 10000);
			return null;
		}
	}
}
