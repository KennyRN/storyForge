import { App, ItemView, Notice, setTooltip, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { getBookChapters, readBookSynopsis, writeBookSynopsis } from "../book";
import {
	getSeriesBooks,
	numberedBookTitle,
	readSeriesDescription,
	readSeriesFrontmatter,
	writeSeriesCoverImage,
	writeSeriesDescription,
} from "../series";
import { isBackstageBookkeepingPath, isLibraryChapterPath, seriesBackstagePath, seriesFilePath } from "../paths";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { isDragInProgress } from "./dragLock";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import {
	measureSeriesOverviewScrollbarGutter,
	pickNovelCover,
	readOrderedChapterWordCounts,
	renderNovelCover,
} from "./NovelPanel";
import { NovelTitleModal } from "./NovelTitleModal";
import { SeriesTitleModal } from "./SeriesTitleModal";
import { resolveNovelRowColor, type NovelRowColor } from "./novelColor";
import { computeSeriesNovelBarLayout, type SeriesNovelBarEntry } from "./seriesNovelBar";

export const STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE = "storyforge-series-overview-view";

/**
 * The Series tab's own full-page view, opened in the main editor area in place of a normal editor
 * — StoryForgeView.ts's layout-tab click handler swaps it into the active leaf, the same way
 * continuous read mode replaces it (see ContinuousReadView.ts). A fixed header (series title,
 * hero image, description) over an independently scrolling novel list —
 * each row its own title + synopsis, filtered to placed-only or unplaced-only to match whichever
 * novel is currently selected (both show when nothing is selected). A placed novel's title line is
 * a word-count databar in the novel's own colour, scaled against the longest placed novel; an
 * unplaced novel's title is a solid chip in that colour instead (renderNovelRow). The page
 * re-renders whenever series.md, any novel's novel.md, or any chapter changes (onOpen), so the
 * bars keep up while the author writes.
 *
 * The per-novel detail block this page used to show below the list (cover, Default PoV,
 * chapter-by-chapter plot) was removed — Story Context's Novel tab in the right sidebar shows the
 * same thing and, since a StoryForgeView.ts change made it auto-open there whenever a novel is
 * selected here, keeping a second copy on this page was pure duplication.
 *
 * The selected novel always follows the `selectedNovel` setting — the same one the storyForge
 * panel's Series tab highlights (TopPanel.ts's open-book marker) — rather than being passed in as
 * view state, so switching books there just needs `plugin.refreshSeriesOverviewView()` (called
 * from StoryForgeView.ts's onSelectBook/followActiveFile) to keep this page in sync.
 */
export class SeriesOverviewView extends ItemView {
	private closed = false;
	/** Bumped at the start of every render() — the placed cards' databars are painted only after
	 * their word counts resolve asynchronously, so a result that comes back after a newer render
	 * has started (its cards already replaced) is recognised by a stale generation and discarded. */
	private renderGeneration = 0;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Series overview";
	}

	getIcon(): string {
		return ICON_SERIES;
	}

	// This page's data sources: series.md (title, order, unplaced-order, per-book titles), plus every
	// novel's novel.md (which chapters are placed or archived) and its chapters' own text (the
	// placed cards' databar word totals) — without these, a reorder or rename made elsewhere (the
	// left sidebar's Series panel, the popup Series settings modal), or simply writing in a chapter,
	// left this page stale until something else happened to trigger a re-render. Every novel's
	// chapters are watched, not just placed ones — cheaper than working out which novels are placed
	// on every write, and the debounce absorbs it. Debounced and, crucially, also triggered by
	// metadataCache's own "changed" event
	// (not just vault's "modify") for the same reason StoryForgeView.ts's equivalent listener is:
	// "modify" fires the instant the file is written, before Obsidian has finished re-parsing its
	// frontmatter — reading getSeriesBooks() synchronously off that raw event renders the *previous*
	// frontmatter, one write behind, which is exactly what "central section only catches up right
	// before the next change" looks like. "changed" fires once the parsed cache is actually ready.
	private readonly debouncedRender = debounce(() => {
		if (!this.closed && !isDragInProgress()) this.render();
	}, 400);

	async onOpen(): Promise<void> {
		// Same path filter as NovelOverviewView.ts's own modify listener, narrowed to what this page
		// shows — backstage bookkeeping writes are skipped first, since they never change it.
		const isRelevantPath = (path: string): boolean =>
			!isBackstageBookkeepingPath(path) &&
			(isLibraryChapterPath(path) || path.endsWith("novel.md") || path === seriesFilePath());
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isRelevantPath(file.path)) this.debouncedRender();
			}),
		);
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (isRelevantPath(file.path)) this.debouncedRender();
		}));
		// Keeps the fixed band's and novel list's 20px insets aligned/solid across a scrollbar
		// appearing or disappearing (measureSeriesOverviewScrollbarGutter's own doc comment,
		// NovelPanel.ts — same technique the central Novel pane uses) — render() already re-measures
		// on every render triggered by the listeners above; these two catch the remaining cases that
		// don't themselves trigger a render: the pane being resized and a theme/CSS snippet change
		// that restyles/re-widths the scrollbar. Observing contentEl itself (not the scroll pane,
		// which render() rebuilds from scratch every time) means this never needs re-attaching.
		const scrollbarGutterObserver = new ResizeObserver(() => measureSeriesOverviewScrollbarGutter(this.contentEl));
		scrollbarGutterObserver.observe(this.contentEl);
		this.register(() => scrollbarGutterObserver.disconnect());
		this.registerEvent(this.app.workspace.on("css-change", () => measureSeriesOverviewScrollbarGutter(this.contentEl)));
		this.render();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.debouncedRender.cancel();
		this.contentEl.empty();
	}

	render(): void {
		if (isDragInProgress()) return;
		const generation = ++this.renderGeneration;
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-series-overview-view");

		const fixed = contentEl.createDiv({ cls: "sf-series-overview-fixed" });
		this.renderTitleField(fixed);
		this.renderCoverDescriptionRow(fixed);

		const scroll = contentEl.createDiv({ cls: "sf-series-overview-scroll" });
		this.renderNovelsList(scroll, generation);

		measureSeriesOverviewScrollbarGutter(contentEl);
	}

	/** Plain clickable h1 text, not an input — mirrors the novel row title's own move
	 * (renderNovelRow, below): clicking opens SeriesTitleModal, where renaming (and titleForge's
	 * generator) now live. */
	private renderTitleField(container: HTMLElement): void {
		const titleRow = container.createDiv({ cls: "sf-modal-title-row sf-series-title-row" });
		const titleWrap = titleRow.createDiv({ cls: "sf-series-title-wrap" });
		const seriesTitle = readSeriesFrontmatter(this.app).seriesTitle;
		const titleEl = titleWrap.createDiv({
			cls: "sf-series-title-input sf-series-title-clickable",
			text: seriesTitle,
			attr: { role: "button", tabindex: "0", "aria-label": "series title" },
		});
		setTooltip(titleEl, "series title");
		const openTitleModal = () =>
			new SeriesTitleModal(this.app, this.plugin, () => {
				if (!this.closed) this.render();
			}).open();
		titleEl.addEventListener("click", openTitleModal);
		makeAccessibleActivatable(titleEl, openTitleModal);
	}

	/** Beneath the title: the series' own cover (left, click to set — same cover box NovelPanel.ts's
	 * per-book cover uses, just backed by the series' own writeSeriesCoverImage instead of a book's)
	 * and its description (right, a plain textarea sized to match the cover's height). Replaces the
	 * plain hint text that used to sit here. */
	private renderCoverDescriptionRow(container: HTMLElement): void {
		const row = container.createDiv({ cls: "sf-series-overview-cover-row" });

		const cover = row.createDiv({ cls: "sf-synopsis-cover sf-series-overview-cover", attr: { "aria-label": "series hero image" } });
		setTooltip(cover, "series hero image");
		renderSeriesCover(this.app, cover);
		cover.addEventListener("click", () => pickSeriesCover(this.app, cover));

		const description = row.createEl("textarea", {
			cls: "sf-modal-input sf-series-overview-description",
			attr: { "aria-label": "series description" },
		});
		setTooltip(description, "series description");
		description.addEventListener("pointerdown", (e) => e.stopPropagation());
		description.addEventListener("blur", () => {
			void writeSeriesDescription(this.app, description.value);
		});
		void readSeriesDescription(this.app).then((value) => {
			if (this.closed) return;
			description.value = value;
		});
	}

	/** Filtered to match the currently selected novel — placed-only if it's in the series order,
	 * unplaced-only if it isn't, or everything when nothing is selected. Not reorderable here —
	 * dragging a card only ever moved the row, not the underlying series/unplaced order (see
	 * TopPanel.ts's own left-sidebar list for that), so it was dropped along with the drag handle
	 * (this page's own follow-up brief).
	 *
	 * Placed novels' title lines carry a databar (renderNovelRow, paintSeriesNovelBar), filled in
	 * once every placed novel's live word total has been read — asynchronously, so each card is
	 * drawn first and painted afterwards, and a result that resolves after the view has closed or a
	 * newer render has begun (`generation` no longer current) is dropped. Nothing is read at all
	 * when only unplaced novels are showing: they never have a bar and never set the scale. */
	private renderNovelsList(container: HTMLElement, generation: number): void {
		container.empty();
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const selected = this.plugin.getSettings().selectedNovel;
		const selectedIsUnplaced = selected !== null && unplaced.some((f) => f.name === selected);
		const showOrdered = !selected || !selectedIsUnplaced;
		const showUnplaced = !selected || selectedIsUnplaced;

		const list = container.createDiv({ cls: "sf-top-list" });
		const placedRows: { folder: TFolder; row: PlacedNovelRow }[] = [];
		if (showOrdered) {
			for (const folder of ordered) {
				const row = this.renderNovelRow(list, folder, { ordered, unplaced }, true);
				if (row) placedRows.push({ folder, row });
			}
		}
		if (showUnplaced) for (const folder of unplaced) this.renderNovelRow(list, folder, { ordered, unplaced }, false);
		if (ordered.length === 0 && unplaced.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
		}
		if (placedRows.length > 0) void this.paintPlacedNovelBars(placedRows, generation);
	}

	/** Reads each placed novel's total — the sum of its placed, non-archived chapters' live word
	 * counts, the same figure the Novel pane's header bar uses — then scales every placed card's
	 * bar against the longest of them (computeSeriesNovelBarLayout, seriesNovelBar.ts). */
	private async paintPlacedNovelBars(
		placedRows: { folder: TFolder; row: PlacedNovelRow }[],
		generation: number,
	): Promise<void> {
		let totals: number[];
		try {
			totals = await Promise.all(
				placedRows.map(async ({ folder }) => {
					const counts = await readOrderedChapterWordCounts(
						this.app,
						folder.name,
						getBookChapters(this.app, folder.name).ordered,
					);
					return counts.reduce((sum, n) => sum + n, 0);
				}),
			);
		} catch (err) {
			console.error("storyForge: could not read novel word counts for the Series overview", err);
			return;
		}
		if (this.closed || generation !== this.renderGeneration) return;
		const layout = computeSeriesNovelBarLayout(totals);
		placedRows.forEach(({ row }, i) => paintSeriesNovelBar(row, layout[i]));
	}

	/** One novel's row: just the "card" now (cover image, then a title input over a synopsis
	 * textarea — a grid, see .sf-series-overview-card in styles.css, so the cover can span the
	 * title+synopsis column's combined height) — no drag handle any more, and nothing here is
	 * reorderable (see renderNovelsList's own doc comment).
	 *
	 * The title itself is plain clickable text, not an input — "Volume #//Outside the Walls"
	 * renders as "Volume 1 (Outside the Walls)" (numberedBookTitle resolves the "#", splitTitleSubtitle
	 * pulls the "// subtitle" off, shown in parentheses on the same line rather than TopPanel's own
	 * convention of a second muted line — there's no room for two lines here). Clicking it opens
	 * NovelTitleModal, which is where renaming (and titleForge's generators) now live. `prefetched`
	 * is this render pass's one getSeriesBooks() result, reused across every row's numbering instead
	 * of each row re-querying it (see numberedBookTitle's own doc comment).
	 *
	 * The novel's colour comes from resolveNovelRowColor (novelColor.ts) — the same accent
	 * NovelTitleModal's colour option sets, or that function's own random-looking per-novel default
	 * when nothing's been picked yet — applied only to the title line itself, not the whole card
	 * (cover stays on the card's own background). How it's applied depends on `placed`:
	 * - Unplaced novels (not part of the series): a solid chip — the title's own background and
	 *   text colour set straight from that colour. Returns null.
	 * - Placed novels: no solid chip. The title line is marked as a databar host instead and its
	 *   pieces are returned, so renderNovelsList can paint the fill (paintSeriesNovelBar) once the
	 *   novel's word total has been read; the unfilled remainder shows the page's own background
	 *   (--background-primary, styles.css) rather than the card's darker one.
	 * The synopsis box has no top, right, or bottom border at all (styles.css) — just its plain left
	 * edge, inherited from .sf-modal-input. */
	private renderNovelRow(
		list: HTMLElement,
		folder: TFolder,
		prefetched: { ordered: TFolder[]; unplaced: TFolder[] },
		placed: boolean,
	): PlacedNovelRow | null {
		const row = list.createDiv({ cls: "sf-row sf-series-overview-row" });

		const card = row.createDiv({ cls: "sf-series-overview-card" });

		const cover = card.createDiv({ cls: "sf-synopsis-cover sf-series-overview-row-cover", attr: { "aria-label": "cover" } });
		setTooltip(cover, "cover");
		renderNovelCover(this.app, cover, folder.name);
		cover.addEventListener("click", () => pickNovelCover(this.app, cover, folder.name));

		const titleLine = card.createDiv({ cls: "sf-series-overview-row-title-line" });
		const { title, subtitle } = splitTitleSubtitle(
			numberedBookTitle(this.app, folder.name, prefetched, this.plugin.getSettings().seriesNumberingStyle),
		);
		const titleEl = titleLine.createDiv({
			cls: "sf-series-overview-row-title",
			text: subtitle ? `${title} (${subtitle})` : title,
			attr: { role: "button", tabindex: "0", "aria-label": "title" },
		});
		const rowColor = resolveNovelRowColor(this.app, folder.name, this.plugin.getSettings());
		if (placed) titleLine.addClass("sf-series-overview-row-title-line--databar");
		else if (rowColor) titleEl.setCssStyles({ backgroundColor: rowColor.background, color: rowColor.text });
		setTooltip(titleEl, "title");
		const openTitleModal = () =>
			new NovelTitleModal(this.app, this.plugin, folder.name, () => {
				if (!this.closed) this.render();
			}).open();
		titleEl.addEventListener("click", openTitleModal);
		makeAccessibleActivatable(titleEl, openTitleModal);

		const synopsis = card.createEl("textarea", {
			cls: "sf-modal-input sf-series-overview-row-synopsis",
			attr: { "aria-label": "synopsis" },
		});
		setTooltip(synopsis, "synopsis");
		synopsis.addEventListener("pointerdown", (e) => e.stopPropagation());
		synopsis.addEventListener("blur", () => {
			void writeBookSynopsis(this.app, folder.name, synopsis.value);
		});
		void readBookSynopsis(this.app, folder.name).then((value) => {
			if (this.closed) return;
			synopsis.value = value;
		});

		return placed ? { titleLine, titleEl, rowColor } : null;
	}
}

