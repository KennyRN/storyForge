import { normalizePath, type App } from "obsidian";
import { zipSync, type Zippable } from "fflate";
import { BACKUPS_FOLDER, isBackupFolderPath } from "./paths";
import {
	enqueueBackstageWrite,
	normalizeVaultPath,
	writeBackupBinary,
	writeBackupText,
} from "./writeGuard";

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

/** Builds the timestamped JSON filename used for formatForge settings exports. */
export function formatFormattingExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - formatForge settings.json`;
}

export function formatStoryForgeSettingsExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - storyForge settings.json`;
}

export function formatTypesTagsExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - types & tags settings.json`;
}

/**
 * Never written to disk — a synthetic key so every settings export shares one
 * `enqueueBackstageWrite` serialization lane. That's what stops two concurrent exports
 * from both probing the same "does this filename exist yet" state and picking the same
 * unique suffix. Do not point this at (or expect it to name) a real file under `${BACKUPS_FOLDER}/`.
 */
const SETTINGS_EXPORT_UNIQUENESS_LOCK_KEY = `${BACKUPS_FOLDER}/.settings-export-uniqueness-lock`;

async function writeUniqueSettingsExport(
	app: App,
	filename: string,
	content: string,
): Promise<string> {
	return enqueueBackstageWrite(SETTINGS_EXPORT_UNIQUENESS_LOCK_KEY, async () => {
		const separator = " - ";
		const splitAt = filename.indexOf(separator);
		const timestamp = filename.slice(0, splitAt);
		const label = filename.slice(splitAt);
		let attempt = 0;
		let vaultPath = "";
		do {
			const suffix = attempt === 0 ? "" : `-${pad(attempt, 3)}`;
			vaultPath = normalizePath(`${BACKUPS_FOLDER}/${timestamp}${suffix}${label}`);
			attempt++;
		} while (app.vault.getAbstractFileByPath(vaultPath));
		await writeBackupText(app.vault, vaultPath, content);
		return vaultPath;
	});
}

/** Saves a formatForge settings document inside storyForge's vault-local backup folder. */
export async function writeFormattingExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(
		app,
		formatFormattingExportFilename(when),
		content,
	);
}

/** Saves a complete storyForge settings document beside other vault-local backups. */
export async function writeStoryForgeSettingsExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(
		app,
		formatStoryForgeSettingsExportFilename(when),
		content,
	);
}

/** Saves a types & tags settings document beside other vault-local backups. */
export async function writeTypesTagsExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(
		app,
		formatTypesTagsExportFilename(when),
		content,
	);
}

export function formatPlotThreadsExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - plot threads settings.json`;
}

export function formatPreferencesExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - preferences settings.json`;
}

export function formatCompleteExportFilename(when: Date): string {
	const datePart = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
	const timePart = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
	return `${datePart}-${timePart} - complete settings.json`;
}

/** Saves a complete settings document beside other vault-local backups. */
export async function writeCompleteExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(app, formatCompleteExportFilename(when), content);
}

/** Saves a preferences settings document beside other vault-local backups. */
export async function writePreferencesExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(app, formatPreferencesExportFilename(when), content);
}

/** Saves a plot-threads settings document beside other vault-local backups. */
export async function writePlotThreadsExportToBackups(
	app: App,
	content: string,
	when: Date = new Date(),
): Promise<string> {
	return writeUniqueSettingsExport(app, formatPlotThreadsExportFilename(when), content);
}

export interface SettingsExportFile {
	path: string;
	name: string;
}

/** Lists JSON settings exports in `_sf-backup/`, newest filename first. */
export async function listSettingsExportsInBackups(app: App): Promise<SettingsExportFile[]> {
	if (!(await app.vault.adapter.exists(BACKUPS_FOLDER))) return [];
	const listing = await app.vault.adapter.list(BACKUPS_FOLDER);
	return listing.files
		.filter((path) => path.toLowerCase().endsWith(" settings.json"))
		.sort((a, b) => b.localeCompare(a))
		.map((path) => ({
			path,
			name: path.slice(path.lastIndexOf("/") + 1),
		}));
}

/** Reads one JSON settings export after constraining it to `_sf-backup/`. */
export async function readSettingsExportFromBackups(app: App, path: string): Promise<string> {
	// Collapse `.` / `..` before the folder prefix check so callers cannot escape
	// `_sf-backup/` through Obsidian's lighter normalizePath.
	let normalized: string;
	try {
		normalized = normalizeVaultPath(path);
	} catch {
		throw new Error("Settings export must be a JSON file inside the storyForge backup folder");
	}
	if (
		!isBackupFolderPath(normalized) ||
		normalized === BACKUPS_FOLDER ||
		!normalized.toLowerCase().endsWith(" settings.json") ||
		normalized.slice(BACKUPS_FOLDER.length + 1).includes("/")
	) {
		throw new Error("Settings export must be a JSON file inside the storyForge backup folder");
	}
	return app.vault.adapter.read(normalized);
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
