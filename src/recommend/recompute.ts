import { App, TFile } from "obsidian";
import { readChapterPlot } from "../book";
import { libraryChapterPath } from "../paths";
import { analyzeChapter } from "./engine";
import { writeRecommendCache, readRecommendCache } from "./cache";
import { loadHydratedCodexInventory } from "./inventory";
import type { ChapterRecommendReport } from "./types";

export interface RecommendSettingsSlice {
	codexFactSectionByType: Record<string, string>;
	recommendIncludeUnknownNames: boolean;
}

async function prepareChapterAnalysis(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	bookId: string | null,
	settings: RecommendSettingsSlice,
	preferCachedRead: boolean,
): Promise<{ report: ChapterRecommendReport } | null> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;

	const raw = preferCachedRead ? await app.vault.cachedRead(file) : await app.vault.read(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, bookId, settings.codexFactSectionByType);
	const report = analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.recommendIncludeUnknownNames,
	});
	return { report };
}

/** Recomputes and caches a chapter recommend report. */
export async function recomputeChapterRecommend(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	bookId: string | null,
	settings: RecommendSettingsSlice,
): Promise<ChapterRecommendReport | null> {
	const prepared = await prepareChapterAnalysis(app, bookFolderName, chapterFilename, bookId, settings, false);
	if (!prepared) return null;
	await writeRecommendCache(app, bookFolderName, prepared.report);
	return prepared.report;
}

/** Loads cache if still matching a fresh analysis hash; otherwise recomputes and writes. */
export async function loadOrRecomputeChapterRecommend(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	bookId: string | null,
	settings: RecommendSettingsSlice,
): Promise<ChapterRecommendReport | null> {
	const prepared = await prepareChapterAnalysis(app, bookFolderName, chapterFilename, bookId, settings, true);
	if (!prepared) return null;

	const cached = await readRecommendCache(app, bookFolderName, chapterFilename);
	if (cached && cached.contentHash === prepared.report.contentHash) return cached;

	await writeRecommendCache(app, bookFolderName, prepared.report);
	return prepared.report;
}
