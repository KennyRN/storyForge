import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { storyContextSidecarFolderPath, storyContextSidecarPath } from "../paths";
import {
	deleteBackstagePath,
	ensureBackstageFolder,
	enqueueBackstageWrite,
	renameBackstagePath,
	writeBackstageFile,
} from "../writeGuard";
import type { ChapterStoryContextReport } from "./types";

const AUTO_MARKER = "<!-- AUTO-MAINTAINED — do not edit, the plugin overwrites it -->";

function parseFrontmatterBlock(raw: string): Record<string, unknown> {
	if (!raw.startsWith("---")) return {};
	const end = raw.indexOf("\n---", 3);
	if (end === -1) return {};
	const yamlText = raw.slice(3, end).trim();
	if (yamlText.length === 0) return {};
	const parsed = parseYaml(yamlText) as Record<string, unknown> | null;
	return parsed ?? {};
}

export function buildStoryContextSidecarContent(
	report: ChapterStoryContextReport,
	resolvedIds: string[] = [],
): string {
	const frontmatter = {
		chapter: report.chapterFilename,
		contentHash: report.contentHash,
		resolvedIds,
	};
	const yaml = stringifyYaml(frontmatter).trimEnd();
	const payload = { ...report, resolvedIds };
	const body = ["", AUTO_MARKER, "", "```json", JSON.stringify(payload), "```", ""].join("\n");
	return `---\n${yaml}\n---\n${body}`;
}

export function parseStoryContextSidecar(raw: string): ChapterStoryContextReport | null {
	const fm = parseFrontmatterBlock(raw);
	const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
	if (!jsonMatch) return null;
	try {
		const report = JSON.parse(jsonMatch[1].trim()) as ChapterStoryContextReport;
		if (typeof report.chapterFilename !== "string") return null;
		if (typeof fm.contentHash === "string") report.contentHash = fm.contentHash;
		if (!Array.isArray(report.hits)) report.hits = [];
		if (!Array.isArray(report.unknownNameHints)) report.unknownNameHints = [];
		if (!Array.isArray(report.sentenceKeys)) report.sentenceKeys = [];
		const resolvedIds = Array.isArray(fm.resolvedIds)
			? fm.resolvedIds.filter((x): x is string => typeof x === "string")
			: Array.isArray((report as unknown as { resolvedIds?: string[] }).resolvedIds)
				? ((report as unknown as { resolvedIds: string[] }).resolvedIds)
				: [];
		const live = new Set(report.hits.map((h) => h.id));
		const swept = resolvedIds.filter((id) => live.has(id));
		for (const hit of report.hits) {
			hit.resolved = swept.includes(hit.id);
		}
		return report;
	} catch {
		return null;
	}
}

export async function writeStoryContextCache(
	app: App,
	bookFolderName: string,
	report: ChapterStoryContextReport,
	resolvedIds?: string[],
): Promise<void> {
	const path = storyContextSidecarPath(bookFolderName, report.chapterFilename);
	// Shares the sidecar path with the resolved/decision writers, so the compare-then-write
	// has to run inside the same queue to avoid clobbering a concurrent resolve.
	await enqueueBackstageWrite(path, async () => {
		await ensureBackstageFolder(app.vault, storyContextSidecarFolderPath(bookFolderName));
		const ids =
			resolvedIds ??
			report.hits.filter((h) => h.resolved).map((h) => h.id);
		// Sweep orphans against current hit ids
		const live = new Set(report.hits.map((h) => h.id));
		const swept = ids.filter((id) => live.has(id));
		const content = buildStoryContextSidecarContent(report, swept);
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			const existing = await app.vault.read(file);
			if (existing === content) return;
		}
		await writeBackstageFile(app.vault, path, content);
	});
}

export async function readStoryContextCache(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
): Promise<ChapterStoryContextReport | null> {
	const path = storyContextSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	return parseStoryContextSidecar(await app.vault.cachedRead(file));
}

export function isStoryContextCacheFresh(cached: ChapterStoryContextReport, contentHash: string): boolean {
	return cached.contentHash === contentHash;
}

/** Follows a chapter rename: moves the Story Context cache sidecar to the new chapter filename. */
export async function renameStoryContextSidecar(
	app: App,
	bookFolderName: string,
	oldFilename: string,
	newFilename: string,
): Promise<void> {
	const oldPath = storyContextSidecarPath(bookFolderName, oldFilename);
	const newPath = storyContextSidecarPath(bookFolderName, newFilename);
	const file = app.vault.getAbstractFileByPath(oldPath);
	if (!(file instanceof TFile)) return;
	await renameBackstagePath(app.vault, oldPath, newPath);
}

/** Deletes the Story Context cache sidecar for a chapter (e.g. after the chapter file is deleted). */
export async function deleteStoryContextCache(app: App, bookFolderName: string, chapterFilename: string): Promise<void> {
	await deleteBackstagePath(app, storyContextSidecarPath(bookFolderName, chapterFilename));
}
