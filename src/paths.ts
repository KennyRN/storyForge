export const LIBRARY_ROOT = "_story-library";
/** Intentionally un-prefixed (unlike the `_sf-`/`_story-`/`_backstage` roots) — the user-facing folder of wikilink-target notes the writer reads and edits directly, so it presents as an ordinary vault folder rather than plugin plumbing. */
export const CODEX_ROOT = "Codex";
/** Nested under a shared `_backstage/` parent — room for sibling xForge plugins to keep their own non-content state alongside storyForge's, each in its own subfolder, rather than each plugin claiming a vault-root name for itself. */
export const BACKSTAGE_ROOT = "_backstage/storyforge";
/** titleForge's own sibling region under the shared `_backstage/` parent — deliberately not nested under `BACKSTAGE_ROOT`, since titleForge is an extraction-ready subplugin (see `src/titleforge/README.md`), not storyForge bookkeeping. */
export const TITLEFORGE_BACKSTAGE_ROOT = "_backstage/titleforge";
/** Vault-root folder where backup zip files are written (Obsidian vault API only — no Node `fs`). Always excluded from backup zips. */
export const BACKUPS_FOLDER = "_sf-backup";
/** Vault-root folder for user-facing shareable JSON copies (types & tags, later other settings). Distinct from `_sf-backup/` dated archives and from `_backstage/storyforge/settings/` named presets. */
export const EXPORT_ROOT = "_export";

/** True if `path` is the backup folder or anything inside it. */
export function isBackupFolderPath(path: string): boolean {
	return path === BACKUPS_FOLDER || path.startsWith(`${BACKUPS_FOLDER}/`);
}

/** True if `path` is the export folder or anything inside it. */
export function isExportFolderPath(path: string): boolean {
	return path === EXPORT_ROOT || path.startsWith(`${EXPORT_ROOT}/`);
}

/** `series.md` lives at the story-library root, alongside the `novel-<code>.md` files — a deliberate exception to "library root is prose-only", carved out narrowly in writeGuard.ts. */
export function seriesFilePath(): string {
	return `${LIBRARY_ROOT}/series.md`;
}

export function codexFilePath(): string {
	return `${BACKSTAGE_ROOT}/codex.md`;
}

/** Vault-wide registry of user-editable Codex types, chapter tags, novel tags, and the icon catalog they draw from. */
export function tagRegistryFilePath(): string {
	return `${BACKSTAGE_ROOT}/tag-registry.md`;
}

/** Vault-wide registry of named plot threads (colour + name) chapters can belong to. */
export function plotThreadsFilePath(): string {
	return `${BACKSTAGE_ROOT}/plot-threads.md`;
}

/** True if `path` is a flat `.md` note directly inside `Codex/` (no nested segments — Codex folders are virtual, not real). */
export function isCodexNotePath(path: string): boolean {
	const prefix = `${CODEX_ROOT}/`;
	if (!path.startsWith(prefix)) return false;
	const rest = path.slice(prefix.length);
	return rest.length > 0 && !rest.includes("/") && rest.toLowerCase().endsWith(".md");
}

export function bookBackstagePath(bookFolderName: string): string {
	return `${BACKSTAGE_ROOT}/${bookFolderName}`;
}

/** Where the series' own cover image lives — `_series`, distinct from any book folder name (those
 * are always plain lowercase letter codes from nextNovelCode, never leading with `_`). */
export function seriesBackstagePath(): string {
	return `${BACKSTAGE_ROOT}/_series`;
}

/** `novel-<code>.md` lives flat at the story-library root — a sibling of the book's `<code>/` chapter folder, not inside it, so that folder holds only user-created manuscript files. */
export function bookFilePath(bookFolderName: string): string {
	return `${LIBRARY_ROOT}/novel-${bookFolderName}.md`;
}

/** Legacy v1 shared wordcount file (all books). Migrated into per-book files. */
export function wordCountFilePath(): string {
	return `${BACKSTAGE_ROOT}/wordcount.md`;
}

