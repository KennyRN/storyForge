/**
 * Opening and creating a project (docs/safety-core.md §8). The order of the steps is a safety
 * guarantee, not an accident of wiring:
 *
 *  1. scan; 2. refuse a pre-0.17 layout (no writes); 3. load the snapshot;
 *  4. reconcile the scan against what was last known (match, then recover, then prune);
 *  5. ensure, without pruning, only after reconciliation, so a renamed chapter is matched before it
 *     can be mistaken for a new one; 6. save the snapshot; 7. return.
 *
 * Nothing on this path writes prose, and it writes nothing at all unless something needs reconciling
 * or ensuring. One project per process (decision 19). Opening an empty folder never seeds it:
 * creating a project is always an explicit request (`createProject`).
 */
import type { Backend } from "./backend/types";
import { BackupService, type BackupResult } from "./backup";
import {
	createBook,
	createChapter,
	ensureAllChapterEntries,
	readBookFrontmatter,
	renameBookTitle,
	syncAllBookReferenceFields,
	writeBookChapterOrder,
} from "./book";
import { LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT } from "./paths";
import { type BackupOutcome, ProseWriter, type ProseWriterOptions, type SaveResult } from "./proseWriter";
import { Project } from "./project";
import { computeGates, reconcileAtOpen, type ReconcileSummary } from "./reconciler";
import { ensureAllSeriesBookEntries, ensureSeriesFile, getLibraryBookFolders, writeSeriesTitle } from "./series";
import { SnapshotKeeper, type SnapshotStore } from "./snapshot";
import { ensureTagRegistryFile, loadCodexTypesIntoRegistry } from "./tagRegistry";

export class ProjectAlreadyOpenError extends Error {
	constructor(public readonly openRoot: string) {
		super(`A project is already open ("${openRoot}"). Close it before opening another.`);
		this.name = "ProjectAlreadyOpenError";
	}
}

/** The folder is not a storyForge project (no story library). Nothing was written. */
export class NotAProjectError extends Error {
	constructor(public readonly root: string) {
		super(`"${root}" is not a storyForge project (it has no _story-library folder). Nothing was changed. To start a project here, create one in an empty folder.`);
		this.name = "NotAProjectError";
	}
}

export class ProjectFolderNotEmptyError extends Error {
	constructor(
		public readonly root: string,
		public readonly found: string[],
	) {
		super(`Can't create a project in "${root}": the folder isn't empty (${found.slice(0, 3).join(", ")}${found.length > 3 ? ", ..." : ""}).`);
		this.name = "ProjectFolderNotEmptyError";
	}
}

let openRoot: string | null = null;

export interface OpenProjectOptions {
	backend: Backend;
	/** Where the session snapshot lives. Without one, tier-1 matching is unavailable at open. */
	snapshotStore?: SnapshotStore;
	/** The project's name in backup file names. Default: the folder's name. */
	projectName?: string;
	writer?: Omit<ProseWriterOptions, "sessionBackup">;
	now?: () => Date;
	snapshotDelayMs?: number;
}

export interface CloseResult {
	/** Unsaved text that was saved or recovered on the way out. */
	saves: SaveResult[];
	snapshot: { ok: true } | { ok: false; error: Error } | { skipped: true };
}

export interface OpenedProject {
	project: Project;
	/** The single path by which the author's typing reaches chapters and Codex notes. */
	writer: ProseWriter;
	backups: BackupService;
	snapshots: SnapshotKeeper | null;
	/** What reconciliation at open matched, pruned, added and left alone. */
	reconciliation: ReconcileSummary;
	/** Why the snapshot could not be saved at open, if it could not. */
	snapshotSaveError?: Error;
	/** Flushes every open editor (saving or recovering), saves the snapshot, and releases the one-project latch. */
	close(): Promise<CloseResult>;
}

