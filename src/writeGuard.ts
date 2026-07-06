import { TFile, Vault, type FrontMatterCache } from "obsidian";
import { BACKSTAGE_ROOT, CODEX_ROOT, LIBRARY_ROOT } from "./paths";

/**
 * The one narrow module every plugin write funnels through. It physically
 * refuses any path inside the story library or codex, so the non-destructive
 * guarantee holds even if the rest of the code is wrong.
 */

export class ForbiddenWriteError extends Error {
	constructor(path: string) {
		super(`storyForge refused to write to "${path}": outside ${BACKSTAGE_ROOT}/`);
		this.name = "ForbiddenWriteError";
	}
}

function assertBackstagePath(path: string): void {
	const forbidden = path.startsWith(`${LIBRARY_ROOT}/`) || path.startsWith(`${CODEX_ROOT}/`);
	const allowed = path === BACKSTAGE_ROOT || path.startsWith(`${BACKSTAGE_ROOT}/`);
	if (forbidden || !allowed) {
		throw new ForbiddenWriteError(path);
	}
}

/** Creates `path` and every missing ancestor folder above it (vault.createFolder does not vivify parents on its own). */
export async function ensureBackstageFolder(vault: Vault, path: string): Promise<void> {
	assertBackstagePath(path);
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
	const lastSlash = path.lastIndexOf("/");
	if (lastSlash === -1) return;
	await ensureBackstageFolder(vault, path.slice(0, lastSlash));
}

export async function writeBackstageFile(vault: Vault, path: string, content: string): Promise<TFile> {
	assertBackstagePath(path);
	const existing = vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) {
		await vault.modify(existing, content);
		return existing;
	}
	await ensureParentFolder(vault, path);
	return vault.create(path, content);
}

export async function modifyBackstageFrontmatter(
	app: { fileManager: { processFrontMatter: (file: TFile, fn: (fm: FrontMatterCache) => void) => Promise<void> } },
	vault: Vault,
	path: string,
	defaultContent: string,
	mutate: (frontmatter: FrontMatterCache) => void,
): Promise<TFile> {
	assertBackstagePath(path);
	let file = vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		await ensureParentFolder(vault, path);
		file = await vault.create(path, defaultContent);
	}
	await app.fileManager.processFrontMatter(file as TFile, mutate);
	return file as TFile;
}

export async function renameBackstagePath(vault: Vault, oldPath: string, newPath: string): Promise<void> {
	assertBackstagePath(oldPath);
	assertBackstagePath(newPath);
	const file = vault.getAbstractFileByPath(oldPath);
	if (file) {
		await vault.rename(file, newPath);
	}
}
