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

export type NamedSettingsKind = "themes" | "preferences" | "types-tags" | "threads" | "complete";

export interface SettingsPresetFile {
	name: string;
	path: string;
}

export const SETTINGS_PRESETS_ROOT = `${BACKSTAGE_ROOT}/settings-presets`;
export const NAMED_SETTINGS_ROOT = `${BACKSTAGE_ROOT}/settings`;
export const NAMED_SETTINGS_ARCHIVE_ROOT = `${NAMED_SETTINGS_ROOT}/archived-settings`;
/** @deprecated Use NAMED_SETTINGS_ROOT — named settings now live in `settings/`. */
export const FORMATTING_THEMES_ROOT = NAMED_SETTINGS_ROOT;
/** @deprecated Use NAMED_SETTINGS_ARCHIVE_ROOT. */
export const FORMATTING_THEMES_ARCHIVE_ROOT = NAMED_SETTINGS_ARCHIVE_ROOT;
const LEGACY_THEMES_ROOT = `${BACKSTAGE_ROOT}/themes`;
const LEGACY_FORMATFORGE_PRESETS_ROOT = `${SETTINGS_PRESETS_ROOT}/formatForge`;

export const NAMED_SETTINGS_PREFIX: Record<NamedSettingsKind, string> = {
	themes: "thm-",
	preferences: "pref-",
	"types-tags": "tytg-",
	threads: "thrd-",
	complete: "comp-",
};

const NAMED_SETTINGS_PREFIX_ALIASES: Record<NamedSettingsKind, readonly string[]> = {
	themes: ["thm-", "themes - "],
	preferences: ["pref-", "preferences - "],
	"types-tags": ["tytg-", "types & tags - "],
	threads: ["thrd-", "threads - "],
	complete: ["comp-", "complete - "],
};

const NAMED_SETTINGS_KINDS = Object.keys(NAMED_SETTINGS_PREFIX) as NamedSettingsKind[];

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

function matchingNamedSettingsPrefix(
	filename: string,
): { kind: NamedSettingsKind; prefix: string } | null {
	const lower = filename.toLowerCase();
	let best: { kind: NamedSettingsKind; prefix: string } | null = null;
	for (const kind of NAMED_SETTINGS_KINDS) {
		for (const prefix of NAMED_SETTINGS_PREFIX_ALIASES[kind]) {
			if (
				lower.startsWith(prefix.toLowerCase()) &&
				(!best || prefix.length > best.prefix.length)
			) {
				best = { kind, prefix };
			}
		}
	}
	return best;
}

export function namedSettingsKindOfFilename(filename: string): NamedSettingsKind | null {
	return matchingNamedSettingsPrefix(filename)?.kind ?? null;
}

export function stripNamedSettingsPrefix(filename: string): string {
	const match = matchingNamedSettingsPrefix(filename);
	if (!match) return filename;
	return filename.slice(match.prefix.length);
}

export function withNamedSettingsPrefix(kind: NamedSettingsKind, name: string): string {
	const prefix = NAMED_SETTINGS_PREFIX[kind];
	const safe = sanitizeSettingsPresetName(name);
	const match = matchingNamedSettingsPrefix(safe);
	const rest =
		match?.kind === kind ? sanitizeSettingsPresetName(safe.slice(match.prefix.length)) : safe;
	return `${prefix}${rest}`;
}

export function settingsPresetFolder(owner: SettingsPresetOwner): string {
	return owner === "formatForge" ? NAMED_SETTINGS_ROOT : `${SETTINGS_PRESETS_ROOT}/${owner}`;
}

function ownedPresetFolders(owner: SettingsPresetOwner): string[] {
	if (owner === "formatForge") return ownedFoldersForKind("themes");
	return [settingsPresetFolder(owner)];
}

function ownedFoldersForKind(kind: NamedSettingsKind): string[] {
	if (kind === "themes") {
		return [NAMED_SETTINGS_ROOT, LEGACY_THEMES_ROOT, LEGACY_FORMATFORGE_PRESETS_ROOT];
	}
	return [NAMED_SETTINGS_ROOT];
}

export function namedSettingsPath(kind: NamedSettingsKind, name: string): string {
	return `${NAMED_SETTINGS_ROOT}/${withNamedSettingsPrefix(kind, name)}.json`;
}