/** Per-book v2 wordcount YAML. */
export function bookWordCountFilePath(bookFolderName: string): string {
	return `${bookBackstagePath(bookFolderName)}/wordcount.md`;
}

export function chapterSidecarFolderPath(bookFolderName: string): string {
	return `${bookBackstagePath(bookFolderName)}/chapters`;
}

export function chapterSidecarPath(bookFolderName: string, chapterFilename: string): string {
	return `${chapterSidecarFolderPath(bookFolderName)}/${chapterFilename}`;
}

export function recommendSidecarFolderPath(bookFolderName: string): string {
	return `${bookBackstagePath(bookFolderName)}/recommend`;
}

export function recommendSidecarPath(bookFolderName: string, chapterFilename: string): string {
	return `${recommendSidecarFolderPath(bookFolderName)}/${chapterFilename}`;
}

/** Book-scoped attribution decisions (confirm/reject coref) for Story Context. */
export function recommendAttributionPath(bookFolderName: string): string {
	return `${recommendSidecarFolderPath(bookFolderName)}/attribution.md`;
}

/** Book-scoped ignored unknown names for Story Context (“Named but not in Codex”). */
export function recommendIgnoredNamesPath(bookFolderName: string): string {
	return `${recommendSidecarFolderPath(bookFolderName)}/ignored-names.md`;
}

export function libraryBookPath(bookFolderName: string): string {
	return `${LIBRARY_ROOT}/${bookFolderName}`;
}

export function libraryChapterPath(bookFolderName: string, chapterFilename: string): string {
	return `${libraryBookPath(bookFolderName)}/${chapterFilename}`;
}

/** True if `path` is a chapter file directly inside a book's library folder (flat, no recursion). */
export function isLibraryChapterPath(path: string): boolean {
	const prefix = `${LIBRARY_ROOT}/`;
	if (!path.startsWith(prefix)) return false;
	const rest = path.slice(prefix.length);
	const segments = rest.split("/");
	return segments.length === 2 && segments[1].toLowerCase().endsWith(".md");
}

/**
 * True if `path` is any flat file directly at the library root (no nested
 * segments) — the write-guard allowance covering `series.md`,
 * `novel-<code>.md`, and any other library-root bookkeeping file, distinct
 * from a chapter (which sits one segment deeper, inside a `<code>/` folder)
 * or anything else nested inside a book folder.
 *
 * Requires a `.` in the remainder so a bare book-code folder itself (e.g.
 * `_story-library/TECa`, one segment, no extension — book codes from
 * `nextNovelCode` are plain letter sequences, never containing a `.`) is
 * never mistaken for an allowed root file: that folder, and everything in
 * it, must stay write-guard protected.
 */
export function isLibraryRootFilePath(path: string): boolean {
	const prefix = `${LIBRARY_ROOT}/`;
	if (!path.startsWith(prefix)) return false;
	const rest = path.slice(prefix.length);
	return rest.length > 0 && !rest.includes("/") && rest.includes(".");
}

/** Extracts the book folder name from a library chapter path, or null if not a chapter path. */
export function bookFolderNameFromChapterPath(path: string): string | null {
	if (!isLibraryChapterPath(path)) return null;
	const prefix = `${LIBRARY_ROOT}/`;
	const rest = path.slice(prefix.length);
	return rest.split("/")[0];
}

export function chapterFilenameFromPath(path: string): string | null {
	if (!isLibraryChapterPath(path)) return null;
	const segments = path.split("/");
	return segments[segments.length - 1];
}

/** True for backstage paths whose churn shouldn't trigger a view re-render —
 * wordcount.md is rewritten on every keystroke's debounce tick, and chapter
 * sidecars are rewritten on every fingerprint check, so re-rendering on these
 * would defeat the point of debouncing in the first place. */
export function isBackstageBookkeepingPath(path: string): boolean {
	if (!path.startsWith(`${BACKSTAGE_ROOT}/`)) return false;
	if (path === wordCountFilePath()) return true;
	if (path.endsWith("/wordcount.md")) return true;
	if (path.includes("/chapters/")) return true;
	return path.includes("/recommend/");
}