export async function openProject(root: string, options: OpenProjectOptions): Promise<OpenedProject> {
	if (openRoot !== null) throw new ProjectAlreadyOpenError(openRoot);
	openRoot = root;
	try {
		// 1-2. Scan; a pre-0.17 layout is refused here, before anything is written.
		const project = await Project.open(options.backend);
		if (!project.isFolder(LIBRARY_ROOT)) throw new NotAProjectError(root);

		// 3. The snapshot, if there is one.
		const loaded = options.snapshotStore ? await options.snapshotStore.load(root) : ({ status: "missing" } as const);

		// 4. Reconcile.
		const reconciliation = await reconcileAtOpen(project, loaded.status === "ok" ? loaded.snapshot : null, loaded.status === "ok" ? "used" : loaded.status, {
			now: options.now?.(),
		});

		// 5. Ensure, without pruning. Gated books are left exactly as they are.
		const registry = await ensureTagRegistryFile(project);
		loadCodexTypesIntoRegistry(project, registry);
		const books = await ensureAllSeriesBookEntries(project, (folderName) => {
			const fm = readBookFrontmatter(project, folderName);
			if (!fm?.bookIdReference) return null;
			return { bookId: fm.bookIdReference, bookTitle: fm.bookTitleReference || folderName };
		});
		await syncAllBookReferenceFields(project, books);
		const gated = new Set(computeGates(project).map((g) => g.area));
		for (const folder of getLibraryBookFolders(project)) {
			if (gated.has(`book:${folder.name}`)) continue;
			await ensureAllChapterEntries(project, folder.name);
		}

		// The writer, the backups and the snapshot keeper, wired together.
		const backups = new BackupService(project, { projectName: options.projectName ?? root.split(/[\\/]/).filter(Boolean).pop() ?? "project", now: options.now });
		const sessionBackup = async (): Promise<BackupOutcome> => {
			try {
				const r: BackupResult = await backups.runScoped("session");
				return { ok: true, path: r.path };
			} catch (err) {
				return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
			}
		};
		const writer = new ProseWriter(project, { ...options.writer, now: options.now, sessionBackup });
		const snapshots = options.snapshotStore ? new SnapshotKeeper(project, options.snapshotStore, root, { delayMs: options.snapshotDelayMs, now: options.now }) : null;
		if (snapshots) writer.onChapterChanged(() => snapshots.touch());

		// 6. Save the snapshot.
		let snapshotSaveError: Error | undefined;
		if (snapshots) {
			const saved = await snapshots.saveNow();
			if (!saved.ok) snapshotSaveError = saved.error;
		}

		let closed = false;
		return {
			project,
			writer,
			backups,
			snapshots,
			reconciliation,
			...(snapshotSaveError ? { snapshotSaveError } : {}),
			async close() {
				if (closed) return { saves: [], snapshot: { skipped: true } };
				closed = true;
				try {
					const saves = await writer.closeAll();
					const snapshot = snapshots ? await snapshots.close() : { skipped: true as const };
					return { saves, snapshot };
				} finally {
					if (openRoot === root) openRoot = null;
				}
			},
		};
	} catch (err) {
		if (openRoot === root) openRoot = null;
		throw err;
	}
}

export interface CreateProjectOptions {
	seriesTitle: string;
	/** A single book: the book takes the series title as its own title. */
	standalone?: boolean;
}

/**
 * Creates the 0.17.1 first-run layout in an **empty** folder: the eager folders, the series file, a
 * first book and its first chapter (both placed), and the tag registry. Refuses any folder that isn't
 * empty, apart from hidden folders and `.DS_Store`.
 */
export async function createProject(backend: Backend, root: string, options: CreateProjectOptions): Promise<{ folderName: string; chapterFilename: string }> {
	const found: string[] = [];
	for await (const e of backend.scan()) {
		const top = e.path.split("/")[0];
		if (top === ".DS_Store" && e.kind === "file" && !e.path.includes("/")) continue;
		if (top.startsWith(".") && (e.kind === "folder" || e.path.includes("/"))) continue;
		found.push(e.path);
	}
	if (found.length > 0) throw new ProjectFolderNotEmptyError(root, found.sort());

	const project = await Project.open(backend);
	for (const folder of [LIBRARY_ROOT, CODEX_ROOT, NOTES_ROOT]) await project.createFolder(folder);
	await ensureSeriesFile(project);
	await writeSeriesTitle(project, options.seriesTitle);
	const { folderName } = await createBook(project);
	if (options.standalone) await renameBookTitle(project, folderName, options.seriesTitle);
	const { filename } = await createChapter(project, folderName);
	await writeBookChapterOrder(project, folderName, [filename]);
	const registry = await ensureTagRegistryFile(project);
	loadCodexTypesIntoRegistry(project, registry);
	return { folderName, chapterFilename: filename };
}
