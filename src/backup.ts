import type { App } from "obsidian";
import JSZip from "jszip";

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g;

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

/** Lazily requires Node's `fs`/`path` - never imported at module top-level so this file stays safe to load on mobile. */
function getNodeFsPath(): { fs: typeof import("fs"); path: typeof import("path") } {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const fs = require("fs") as typeof import("fs");
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	const path = require("path") as typeof import("path");
	return { fs, path };
}

async function writeZipToFolder(destFolder: string, filename: string, buffer: Uint8Array): Promise<string> {
	const { fs, path } = getNodeFsPath();
	await fs.promises.mkdir(destFolder, { recursive: true });
	const fullPath = path.join(destFolder, filename);
	await fs.promises.writeFile(fullPath, buffer);
	return fullPath;
}

/** Content-only backup used by the automatic schedule: every file Obsidian indexes (notes + attachments). */
export async function runContentBackup(app: App, destFolder: string, includeTime: boolean, now: Date = new Date()): Promise<string> {
	const zip = new JSZip();
	for (const file of app.vault.getFiles()) {
		const data = await app.vault.readBinary(file);
		zip.file(file.path, data);
	}
	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	const filename = formatBackupFilename(app.vault.getName(), now, includeTime);
	return writeZipToFolder(destFolder, filename, buffer);
}

/** Recursively lists every path under the vault root, including hidden folders like `.obsidian`. */
async function listAllFilesRecursive(app: App, folder: string, skipFolder: string | null): Promise<string[]> {
	if (skipFolder && (folder === skipFolder || folder.startsWith(`${skipFolder}/`))) return [];
	const { files, folders } = await app.vault.adapter.list(folder);
	const nested = await Promise.all(folders.map((sub) => listAllFilesRecursive(app, sub, skipFolder)));
	return [...files, ...nested.flat()];
}

/** Full backup used by the manual "Back up now" button: every file in the vault, including `.obsidian`. */
export async function runFullBackup(app: App, destFolder: string, now: Date = new Date()): Promise<string> {
	const { path } = getNodeFsPath();
	const normalizedDest = path.resolve(destFolder);
	const basePath = "getBasePath" in app.vault.adapter ? (app.vault.adapter as { getBasePath(): string }).getBasePath() : null;
	const skipFolder = basePath && normalizedDest.startsWith(basePath) ? path.relative(basePath, normalizedDest) : null;

	const allPaths = await listAllFilesRecursive(app, "", skipFolder);
	const zip = new JSZip();
	for (const filePath of allPaths) {
		const data = await app.vault.adapter.readBinary(filePath);
		zip.file(filePath, data);
	}
	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	const filename = formatFullBackupFilename(app.vault.getName(), now);
	return writeZipToFolder(destFolder, filename, buffer);
}
