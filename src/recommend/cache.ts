import { App, parseYaml, stringifyYaml, TFile } from "obsidian";
import { recommendSidecarFolderPath, recommendSidecarPath } from "../paths";
import { ensureBackstageFolder, writeBackstageFile } from "../writeGuard";
import type { ChapterRecommendReport } from "./types";

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

export function buildRecommendSidecarContent(
	report: ChapterRecommendReport,
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

export function parseRecommendSidecar(raw: string): ChapterRecommendReport | null {
	const fm = parseFrontmatterBlock(raw);
	const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
	if (!jsonMatch) return null;
	try {
		const report = JSON.parse(jsonMatch[1].trim()) as ChapterRecommendReport;
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

export async function writeRecommendCache(
	app: App,
	bookFolderName: string,
	report: ChapterRecommendReport,
	resolvedIds?: string[],
): Promise<void> {
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	const path = recommendSidecarPath(bookFolderName, report.chapterFilename);
	const ids =
		resolvedIds ??
		report.hits.filter((h) => h.resolved).map((h) => h.id);
	// Sweep orphans against current hit ids
	const live = new Set(report.hits.map((h) => h.id));
	const swept = ids.filter((id) => live.has(id));
	const content = buildRecommendSidecarContent(report, swept);
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		const existing = await app.vault.read(file);
		if (existing === content) return;
	}
	await writeBackstageFile(app.vault, path, content);
}

export async function readRecommendCache(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
): Promise<ChapterRecommendReport | null> {
	const path = recommendSidecarPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	return parseRecommendSidecar(await app.vault.cachedRead(file));
}

export function isRecommendCacheFresh(cached: ChapterRecommendReport, contentHash: string): boolean {
	return cached.contentHash === contentHash;
}
