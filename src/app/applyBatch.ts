/**
 * Applying a batch of outside changes (docs/tauri-shell.md §6; Brief 4 §3.4). A pure TypeScript
 * module, so it is tested without Tauri. In this order:
 *
 *  1. **Capture evidence** for every path that may have vanished (its body hash and fingerprint, from
 *     the index) before anything changes. Otherwise the reconciler would have nothing to match a
 *     reappearing file against.
 *  2. **Ignore echoes**: if the disk already matches the index, it was our own write.
 *  3. **Existing files that changed** go to the prose writer's disk-change entry point (which runs the
 *     after-save hook); other files just refresh the index.
 *  4. **The index learns** which files vanished and appeared (the reconciler reads the index).
 *  5. **Vanished and appeared chapters and Codex notes** go, with the captured evidence, to the
 *     reconciler as one change set.
 *
 * An iCloud stub becoming its real file (or the reverse) is one file changing state, never a rename:
 * stubs are mapped to their real path and kept out of matching.
 */
import type { ScanEntry } from "../core/backend/types";
import { sha256Text } from "../core/hash";
import { isCodexNotePath, isLibraryChapterPath } from "../core/paths";
import { icloudPlaceholderTarget, isHiddenPath, resolvePath } from "../core/pathRules";
import type { Project } from "../core/project";
import type { DiskChangeResult, ProseWriter } from "../core/proseWriter";
import { type Evidence, type ReconcileSummary, evidenceFromIndex, reconcileChanges } from "../core/reconciler";

export interface Batch {
	paths: string[];
	/** Events may have been missed (the system says so, the Mac woke, the watcher restarted): compare everything. */
	rescan: boolean;
}

export interface BatchTarget {
	project: Project;
	writer: ProseWriter;
}

export interface BatchResult {
	rescan: boolean;
	/** Our own writes coming back. */
	echoes: string[];
	/** Existing files that changed outside the app. */
	changed: string[];
	vanished: string[];
	appeared: string[];
	/** Stubs that became real files (or the reverse): the same file, not a rename. */
	stateChanges: string[];
	/** What the prose writer did with changed chapters and Codex notes. */
	diskChanges: { path: string; result: DiskChangeResult }[];
	reconciliation: ReconcileSummary | null;
	errors: { path: string; error: Error }[];
}

const isProse = (p: string) => isLibraryChapterPath(p) || isCodexNotePath(p);
const err = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

/** Paths that differ between a full scan of the disk and the index: the change set of a rescan. */
export async function diffAgainstDisk(project: Project): Promise<string[]> {
	const disk = new Map<string, ScanEntry>();
	const stubs = new Set<string>();
	for await (const e of project.fs.scan()) {
		const real = icloudPlaceholderTarget(e.path);
		if (real !== null && !isHiddenPath(real)) {
			stubs.add(real);
			continue;
		}
		if (isHiddenPath(e.path)) continue;
		disk.set(e.path, e);
	}
	const out = new Set<string>();
	for (const entry of project.index.all()) {
		const d = disk.get(entry.path);
		if (!d || d.kind !== entry.kind) out.add(entry.path);
		else if (entry.kind === "file" && (d.size !== entry.size || Math.abs(d.mtimeMs - entry.mtimeMs) >= 1)) out.add(entry.path);
	}
	for (const [p] of disk) if (!project.index.get(p)) out.add(p);
	for (const real of stubs) if (!project.index.isPlaceholder(real)) out.add(`${real.slice(0, real.lastIndexOf("/") + 1)}.${real.slice(real.lastIndexOf("/") + 1)}.icloud`);
	for (const real of project.index.placeholders()) if (!stubs.has(real)) out.add(`${real.slice(0, real.lastIndexOf("/") + 1)}.${real.slice(real.lastIndexOf("/") + 1)}.icloud`);
	return [...out];
}