export function settingsPresetPath(owner: SettingsPresetOwner, name: string): string {
	if (owner === "formatForge") return namedSettingsPath("themes", name);
	return `${settingsPresetFolder(owner)}/${sanitizeSettingsPresetName(name)}.json`;
}

function displayNameForListedFile(folder: string, filename: string): string {
	if (folder === NAMED_SETTINGS_ROOT) return stripNamedSettingsPrefix(filename);
	return filename;
}

function isListableKindFile(kind: NamedSettingsKind, folder: string, filename: string): boolean {
	if (folder !== NAMED_SETTINGS_ROOT) return kind === "themes";
	const fileKind = namedSettingsKindOfFilename(filename);
	if (fileKind === kind) return true;
	return fileKind === null && kind === "themes";
}

function storedNameForKind(kind: NamedSettingsKind, name: string): string {
	return stripNamedSettingsPrefix(withNamedSettingsPrefix(kind, sanitizeSettingsPresetName(name)));
}

/** Creates or updates a user-named settings file in `_backstage/storyforge/settings/`. */
export async function saveNamedSettings(
	app: App,
	kind: NamedSettingsKind,
	name: string,
	content: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	const safeName = sanitizeSettingsPresetName(name);
	const path = namedSettingsPath(kind, safeName);
	const storedName = storedNameForKind(kind, safeName);
	return enqueueBackstageWrite(path, async () => {
		if (!overwrite && app.vault.getAbstractFileByPath(path)) {
			throw new SettingsPresetExistsError(storedName);
		}
		await writeBackstageFile(app.vault, path, content);
		return { name: storedName, path };
	});
}

/** Creates or updates a user-named settings preset in storyForge backstage. */
export async function saveSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	name: string,
	content: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	if (owner === "formatForge") {
		return saveNamedSettings(app, "themes", name, content, overwrite);
	}
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

