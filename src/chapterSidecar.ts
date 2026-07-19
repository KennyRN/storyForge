import { App, parseYaml, stringifyYaml, TFile, type FrontMatterCache } from "obsidian";
import { chapterSidecarFolderPath, chapterSidecarPath } from "./paths";
import { ensureBackstageFolder, modifyBackstageFrontmatter, renameBackstagePath, writeBackstageFile } from "./writeGuard";
import type { Fingerprint } from "./fingerprint";

/** The raw on-disk shape of a chapter sidecar file's frontmatter, as read/written through `modifyBackstageFrontmatter`. */
interface RawSidecarFrontmatter extends FrontMatterCache {
	chapter?: unknown;
}

const AUTO_MARKER = "<!-- AUTO-MAINTAINED BELOW — do not edit, the plugin overwrites it -->";

function parseFrontmatterBlock(raw: string): Record<string, unknown> {
	if (!raw.startsWith("---")) return {};
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return {};
	const yamlText = raw.slice(3, end).trim();
	if (yamlText.length === 0) return {};
	const parsed = parseYaml(yamlText) as Record<string, unknown> | null;
	return parsed ?? {};
}

export function buildSidecarContent(frontmatter: Record<string, unknown>, fingerprint: Fingerprint): string {
	const yaml = stringifyYaml(frontmatter).trimEnd();
	const body = [
		"",
		AUTO_MARKER,
		"",
		"## opening",
		fingerprint.opening,
		"",
		"## closing",
		fingerprint.closing,
		"",
	].join("\n");
	return `---\n${yaml}\n---\n${body}`;
}

/** Rewrites only the plugin-owned body (opening/closing fingerprint), preserving user frontmatter untouched. */
export async function updateChapterFingerprint(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	fingerprint: Fingerprint,
): Promise<void> {
	await ensureBackstageFolder(app.vault, chapterSidecarFolderPath(bookFolderName));
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	let frontmatter: Record<string, unknown> = { chapter: chapterFilename };
	if (file instanceof TFile) {
		const raw = await app.vault.read(file);
		frontmatter = { ...parseFrontmatterBlock(raw), chapter: chapterFilename };
		const content = buildSidecarContent(frontmatter, fingerprint);
		// Typing pauses fire this on every debounce tick; skip the write when the
		// fingerprint hasn't actually changed, so idle re-checks don't touch disk.
		if (content === raw) return;
		await writeBackstageFile(app.vault, path, content);
		return;
	}
	const content = buildSidecarContent(frontmatter, fingerprint);
	await writeBackstageFile(app.vault, path, content);
}

/** Follows a chapter rename: moves the sidecar file and updates its `chapter` identity key. */
export async function renameChapterSidecar(
	app: App,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const oldPath = chapterSidecarPath(bookFolderName, oldFilename);
	const newPath = chapterSidecarPath(bookFolderName, newFilename);
	const file = app.vault.getAbstractFileByPath(oldPath);
	if (!(file instanceof TFile)) return;
	await renameBackstagePath(app.vault, oldPath, newPath);
	await modifyBackstageFrontmatter<RawSidecarFrontmatter>(app, app.vault, newPath, buildSidecarContent({ chapter: newFilename }, { opening: "", closing: "" }), (fm) => {
		fm.chapter = newFilename;
	});
}