/** The pieces of a placed novel card's title line that paintSeriesNovelBar needs. */
interface PlacedNovelRow {
	titleLine: HTMLElement;
	titleEl: HTMLElement;
	rowColor: NovelRowColor | null;
}

/**
 * Paints one placed novel card's databar — a simpler sibling of NovelPanel.ts's renderDataBar
 * (chapter cards), deliberately kept separate from it: one solid segment, no target marker, no
 * overflow lattice, and the title line keeps its usual height. Same construction for the same
 * reason — a plain absolutely positioned `<div>` with inline left/width, not a CSS custom
 * property or gradient, so there's nothing that can silently fail to resolve. The segment spans
 * the title line's true 0%–100% width (cover's right edge to the card's); the title's own padding
 * insets only its text, which sits above the segment (see
 * .sf-series-overview-row-title-line--databar in styles.css).
 */
function paintSeriesNovelBar(row: PlacedNovelRow, entry: SeriesNovelBarEntry): void {
	const { titleLine, titleEl, rowColor } = row;
	const color = rowColor?.background ?? "var(--background-modifier-border)";
	// Matches the title line's own right-corner radius — the fill's right end rounds only when it's
	// the bar's visual end. At 100% the title line's own rounded corner and clipping supply the
	// curve, so the segment stays square there. The left edge is always square against the cover.
	const cornerRadius = 4;
	const roundedEnd = entry.sliver || entry.fillPercent < 100;

	const seg = titleLine.createDiv({ cls: "sf-series-overview-row-databar-segment" });
	seg.setCssStyles({
		left: "0",
		// No words yet: a 3px sliver at the start, as chapter cards show.
		width: entry.sliver ? "3px" : `${entry.fillPercent}%`,
		backgroundColor: color,
		borderRadius: roundedEnd ? `0 ${cornerRadius}px ${cornerRadius}px 0` : "0",
	});

	// Title text-colour split: rowColor.text where the fill covers the title, rowColor.background
	// (the novel's own colour, as plain coloured text) beyond it — a hard cutover at the fill's own
	// percentage, painted through background-clip: text so a truncated title's ellipsis takes the
	// colour at its own position too. Left alone when there's no novel colour, as renderDataBar does.
	if (rowColor) {
		const fillPercent = entry.fillPercent;
		titleEl.style.setProperty(
			"background-image",
			`linear-gradient(to right, ${rowColor.text} 0%, ${rowColor.text} ${fillPercent}%, ${rowColor.background} ${fillPercent}%, ${rowColor.background} 100%)`,
		);
		titleEl.style.setProperty("background-clip", "text");
		titleEl.style.setProperty("-webkit-background-clip", "text");
		titleEl.style.setProperty("color", "transparent");
		titleEl.style.setProperty("-webkit-text-fill-color", "transparent");
	}
}

