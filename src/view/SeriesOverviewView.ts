import { App, ItemView, Notice, setTooltip, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { readBookSynopsis, writeBookSynopsis } from "../book";
import {
	getSeriesBooks,
	numberedBookTitle,
	readSeriesDescription,
	readSeriesFrontmatter,
	writeSeriesCoverImage,
	writeSeriesDescription,
} from "../series";
import { seriesBackstagePath, seriesFilePath } from "../paths";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { isDragInProgress } from "./dragLock";
import { debounce } from "../debounce";
import { ICON_SERIES } from "../icons";
import { measureSeriesOverviewScrollbarGutter, renderNovelCover, pickNovelCover } from "./NovelPanel";
import { NovelTitleModal } from "./NovelTitleModal";
import { SeriesTitleModal } from "./SeriesTitleModal";
import { resolveNovelRowColor } from "./novelColor";

export const STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE = "storyforge-series-overview-view";

/**
 * The Series tab's own full-page view, opened in the main editor area in place of a normal editor
 * — StoryForgeView.ts's layout-tab click handler swaps it into the active leaf, the same way
 * continuous read mode replaces it (see ContinuousReadView.ts). A fixed header (series title,
 * hero image, description) over an independently scrolling novel list —
 * each row its own title + synopsis, filtered to placed-only or unplaced-only to match whichever
 * novel is currently selected (both show when nothing is selected).
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

	// series.md is this page's whole data source (title, order, unplaced-order, per-book titles) —
	// without this, a reorder or rename made elsewhere (the left sidebar's Series panel, the popup
	// Series settings modal) left this page stale until something else happened to trigger a
	// re-render. Debounced and, crucially, also triggered by metadataCache's own "changed" event
	// (not just vault's "modify") for the same reason StoryForgeView.ts's equivalent listener is:
	// "modify" fires the instant the file is written, before Obsidian has finished re-parsing its
	// frontmatter — reading getSeriesBooks() synchronously off that raw event renders the *previous*
	// frontmatter, one write behind, which is exactly what "central section only catches up right
	// before the next change" looks like. "changed" fires once the parsed cache is actually ready.
	private readonly debouncedRender = debounce(() => {
		if (!this.closed && !isDragInProgress()) this.render();
	}, 400);

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file.path === seriesFilePath()) this.debouncedRender();
			}),
		);
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			if (file.path === seriesFilePath()) this.debouncedRender();
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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-series-overview-view");

		const fixed = contentEl.createDiv({ cls: "sf-series-overview-fixed" });
		this.renderTitleField(fixed);
		this.renderCoverDescriptionRow(fixed);

		const scroll = contentEl.createDiv({ cls: "sf-series-overview-scroll" });
		this.renderNovelsList(scroll);

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
	 * (this page's own follow-up brief). */
	private renderNovelsList(container: HTMLElement): void {
		container.empty();
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const selected = this.plugin.getSettings().selectedNovel;
		const selectedIsUnplaced = selected !== null && unplaced.some((f) => f.name === selected);
		const showOrdered = !selected || !selectedIsUnplaced;
		const showUnplaced = !selected || selectedIsUnplaced;

		const list = container.createDiv({ cls: "sf-top-list" });
		if (showOrdered) for (const folder of ordered) this.renderNovelRow(list, folder, { ordered, unplaced });
		if (showUnplaced) for (const folder of unplaced) this.renderNovelRow(list, folder, { ordered, unplaced });
		if (ordered.length === 0 && unplaced.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
		}
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
	 * The title chip's own background/text colour comes from resolveNovelRowColor (novelColor.ts) —
	 * the same accent NovelTitleModal's colour option sets, or that function's own random-looking
	 * per-novel default when nothing's been picked yet — applied only to the title line itself, not
	 * the whole card (cover stays on the card's own background). The synopsis box has no top, right,
	 * or bottom border at all (styles.css) — just its plain left edge, inherited from .sf-modal-input. */
	private renderNovelRow(
		list: HTMLElement,
		folder: TFolder,
		prefetched: { ordered: TFolder[]; unplaced: TFolder[] },
	): void {
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
		if (rowColor) titleEl.setCssStyles({ backgroundColor: rowColor.background, color: rowColor.text });
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
