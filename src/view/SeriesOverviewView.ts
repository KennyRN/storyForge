import { ItemView, Notice, setIcon, TFolder, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { bindTextCommit } from "./SeriesModal";
import { createBook, reorderSeriesBooks, renameBookTitle, readBookSynopsis, writeBookSynopsis } from "../book";
import { getSeriesBooks, readSeriesFrontmatter, writeSeriesTitle, writeUnplacedOrder } from "../series";
import { seriesFilePath } from "../paths";
import { makeReorderable, type DragZone } from "./dragReorder";
import { makeAccessibleActivatable } from "./a11y";
import { isDragInProgress } from "./dragLock";
import { debounce } from "../debounce";
import { ICON_BOOK_PLUS, ICON_SERIES } from "../icons";

export const STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE = "storyforge-series-overview-view";

/**
 * The Series tab's own full-page view, opened in the main editor area in place of a normal editor
 * — StoryForgeView.ts's layout-tab click handler swaps it into the active leaf, the same way
 * continuous read mode replaces it (see ContinuousReadView.ts). A fixed header (series title,
 * "Novels" list header, hint text, add-novel icon) over an independently scrolling novel list —
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

		fixed.createDiv({ cls: "sf-modal-list-header" }).createEl("h3", { text: "Novels" });

		const hintRow = fixed.createDiv({ cls: "sf-modal-hint-row" });
		hintRow.createDiv({
			cls: "sf-modal-hint",
			text: "# inserts a counted number\n// breaks title into title and subtitle",
		});
		const addBookBtn = hintRow.createSpan({ cls: "sf-modal-add-book", attr: { "aria-label": "New book" } });
		setIcon(addBookBtn, ICON_BOOK_PLUS);
		const handleCreateBook = async () => {
			try {
				await createBook(this.app);
				if (!this.closed) this.render();
			} catch (err) {
				new Notice(`storyForge: could not create book — ${(err as Error).message}`);
			}
		};
		addBookBtn.addEventListener("click", () => void handleCreateBook());
		makeAccessibleActivatable(addBookBtn, () => void handleCreateBook());

		const scroll = contentEl.createDiv({ cls: "sf-series-overview-scroll" });
		this.renderNovelsList(scroll);
	}

	private renderTitleField(container: HTMLElement): void {
		const titleRow = container.createDiv({ cls: "sf-modal-title-row sf-series-title-row" });
		const titleWrap = titleRow.createDiv({ cls: "sf-series-title-wrap" });
		const titleInput = titleWrap.createEl("input", {
			cls: "sf-modal-input sf-modal-title-input sf-series-title-input",
			type: "text",
			attr: { placeholder: "Series Name" },
		});
		titleInput.value = readSeriesFrontmatter(this.app).seriesTitle;
		bindTextCommit(titleInput, async (value) => {
			await writeSeriesTitle(this.app, value);
			if (!this.closed) this.render();
		});
		titleWrap.createDiv({ cls: "sf-series-title-label", text: "series name" });
	}

	/** Filtered to match the currently selected novel — placed-only if it's in the series order,
	 * unplaced-only if it isn't, or everything when nothing is selected. Reordering persists to
	 * whichever single list is actually on screen: the placed set via reorderSeriesBooks (which
	 * replaces the whole `order` array — see resolveOrder in ordering.ts), or the unplaced set via
	 * its own separate writeUnplacedOrder (see SeriesFrontmatter's unplacedOrder doc comment for why
	 * that's a distinct field rather than reusing `order`, which would place them). With both lists
	 * showing at once (nothing selected) there's no single field a combined drag could write back
	 * to without corrupting the other category, so dragging is display-only there. */
	private renderNovelsList(container: HTMLElement): void {
		container.empty();
		const { ordered, unplaced } = getSeriesBooks(this.app);
		const selected = this.plugin.getSettings().selectedNovel;
		const selectedIsUnplaced = selected !== null && unplaced.some((f) => f.name === selected);
		const showOrdered = !selected || !selectedIsUnplaced;
		const showUnplaced = !selected || selectedIsUnplaced;
		const reorderable = showOrdered !== showUnplaced;

		const list = container.createDiv({ cls: "sf-top-list" });
		if (showOrdered) for (const folder of ordered) this.renderNovelRow(list, folder);
		if (showUnplaced) for (const folder of unplaced) this.renderNovelRow(list, folder);
		if (ordered.length === 0 && unplaced.length === 0) {
			list.createDiv({ cls: "sf-empty sf-empty-inline", text: "No books yet." });
		}

		if (!reorderable) return;
		const zones: DragZone[] = [{ key: "order", container: list }];
		makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
			void (async () => {
				const newOrder = (zoneRowKeys.order ?? []).filter(Boolean);
				try {
					if (showOrdered) {
						await reorderSeriesBooks(this.app, newOrder);
					} else {
						await writeUnplacedOrder(this.app, newOrder);
					}
				} catch (err) {
					new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
					if (!this.closed) this.render();
				}
			})();
		});
	}

	/** One novel's row: a title line (drag handle + title input) with a synopsis textarea beneath
	 * it. The handle sits centred on the title line only, not the taller row it's actually part of
	 * — dragging it still moves title + synopsis together, since both live under the one draggable
	 * `.sf-row`. */
	private renderNovelRow(list: HTMLElement, folder: TFolder): void {
		const row = list.createDiv({ cls: "sf-row sf-series-overview-row" });
		row.dataset.key = folder.name;

		const titleLine = row.createDiv({ cls: "sf-series-overview-row-title-line" });
		setIcon(titleLine.createSpan({ cls: "sf-drag-handle" }), "grip-vertical");
		const input = titleLine.createEl("input", { cls: "sf-modal-input sf-modal-book-input", type: "text" });
		input.value = readSeriesFrontmatter(this.app).books[folder.name]?.bookTitle ?? folder.name;
		bindTextCommit(input, async (value) => {
			await renameBookTitle(this.app, folder.name, value);
			if (!this.closed) this.render();
		});

		const synopsis = row.createEl("textarea", {
			cls: "sf-modal-input sf-series-overview-row-synopsis",
			attr: { "aria-label": `Synopsis for ${folder.name}` },
		});
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
