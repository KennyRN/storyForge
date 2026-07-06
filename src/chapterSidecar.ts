import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { chapterSidecarFolderPath, chapterSidecarPath } from "./paths";
import { ensureBackstageFolder, modifyBackstageFrontmatter, renameBackstagePath, writeBackstageFile } from "./writeGuard";
import { parseStoredFingerprintFromContent, type Fingerprint } from "./fingerprint";

export { parseStoredFingerprintFromContent };

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

/** Sidecar frontmatter is user-owned; the plugin reads it for display but never rewrites it (aside from the `chapter` key it maintains as the identity anchor). */
export function readChapterSidecarFrontmatter(app: App, bookFolderName: string, chapterFilename: string): Record<string, unknown> | null {
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	return app.metadataCache.getCache(path)?.frontmatter ?? null;
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
	await modifyBackstageFrontmatter(app, app.vault, newPath, buildSidecarContent({ chapter: newFilename }, { opening: "", closing: "" }), (fm) => {
		fm.chapter = newFilename;
	});
}

/** Reads the plugin-maintained opening/closing fingerprint back out of a sidecar file, for reconciliation matching. */
export async function readStoredFingerprint(app: App, bookFolderName: string, chapterFilename: string): Promise<Fingerprint | null> {
	const path = chapterSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	const raw = await app.vault.read(file);
	return parseStoredFingerprintFromContent(raw);
}

export function listSidecarFilenames(app: App, bookFolderName: string): string[] {
	const folder = app.vault.getAbstractFileByPath(chapterSidecarFolderPath(bookFolderName));
	if (!folder || !("children" in folder)) return [];
	const children = (folder as { children: unknown[] }).children;
	return children
		.filter((child): child is TFile => child instanceof TFile && child.extension === "md")
		.map((file) => file.basename + ".md");
}
