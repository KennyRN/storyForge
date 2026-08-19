import { App, TFile, Vault, type FrontMatterCache } from "obsidian";
import { BACKSTAGE_ROOT, BACKUPS_FOLDER, CODEX_ROOT, LIBRARY_ROOT, isLibraryNovelPath, seriesFilePath } from "./paths";

/**
 * The one narrow module every plugin write funnels through. It physically
 * refuses any path inside the story library or codex — except the two flat
 * metadata files at the library root (`series.md`, `novel-<code>.md`), which
 * describe the manuscripts without being manuscript prose themselves — so the
 * non-destructive guarantee holds even if the rest of the code is wrong.
 *
 * Every write that targets a chapter file under `_story-library/<code>/` or a
 * note under `Codex/` must go through this module (which will refuse it).
 * Library manuscripts are prose-only; Codex notes are user-owned (create/rename
 * for wikilinks are the only intentional disk exceptions elsewhere, and must
 * not grow into content edits). Story Context never edits Codex note bodies —
 * its write footprint is `_backstage/storyforge/` only (plus the two library-root
 * metadata files above). Backup zips are the other allowed write root: `_sf-backup/` only.
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
			`storyForge refused to write to "${path}": outside ${BACKSTAGE_ROOT}/, ${BACKUPS_FOLDER}/, or ${LIBRARY_ROOT}/series.md and novel-<code>.md`,
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
 * `_backstage/storyforge/` — with a narrow exception for `series.md` and
 * `novel-<code>.md`, which live flat at the library root but are still
 * plugin-managed metadata, not prose. Everything else under the library root
 * (the actual chapter files, one segment deeper) stays forbidden below.
 * Exported for tests.
 */
export function assertBackstagePath(path: string): void {
	const normalized = normalizeVaultPath(path);
	if (normalized === seriesFilePath() || isLibraryNovelPath(normalized)) {
		return;
	}
	const forbidden =
		normalized === LIBRARY_ROOT ||
		normalized.startsWith(`${LIBRARY_ROOT}/`) ||
		normalized === CODEX_ROOT ||
		normalized.startsWith(`${CODEX_ROOT}/`);
	const allowed = normalized === BACKSTAGE_ROOT || normalized.startsWith(`${BACKSTAGE_ROOT}/`);
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

/** Creates `path` and every missing ancestor folder above it (vault.createFolder does not vivify parents on its own). */
export async function ensureBackstageFolder(vault: Vault, path: string): Promise<void> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const segments = normalized.split("/");
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!vault.getAbstractFileByPath(current)) {
			await vault.createFolder(current);
		}
	}
}

async function ensureFolderTree(vault: Vault, path: string, assertPath: (p: string) => void): Promise<void> {
	assertPath(path);
	const segments = path.split("/");
	let current = "";
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (!vault.getAbstractFileByPath(current)) {
			await vault.createFolder(current);
		}
	}
}

async function ensureParentFolder(vault: Vault, path: string): Promise<void> {
	const normalized = normalizeVaultPath(path);
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) return;
	await ensureBackstageFolder(vault, normalized.slice(0, lastSlash));
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
	return vault.create(normalized, content);
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
	return vault.createBinary(normalized, data);
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
	const file = vault.getAbstractFileByPath(oldNormalized);
	if (file) {
		await vault.rename(file, newNormalized);
	}
}
