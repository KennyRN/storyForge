import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type StoryForgePlugin from "../main";
import { renderSeriesSettingsBody } from "./SeriesModal";
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
import { bookBackstagePath } from "../paths";
import { getBookId, numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { resolveChapterNarrator } from "../recommend/narrator";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_MAP_PIN, ICON_MAP_PIN_PLUS, ICON_PERSON_FILL, ICON_PERSON_FILL_ADD, ICON_SERIES, ICON_TIMELINE } from "../icons";

export const STORYFORGE_SERIES_OVERVIEW_VIEW_TYPE = "storyforge-series-overview-view";

/**
 * The Series tab's own full-page view, opened in the main editor area in place of a normal editor
 * — StoryForgeView.ts's layout-tab click handler swaps it into the active leaf, the same way
 * continuous read mode replaces it (see ContinuousReadView.ts). Two sections, stacked:
 *
 *  1. The series settings (title, book list, reorder, add book) — SeriesModal.ts's own body,
 *     reused via its exported `renderSeriesSettingsBody()` so there's one source of truth for
 *     that content, not a second copy that can drift from the modal.
 *  2. The selected novel's details (cover, title, synopsis, Default PoV, plot-by-chapter). The
 *     *elements* Story Context's Novel tab shows are mirrored here — same underlying read/write
 *     calls (writeBookSynopsis, writeDefaultPov, writeChapterPov, …) — but laid out differently
 *     (a full page, not a narrow sidebar) and rendered entirely by this file's own code. Story
 *     Context itself (RecommendationView.ts) is neither read from nor written to here — the two
 *     stay independent by design, so nothing about Story Context's own settings or styling
 *     affects this page or vice versa.
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

	async onOpen(): Promise<void> {
		this.render();
	}

	async onClose(): Promise<void> {
		this.closed = true;
		this.contentEl.empty();
	}

	render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-series-overview-view");

		const settingsSection = contentEl.createDiv({ cls: "sf-series-overview-settings" });
		renderSeriesSettingsBody(settingsSection, this.app, () => this.render());

		const bookFolderName = this.plugin.getSettings().selectedNovel;
		const novelSection = contentEl.createDiv({ cls: "sf-series-overview-novel" });
		if (!bookFolderName) {
			novelSection.createDiv({ cls: "sf-empty", text: "Select a novel above to see its details." });
			return;
		}
		this.renderNovel(novelSection, bookFolderName);
	}

	private renderNovel(container: HTMLElement, bookFolderName: string): void {
		const top = container.createDiv({ cls: "sf-series-overview-top" });

		const cover = top.createDiv({ cls: "sf-synopsis-cover sf-series-overview-cover" });
		this.renderCover(cover, bookFolderName);
		cover.addEventListener("click", () => this.pickCover(cover, bookFolderName));

		const details = top.createDiv({ cls: "sf-series-overview-details" });
		const { title, subtitle } = splitTitleSubtitle(numberedBookTitle(this.app, bookFolderName));
		details.createDiv({ cls: "sf-series-overview-title", text: title });
		if (subtitle) {
			details.createDiv({ cls: "sf-series-overview-subtitle", text: subtitle });
		}

		const synopsis = details.createEl("textarea", {
			cls: "sf-series-overview-synopsis",
			attr: { "aria-label": "Novel synopsis" },
		});
		synopsis.addEventListener("pointerdown", (e) => e.stopPropagation());
		synopsis.addEventListener("blur", () => {
			void writeBookSynopsis(this.app, bookFolderName, synopsis.value);
		});
		void readBookSynopsis(this.app, bookFolderName).then((value) => {
			if (this.closed || this.plugin.getSettings().selectedNovel !== bookFolderName) return;
			synopsis.value = value;
		});

		this.renderDefaultPovRow(details, bookFolderName);

		const plotTitle = container.createDiv({ cls: "sf-series-overview-section-title" });
		setIcon(plotTitle.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
		plotTitle.createSpan({ text: "Plot" });

		const plot = container.createDiv({ cls: "sf-series-overview-plot" });
		this.renderPlot(plot, bookFolderName);
	}

	private renderCover(cover: HTMLElement, bookFolderName: string): void {
		cover.empty();
		const coverImage = readBookFrontmatter(this.app, bookFolderName)?.coverImage ?? null;
		const file = coverImage
			? this.app.vault.getAbstractFileByPath(`${bookBackstagePath(bookFolderName)}/${coverImage}`)
			: null;
		if (file instanceof TFile) {
			cover.addClass("has-image");
			cover.createEl("img", { attr: { src: this.app.vault.getResourcePath(file) } });
		} else {
			cover.removeClass("has-image");
		}
	}

	private pickCover(cover: HTMLElement, bookFolderName: string): void {
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
					await writeBookCoverImage(this.app, bookFolderName, data, extension);
					if (this.closed) return;
					this.renderCover(cover, bookFolderName);
				} catch (err) {
					new Notice(`storyForge: could not set cover image — ${err instanceof Error ? err.message : String(err)}`);
				}
			})();
		});
		input.click();
	}

	private renderDefaultPovRow(parent: HTMLElement, bookFolderName: string): void {
		const fm = readBookFrontmatter(this.app, bookFolderName);
		const path = fm?.defaultPovPath ?? null;
		const name = fm?.defaultPovName ?? null;
		const row = parent.createDiv({ cls: "sf-series-overview-meta-row" });
		this.renderMetaItem(
			row,
			"Default PoV:",
			path ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
			path ? (name ?? path) : null,
			!!path,
			() => void this.openDefaultPovPicker(bookFolderName, !!path),
			path ? "change pov character" : "set pov character",
		);
	}

	/** One chapter's record in the plot list: name as a header, PoV + Location on one row beneath
	 * it, then the chapter summary box. */
	private renderPlot(container: HTMLElement, bookFolderName: string): void {
		container.empty();
		const { ordered } = getBookChapters(this.app, bookFolderName);
		if (ordered.length === 0) return;

		for (const file of ordered) {
			const block = container.createDiv({ cls: "sf-series-overview-plot-block" });
			block.createEl("h3", {
				cls: "sf-series-overview-chapter-name",
				text: numberedChapterTitle(this.app, bookFolderName, file.name),
			});

			const entry = getChapterEntry(this.app, bookFolderName, file.name);
			const narrator = resolveChapterNarrator(this.app, bookFolderName, file.name);

			const metaRow = block.createDiv({ cls: "sf-series-overview-meta-inline" });
			this.renderMetaItem(
				metaRow,
				"PoV:",
				narrator ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
				narrator?.name ?? null,
				!!narrator,
				() => void this.openChapterPovPicker(bookFolderName, file.name, !!narrator),
				narrator ? "change pov character" : "set pov character",
			);
			this.renderMetaItem(
				metaRow,
				"Location:",
				entry?.locationPath ? ICON_MAP_PIN : ICON_MAP_PIN_PLUS,
				entry?.locationName ?? entry?.locationPath ?? null,
				!!entry?.locationPath,
				() => void this.openChapterLocationPicker(bookFolderName, file.name, !!entry?.locationPath),
				entry?.locationPath ? "change location" : "set location",
			);

			const summary = block.createEl("textarea", {
				cls: "sf-series-overview-summary",
				attr: { "aria-label": `Chapter summary for ${file.name}` },
			});
			summary.addEventListener("pointerdown", (e) => e.stopPropagation());
			summary.addEventListener("blur", () => {
				void writeChapterPlot(this.app, bookFolderName, file.name, summary.value);
			});
			void readChapterPlot(this.app, bookFolderName, file.name).then((value) => {
				if (this.closed || this.plugin.getSettings().selectedNovel !== bookFolderName) return;
				summary.value = value;
			});
		}
	}

	private renderMetaItem(
		parent: HTMLElement,
		label: string,
		iconId: string,
		value: string | null,
		hasValue: boolean,
		onOpen: () => void,
		tooltip: string,
	): void {
		const item = parent.createDiv({ cls: "sf-series-overview-meta-item" });
		item.createSpan({ cls: "sf-series-overview-meta-label", text: label });
		const control = item.createSpan({ cls: "sf-series-overview-meta-control", attr: { "aria-label": tooltip } });
		setIcon(control.createSpan({ cls: "sf-series-overview-meta-icon" }), iconId);
		control.createSpan({ cls: "sf-series-overview-meta-value", text: hasValue ? (value ?? "—") : "—" });
		control.addEventListener("click", onOpen);
		makeAccessibleActivatable(control, onOpen);
	}

	private async openDefaultPovPicker(bookFolderName: string, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeDefaultPov(this.app, bookFolderName, entry.path, entry.name);
				if (!this.closed) this.render();
			},
			async () => {
				await writeDefaultPov(this.app, bookFolderName, null, null);
				if (!this.closed) this.render();
			},
		).open();
	}

	private async openChapterPovPicker(bookFolderName: string, filename: string, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "person", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set PoV",
			"No person entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterPov(this.app, bookFolderName, filename, entry.path, entry.name);
				if (!this.closed) this.render();
			},
			async () => {
				await writeChapterPov(this.app, bookFolderName, filename, null, null);
				if (!this.closed) this.render();
			},
		).open();
	}

	private async openChapterLocationPicker(bookFolderName: string, filename: string, hasValue: boolean): Promise<void> {
		const bookId = getBookId(this.app, bookFolderName);
		const entries = getCodexEntriesByType(this.app, "place", bookId);
		new CodexEntryPickerModal(
			this.app,
			"Set location",
			"No place entries in the Codex yet.",
			entries,
			hasValue,
			async (entry) => {
				await writeChapterLocation(this.app, bookFolderName, filename, entry.path, entry.name);
				if (!this.closed) this.render();
			},
			async () => {
				await writeChapterLocation(this.app, bookFolderName, filename, null, null);
				if (!this.closed) this.render();
			},
		).open();
	}
}
