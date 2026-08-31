import { App, Notice, TFile, setIcon, setTooltip } from "obsidian";
import type StoryForgePlugin from "../main";
import {
	getBookChapters,
	getChapterEntry,
	numberedChapterTitle,
	readBookFrontmatter,
	readBookSynopsis,
	readChapterPlot,
	writeBookCoverImage,
	writeBookSynopsis,
	writeChapterLocation,
	writeChapterPlot,
	writeChapterPov,
	writeDefaultPov,
} from "../book";
import { getCodexEntriesByType } from "../codex";
import {
	ICON_MAP_PIN,
	ICON_MAP_PIN_PLUS,
	ICON_PERSON_FILL,
	ICON_PERSON_FILL_ADD,
	setCharmChevronIcon,
} from "../icons";
import { bookBackstagePath } from "../paths";
import { resolveChapterNarrator } from "../recommend/narrator";
import type { CastMember } from "../recommend/types";
import { getBookId, numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { ChapterTitleModal } from "./ChapterTitleModal";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { collectPlotLines, chapterPlotLineKey, resolveChapterRowColor, type PlotLine } from "./novelColor";

/**
 * A novel's cover/synopsis/chapter-by-chapter plot — the content Story Context's own Novel tab
 * (RecommendationView.ts) shows in the right sidebar, and the storyLibrary panel's Novel-layout
 * main-pane page (NovelOverviewView.ts) mirrors in the main editor area. One render function
 * shared by both hosts rather than two copies drifting apart (see SeriesOverviewView.ts's doc
 * comment for the duplication this project already learned not to repeat). Story Context's
 * sidebar omits Default PoV and the "Plot" heading; the wide overview also omits the heading
 * and runs the primary plot thread up the cover and along the top of the cover/synopsis row.
 */
export interface NovelPanelOptions {
	bookFolderName: string | null;
	/** Needed for settings (colour palette, plot-card collapse) and to open ChapterTitleModal on a
	 * "wide" card's title click. */
	plugin: StoryForgePlugin;
	/** Shown in place of the panel when no novel is selected — hosts word this slightly differently. */
	emptyText: string;
	/** RecommendationView's own hydrated cast list, used to validate a PoV path still resolves to a
	 * live Codex person entry (see resolveChapterNarrator's doc comment). Omitted by simpler hosts —
	 * resolveChapterNarrator falls back to the stored PoV name directly without it. */
	castCache?: CastMember[];
	/** Re-render trigger after an edit made through this panel (cover, PoV/location pickers, …). */
	onChanged: () => void;
	/** Checked after every async read before it's applied to the DOM — true skips the write, so a
	 * closed view or a since-changed selection never lands a stale value. */
	isStale: () => boolean;
	/** "sidebar" (default, omit to get it) is Story Context's own stacked/centred layout: cover on
	 * top, title/subtitle beneath it, synopsis below that, then the plot-thread cards.
	 * "wide" is the storyLibrary panel's Novel-overview page (NovelOverviewView.ts) — a larger,
	 * left-aligned cover with no title/subtitle, and synopsis and Default PoV beside the cover
	 * instead of under it. The primary plot thread runs up the cover's left and along the top
	 * of that row. Both hosts share coloured plot cards, the colour-line gutter, collapse
	 * chevrons, and coloured chapter titles; only "wide" opens ChapterTitleModal from a title click. */
	layout?: "sidebar" | "wide";
}

interface ChapterLineGutterMetrics {
	/** Cap width — 2px corner radius on each side plus room for the full line bundle, so every
	 * strand lands on the bar's straight segment (see lineOffsets). */
	pillWidth: number;
	/** Each line's left x-offset within the scroll pane's background, same order as the colours
	 * passed in. Offset by the cap's own corner radius (not from 0) so the first line starts just
	 * past where the left curve ends, and the last ends just short of where its right curve
	 * begins — the lines read as continuing directly out from inside the bar above them, not
	 * merely lined up beside it. */
	lineOffsets: number[];
	/** How far every chapter card shifts right to clear the last line, plus a small gap. */
	cardShift: number;
}

const GUTTER_CAP_RADIUS = 2;
const GUTTER_LINE_WIDTH = 2;
const GUTTER_LINE_GAP = 2;
const GUTTER_CARD_GAP = 8;

/** Null when there are no lines to draw at all (collectChapterLineColors came back empty — e.g. an
 * empty custom palette) — callers skip the pill/gutter/card-shift entirely in that case. */
function computeChapterLineGutterMetrics(lineCount: number): ChapterLineGutterMetrics | null {
	if (lineCount <= 0) return null;
	const pitch = GUTTER_LINE_WIDTH + GUTTER_LINE_GAP;
	const bundleWidth = (lineCount - 1) * pitch + GUTTER_LINE_WIDTH;
	return {
		pillWidth: 2 * GUTTER_CAP_RADIUS + bundleWidth,
		lineOffsets: Array.from({ length: lineCount }, (_, i) => GUTTER_CAP_RADIUS + i * pitch),
		cardShift: GUTTER_CAP_RADIUS + bundleWidth + GUTTER_CARD_GAP,
	};
}

/** The line bundle's own paint job — a solid-colour linear-gradient "stripe" per line, each sized
 * to its own 2px column and positioned at its own lineOffsets entry — shared between the header's
 * pill-stub (a few static pixels, so the lines are visibly already running before the scroll pane
 * even begins) and the scroll pane's own full-height background (renderNovelPlot). Same colours,
 * same x-offsets, in both places, so the two read as one continuous set of lines rather than two
 * separately-aligned ones. */
function buildGutterLineBackground(lineColors: string[], lineOffsets: number[]) {
	return {
		backgroundImage: lineColors.map((c) => `linear-gradient(${c}, ${c})`).join(", "),
		backgroundSize: lineColors.map(() => "2px 100%").join(", "),
		backgroundPosition: lineOffsets.map((x) => `${x}px 0`).join(", "),
		backgroundRepeat: "no-repeat",
	};
}

export function renderNovelPanel(app: App, container: HTMLElement, options: NovelPanelOptions): void {
	container.empty();
	const wide = options.layout === "wide";
	const body = container.createDiv({ cls: "sf-recommend-body" });

	if (!options.bookFolderName) {
		body.addClass("sf-recommend-body--scroll");
		body.createDiv({ cls: "sf-empty", text: options.emptyText });
		return;
	}

	const bookFolderName = options.bookFolderName;
	const fixed = body.createDiv({ cls: "sf-recommend-fixed sf-recommend-novel-fixed" });

	// "wide" splits into a cover-left/text-right row (cover, then synopsis + Default PoV in a
	// column beside it) — everything else (title/subtitle, synopsis) still parents directly off
	// `fixed` for "sidebar", one column top to bottom same as before.
	const coverHost = wide ? fixed.createDiv({ cls: "sf-recommend-novel-cover-row" }) : fixed;

	const cover = coverHost.createDiv({ cls: "sf-synopsis-cover sf-recommend-novel-cover" });
	renderNovelCover(app, cover, bookFolderName);
	cover.addEventListener("click", () => pickNovelCover(app, cover, bookFolderName));

	const textHost = wide ? coverHost.createDiv({ cls: "sf-recommend-novel-text-col" }) : fixed;

	if (!wide) {
		const numberedTitle = numberedBookTitle(app, bookFolderName, undefined, options.plugin.getSettings().seriesNumberingStyle);
		const { title, subtitle } = splitTitleSubtitle(numberedTitle);
		fixed.createDiv({ cls: "sf-recommend-novel-title", text: title });
		if (subtitle) {
			fixed.createDiv({ cls: "sf-recommend-novel-subtitle", text: subtitle });
		}
	}

	const synopsis = textHost.createEl("textarea", {
		cls: "sf-recommend-synopsis sf-recommend-novel-synopsis",
		attr: { "aria-label": "Novel synopsis" },
	});
	synopsis.addEventListener("pointerdown", (e) => e.stopPropagation());
	synopsis.addEventListener("blur", () => {
		void writeBookSynopsis(app, bookFolderName, synopsis.value);
	});
	void readBookSynopsis(app, bookFolderName).then((value) => {
		if (options.isStale()) return;
		synopsis.value = value;
	});

	if (wide) {
		const defaultPovSection = textHost.createDiv({ cls: "sf-recommend-section" });
		renderDefaultPovRow(app, defaultPovSection, bookFolderName, options.onChanged);
	}

	const plotLines = collectPlotLines(app, bookFolderName, options.plugin.getSettings());
	const lineColors = plotLines.map((line) => line.color);
	const gutter = computeChapterLineGutterMetrics(lineColors.length);

	if (!wide && gutter && lineColors[0]) {
		const threadLeft = gutter.lineOffsets[0];
		const wrap = textHost.createDiv({ cls: "sf-recommend-novel-synopsis-wrap" });
		synopsis.before(wrap);
		const cap = wrap.createDiv({ cls: "sf-recommend-novel-synopsis-thread-cap" });
		cap.setCssStyles({ backgroundColor: lineColors[0] });
		wrap.append(synopsis);
		wrap.setCssStyles({
			marginLeft: `${threadLeft}px`,
			width: `calc(100% - ${threadLeft}px)`,
			backgroundColor: lineColors[0],
		});
		synopsis.addClass("sf-recommend-novel-synopsis--thread");
	}
	if (wide && gutter && lineColors[0]) {
		const threadLeft = gutter.lineOffsets[0];
		const wrap = fixed.createDiv({ cls: "sf-recommend-novel-cover-thread" });
		coverHost.before(wrap);
		const cap = wrap.createDiv({ cls: "sf-recommend-novel-synopsis-thread-cap" });
		cap.setCssStyles({ backgroundColor: lineColors[0] });
		wrap.append(coverHost);
		wrap.setCssStyles({
			marginLeft: `${threadLeft}px`,
			width: `calc(100% - ${threadLeft}px)`,
		});
		wrap.style.setProperty("--sf-cover-thread-color", lineColors[0]);
		cover.addClass("sf-recommend-novel-cover--thread");
	}
	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	void renderNovelPlot(app, scroll, bookFolderName, options, wide, plotLines);
}

/** Exported for SeriesOverviewView.ts's per-row cover box — same cover, same click-to-set
 * behaviour, reused rather than re-implemented a third time (see this file's own doc comment). */
export function renderNovelCover(app: App, cover: HTMLElement, bookFolderName: string): void {
	cover.empty();
	const coverImage = readBookFrontmatter(app, bookFolderName)?.coverImage ?? null;
	const file = coverImage
		? app.vault.getAbstractFileByPath(`${bookBackstagePath(bookFolderName)}/${coverImage}`)
		: null;
	if (file instanceof TFile) {
		cover.addClass("has-image");
		cover.createEl("img", { attr: { src: app.vault.getResourcePath(file) } });
	} else {
		cover.removeClass("has-image");
	}
}

export function pickNovelCover(app: App, cover: HTMLElement, bookFolderName: string): void {
	const input = createEl("input", { type: "file", attr: { accept: "image/*" } });
	input.addEventListener("change", () => {
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			new Notice("storyForge: please choose an image file for the cover.");
			return;
		}
		void (async () => {
			try {
				const data = await file.arrayBuffer();
				const dotIndex = file.name.lastIndexOf(".");
				const extension =
					dotIndex !== -1 ? file.name.slice(dotIndex + 1).toLowerCase() : file.type.split("/")[1] || "png";
				await writeBookCoverImage(app, bookFolderName, data, extension);
				renderNovelCover(app, cover, bookFolderName);
			} catch (err) {
				new Notice(`storyForge: could not set cover image — ${err instanceof Error ? err.message : String(err)}`);
			}
		})();
	});
	input.click();
}

