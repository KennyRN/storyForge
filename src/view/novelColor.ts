import { App } from "obsidian";
import type { StoryForgePluginSettings } from "../main";
import { getBookChapters, getChapterEntry } from "../book";
import { getPlotThread, isPlotThreadColor, MAIN_THREAD_FALLBACK_COLOR, MAIN_THREAD_ID, readPlotThreads, type PlotThread } from "../plotThreads";
import { getSeriesBookEntry } from "../series";
import {
	pickDefaultAccentColor,
	pickMidToneAccentColor,
	resolveForegroundBackground,
	resolvePaletteAppearance,
	resolvePaletteColors,
	resolveRowTextColor,
	type PaletteMode,
} from "../colorPalettes";

export interface NovelRowColor {
	/** The novel's own accent — row background, and the colour swatch's current value. */
	background: string;
	/** Contrast-resolved colour for text drawn over `background` (hand-off item 3a). */
	text: string;
}

/** One strand in the Novel panel's plot-line gutter. `key` is what cards match against
 * (a plot-thread id, or a leftover legacy hex) so two threads that happen to share a colour
 * still get their own lines. */
export interface PlotLine {
	key: string;
	color: string;
}

export function plotThreadLineKey(threadId: string): string {
	return `thread:${threadId}`;
}

export function legacyColorLineKey(hex: string): string {
	return `legacy:${hex.toLowerCase()}`;
}

/**
 * Resolves a novel's row accent + matching text colour against the plugin's live palette
 * (settings.colorPaletteName/…, the same one SeriesModal's formatting tab uses). Purely a read —
 * it never writes to series.md: a novel with no stored `book-color` yet gets
 * pickDefaultAccentColor's deterministic per-novel default (hand-off item 4) computed fresh every
 * call, not persisted, so SeriesOverviewView can call this unconditionally on every row of every
 * render without racing itself into repeated frontmatter writes (an earlier version of this
 * function auto-persisted that default the first time a row asked for one — dropped after it
 * turned out to corrupt other `books` entries under concurrent renders). The only thing that ever
 * writes `book-color` is a real user pick: NovelTitleModal's colour swatch, via
 * writeSeriesBookColor.
 */
export function resolveNovelRowColor(app: App, folderName: string, settings: StoryForgePluginSettings): NovelRowColor | null {
	const colors = resolvePaletteColors(settings.colorPaletteName, settings.colorPaletteVariant, settings.customPaletteColors);
	if (colors.length === 0) return null;
	const fallbackAppearance: PaletteMode = document.body.classList.contains("theme-dark") ? "dark" : "light";
	const appearance = resolvePaletteAppearance(settings.colorPaletteName, settings.colorPaletteVariant, fallbackAppearance);
	const resolvedFgBg = resolveForegroundBackground(colors, appearance);
	if (!resolvedFgBg) return null;

	const stored = getSeriesBookEntry(app, folderName)?.color ?? null;
	const accentHex = stored ?? pickDefaultAccentColor(colors, resolvedFgBg.background, resolvedFgBg.foreground, folderName)?.hex ?? null;
	if (!accentHex) return null;

	return { background: accentHex, text: resolveRowTextColor(colors, resolvedFgBg.background, accentHex) };
}

/** Contrast-resolved text colour for an arbitrary accent hex against the live palette — used by
 * plot-thread rows (ChapterTitleModal) so the thread name stays readable on its own colour. */
export function resolveAccentTextColor(settings: StoryForgePluginSettings, accentHex: string): string | null {
	const colors = resolvePaletteColors(settings.colorPaletteName, settings.colorPaletteVariant, settings.customPaletteColors);
	if (colors.length === 0) return null;
	const fallbackAppearance: PaletteMode = document.body.classList.contains("theme-dark") ? "dark" : "light";
	const appearance = resolvePaletteAppearance(settings.colorPaletteName, settings.colorPaletteVariant, fallbackAppearance);
	const resolvedFgBg = resolveForegroundBackground(colors, appearance);
	if (!resolvedFgBg) return null;
	return resolveRowTextColor(colors, resolvedFgBg.background, accentHex);
}

