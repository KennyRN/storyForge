import { App, TFile } from "obsidian";
import { readChapterPlot } from "../book";
import { libraryChapterPath } from "../paths";
import { analyzeChapter } from "./engine";
import { writeRecommendCache, readRecommendCache, isRecommendCacheFresh } from "./cache";
import { loadHydratedCodexInventory } from "./inventory";
import type { ChapterRecommendReport } from "./types";

export interface RecommendSettingsSlice {
	codexFactSectionByType: Record<string, string>;
	recommendIncludeUnknownNames: boolean;
}

function analyzeFresh(
	raw: string,
	existingPlot: string,
	entries: Awaited<ReturnType<typeof loadHydratedCodexInventory>>,
	chapterFilename: string,
	settings: RecommendSettingsSlice,
): ChapterRecommendReport {
	return analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.recommendIncludeUnknownNames,
	});
}

/** Recomputes and caches a chapter recommend report. */
export async function recomputeChapterRecommend(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	bookId: string | null,
	settings: RecommendSettingsSlice,
): Promise<ChapterRecommendReport | null> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;

	const raw = await app.vault.read(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, bookId, settings.codexFactSectionByType);
	const report = analyzeFresh(raw, existingPlot, entries, chapterFilename, settings);
	await writeRecommendCache(app, bookFolderName, report);
	return report;
}

/** Loads cache if still matching a fresh analysis hash; otherwise recomputes and writes. */
export async function loadOrRecomputeChapterRecommend(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	bookId: string | null,
	settings: RecommendSettingsSlice,
): Promise<ChapterRecommendReport | null> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;

	const raw = await app.vault.cachedRead(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, bookId, settings.codexFactSectionByType);
	const fresh = analyzeFresh(raw, existingPlot, entries, chapterFilename, settings);

	const cached = await readRecommendCache(app, bookFolderName, chapterFilename);
	if (cached && isRecommendCacheFresh(cached, fresh.contentHash)) return cached;

	await writeRecommendCache(app, bookFolderName, fresh);
	return fresh;
}