function renderDefaultPovRow(app: App, parent: HTMLElement, bookFolderName: string, onChanged: () => void): void {
	const fm = readBookFrontmatter(app, bookFolderName);
	const path = fm?.defaultPovPath ?? null;
	const name = fm?.defaultPovName ?? null;
	const meta = parent.createDiv({ cls: "sf-recommend-meta" });
	const row = meta.createDiv({ cls: "sf-recommend-meta-row" });
	row.createSpan({ cls: "sf-recommend-meta-label", text: "Default PoV:" });
	renderMetaControl(row, {
		iconId: path ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
		value: path ? (name ?? path) : null,
		tooltip: path ? "change pov character" : "set pov character",
		onOpen: () => void openDefaultPovPicker(app, bookFolderName, !!path, onChanged),
	});
}

async function openDefaultPovPicker(app: App, bookFolderName: string, hasValue: boolean, onChanged: () => void): Promise<void> {
	const bookId = getBookId(app, bookFolderName);
	const entries = getCodexEntriesByType(app, "person", bookId);
	new CodexEntryPickerModal(
		app,
		"Set PoV",
		"No person entries in the Codex yet.",
		entries,
		hasValue,
		async (entry) => {
			await writeDefaultPov(app, bookFolderName, entry.path, entry.name);
			onChanged();
		},
		async () => {
			await writeDefaultPov(app, bookFolderName, null, null);
			onChanged();
		},
	).open();
}