/** Stored plot-thread text colour when the user picked one; otherwise contrast-resolved. */
export function resolvePlotThreadTextColor(settings: StoryForgePluginSettings, thread: PlotThread): string {
	if (thread.textColor && isPlotThreadColor(thread.textColor)) return thread.textColor;
	return resolveAccentTextColor(settings, thread.color) ?? "#ffffff";
}

/** Series-wide default for the protected "main thread" — one colour for the whole series, not
 * per novel. A mid-tone palette accent (never the palette's own fg/bg extremes), so the Novel
 * panel's Plot header and pill stay visible on both light and dark chrome. Existing vaults keep
 * whatever colour is already stored; this only seeds a missing main thread. */
export function defaultSeriesPlotThreadColor(settings: StoryForgePluginSettings): string | null {
	return nextUnusedPlotThreadColor(settings, []);
}

/** First mid-tone palette accent not already used by an existing plot thread, for the registry
 * add-row's starting swatch. Falls back to pickDefaultAccentColor when every accent is taken. */
export function nextUnusedPlotThreadColor(settings: StoryForgePluginSettings, usedHexes: readonly string[]): string | null {
	const colors = resolvePaletteColors(settings.colorPaletteName, settings.colorPaletteVariant, settings.customPaletteColors);
	if (colors.length === 0) return null;
	const fallbackAppearance: PaletteMode = document.body.classList.contains("theme-dark") ? "dark" : "light";
	const appearance = resolvePaletteAppearance(settings.colorPaletteName, settings.colorPaletteVariant, fallbackAppearance);
	const resolvedFgBg = resolveForegroundBackground(colors, appearance);
	if (!resolvedFgBg) return null;
	return pickMidToneAccentColor(colors, resolvedFgBg.background, resolvedFgBg.foreground, usedHexes)?.hex
		?? pickDefaultAccentColor(colors, resolvedFgBg.background, resolvedFgBg.foreground, "plot-thread")?.hex
		?? null;
}

/** Series default main-thread colour + text — used by the Chapter tab card chrome (border,
 * header band, section titles) so that box matches the Novel gutter's first line, not the
 * chapter's assigned thread. */
export function resolveMainThreadRowColor(app: App, settings: StoryForgePluginSettings): NovelRowColor {
	const main = getPlotThread(app, MAIN_THREAD_ID);
	const background = main?.color ?? MAIN_THREAD_FALLBACK_COLOR;
	const text = main
		? resolvePlotThreadTextColor(settings, main)
		: resolveAccentTextColor(settings, background) ?? "#ffffff";
	return { background, text };
}

/**
 * Resolves a chapter's card accent + matching text colour, same shape as resolveNovelRowColor
 * (NovelRowColor is reused rather than a near-identical duplicate type). A chapter with a named
 * plot thread (plotThreads.ts, picked in ChapterTitleModal) uses that thread's colour. Unassigned
 * chapters use the default "main thread". A leftover `chapter-color` hex (legacy anonymous pick)
 * still wins over the default until a thread is picked. Like resolveNovelRowColor, this never
 * writes anything itself — renderNovelPlot can call it unconditionally on every card of every
 * render.
 */
export function resolveChapterRowColor(
	app: App,
	bookFolderName: string,
	filename: string,
	settings: StoryForgePluginSettings,
): NovelRowColor | null {
	const colors = resolvePaletteColors(settings.colorPaletteName, settings.colorPaletteVariant, settings.customPaletteColors);
	if (colors.length === 0) return null;
	const fallbackAppearance: PaletteMode = document.body.classList.contains("theme-dark") ? "dark" : "light";
	const appearance = resolvePaletteAppearance(settings.colorPaletteName, settings.colorPaletteVariant, fallbackAppearance);
	const resolvedFgBg = resolveForegroundBackground(colors, appearance);
	if (!resolvedFgBg) return null;

	const stored = getChapterEntry(app, bookFolderName, filename);
	const assigned = stored?.plotThreadId ? getPlotThread(app, stored.plotThreadId) : null;
	const main = getPlotThread(app, MAIN_THREAD_ID);
	const bookColor = resolveNovelRowColor(app, bookFolderName, settings);
	const thread = assigned ?? (stored?.color ? null : main);
	const accentHex = thread?.color ?? stored?.color ?? bookColor?.background ?? null;
	if (!accentHex) return null;

	const text =
		thread && isPlotThreadColor(thread.textColor)
			? thread.textColor
			: resolveRowTextColor(colors, resolvedFgBg.background, accentHex);

	return { background: accentHex, text };
}

