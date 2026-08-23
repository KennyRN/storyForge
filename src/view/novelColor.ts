import { App } from "obsidian";
import type { StoryForgePluginSettings } from "../main";
import { getBookChapters, getChapterEntry } from "../book";
import { getSeriesBookEntry } from "../series";
import {
	pickDefaultAccentColor,
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

/**
 * Resolves a chapter's card accent + matching text colour, same shape as resolveNovelRowColor
 * (NovelRowColor is reused rather than a near-identical duplicate type). Every chapter defaults to
 * its *book's own* accent (resolveNovelRowColor above) — one colour shared by every chapter in a
 * book, deterministic but "random-looking" the same way a novel's default is — rather than each
 * chapter rolling its own. A chapter only gets its own colour once one is actually picked
 * (ChapterTitleModal's colour swatch, via writeChapterColor), stored as `chapter-color` on its
 * novel.md entry and read here through getChapterEntry. Like resolveNovelRowColor, this never
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

	const bookColor = resolveNovelRowColor(app, bookFolderName, settings);
	if (!bookColor) return null;
	const stored = getChapterEntry(app, bookFolderName, filename)?.color ?? null;
	const accentHex = stored ?? bookColor.background;

	return { background: accentHex, text: resolveRowTextColor(colors, resolvedFgBg.background, accentHex) };
}

/**
 * Every distinct chapter-card colour in use across a book's placed chapters, in a fixed order for
 * the central Novel-overview page's colour-line gutter (renderNovelPlot's `wide` branch only): the
 * book's own shared default first (resolveNovelRowColor — every un-overridden chapter's colour),
 * then each further override colour in the order its first chapter appears. Not sorted or
 * deduplicated any other way, so the gutter's line order stays stable render to render as long as
 * the underlying colours themselves don't change. Empty when the palette itself resolves to
 * nothing (resolveNovelRowColor returning null — e.g. an empty custom palette).
 */
export function collectChapterLineColors(app: App, bookFolderName: string, settings: StoryForgePluginSettings): string[] {
	const bookColor = resolveNovelRowColor(app, bookFolderName, settings);
	if (!bookColor) return [];
	const colors = [bookColor.background];
	const { ordered } = getBookChapters(app, bookFolderName);
	for (const file of ordered) {
		const chapterColor = resolveChapterRowColor(app, bookFolderName, file.name, settings);
		if (chapterColor && !colors.includes(chapterColor.background)) {
			colors.push(chapterColor.background);
		}
	}
	return colors;
}