async function renderNovelPlot(
	app: App,
	scroll: HTMLElement,
	bookFolderName: string,
	options: NovelPanelOptions,
	wide: boolean,
	plotLines: PlotLine[],
): Promise<void> {
	scroll.empty();
	const { ordered } = getBookChapters(app, bookFolderName);
	if (ordered.length === 0) {
		scroll.createDiv({ cls: "sf-empty", text: "No placed chapters yet." });
		return;
	}
	const lineColors = plotLines.map((line) => line.color);
	// The colour-line gutter (renderNovelPanel's own pill sits directly above it, same colours and
	// the same computeChapterLineGutterMetrics geometry, so the lines read as continuing out of the
	// pill rather than just lining up beside it) — one 2px line per plot thread in use (plus the
	// book's own default), 2px gaps between them, painted as backgrounds on the scroll pane itself
	// rather than as real elements so it never needs its own height calculation. background-attachment:
	// local (rather than the default "scroll", which stays fixed to the viewport) is what makes it
	// scroll together with the cards and span the pane's full *scrollable* content height, not just
	// whatever's currently visible. Every card is then shifted right past the last line, plus a
	// small gap, so nothing overlaps it.
	const gutter = computeChapterLineGutterMetrics(lineColors.length);
	if (gutter) {
		scroll.setCssStyles({ ...buildGutterLineBackground(lineColors, gutter.lineOffsets), backgroundAttachment: "local" });
	}
	for (const file of ordered) {
		const block = scroll.createDiv({ cls: "sf-recommend-plot-block sf-recommend-plot-block--plain" });
		if (gutter) block.setCssStyles({ marginLeft: `${gutter.cardShift}px` });
		const headerRow = block.createDiv({ cls: "sf-recommend-plot-header-row" });
		const { title, subtitle } = splitTitleSubtitle(
			numberedChapterTitle(app, bookFolderName, file.name, options.plugin.getSettings().chapterNumberingStyle),
		);
		const nameEl = headerRow.createDiv({
			cls: "sf-recommend-plot-chapter-name",
			text: subtitle ? `${title} (${subtitle})` : title,
		});
		const collapseBtn = headerRow.createSpan({
			cls: "sf-recommend-plot-collapse",
			attr: { role: "button", tabindex: "0" },
		});
		// Each chapter reads as its own card: the whole header band (not just the name text) is
		// painted with the chapter's plot-thread colour — its assigned thread if it has one, else
		// a leftover anonymous colour, else the book's shared default (resolveChapterRowColor) —
		// and the card's outline picks up that same colour, so the outline and the header read as
		// one accent rather than two. The name text declares its own `color` in CSS (it's itself
		// user-configurable), so headerRow's own inline colour would never actually reach it by
		// inheritance alone — set directly on it instead.
		const rowColor = resolveChapterRowColor(app, bookFolderName, file.name, options.plugin.getSettings());
		if (rowColor) {
			headerRow.setCssStyles({ backgroundColor: rowColor.background, color: rowColor.text });
			// An inset box-shadow, not a real border — see .sf-recommend-plot-block--plain's own
			// doc comment for why (no box-model footprint, so nothing measured against this card's
			// content edge, including the margin-left below, needs to compensate for a border's
			// width).
			block.setCssStyles({ boxShadow: `inset 0 0 0 2px ${rowColor.background}` });
			block.setCssProps({
				"--sf-plot-card-header-bg": rowColor.background,
				"--sf-plot-card-header-fg": rowColor.text,
			});
			nameEl.setCssStyles({ color: rowColor.text });
			collapseBtn.setCssStyles({ color: rowColor.text });
			// The header band reaches back out past the card's own left edge, into the gutter,
			// until it's centred exactly on the one line that matches this chapter's own plot
			// thread (matched by key, not hex, so two threads that share a colour still land on
			// their own strand). No z-index/stacking change needed for it to cover any *other*
			// lines it crosses on the way there: it's a normal in-flow child with its own opaque
			// background, so it already paints above the scroll pane's own background (the lines)
			// by default.
			if (gutter) {
				const matchIndex = plotLines.findIndex((line) => line.key === chapterPlotLineKey(app, bookFolderName, file.name));
				if (matchIndex !== -1) {
					const lineCenterX = gutter.lineOffsets[matchIndex] + GUTTER_LINE_WIDTH / 2;
					// -16 is the card's own left padding (cancelled, same as the header's static
					// right margin cancels its right padding); no separate compensation for the
					// card's own outline needed on top of that — it's an inset box-shadow (above),
					// which — unlike a real border — never shifts the content box in the first place.
					headerRow.setCssStyles({ marginLeft: `${lineCenterX - gutter.cardShift - 16}px` });
				}
			}
		}
		// Title left edge = card inner text edge (16px, same as meta/description). The
		// header band may bleed left into the gutter; extra padding-left keeps the title
		// on that 16px line. The chevron is out of flow, centred on the 2px inset outline
		// (`left: 1px` when flush; shifted by the same extra bleed so it stays on the
		// card's shadow, not out on the colour line).
		const cardPad = 16;
		const headerMarginLeft = headerRow.style.marginLeft ? parseFloat(headerRow.style.marginLeft) : -cardPad;
		const extraBleed = Math.max(0, -cardPad - headerMarginLeft);
		headerRow.setCssStyles({ paddingLeft: `${cardPad + extraBleed}px` });
		collapseBtn.setCssStyles({ left: `${1 + extraBleed}px` });

		const chapterKey = plotChapterCollapseKey(bookFolderName, file.name);
		const applyCollapsed = (collapsed: boolean) =>
			applyPlotCardCollapsed(block, collapseBtn, collapsed);
		applyCollapsed((options.plugin.getSettings().collapsedPlotChapterKeys ?? []).includes(chapterKey));
		const toggleCollapsed = () => {
			const next = !block.hasClass("sf-recommend-plot-block--collapsed");
			applyCollapsed(next);
			persistPlotCardCollapsed(options.plugin, chapterKey, next);
		};
		collapseBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleCollapsed();
		});
		makeAccessibleActivatable(collapseBtn, toggleCollapsed);

		// Title-click rename stays on the central Novel overview only — the sidebar Novel tab
		// shows the same coloured title but does not open ChapterTitleModal.
		if (wide) {
			nameEl.addClass("sf-recommend-plot-chapter-name--clickable");
			const openTitleModal = () =>
				new ChapterTitleModal(app, options.plugin, bookFolderName, file.name, () => options.onChanged()).open();
			nameEl.addEventListener("click", openTitleModal);
			makeAccessibleActivatable(nameEl, openTitleModal);
		}

		const entry = getChapterEntry(app, bookFolderName, file.name);
		const narrator = resolveChapterNarrator(
			app,
			bookFolderName,
			file.name,
			options.castCache?.length ? options.castCache : undefined,
		);
		const meta = block.createDiv({ cls: "sf-recommend-meta" });
		renderPlotMetaRow(
			meta,
			"PoV:",
			narrator ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
			narrator?.name ?? null,
			!!narrator,
			() => void openNovelChapterPovPicker(app, bookFolderName, file.name, !!narrator, options.onChanged),
			narrator ? "change pov character" : "set pov character",
		);
		renderPlotMetaRow(
			meta,
			"Location:",
			entry?.locationPath ? ICON_MAP_PIN : ICON_MAP_PIN_PLUS,
			entry?.locationName ?? entry?.locationPath ?? null,
			!!entry?.locationPath,
			() => void openNovelChapterLocationPicker(app, bookFolderName, file.name, !!entry?.locationPath, options.onChanged),
			entry?.locationPath ? "change location" : "set location",
		);

		// A plain divider line, not the textarea's own border-top (an earlier version's approach):
		// that border spanned the textarea's own bled-out width, the same width as the card's
		// outline itself, so the two crossed right at the card's left/right edges and left a visible
		// mark wherever the (opaque) border-top passed over the (inset) outline. This divider sits
		// in the card's ordinary padded content area instead — well clear of the outline on both
		// sides — so nothing crosses it at all.
		block.createDiv({ cls: "sf-recommend-plot-textarea-divider" });
		const textarea = block.createEl("textarea", {
			cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
			// rows="1" overrides the HTML default of 2 — without it, a single-line description's
			// resizeToContent() (below) never shows a gap-free 1-line box: scrollHeight can't report
			// less than the textarea's own current height, and its un-styled intrinsic height (what
			// "height: auto" actually resolves to for a textarea, unlike a plain <div>) comes from this
			// attribute, not from the text it holds. A two-line description happens to roughly match
			// the default of 2 already, which is why only single-line ones showed the gap.
			attr: { "aria-label": "chapter description", rows: "1" },
		});
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
		// Grows with its own content (height only — resize: none in CSS removes the manual drag
		// handle entirely) rather than sitting at a fixed size with its own internal scrollbar: starts
		// at a single line (its CSS min-height:0, so an empty textarea's scrollHeight alone decides
		// the starting height) and expands on every keystroke, re-measured once more below after the
		// real plot text loads in (that arrives after this listener is wired, so the initial "resize
		// to empty" call here would otherwise never see the real content's true height).
		const resizeToContent = () => {
			textarea.setCssStyles({ height: "auto" });
			textarea.setCssStyles({ height: `${textarea.scrollHeight}px` });
		};
		textarea.addEventListener("input", resizeToContent);
		// A one-shot measurement right after loading the plot text (below) isn't always enough on
		// its own — this card's own width isn't necessarily final at that exact point (the cover
		// image beside it loads asynchronously and can still reflow the row afterwards), and a
		// narrower width means more wrapped lines, so a height measured too early can end up taller
		// than the content actually needs once things settle — exactly the "gap before the border"
		// this whole fix is for, just from a stale measurement instead of trailing whitespace. A
		// ResizeObserver on the card catches any such reflow after the fact and re-measures, however
		// it happens to be caused (a slow-loading cover, a font swap, the sidebar resizing, …) — width
		// is checked explicitly because the observed card's own height changes right along with the
		// textarea's on every resizeToContent() call, and reacting to that too would recurse forever.
		let lastCardWidth = -1;
		const cardResizeObserver = new ResizeObserver((entries) => {
			// Also the cleanup point for this observer: there's no per-card teardown hook (the whole
			// page just re-renders from scratch on the next relevant vault change), so once the host
			// view itself has closed there's nothing left worth reacting to — disconnect rather than
			// leave it registered against a now-orphaned card indefinitely.
			if (options.isStale()) {
				cardResizeObserver.disconnect();
				return;
			}
			const width = entries[0].contentRect.width;
			if (width === lastCardWidth) return;
			lastCardWidth = width;
			resizeToContent();
		});
		cardResizeObserver.observe(block);
		// Trailing whitespace (most often a trailing blank line left over from however the text was
		// typed or pasted) still counts toward the textarea's own scrollHeight — a browser reserves
		// room for the empty line after a final "\n" the same as any other line — so left alone it
		// shows up as a gap between the last paragraph and the card's own bottom edge that has
		// nothing to do with this box's own padding. Trimmed on blur (once editing has actually
		// finished, not on every keystroke — trimming mid-edit would eat the newline the moment
		// someone pressed Enter to start a new paragraph) and re-measured immediately after, so the
		// box visibly snaps back down to fit rather than waiting for the next re-render.
		textarea.addEventListener("blur", () => {
			const trimmed = textarea.value.replace(/\s+$/, "");
			if (trimmed !== textarea.value) {
				textarea.value = trimmed;
				resizeToContent();
			}
			void writeChapterPlot(app, bookFolderName, file.name, trimmed);
		});
		resizeToContent();
		const plot = await readChapterPlot(app, bookFolderName, file.name);
		if (options.isStale()) return;
		textarea.value = plot.replace(/\s+$/, "");
		resizeToContent();
	}
}

