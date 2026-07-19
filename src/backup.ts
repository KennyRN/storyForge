import type { App } from "obsidian";
import { zipSync, type Zippable } from "fflate";
import * as fs from "fs";
import * as path from "path";

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Extensions that are already compressed and gain nothing from deflate; stored instead of deflated. */
const PRE_COMPRESSED_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "webp", "avif", "mp3", "m4a", "ogg", "mp4", "webm", "woff", "woff2", "zip", "7z", "gz",
]);

function isPreCompressed(filePath: string): boolean {
	const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
	return PRE_COMPRESSED_EXTENSIONS.has(ext);
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, "0");
}

/** Builds `yyyymmdd - <vault>.zip`, or `yyyymmdd-hhmmss - <vault>.zip` when `includeTime` is set. */
export function formatBackupFilename(vaultName: string, when: Date, includeTime: boolean): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = includeTime ? `-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}` : "";
	const safeVaultName = vaultName.replace(ILLEGAL_FILENAME_CHARS, "-");
	return `${datePart}${timePart} - ${safeVaultName}.zip`;
}

/** Builds `yyyymmdd-hhmmss - <vault> - full.zip`, used for the manual "Back up now" full backup. */
export function formatFullBackupFilename(vaultName: string, when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	const safeVaultName = vaultName.replace(ILLEGAL_FILENAME_CHARS, "-");
	return `${datePart}-${timePart} - ${safeVaultName} - full.zip`;
}

async function writeZipToFolder(destFolder: string, filename: string, buffer: Uint8Array): Promise<string> {
	await fs.promises.mkdir(destFolder, { recursive: true });
	const fullPath = path.join(destFolder, filename);
	await fs.promises.writeFile(fullPath, buffer);
	return fullPath;
}

// This module is intentionally the only place in the plugin that enumerates the vault (see README's
// "Privacy and vault access"). Any future enumeration elsewhere should be a design decision, not a convenience.
/** Content-only backup used by the automatic schedule: every file Obsidian indexes (notes + attachments). */
export async function runContentBackup(app: App, destFolder: string, includeTime: boolean, now: Date = new Date()): Promise<string> {
	const entries: Zippable = {};
	for (const file of app.vault.getFiles()) {
		const data = await app.vault.readBinary(file);
		entries[file.path] = [new Uint8Array(data), { level: isPreCompressed(file.path) ? 0 : 6 }];
	}
	const buffer = zipSync(entries);
	const filename = formatBackupFilename(app.vault.getName(), now, includeTime);
	return writeZipToFolder(destFolder, filename, buffer);
}

/** Recursively lists every path under the vault root, including hidden folders like `.obsidian` (but not `.trash`). */
export async function listAllFilesRecursive(app: App, folder: string, skipFolder: string | null): Promise<string[]> {
	if (folder === ".trash" || folder.startsWith(".trash/")) return [];
	if (skipFolder && (folder === skipFolder || folder.startsWith(`${skipFolder}/`))) return [];
	const { files, folders } = await app.vault.adapter.list(folder);
	const nested = await Promise.all(folders.map((sub) => listAllFilesRecursive(app, sub, skipFolder)));
	return [...files, ...nested.flat()];
}

/** Full backup used by the manual "Back up now" button: every file in the vault, including `.obsidian`, excluding `.trash`. */
export async function runFullBackup(app: App, destFolder: string, now: Date = new Date()): Promise<string> {
	const normalizedDest = path.resolve(destFolder);
	const basePath = "getBasePath" in app.vault.adapter ? (app.vault.adapter as { getBasePath(): string }).getBasePath() : null;
	const skipFolder = basePath && normalizedDest.startsWith(basePath) ? path.relative(basePath, normalizedDest) : null;

	const allPaths = await listAllFilesRecursive(app, "", skipFolder);
	const entries: Zippable = {};
	for (const filePath of allPaths) {
		const data = await app.vault.adapter.readBinary(filePath);
		entries[filePath] = [new Uint8Array(data), { level: isPreCompressed(filePath) ? 0 : 6 }];
	}
	const buffer = zipSync(entries);
	const filename = formatFullBackupFilename(app.vault.getName(), now);
	return writeZipToFolder(destFolder, filename, buffer);
}
