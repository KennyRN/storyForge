import { App, TFile } from "obsidian";
import { readBookFrontmatter, readChapterPlot } from "../book";
import { libraryChapterPath } from "../paths";
import { writeStoryContextCache, readStoryContextCache, isStoryContextCacheFresh } from "./cache";
import {
	applyIgnoredNames,
	readAttributionStore,
	readIgnoredNamesStore,
	readResolvedStore,
	sweepAttributionOrphans,
	writeAttributionStore,
} from "./decisions";
import { analyzeChapter, demoteGoneMatchesToUnknown, stripMarkdownMapped } from "./engine";
import { loadHydratedCodexInventory } from "./inventory";
import { resolveChapterNarrator, resolveDisplayedChapterPov } from "./narrator";
import type { DialogueQuoteStyle } from "./quoteSpans";
import type { ChapterStoryContextReport } from "./types";

export interface StoryContextSettingsSlice {
	codexFactSectionByType: Record<string, string>;
	storyContextIncludeUnknownNames: boolean;
}

async function withIgnoredNames(
	app: App,
	bookFolderName: string,
	report: ChapterStoryContextReport,
): Promise<ChapterStoryContextReport> {
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
	povRefs: Array<{ path: string; name: string }>;
	dialogueQuotes: DialogueQuoteStyle;
} {
	return {
		narrator: resolveChapterNarrator(app, bookFolderName, chapterFilename, entries),
		povRefs: resolveDisplayedChapterPov(app, bookFolderName, chapterFilename, entries),
		dialogueQuotes: readBookFrontmatter(app, bookFolderName)?.dialogueQuotes ?? "double",
	};
}

function applyGoneMatchDemotion(
	report: ChapterStoryContextReport,
	previousMatched: ChapterStoryContextReport["matched"] | undefined,
	entries: Awaited<ReturnType<typeof loadHydratedCodexInventory>>,
	rawChapter: string,
	includeUnknownNames: boolean,
): void {
	if (!includeUnknownNames) return;
	demoteGoneMatchesToUnknown(
		report,
		previousMatched,
		entries,
		stripMarkdownMapped(rawChapter).text,
	);
}

/** Recomputes and caches a chapter Story Context report. */
export async function recomputeChapterStoryContext(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	settings: StoryContextSettingsSlice,
): Promise<ChapterStoryContextReport | null> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;

	const raw = await app.vault.cachedRead(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, settings.codexFactSectionByType);
	const attribution = await readAttributionStore(app, bookFolderName);
	const resolved = await readResolvedStore(app, bookFolderName, chapterFilename);
	const extras = bookScanExtras(app, bookFolderName, chapterFilename, entries);

	const previous = await readStoryContextCache(app, bookFolderName, chapterFilename);
	const report = await analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.storyContextIncludeUnknownNames,
		attributions: attribution.decisions,
		resolvedIds: resolved.resolvedIds,
		narrator: extras.narrator,
		povRefs: extras.povRefs,
		dialogueQuotes: extras.dialogueQuotes,
	});
	applyGoneMatchDemotion(
		report,
		previous?.matched,
		entries,
		raw,
		settings.storyContextIncludeUnknownNames,
	);
	await withIgnoredNames(app, bookFolderName, report);

	const liveSentences = new Set(report.sentenceKeys);
	const sweptAttr = sweepAttributionOrphans(attribution, liveSentences);
	if (sweptAttr.decisions.length !== attribution.decisions.length) {
		await writeAttributionStore(app, bookFolderName, sweptAttr);
	}

	await writeStoryContextCache(app, bookFolderName, report);
	return report;
}

/** Loads cache if still matching a fresh analysis hash; otherwise recomputes and writes. */
export async function loadOrRecomputeChapterStoryContext(
	app: App,
	bookFolderName: string,
	chapterFilename: string,
	settings: StoryContextSettingsSlice,
): Promise<ChapterStoryContextReport | null> {
	const path = libraryChapterPath(bookFolderName, chapterFilename);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;

	const raw = await app.vault.cachedRead(file);
	const existingPlot = await readChapterPlot(app, bookFolderName, chapterFilename);
	const entries = await loadHydratedCodexInventory(app, settings.codexFactSectionByType);
	const attribution = await readAttributionStore(app, bookFolderName);
	const resolved = await readResolvedStore(app, bookFolderName, chapterFilename);
	const extras = bookScanExtras(app, bookFolderName, chapterFilename, entries);

	const cached = await readStoryContextCache(app, bookFolderName, chapterFilename);
	const fresh = await analyzeChapter(raw, entries, {
		chapterFilename,
		existingPlot,
		includeUnknownNames: settings.storyContextIncludeUnknownNames,
		attributions: attribution.decisions,
		resolvedIds: resolved.resolvedIds,
		narrator: extras.narrator,
		povRefs: extras.povRefs,
		dialogueQuotes: extras.dialogueQuotes,
	});
	applyGoneMatchDemotion(
		fresh,
		cached?.matched,
		entries,
		raw,
		settings.storyContextIncludeUnknownNames,
	);
	await withIgnoredNames(app, bookFolderName, fresh);

	if (cached && isStoryContextCacheFresh(cached, fresh.contentHash)) {
		// Re-apply live resolved/attribution onto cached hits
		const resolvedSet = new Set(resolved.resolvedIds);
		for (const hit of cached.hits) {
			hit.resolved = resolvedSet.has(hit.id);
		}
		// Overlay live Codex metadata (type/name) so pane edits show without waiting on hash drift.
		const byPath = new Map(entries.map((e) => [e.path, e]));
		const stale = cached.matched.filter((m) => !byPath.has(m.path));
		cached.matched = cached.matched.filter((m) => byPath.has(m.path));
		for (const m of cached.matched) {
			const live = byPath.get(m.path);
			if (!live) continue;
			m.type = live.type;
			m.name = live.name;
		}
		applyGoneMatchDemotion(
			cached,
			stale,
			entries,
			raw,
			settings.storyContextIncludeUnknownNames,
		);
		await withIgnoredNames(app, bookFolderName, cached);
		return cached;
	}

	const liveSentences = new Set(fresh.sentenceKeys);
	const sweptAttr = sweepAttributionOrphans(attribution, liveSentences);
	if (sweptAttr.decisions.length !== attribution.decisions.length) {
		await writeAttributionStore(app, bookFolderName, sweptAttr);
	}

	await writeStoryContextCache(app, bookFolderName, fresh);
	return fresh;
}
