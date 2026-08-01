import { normalizePath, type App } from "obsidian";
import { zipSync, type Zippable } from "fflate";
import { BACKUPS_FOLDER, isBackupFolderPath } from "./paths";
import { writeBackupBinary } from "./writeGuard";

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

function folderBasename(folderPath: string): string {
	const normalized = folderPath.replace(/\\/g, "/").replace(/\/+$/, "");
	const slash = normalized.lastIndexOf("/");
	return slash === -1 ? normalized : normalized.slice(slash + 1);
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

async function writeZipToBackups(app: App, filename: string, buffer: Uint8Array): Promise<string> {
	const vaultPath = normalizePath(`${BACKUPS_FOLDER}/${filename}`);
	// Copy into a fresh ArrayBuffer — Uint8Array may be a view into a larger SharedArrayBuffer-backed buffer.
	const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
	await writeBackupBinary(app.vault, vaultPath, data);
	return vaultPath;
}

// This module is intentionally the only place in the plugin that walks vault folders for backup
// (see README's "Privacy and vault access"). Walks use adapter.list on known roots — never vault.getFiles().
// `_sf-backup/` is always ignored so backups never nest previous zips inside new ones.
/** Recursively lists every path under `folder`, excluding `.trash`, `_sf-backup/`, and optional skip/hidden folders. */
export async function listAllFilesRecursive(
	app: App,
	folder: string,
	skipFolder: string | null = null,
	options: { skipHiddenFolders?: boolean } = {},
): Promise<string[]> {
	if (folder === ".trash" || folder.startsWith(".trash/")) return [];
	if (isBackupFolderPath(folder)) return [];
	if (skipFolder && (folder === skipFolder || folder.startsWith(`${skipFolder}/`))) return [];
	const { files, folders } = await app.vault.adapter.list(folder);
	const nested = await Promise.all(
		folders
			.filter((sub) => {
				if (isBackupFolderPath(sub)) return false;
				if (options.skipHiddenFolders && folderBasename(sub).startsWith(".")) return false;
				if (skipFolder && (sub === skipFolder || sub.startsWith(`${skipFolder}/`))) return false;
				return true;
			})
			.map((sub) => listAllFilesRecursive(app, sub, skipFolder, options)),
	);
	return [...files, ...nested.flat()];
}

async function zipListedFiles(app: App, paths: string[]): Promise<Uint8Array> {
	const entries: Zippable = {};
	for (const filePath of paths) {
		if (isBackupFolderPath(filePath)) continue;
		const data = await app.vault.adapter.readBinary(filePath);
		entries[filePath] = [new Uint8Array(data), { level: isPreCompressed(filePath) ? 0 : 6 }];
	}
	return zipSync(entries);
}

/** Content-only backup used by the automatic schedule: vault notes + attachments (skips hidden folders like `.obsidian`). */
export async function runContentBackup(app: App, includeTime: boolean, now: Date = new Date()): Promise<string> {
	const allPaths = await listAllFilesRecursive(app, "", null, { skipHiddenFolders: true });
	const buffer = await zipListedFiles(app, allPaths);
	const filename = formatBackupFilename(app.vault.getName(), now, includeTime);
	return writeZipToBackups(app, filename, buffer);
}

/** Full backup used by the manual "Back up now" button: every file in the vault, including `.obsidian`, excluding `.trash` and `_sf-backup/`. */
export async function runFullBackup(app: App, now: Date = new Date()): Promise<string> {
	const allPaths = await listAllFilesRecursive(app, "");
	const buffer = await zipListedFiles(app, allPaths);
	const filename = formatFullBackupFilename(app.vault.getName(), now);
	return writeZipToBackups(app, filename, buffer);
}