function renderPlotMetaRow(
	parent: HTMLElement,
	label: string,
	iconId: string,
	value: string | null,
	hasValue: boolean,
	onOpen: () => void,
	tooltip: string,
): void {
	const row = parent.createDiv({ cls: "sf-recommend-meta-row" });
	row.createSpan({ cls: "sf-recommend-meta-label", text: label });
	renderMetaControl(row, {
		iconId,
		value: hasValue ? value : null,
		tooltip,
		onOpen,
	});
}

async function openNovelChapterPovPicker(
	app: App,
	bookFolderName: string,
	filename: string,
	hasValue: boolean,
	onChanged: () => void,
): Promise<void> {
	const bookId = getBookId(app, bookFolderName);
	const entries = getCodexEntriesByType(app, "person", bookId);
	new CodexEntryPickerModal(
		app,
		"Set PoV",
		"No person entries in the Codex yet.",
		entries,
		hasValue,
		async (entry) => {
			await writeChapterPov(app, bookFolderName, filename, entry.path, entry.name);
			onChanged();
		},
		async () => {
			await writeChapterPov(app, bookFolderName, filename, null, null);
			onChanged();
		},
	).open();
}

async function openNovelChapterLocationPicker(
	app: App,
	bookFolderName: string,
	filename: string,
	hasValue: boolean,
	onChanged: () => void,
): Promise<void> {
	const bookId = getBookId(app, bookFolderName);
	const entries = getCodexEntriesByType(app, "place", bookId);
	new CodexEntryPickerModal(
		app,
		"Set location",
		"No place entries in the Codex yet.",
		entries,
		hasValue,
		async (entry) => {
			await writeChapterLocation(app, bookFolderName, filename, entry.path, entry.name);
			onChanged();
		},
		async () => {
			await writeChapterLocation(app, bookFolderName, filename, null, null);
			onChanged();
		},
	).open();
}