export async function listNamedSettings(
	app: App,
	kind: NamedSettingsKind,
): Promise<SettingsPresetFile[]> {
	const seen = new Set<string>();
	const files: SettingsPresetFile[] = [];
	for (const folder of ownedFoldersForKind(kind)) {
		if (!(await app.vault.adapter.exists(folder))) continue;
		const listing = await app.vault.adapter.list(folder);
		for (const path of listing.files.filter((filePath) => filePath.toLowerCase().endsWith(".json"))) {
			const filename = path.slice(path.lastIndexOf("/") + 1, -".json".length);
			if (!isListableKindFile(kind, folder, filename)) continue;
			const name = displayNameForListedFile(folder, filename);
			const key = name.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			files.push({ path, name });
		}
	}
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSettingsPresets(
	app: App,
	owner: SettingsPresetOwner,
): Promise<SettingsPresetFile[]> {
	if (owner === "formatForge") return listNamedSettings(app, "themes");
	const seen = new Set<string>();
	const files: SettingsPresetFile[] = [];
	for (const folder of ownedPresetFolders(owner)) {
		if (!(await app.vault.adapter.exists(folder))) continue;
		const listing = await app.vault.adapter.list(folder);
		for (const path of listing.files.filter((filePath) => filePath.toLowerCase().endsWith(".json"))) {
			const filename = path.slice(path.lastIndexOf("/") + 1, -".json".length);
			const name = displayNameForListedFile(folder, filename);
			const key = name.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			files.push({ path, name });
		}
	}
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readNamedSettings(
	app: App,
	kind: NamedSettingsKind,
	path: string,
): Promise<string> {
	return app.vault.adapter.read(assertNamedSettingsPath(kind, path));
}

export async function readSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	path: string,
): Promise<string> {
	if (owner === "formatForge") return readNamedSettings(app, "themes", path);
	return app.vault.adapter.read(assertOwnedPresetPath(owner, path));
}

function assertNamedSettingsPath(kind: NamedSettingsKind, path: string): string {
	const normalized = normalizeVaultPath(path);
	const folders = ownedFoldersForKind(kind);
	const folder = folders.find(
		(root) =>
			normalized.startsWith(`${root}/`) &&
			!normalized.slice(root.length + 1).includes("/") &&
			normalized.toLowerCase().endsWith(".json"),
	);
	if (!folder) {
		throw new Error(`Settings preset must be a JSON file inside ${NAMED_SETTINGS_ROOT}/`);
	}
	if (folder === NAMED_SETTINGS_ROOT) {
		const filename = normalized.slice(folder.length + 1, -".json".length);
		const fileKind = namedSettingsKindOfFilename(filename);
		if (fileKind ? fileKind !== kind : kind !== "themes") {
			throw new Error(`Settings preset must be a JSON file inside ${NAMED_SETTINGS_ROOT}/`);
		}
	} else if (kind !== "themes") {
		throw new Error(`Settings preset must be a JSON file inside ${NAMED_SETTINGS_ROOT}/`);
	}
	return normalized;
}

function assertOwnedPresetPath(owner: SettingsPresetOwner, path: string): string {
	if (owner === "formatForge") return assertNamedSettingsPath("themes", path);
	const normalized = normalizeVaultPath(path);
	const folders = ownedPresetFolders(owner);
	const folder = folders.find(
		(root) =>
			normalized.startsWith(`${root}/`) &&
			!normalized.slice(root.length + 1).includes("/") &&
			normalized.toLowerCase().endsWith(".json"),
	);
	if (!folder) {
		throw new Error(`Settings preset must be a JSON file inside ${settingsPresetFolder(owner)}/`);
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

export async function renameNamedSettings(
	app: App,
	kind: NamedSettingsKind,
	path: string,
	newName: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	const oldPath = assertNamedSettingsPath(kind, path);
	const safeName = sanitizeSettingsPresetName(newName);
	const newPath = namedSettingsPath(kind, safeName);
	const storedName = storedNameForKind(kind, safeName);
	if (newPath === oldPath) return { name: storedName, path: oldPath };
	if (oldPath.toLowerCase() === newPath.toLowerCase()) {
		await enqueueRenamePaths(oldPath, newPath, () =>
			renameBackstagePath(app.vault, oldPath, newPath),
		);
		return { name: storedName, path: newPath };
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
			throw new SettingsPresetExistsError(storedName);
		}
		if (!existingPath) {
			await renameBackstagePath(app.vault, oldPath, newPath);
			return { name: storedName, path: newPath };
		}
		const content = await app.vault.adapter.read(oldPath);
		await writeBackstageFile(app.vault, newPath, content);
		await deleteBackstagePath(app, oldPath);
		return { name: storedName, path: newPath };
	});
}

export async function renameSettingsPreset(
	app: App,
	owner: SettingsPresetOwner,
	path: string,
	newName: string,
	overwrite = false,
): Promise<SettingsPresetFile> {
	if (owner === "formatForge") {
		return renameNamedSettings(app, "themes", path, newName, overwrite);
	}
	const oldPath = assertOwnedPresetPath(owner, path);
	const safeName = sanitizeSettingsPresetName(newName);
	const newPath = settingsPresetPath(owner, safeName);
	if (newPath === oldPath) return { name: safeName, path: oldPath };
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
			await renameBackstagePath(app.vault, oldPath, newPath);
			return { name: safeName, path: newPath };
		}
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

function uniqueNamedSettingsArchivePath(app: App, filename: string): string {
	const dest = `${NAMED_SETTINGS_ARCHIVE_ROOT}/${filename}`;
	if (!app.vault.getAbstractFileByPath(dest)) return dest;
	const base = filename.replace(/\.json$/i, "");
	for (let n = 2; n < 1000; n++) {
		const candidate = `${NAMED_SETTINGS_ARCHIVE_ROOT}/${base} (${n}).json`;
		if (!app.vault.getAbstractFileByPath(candidate)) return candidate;
	}
	return `${NAMED_SETTINGS_ARCHIVE_ROOT}/${base} ${Date.now()}.json`;
}

/** Moves a named settings file into `settings/archived-settings/` instead of trashing it. */
export async function archiveNamedSettings(
	app: App,
	kind: NamedSettingsKind,
	path: string,
): Promise<void> {
	const oldPath = assertNamedSettingsPath(kind, path);
	const filename = oldPath.slice(oldPath.lastIndexOf("/") + 1);
	const dest = uniqueNamedSettingsArchivePath(app, filename);
	await enqueueRenamePaths(oldPath, dest, () => renameBackstagePath(app.vault, oldPath, dest));
}

/** Moves a named formatForge theme into `settings/archived-settings/` instead of trashing it. */
export async function archiveFormattingTheme(app: App, path: string): Promise<void> {
	return archiveNamedSettings(app, "themes", path);
}
