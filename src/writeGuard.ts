import { App, TFile, Vault, type FrontMatterCache } from "obsidian";
import {
	BACKSTAGE_ROOT,
	BACKUPS_FOLDER,
	CODEX_ROOT,
	EXPORT_ROOT,
	LIBRARY_ROOT,
	TITLEFORGE_BACKSTAGE_ROOT,
	isCodexNotePath,
	isLibraryRootFilePath,
} from "./paths";

/**
 * The one narrow module every plugin write funnels through. It physically
 * refuses any path inside the story library or codex — except any flat file
 * directly at the library root (`series.md`, `novel-<code>.md`, and any other
 * library-root bookkeeping file), which describes the manuscripts without
 * being manuscript prose themselves — so the non-destructive guarantee holds
 * even if the rest of the code is wrong.
 *
 * Every write that targets a chapter file under `_story-library/<code>/` or a
 * note under `Codex/` must go through this module (which will refuse it).
 * Library manuscripts are prose-only; Codex notes are user-owned. Intentional
 * disk exceptions are create, rename (wikilinks), and aliases-only YAML via
 * `modifyCodexNoteAliases` — never body edits or other frontmatter keys.
 * Story Context never edits Codex note bodies — its write footprint is
 * `_backstage/storyforge/` (plus flat library-root files above) and
 * `_backstage/titleforge/` (titleForge's own sibling region).
 * Backup zips are an allowed write root: `_sf-backup/` only. User-facing shareable
 * JSON copies are another: `_export/` only.
 *
 * Host API / xForge siblings:
 * - Codex note *frontmatter* create/edit is only for plugins that called
 *   `registerCodexWriteException`, and only for essential owned fields.
 * - `allowBody` defaults false; hosted timelineForge must not edit note bodies.
 * - nameForge should not register. languageForge: deferred — do not pre-grant.
 * - Never Library prose. Never raw `_backstage/storyforge/codex.md` from siblings
 *   (use `ensureVirtualFolder` / `createNote` / `setType` host facades).
 * See docs/xforge-sibling-writes.md and docs/xforge-timelineforge-host-audit.md.
 */

export class ForbiddenWriteError extends Error {
	constructor(path: string) {
		super(
			`storyForge refused to write to "${path}": outside ${BACKSTAGE_ROOT}/, ${TITLEFORGE_BACKSTAGE_ROOT}/, ${BACKUPS_FOLDER}/, ${EXPORT_ROOT}/, or a flat file directly at ${LIBRARY_ROOT}/`,
		);
		this.name = "ForbiddenWriteError";
	}
}

/**
 * Collapses `.` / `..` segments so a prefix check cannot be fooled by paths
 * like `_backstage/storyforge/../Codex/x.md`. Rejects absolute paths and null
 * bytes. Exported for unit tests.
 */
export function normalizeVaultPath(path: string): string {
	if (path.startsWith("/") || path.includes("\0")) {
		throw new ForbiddenWriteError(path);
	}
	const out: string[] = [];
	for (const segment of path.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			if (out.length === 0) throw new ForbiddenWriteError(path);
			out.pop();
			continue;
		}
		out.push(segment);
	}
	if (out.length === 0) throw new ForbiddenWriteError(path);
	return out.join("/");
}

/**
 * Throws ForbiddenWriteError unless `path` resolves strictly under
 * `_backstage/storyforge/` or `_backstage/titleforge/` — with a narrow
 * exception for any flat file directly at the library root (`series.md`,
 * `novel-<code>.md`, and any other library-root bookkeeping file), which
 * lives alongside the manuscripts but is still plugin-managed metadata, not
 * prose. Everything else under the library root (the actual chapter files
 * and anything else nested inside a `<code>/` folder) stays forbidden below.
 * Exported for tests.
 */
export function assertBackstagePath(path: string): void {
	const normalized = normalizeVaultPath(path);
	if (isLibraryRootFilePath(normalized)) {
		return;
	}
	const forbidden =
		normalized === LIBRARY_ROOT ||
		normalized.startsWith(`${LIBRARY_ROOT}/`) ||
		normalized === CODEX_ROOT ||
		normalized.startsWith(`${CODEX_ROOT}/`);
	const allowed =
		normalized === BACKSTAGE_ROOT ||
		normalized.startsWith(`${BACKSTAGE_ROOT}/`) ||
		normalized === TITLEFORGE_BACKSTAGE_ROOT ||
		normalized.startsWith(`${TITLEFORGE_BACKSTAGE_ROOT}/`);
	if (forbidden || !allowed) {
		throw new ForbiddenWriteError(path);
	}
}

