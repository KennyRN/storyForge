import type { App } from "obsidian";
import { BACKSTAGE_ROOT } from "./paths";
import {
	deleteBackstagePath,
	enqueueBackstageWrite,
	normalizeVaultPath,
	renameBackstagePath,
	writeBackstageFile,
} from "./writeGuard";

export type SettingsPresetOwner = "formatForge" | "storyForge";

export interface SettingsPresetFile {
	name: string;
	path: string;
}

export const SETTINGS_PRESETS_ROOT = `${BACKSTAGE_ROOT}/settings-presets`;

const ILLEGAL_PRESET_CHARS = /[\\/:*?"<>|]/g;

export class SettingsPresetExistsError extends Error {
	constructor(name: string) {
		super(`A settings preset named "${name}" already exists`);
		this.name = "SettingsPresetExistsError";
	}
}

export function sanitizeSettingsPresetName(rawName: string): string {
	const safe = rawName
		.trim()
		.replace(ILLEGAL_PRESET_CHARS, "-")
		.replace(/\s+/g, " ")
		.replace(/^[.\s]+|[.\s]+$/g, "")
		.slice(0, 100)
		.trim();
	if (!safe) throw new Error("Enter a name for this settings preset");
	return safe;
}

export function settingsPresetFolder(owner: SettingsPresetOwner): string {
	return `${SETTINGS_PRESETS_ROOT}/${owner}`;
}

export function settingsPresetPath(owner: SettingsPresetOwner, name: string): string {
	return `${settingsPresetFolder(owner)}/${sanitizeSettingsPresetName(name)}.json`;
}

/** Creates or updates a user-named settings preset in storyForge backstage. */
export async function saveSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	name: string,
	content: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	const safeName = sanitizeSettingsPresetName(name);
	const path = settingsPresetPath(owner, safeName);
	return enqueueBackstageWrite(path, async () => {
		if (!overwrite && app.vault.getAbstractFileByPath(path)) {
			throw new SettingsPresetExistsError(safeName);
		}
		await writeBackstageFile(app.vault, path, content);
		return { name: safeName, path };
	});
}

export async function listSettingsPresets(
	app: App,
	owner: SettingsPresetOwner,
): Promise<SettingsPresetFile[]> {
	const folder = settingsPresetFolder(owner);
	if (!(await app.vault.adapter.exists(folder))) return [];
	const listing = await app.vault.adapter.list(folder);
	return listing.files
		.filter((path) => path.toLowerCase().endsWith(".json"))
		.map((path) => ({
			path,
			name: path.slice(path.lastIndexOf("/") + 1, -".json".length),
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	path: string,
): Promise<string> {
	return app.vault.adapter.read(assertOwnedPresetPath(owner, path));
}

function assertOwnedPresetPath(owner: SettingsPresetOwner, path: string): string {
	const normalized = normalizeVaultPath(path);
	const folder = settingsPresetFolder(owner);
	if (
		!normalized.startsWith(`${folder}/`) ||
		normalized.slice(folder.length + 1).includes("/") ||
		!normalized.toLowerCase().endsWith(".json")
	) {
		throw new Error(`Settings preset must be a JSON file inside ${folder}/`);
	}
	return normalized;
}

/**
 * Serializes a task against both endpoints of a rename. Locks are always taken in
 * path order so two concurrent renames of the same pair cannot deadlock each other.
 */
function enqueueRenamePaths<T>(a: string, b: string, task: () => Promise<T>): Promise<T> {
	const [first, second] = a < b ? [a, b] : [b, a];
	return enqueueBackstageWrite(first, () => enqueueBackstageWrite(second, task));
}

export async function renameSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	path: string,
	newName: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	const oldPath = assertOwnedPresetPath(owner, path);
	const safeName = sanitizeSettingsPresetName(newName);
	const newPath = settingsPresetPath(owner, safeName);
	if (newPath === oldPath) return { name: safeName, path: oldPath };
	// Case-only renames must use vault.rename. Copy/delete would trash the only
	// file on case-insensitive filesystems (common on macOS).
	if (oldPath.toLowerCase() === newPath.toLowerCase()) {
		await enqueueRenamePaths(oldPath, newPath, () =>
			renameBackstagePath(app.vault, oldPath, newPath),
		);
		return { name: safeName, path: newPath };
	}
	return enqueueRenamePaths(oldPath, newPath, async () => {
		const existing = app.vault.getAbstractFileByPath(newPath);
		const existingPath =
			existing && typeof (existing as { path?: unknown }).path === "string"
				? ((existing as { path: string }).path)
				: null;
		if (
			existingPath &&
			existingPath.toLowerCase() !== oldPath.toLowerCase() &&
			!overwrite
		) {
			throw new SettingsPresetExistsError(safeName);
		}
		if (!existingPath) {
			// One move instead of copy-then-delete: a failed delete can no longer leave
			// the preset visible under both names.
			await renameBackstagePath(app.vault, oldPath, newPath);
			return { name: safeName, path: newPath };
		}
		// Overwriting a different preset: vault.rename refuses an occupied target, so
		// replace its contents first and only then drop the source.
		const content = await app.vault.adapter.read(oldPath);
		await writeBackstageFile(app.vault, newPath, content);
		await deleteBackstagePath(app, oldPath);
		return { name: safeName, path: newPath };
	});
}

export async function deleteSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	path: string,
): Promise<void> {
	const ownedPath = assertOwnedPresetPath(owner, path);
	await enqueueBackstageWrite(ownedPath, () => deleteBackstagePath(app, ownedPath));
}
