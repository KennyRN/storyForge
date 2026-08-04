import { App, TFile } from "obsidian";
import { readBookFrontmatter, readChapterPlot } from "../book";
import { libraryChapterPath } from "../paths";
import { writeRecommendCache, readRecommendCache, isRecommendCacheFresh } from "./cache";
import {
	applyIgnoredNames,
	readAttributionStore,
	readIgnoredNamesStore,
	readResolvedStore,
	sweepAttributionOrphans,
	writeAttributionStore,
} from "./decisions";
import { analyzeChapter } from "./engine";
import { loadHydratedCodexInventory } from "./inventory";
import { resolveChapterNarrator } from "./narrator";
import type { DialogueQuoteStyle } from "./quoteSpans";
import type { ChapterRecommendReport } from "./types";

export interface RecommendSettingsSlice {
	codexFactSectionByType: Record<string, string>;
	recommendIncludeUnknownNames: boolean;
}

async function withIgnoredNames(
	app: App,
	bookFolderName: string,
	report: ChapterRecommendReport,
): Promise<ChapterRecommendReport> {
	const ignored = await readIgnoredNamesStore(app, bookFolderName);
	applyIgnoredNames(report, ignored.names);
	return report;
}

function bookScanExtras(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	entries: Awaited<ReturnType<typeof loadHydratedCodexInventory>>,
): {
	narrator: { path: string; name: string } | null;
	dialogueQuotes: DialogueQuoteStyle;
} {
	return {
		narrator: resolveChapterNarrator(app, bookFolderName, chapterFilename, entries),
		dialogueQuotes: readBookFrontmatter(app, bookFolderName)?.dialogueQuotes ?? "double",
	};
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

	const raw = await app.vault.cachedRead(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, bookId, settings.codexFactSectionByType);
	const attribution = await readAttributionStore(app, bookFolderName);
	const resolved = await readResolvedStore(app, bookFolderName, chapterFilename);
	const extras = bookScanExtras(app, bookFolderName, chapterFilename, entries);

	const report = await analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.recommendIncludeUnknownNames,
		attributions: attribution.decisions,
		resolvedIds: resolved.resolvedIds,
		narrator: extras.narrator,
		dialogueQuotes: extras.dialogueQuotes,
	});
	await withIgnoredNames(app, bookFolderName, report);

	const liveSentences = new Set(report.sentenceKeys);
	const sweptAttr = sweepAttributionOrphans(attribution, liveSentences);
	if (sweptAttr.decisions.length !== attribution.decisions.length) {
		await writeAttributionStore(app, bookFolderName, sweptAttr);
	}

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
	const attribution = await readAttributionStore(app, bookFolderName);
	const resolved = await readResolvedStore(app, bookFolderName, chapterFilename);
	const extras = bookScanExtras(app, bookFolderName, chapterFilename, entries);

	const fresh = await analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.recommendIncludeUnknownNames,
		attributions: attribution.decisions,
		resolvedIds: resolved.resolvedIds,
		narrator: extras.narrator,
		dialogueQuotes: extras.dialogueQuotes,
	});
	await withIgnoredNames(app, bookFolderName, fresh);

	const cached = await readRecommendCache(app, bookFolderName, chapterFilename);
	if (cached && isRecommendCacheFresh(cached, fresh.contentHash)) {
		// Re-apply live resolved/attribution onto cached hits
		const resolvedSet = new Set(resolved.resolvedIds);
		for (const hit of cached.hits) {
			hit.resolved = resolvedSet.has(hit.id);
		}
		// Overlay live Codex metadata (type/name) so pane edits show without waiting on hash drift.
		const byPath = new Map(entries.map((e) => [e.path, e]));
		for (const m of cached.matched) {
			const live = byPath.get(m.path);
			if (!live) continue;
			m.type = live.type;
			m.name = live.name;
		}
		await withIgnoredNames(app, bookFolderName, cached);
		return cached;
	}

	const liveSentences = new Set(fresh.sentenceKeys);
	const sweptAttr = sweepAttributionOrphans(attribution, liveSentences);
	if (sweptAttr.decisions.length !== attribution.decisions.length) {
		await writeAttributionStore(app, bookFolderName, sweptAttr);
	}

	await writeRecommendCache(app, bookFolderName, fresh);
	return fresh;
}