function assertBackupPath(path: string): void {
	const normalized = normalizeVaultPath(path);
	const allowed = normalized === BACKUPS_FOLDER || normalized.startsWith(`${BACKUPS_FOLDER}/`);
	if (!allowed) {
		throw new ForbiddenWriteError(path);
	}
}

function assertExportPath(path: string): void {
	const normalized = normalizeVaultPath(path);
	const allowed =
		normalized === EXPORT_ROOT ||
		(normalized.startsWith(`${EXPORT_ROOT}/`) && !normalized.slice(EXPORT_ROOT.length + 1).includes("/"));
	if (!allowed) {
		throw new ForbiddenWriteError(path);
	}
}

/** Creates `path` unless the in-memory index already has it. Swallows "already exists" from a
 * cold-start index that lags behind disk — `createFolder` throwing here used to abort plugin
 * `onload()` and leave restored custom views as "plugin has gone away". */
async function createFolderIfMissing(vault: Vault, path: string): Promise<void> {
	if (vault.getAbstractFileByPath(path)) return;
	try {
		await vault.createFolder(path);
	} catch {
		// Folder exists on disk; the vault index has not caught up yet.
	}
}

/** Creates `path` and every missing ancestor folder above it (vault.createFolder does not vivify parents on its own). */
export async function ensureBackstageFolder(vault: Vault, path: string): Promise<void> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const segments = normalized.split("/");
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		await createFolderIfMissing(vault, current);
	}
}

async function ensureFolderTree(vault: Vault, path: string, assertPath: (p: string) => void): Promise<void> {
	assertPath(path);
	const segments = path.split("/");
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		await createFolderIfMissing(vault, current);
	}
}

/**
 * `path` has already passed `assertBackstagePath` in the caller by this point, so a parent of
 * exactly `LIBRARY_ROOT` only ever arises for the flat-library-root-file exception (series.md,
 * novel-<code>.md, ...) — never a nested library path, which stayed forbidden back there. That
 * folder is guaranteed to already exist (ensureEagerFolders, at plugin load) and, being the
 * library root itself rather than a backstage path, would fail `ensureBackstageFolder`'s own
 * backstage-only assertion below if we still routed it through there. Nothing to ensure in that
 * case; every other parent is a genuine backstage path and takes the normal ensure-folder path.
 */
async function ensureParentFolder(vault: Vault, path: string): Promise<void> {
	const normalized = normalizeVaultPath(path);
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) return;
	const parent = normalized.slice(0, lastSlash);
	if (parent === LIBRARY_ROOT) return;
	await ensureBackstageFolder(vault, parent);
}

export async function writeBackstageFile(vault: Vault, path: string, content: string): Promise<TFile> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const existing = vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await vault.modify(existing, content);
		return existing;
	}
	await ensureParentFolder(vault, normalized);
	try {
		return await vault.create(normalized, content);
	} catch (err) {
		const raced = vault.getAbstractFileByPath(normalized);
		if (raced instanceof TFile) {
			await vault.modify(raced, content);
			return raced;
		}
		throw err;
	}
}

export async function writeBackstageBinary(vault: Vault, path: string, data: ArrayBuffer): Promise<TFile> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const existing = vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await vault.modifyBinary(existing, data);
		return existing;
	}
	await ensureParentFolder(vault, normalized);
	try {
		return await vault.createBinary(normalized, data);
	} catch (err) {
		const raced = vault.getAbstractFileByPath(normalized);
		if (raced instanceof TFile) {
			await vault.modifyBinary(raced, data);
			return raced;
		}
		throw err;
	}
}

/** Writes a backup zip (or other binary) under `_sf-backup/` only. */
export async function writeBackupBinary(vault: Vault, path: string, data: ArrayBuffer): Promise<TFile> {
	assertBackupPath(path);
	const normalized = normalizeVaultPath(path);
	const existing = vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await vault.modifyBinary(existing, data);
		return existing;
	}
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash !== -1) {
		await ensureFolderTree(vault, normalized.slice(0, lastSlash), assertBackupPath);
	}
	return vault.createBinary(normalized, data);
}

