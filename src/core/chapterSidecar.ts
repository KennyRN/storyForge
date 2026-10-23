import { chapterSidecarFolderPath, chapterSidecarPath } from "./paths";
import { editFrontmatter, readFrontmatter, splitFrontmatterSection, stringifyFrontmatterBlock } from "./frontmatter";
import type { Fingerprint } from "./fingerprint";
import type { Project } from "./project";

const AUTO_MARKER = "<!-- AUTO-MAINTAINED BELOW — do not edit, the plugin overwrites it -->";

/** The text of a chapter sidecar: frontmatter, then the plugin-owned opening/closing fingerprint. */
export function buildSidecarContent(frontmatter: Record<string, unknown>, fingerprint: Fingerprint): string {
	return stringifyFrontmatterBlock(frontmatter) + sidecarBody(fingerprint);
}

function sidecarBody(fingerprint: Fingerprint): string {
	return ["", AUTO_MARKER, "", "## opening", fingerprint.opening, "", "## closing", fingerprint.closing, ""].join("\n");
}

/**
 * Rewrites only the plugin-owned body (opening/closing fingerprint). The sidecar's frontmatter is
 * left exactly as it is (user keys, comments and all) apart from making sure `chapter` names this
 * chapter. Nothing is written when the result would be identical.
 */
export async function updateChapterFingerprint(
	project: Project,
	bookFolderName: string,
	chapterFilename: string,
	fingerprint: Fingerprint,
): Promise<void> {
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	await project.createFolder(chapterSidecarFolderPath(bookFolderName));
	await project.updateText(path, (current) => {
		const withChapter = editFrontmatter(current ?? "", (fm) => {
			fm.chapter = chapterFilename;
		}, path);
		const section = splitFrontmatterSection(withChapter);
		const frontmatter = section ? section.frontmatter : stringifyFrontmatterBlock({ chapter: chapterFilename });
		return frontmatter + sidecarBody(fingerprint);
	});
}

/** Follows a chapter rename: moves the sidecar file and updates its `chapter` identity key. */
export async function renameChapterSidecar(
	project: Project,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const oldPath = chapterSidecarPath(bookFolderName, oldFilename);
	const newPath = chapterSidecarPath(bookFolderName, newFilename);
	if (!project.isFile(oldPath)) return;
	await project.rename(oldPath, newPath);
	if (readFrontmatter(await project.readText(newPath)).state === "unreadable") return;
	await project.modifyFrontmatter(newPath, "", (fm) => {
		fm.chapter = newFilename;
	});
}

/** Retires the fingerprint sidecar for a chapter (e.g. after the chapter file is deleted). */
export async function deleteChapterSidecar(project: Project, bookFolderName: string, chapterFilename: string): Promise<void> {
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	if (project.exists(path)) await project.retire(path);
}

/** Reads the opening and closing fingerprint back out of a sidecar's text (what `sidecarBody` wrote). */
export function parseSidecarFingerprint(text: string): Fingerprint | null {
	const opening = /(?:^|\n)## opening\r?\n([\s\S]*?)(?:\r?\n\r?\n## closing\r?\n|\r?\n## closing\r?\n)/.exec(text);
	const closing = /(?:^|\n)## closing\r?\n([\s\S]*?)(?:\r?\n)*$/.exec(text);
	if (!opening || !closing) return null;
	return { opening: opening[1].trim(), closing: closing[1].trim() };
}

/** The stored fingerprint for a chapter, or null if it has no readable sidecar. */
export async function readChapterFingerprint(project: Project, bookFolderName: string, chapterFilename: string): Promise<Fingerprint | null> {
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	if (!project.isFile(path)) return null;
	return parseSidecarFingerprint(await project.readText(path));
}