export async function applyBatch(target: BatchTarget, batch: Batch): Promise<BatchResult> {
	const { project, writer } = target;
	const result: BatchResult = { rescan: batch.rescan, echoes: [], changed: [], vanished: [], appeared: [], stateChanges: [], diskChanges: [], reconciliation: null, errors: [] };

	let raw = batch.paths;
	if (batch.rescan) raw = [...raw, ...(await diffAgainstDisk(project))];
	const canonical = [...new Set(raw.map((p) => resolvePath(p)).filter((p): p is string => !!p))];

	// Stubs are the same file changing state: map them to the real path and keep them out of matching.
	const stubStates = new Set<string>();
	const paths = new Set<string>();
	for (const p of canonical) {
		const real = icloudPlaceholderTarget(p);
		if (real !== null) {
			if (!isHiddenPath(real)) stubStates.add(p);
			continue;
		}
		if (!isHiddenPath(p)) paths.add(p);
	}
	// 1. Evidence, before anything changes.
	// A folder that is gone takes everything the index knew under it, so those files' evidence is captured too.
	const underFolders = (folder: string) => {
		const prefix = folder.toLowerCase() + "/";
		return project.index.all().filter((f) => f.kind === "file" && f.path.toLowerCase().startsWith(prefix)).map((f) => f.path);
	};
	const evidencePaths = new Set<string>();
	for (const p of paths) {
		const e = project.index.get(p);
		if (e?.kind === "file") evidencePaths.add(e.path);
		else if (e?.kind === "folder") for (const f of underFolders(e.path)) evidencePaths.add(f);
	}
	const evidence = new Map<string, Evidence>(evidenceFromIndex(project, [...evidencePaths]));

	// 2. Classify; echoes are dropped.
	const changed: { path: string; text?: string }[] = [];
	const newFolders: string[] = [];
	const goneFolders: string[] = [];
	for (const p of paths) {
		try {
			const entry = project.index.get(p);
			const disk = await project.fs.stat(p);
			if (disk === null) {
				if (entry?.kind === "file") result.vanished.push(entry.path);
				else if (entry?.kind === "folder") {
					goneFolders.push(entry.path);
					for (const f of underFolders(entry.path)) if (!paths.has(f) && !result.vanished.includes(f) && (await project.fs.stat(f)) === null) result.vanished.push(f);
				}
				continue;
			}
			if (disk.kind === "folder") {
				if (!entry) newFolders.push(p);
				continue;
			}
			if (!entry || entry.kind !== "file") {
				result.appeared.push(p);
				continue;
			}
			if (entry.hash !== undefined) {
				const text = await project.readText(p);
				if (sha256Text(text) === entry.hash) result.echoes.push(p);
				else changed.push({ path: p, text });
			} else if (disk.size === entry.size && Math.abs(disk.mtimeMs - entry.mtimeMs) < 1) {
				result.echoes.push(p);
			} else {
				changed.push({ path: p });
			}
		} catch (e) {
			result.errors.push({ path: p, error: err(e) });
		}
	}
	for (const folder of newFolders) {
		try {
			for await (const e of project.fs.scan(folder)) {
				if (e.kind === "file" && !isHiddenPath(e.path) && !project.index.get(e.path) && !result.appeared.includes(e.path)) result.appeared.push(e.path);
			}
		} catch (e) {
			result.errors.push({ path: folder, error: err(e) });
		}
	}

	// 3. Existing files that changed.
	for (const c of changed) {
		try {
			if (isProse(c.path)) result.diskChanges.push({ path: c.path, result: await writer.onDiskChanged(c.path, c.text ?? (await project.readText(c.path))) });
			await project.refresh(c.path);
			result.changed.push(c.path);
		} catch (e) {
			result.errors.push({ path: c.path, error: err(e) });
		}
	}

	// 4. The index learns what vanished and appeared; stubs change state.
	for (const p of result.vanished) await project.index.applyChange({ type: "deleted", path: p }).catch((e) => result.errors.push({ path: p, error: err(e) }));
	for (const p of goneFolders) await project.index.applyChange({ type: "deleted", path: p }).catch((e) => result.errors.push({ path: p, error: err(e) }));
	for (const p of newFolders) await project.index.applyChange({ type: "created", path: p }).catch((e) => result.errors.push({ path: p, error: err(e) }));
	for (const p of result.appeared) await project.index.applyChange({ type: "created", path: p }).catch((e) => result.errors.push({ path: p, error: err(e) }));
	for (const stub of stubStates) {
		const real = icloudPlaceholderTarget(stub) as string;
		try {
			await project.index.applyChange({ type: "created", path: stub }); // records or forgets the stub by whether it exists
			const realStat = await project.fs.stat(real);
			if (realStat?.kind === "file" && !project.index.get(real)) {
				await project.index.applyChange({ type: "created", path: real }); // downloaded: the same file, now with content
				result.appeared = result.appeared.filter((a) => a !== real);
			}
			result.stateChanges.push(real);
		} catch (e) {
			result.errors.push({ path: stub, error: err(e) });
		}
	}

	// 5. Vanished and appeared chapters and Codex notes: one change set, with the evidence captured first.
	const vanishedProse = result.vanished.filter(isProse);
	const appearedProse = result.appeared.filter((p) => isProse(p) && !result.stateChanges.includes(p));
	if (vanishedProse.length > 0 || appearedProse.length > 0) {
		try {
			result.reconciliation = await reconcileChanges(project, { vanished: vanishedProse, appeared: appearedProse, evidence });
		} catch (e) {
			result.errors.push({ path: "(reconciliation)", error: err(e) });
		}
	}
	return result;
}