/** Writes a text export under `_sf-backup/` only. */
export async function writeBackupText(vault: Vault, path: string, content: string): Promise<TFile> {
	assertBackupPath(path);
	const normalized = normalizeVaultPath(path);
	const existing = vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await vault.modify(existing, content);
		return existing;
	}
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash !== -1) {
		await ensureFolderTree(vault, normalized.slice(0, lastSlash), assertBackupPath);
	}
	return vault.create(normalized, content);
}

/** Writes a user-facing shareable JSON file under `_export/` only. */
export async function writeExportText(vault: Vault, path: string, content: string): Promise<TFile> {
	assertExportPath(path);
	const normalized = normalizeVaultPath(path);
	const existing = vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFile) {
		await vault.modify(existing, content);
		return existing;
	}
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash !== -1) {
		await ensureFolderTree(vault, normalized.slice(0, lastSlash), assertExportPath);
	}
	return vault.create(normalized, content);
}

export async function deleteBackstagePath(app: App, path: string): Promise<void> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const file = app.vault.getAbstractFileByPath(normalized);
	if (file) {
		await app.fileManager.trashFile(file);
	}
}

/** Per-normalized-path queue so concurrent guarded writes cannot clobber each other. */
const pathQueues = new Map<string, Promise<void>>();

export function enqueueBackstageWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
	const key = normalizeVaultPath(path);
	const prev = pathQueues.get(key) ?? Promise.resolve();
	const run = prev.then(task, task);
	const settled = run.then(
		() => undefined,
		() => undefined,
	);
	pathQueues.set(key, settled);
	void settled.then(() => {
		if (pathQueues.get(key) === settled) pathQueues.delete(key);
	});
	return run;
}

function readAliasList(raw: unknown): string[] {
	if (Array.isArray(raw)) {
		return raw
			.filter((v): v is string => typeof v === "string")
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (typeof raw === "string" && raw.trim()) return [raw.trim()];
	return [];
}

/**
 * The third Codex disk exception: rewrite only the note's YAML `aliases` key.
 * Refuses any path that is not a flat `Codex/*.md` note. The mutate callback
 * receives and returns the alias list — it cannot see or change other keys
 * or the note body.
 */
export async function modifyCodexNoteAliases(
	app: { fileManager: { processFrontMatter: (file: TFile, fn: (fm: FrontMatterCache) => void) => Promise<void> } },
	vault: Vault,
	path: string,
	mutate: (aliases: string[]) => string[],
): Promise<void> {
	const normalized = normalizeVaultPath(path);
	if (!isCodexNotePath(normalized)) {
		throw new ForbiddenWriteError(path);
	}
	const file = vault.getAbstractFileByPath(normalized);
	if (!(file instanceof TFile)) {
		throw new ForbiddenWriteError(path);
	}
	await enqueueBackstageWrite(normalized, async () => {
		await app.fileManager.processFrontMatter(file, (fm) => {
			const next = mutate(readAliasList(fm.aliases));
			if (next.length === 0) {
				delete fm.aliases;
			} else {
				fm.aliases = next;
			}
		});
	});
}

export async function modifyBackstageFrontmatter<T extends FrontMatterCache = FrontMatterCache>(
	app: { fileManager: { processFrontMatter: (file: TFile, fn: (fm: T) => void) => Promise<void> } },
	vault: Vault,
	path: string,
	defaultContent: string,
	mutate: (frontmatter: T) => void,
): Promise<TFile> {
	assertBackstagePath(path);
	return enqueueBackstageWrite(path, async () => {
		const normalized = normalizeVaultPath(path);
		const existing = vault.getAbstractFileByPath(normalized);
		let resolvedFile: TFile;
		if (existing instanceof TFile) {
			resolvedFile = existing;
		} else {
			await ensureParentFolder(vault, normalized);
			resolvedFile = await vault.create(normalized, defaultContent);
		}
		await app.fileManager.processFrontMatter(resolvedFile, mutate);
		return resolvedFile;
	});
}

export async function renameBackstagePath(vault: Vault, oldPath: string, newPath: string): Promise<void> {
	assertBackstagePath(oldPath);
	assertBackstagePath(newPath);
	const oldNormalized = normalizeVaultPath(oldPath);
	const newNormalized = normalizeVaultPath(newPath);
	await ensureParentFolder(vault, newNormalized);
	const file = vault.getAbstractFileByPath(oldNormalized);
	if (file) {
		await vault.rename(file, newNormalized);
	}
}
