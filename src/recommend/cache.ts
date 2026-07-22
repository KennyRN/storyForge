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

export function buildRecommendSidecarContent(report: ChapterRecommendReport): string {
	const frontmatter = {
		chapter: report.chapterFilename,
		contentHash: report.contentHash,
	};
	const yaml = stringifyYaml(frontmatter).trimEnd();
	const body = ["", AUTO_MARKER, "", "```json", JSON.stringify(report), "```", ""].join("\n");
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
		return report;
	} catch {
		return null;
	}
}

export async function writeRecommendCache(
	app: App,
	bookFolderName: string,
	report: ChapterRecommendReport,
): Promise<void> {
	await ensureBackstageFolder(app.vault, recommendSidecarFolderPath(bookFolderName));
	const path = recommendSidecarPath(bookFolderName, report.chapterFilename);
	const content = buildRecommendSidecarContent(report);
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
	return parseRecommendSidecar(await app.vault.read(file));
}

export function isRecommendCacheFresh(cached: ChapterRecommendReport, contentHash: string): boolean {
	return cached.contentHash === contentHash;
}
