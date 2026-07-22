export const LIBRARY_ROOT = "_sf-storylibrary";
export const CODEX_ROOT = "Codex";
export const BACKSTAGE_ROOT = "_sf-backstage";

export function seriesFilePath(): string {
	return `${BACKSTAGE_ROOT}/series.md`;
}

export function codexFilePath(): string {
	return `${BACKSTAGE_ROOT}/codex.md`;
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

export function bookFilePath(bookFolderName: string): string {
	return `${bookBackstagePath(bookFolderName)}/novel.md`;
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
