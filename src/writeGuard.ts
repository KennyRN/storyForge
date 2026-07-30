import { App, TFile, Vault, type FrontMatterCache } from "obsidian";
import { BACKSTAGE_ROOT, CODEX_ROOT, LIBRARY_ROOT } from "./paths";

/**
 * The one narrow module every plugin write funnels through. It physically
 * refuses any path inside the story library or codex, so the non-destructive
 * guarantee holds even if the rest of the code is wrong.
 *
 * Every write that targets a markdown file under `_sf-storylibrary/` or `Codex/`
 * must go through this module (which will refuse it). Library manuscripts are
 * prose-only; Codex notes are user-owned (create/rename for wikilinks are the
 * only intentional disk exceptions elsewhere, and must not grow into content edits).
 */

export class ForbiddenWriteError extends Error {
	constructor(path: string) {
		super(`storyForge refused to write to "${path}": outside ${BACKSTAGE_ROOT}/`);
		this.name = "ForbiddenWriteError";
	}
}

/**
 * Collapses `.` / `..` segments so a prefix check cannot be fooled by paths
 * like `_sf-backstage/../Codex/x.md`. Rejects absolute paths and null bytes.
 * Exported for unit tests.
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

/** Throws ForbiddenWriteError unless `path` resolves strictly under `_sf-backstage/`. Exported for tests. */
export function assertBackstagePath(path: string): void {
	const normalized = normalizeVaultPath(path);
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

export async function deleteBackstagePath(app: App, path: string): Promise<void> {
	assertBackstagePath(path);
	const normalized = normalizeVaultPath(path);
	const file = app.vault.getAbstractFileByPath(normalized);
	if (file) {
		await app.fileManager.trashFile(file);
	}
}

/** Per-normalized-path write queue so concurrent RMW on the same backstage file cannot clobber each other. */
const pathQueues = new Map<string, Promise<void>>();

export function enqueueBackstageWrite<T>(path: string, task: () => Promise<T>): Promise<T> {
	const key = normalizeVaultPath(path);
	const prev = pathQueues.get(key) ?? Promise.resolve();
	const run = prev.then(task, task);
	pathQueues.set(
		key,
		run.then(
			() => undefined,
			() => undefined,
		),
	);
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