function plotChapterCollapseKey(bookFolderName: string, filename: string): string {
	return `${bookFolderName}/${filename}`;
}

function applyPlotCardCollapsed(block: HTMLElement, collapseBtn: HTMLElement, collapsed: boolean): void {
	block.toggleClass("sf-recommend-plot-block--collapsed", collapsed);
	setCharmChevronIcon(collapseBtn, collapsed);
	collapseBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
	collapseBtn.setAttribute("aria-label", collapsed ? "expand chapter card" : "collapse chapter card");
	setTooltip(collapseBtn, collapsed ? "expand chapter card" : "collapse chapter card");
}

function persistPlotCardCollapsed(plugin: StoryForgePlugin, key: string, collapsed: boolean): void {
	const current = plugin.getSettings().collapsedPlotChapterKeys ?? [];
	if (collapsed === current.includes(key)) return;
	const next = collapsed ? [...current, key] : current.filter((k) => k !== key);
	void plugin.updateSetting("collapsedPlotChapterKeys", next);
}

/** Icon (+ optional value) as a single interactive control — shared by this panel's Default PoV /
 * per-chapter PoV+location rows and Story Context's own Chapter tab (RecommendationView.ts). */
export function renderMetaControl(
	row: HTMLElement,
	opts: { iconId: string; value: string | null; tooltip: string; onOpen: () => void },
): void {
	const control = row.createSpan({
		cls: "sf-recommend-meta-control",
		attr: { role: "button", tabindex: "0", "aria-label": opts.tooltip },
	});
	setTooltip(control, opts.tooltip);
	setIcon(control.createSpan({ cls: "sf-recommend-meta-icon" }), opts.iconId);
	if (opts.value) {
		control.createSpan({ cls: "sf-recommend-meta-value", text: opts.value });
	}
	control.addEventListener("click", (e) => {
		e.stopPropagation();
		opts.onOpen();
	});
	makeAccessibleActivatable(control, opts.onOpen);
}

/** Small icon-only action button — Story Context list-row actions (RecommendationView.ts). */
export function iconAction(parent: HTMLElement, iconId: string, label: string, onActivate: () => void): HTMLElement {
	const btn = parent.createSpan({
		cls: "sf-recommend-icon-btn",
		attr: { "aria-label": label, tabindex: "0", role: "button" },
	});
	setIcon(btn, iconId);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onActivate();
	});
	makeAccessibleActivatable(btn, onActivate);
	return btn;
}
