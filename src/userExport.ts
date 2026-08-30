import { EXPORT_ROOT, isExportFolderPath } from "./paths";
import { sanitizeSettingsPresetName } from "./settingsPresets";
import { normalizeVaultPath } from "./writeGuard";
import type { App } from "obsidian";

function pad(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

/** Name used in `yyyy-mm-dd - <name>`: preset, else series, else novel, else a generic fallback. */
export function resolveExportItemName(
	presetName: string,
	seriesTitle: string,
	novelTitle: string,
	fallback = "types & tags",
): string {
	const preset = presetName.trim();
	if (preset) return preset;
	const series = seriesTitle.trim();
	if (series) return series;
	const novel = novelTitle.trim();
	if (novel) return novel;
	return fallback;
}

export function formatDatedExportStem(name: string, when: Date = new Date()): string {
	return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} - ${name}`;
}

/** Filename without `.json` and without a leading `yyyy-mm-dd - ` date stamp. */
export function exportFilenameStem(filename: string): string {
	return filename.replace(/\.json$/i, "").replace(/^\d{4}-\d{2}-\d{2} - /, "");
}

/** Strips any trailing `.json` the user typed so we add exactly one suffix. */
export function withJsonExtension(filename: string): string {
	const without = filename.trim().replace(/(\.json)+$/i, "").trim();
	const safe = sanitizeSettingsPresetName(without);
	return `${safe}.json`;
}

export function userExportPath(filename: string): string {
	return `${EXPORT_ROOT}/${withJsonExtension(filename)}`;
}

export interface UserExportFile {
	path: string;
	name: string;
}

function assertUserExportFilePath(path: string): string {
	const normalized = normalizeVaultPath(path);
	if (
		!isExportFolderPath(normalized) ||
		normalized === EXPORT_ROOT ||
		!normalized.toLowerCase().endsWith(".json") ||
		normalized.slice(EXPORT_ROOT.length + 1).includes("/")
	) {
		throw new Error("Export must be a JSON file inside _export/");
	}
	return normalized;
}

/** Lists flat JSON files in `_export/`, newest filename first. */
export async function listUserExportFiles(app: App): Promise<UserExportFile[]> {
	if (!(await app.vault.adapter.exists(EXPORT_ROOT))) return [];
	const listing = await app.vault.adapter.list(EXPORT_ROOT);
	return listing.files
		.filter((path) => {
			const rest = path.slice(EXPORT_ROOT.length + 1);
			return path.toLowerCase().endsWith(".json") && rest.length > 0 && !rest.includes("/");
		})
		.sort((a, b) => b.localeCompare(a))
		.map((path) => ({
			path,
			name: path.slice(path.lastIndexOf("/") + 1),
		}));
}

export async function readUserExportFile(app: App, path: string): Promise<string> {
	return app.vault.adapter.read(assertUserExportFilePath(path));
}