/** The series' own cover box — same has-image/placeholder rendering as NovelPanel.ts's per-book
 * renderNovelCover, just reading/writing the series' own cover (seriesBackstagePath()) instead of a
 * book's. Kept here rather than in NovelPanel.ts since nothing else needs a series-level cover. */
function renderSeriesCover(app: App, cover: HTMLElement): void {
	cover.empty();
	const coverImage = readSeriesFrontmatter(app).coverImage;
	const file = coverImage ? app.vault.getAbstractFileByPath(`${seriesBackstagePath()}/${coverImage}`) : null;
	if (file instanceof TFile) {
		cover.addClass("has-image");
		cover.createEl("img", { attr: { src: app.vault.getResourcePath(file) } });
	} else {
		cover.removeClass("has-image");
	}
}

function pickSeriesCover(app: App, cover: HTMLElement): void {
	const input = createEl("input", { type: "file", attr: { accept: "image/*" } });
	input.addEventListener("change", () => {
		const file = input.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			new Notice("storyForge: please choose an image file for the series hero image.");
			return;
		}
		void (async () => {
			try {
				const data = await file.arrayBuffer();
				const dotIndex = file.name.lastIndexOf(".");
				const extension =
					dotIndex !== -1 ? file.name.slice(dotIndex + 1).toLowerCase() : file.type.split("/")[1] || "png";
				await writeSeriesCoverImage(app, data, extension);
				renderSeriesCover(app, cover);
			} catch (err) {
				new Notice(`storyForge: could not set series hero image — ${err instanceof Error ? err.message : String(err)}`);
			}
		})();
	});
	input.click();
}