/** Stable key for which plot-line this chapter belongs to — used to line the card header up with
 * the matching gutter strand (collectPlotLines). Unassigned chapters share the default main thread. */
export function chapterPlotLineKey(app: App, bookFolderName: string, filename: string): string {
	const stored = getChapterEntry(app, bookFolderName, filename);
	if (stored?.plotThreadId && getPlotThread(app, stored.plotThreadId)) {
		return plotThreadLineKey(stored.plotThreadId);
	}
	if (stored?.color) return legacyColorLineKey(stored.color);
	return plotThreadLineKey(MAIN_THREAD_ID);
}

/**
 * The Novel panel's colour-line gutter (renderNovelPlot — Story Context's sidebar Novel tab and
 * the central Novel-overview page): the default "main thread" first, then each other plot thread
 * that at least one placed chapter in this book belongs to, in registry order, then any leftover
 * anonymous `chapter-color` hexes in first-appearance order. Matching is by `key` (not hex), so
 * two threads that share a colour still get two lines.
 */
export function collectPlotLines(app: App, bookFolderName: string, _settings: StoryForgePluginSettings): PlotLine[] {
	const threads = readPlotThreads(app);
	const main = threads.find((t) => t.id === MAIN_THREAD_ID);
	// Always emit this first strand — the Novel panel's "Plot" label and pill cap are painted from
	// line[0]. Unassigned chapters don't add leftover hexes, so without a guaranteed main line the
	// gutter (and those two header pieces) would be empty on a book that hasn't picked other threads.
	const mainKey = plotThreadLineKey(MAIN_THREAD_ID);
	const lines: PlotLine[] = [{ key: mainKey, color: main?.color ?? MAIN_THREAD_FALLBACK_COLOR }];
	const seen = new Set<string>([mainKey]);
	const { ordered } = getBookChapters(app, bookFolderName);
	const usedThreadIds = new Set<string>();
	const leftoverHexes: string[] = [];
	for (const file of ordered) {
		const stored = getChapterEntry(app, bookFolderName, file.name);
		if (stored?.plotThreadId && getPlotThread(app, stored.plotThreadId)) {
			usedThreadIds.add(stored.plotThreadId);
			continue;
		}
		if (stored?.color) {
			const hex = stored.color.toLowerCase();
			if (!leftoverHexes.includes(hex)) leftoverHexes.push(hex);
		}
	}
	for (const thread of threads) {
		if (thread.id === MAIN_THREAD_ID) continue;
		if (!usedThreadIds.has(thread.id)) continue;
		const key = plotThreadLineKey(thread.id);
		if (seen.has(key)) continue;
		seen.add(key);
		lines.push({ key, color: thread.color });
	}
	const threadColors = new Set(threads.map((t) => t.color.toLowerCase()));
	for (const hex of leftoverHexes) {
		if (threadColors.has(hex)) continue;
		const key = legacyColorLineKey(hex);
		if (seen.has(key)) continue;
		seen.add(key);
		lines.push({ key, color: hex });
	}
	return lines;
}

/**
 * Every distinct chapter-card colour in use across a book's placed chapters, in a fixed order for
 * the Novel panel's colour-line gutter. Wrapper around collectPlotLines — prefer that when the
 * caller needs to match a card to a specific strand (two threads can share a hex).
 */
export function collectChapterLineColors(app: App, bookFolderName: string, settings: StoryForgePluginSettings): string[] {
	return collectPlotLines(app, bookFolderName, settings).map((line) => line.color);
}
