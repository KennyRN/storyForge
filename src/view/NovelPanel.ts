import { App, Notice, TFile, setIcon, setTooltip } from "obsidian";
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
	ICON_LOCATION_TARGET_SQUARE,
	ICON_MAP_PIN,
	ICON_MAP_PIN_PLUS,
	ICON_PERSON_FILL,
	ICON_PERSON_FILL_ADD,
	ICON_TIMELINE,
} from "../icons";
import { bookBackstagePath } from "../paths";
import { resolveChapterNarrator } from "../recommend/narrator";
import type { CastMember } from "../recommend/types";
import { getBookId, numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";

/**
 * A novel's cover/synopsis/Default PoV/chapter-by-chapter plot — the content Story Context's own
 * Novel tab (RecommendationView.ts) shows in the right sidebar, and the storyLibrary panel's
 * Novel-layout main-pane page (NovelOverviewView.ts) mirrors in the main editor area. One render
 * function shared by both hosts rather than two copies drifting apart (see SeriesOverviewView.ts's
 * doc comment for the duplication this project already learned not to repeat).
 */
export interface NovelPanelOptions {
	bookFolderName: string | null;
	/** Shown in place of the panel when no novel is selected — hosts word this slightly differently. */
	emptyText: string;
	/** RecommendationView's own hydrated cast list, used to validate a PoV path still resolves to a
	 * live Codex person entry (see resolveChapterNarrator's doc comment). Omitted by simpler hosts —
	 * resolveChapterNarrator falls back to the stored PoV name directly without it. */
	castCache?: CastMember[];
	/** Per-chapter plot row's own way to act on a chapter — Story Context's "sidebar" layout opens
	 * it for real (RecommendationView.ts's own openChapter, a jump icon); the storyLibrary panel's
	 * "wide" layout instead just selects it (NovelOverviewView.ts's own selectChapter, the whole
	 * row) so its own Novel overview page stays put. */
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	/** Re-render trigger after an edit made through this panel (cover, PoV/location pickers, …). */
	onChanged: () => void;
	/** Checked after every async read before it's applied to the DOM — true skips the write, so a
	 * closed view or a since-changed selection never lands a stale value. */
	isStale: () => boolean;
	/** "sidebar" (default, omit to get it) is Story Context's own stacked/centred layout: cover on
	 * top, title/subtitle beneath it, synopsis and Default PoV below that, one column throughout.
	 * "wide" is the storyLibrary panel's Novel-overview page (NovelOverviewView.ts) — a larger,
	 * left-aligned cover with no title/subtitle, synopsis and Default PoV beside it instead of
	 * under it, and a plainer plot list (no per-chapter jump icon, no dividing lines between
	 * chapters — the whole chapter-name row opens it instead). */
	layout?: "sidebar" | "wide";
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
	// column beside it) — everything else (title/subtitle, synopsis, Default PoV) still parents
	// directly off `fixed` for "sidebar", one column top to bottom same as before.
	const coverHost = wide ? fixed.createDiv({ cls: "sf-recommend-novel-cover-row" }) : fixed;

	const cover = coverHost.createDiv({ cls: "sf-synopsis-cover sf-recommend-novel-cover" });
	renderNovelCover(app, cover, bookFolderName);
	cover.addEventListener("click", () => pickNovelCover(app, cover, bookFolderName));

	const textHost = wide ? coverHost.createDiv({ cls: "sf-recommend-novel-text-col" }) : fixed;

	if (!wide) {
		const numberedTitle = numberedBookTitle(app, bookFolderName);
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

	const defaultPovSection = textHost.createDiv({ cls: "sf-recommend-section" });
	renderDefaultPovRow(app, defaultPovSection, bookFolderName, options.onChanged);

	// Sibling of coverHost (not nested in it) so it sits below the row as a whole — with the cover
	// enlarged for "wide", that's beneath the cover, which is taller than the text column beside it.
	const plotLine = fixed.createDiv({ cls: "sf-book-line sf-synopsis-plot-title" });
	setIcon(plotLine.createSpan({ cls: "sf-icon" }), ICON_TIMELINE);
	const plotTitleRow = plotLine.createDiv({ cls: "sf-header-line sf-book-title-row" });
	const plotTextWrap = plotTitleRow.createDiv({ cls: "sf-book-text-wrap" });
	plotTextWrap.createSpan({ cls: "sf-header-text", text: "Plot" });

	const scroll = body.createDiv({ cls: "sf-recommend-scroll" });
	void renderNovelPlot(app, scroll, bookFolderName, options, wide);
}

function renderNovelCover(app: App, cover: HTMLElement, bookFolderName: string): void {
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

function pickNovelCover(app: App, cover: HTMLElement, bookFolderName: string): void {
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
): Promise<void> {
	scroll.empty();
	const { ordered } = getBookChapters(app, bookFolderName);
	if (ordered.length === 0) {
		scroll.createDiv({ cls: "sf-empty", text: "No placed chapters yet." });
		return;
	}
	for (const file of ordered) {
		const block = scroll.createDiv({ cls: "sf-recommend-plot-block" });
		if (wide) block.addClass("sf-recommend-plot-block--plain");
		const headerRow = block.createDiv({ cls: "sf-recommend-plot-header-row" });
		headerRow.createDiv({
			cls: "sf-recommend-plot-chapter-name",
			text: numberedChapterTitle(app, bookFolderName, file.name),
		});
		if (wide) {
			// No separate jump icon here — the whole row opens the chapter instead.
			headerRow.addClass("sf-recommend-plot-header-row--clickable");
			const open = () => options.onOpenChapter(bookFolderName, file.name);
			headerRow.addEventListener("click", open);
			makeAccessibleActivatable(headerRow, open);
		} else {
			// Same icon/tooltip/behaviour as Story Context's Chapter tab "go to chapter" control —
			// this panel's own per-chapter way to jump straight to a specific chapter from the plot list.
			iconAction(headerRow, ICON_LOCATION_TARGET_SQUARE, "go to chapter", () => options.onOpenChapter(bookFolderName, file.name));
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

		const textarea = block.createEl("textarea", {
			cls: "sf-recommend-synopsis sf-recommend-plot-textarea",
			attr: { "aria-label": `Plot notes for ${file.name}` },
		});
		textarea.addEventListener("pointerdown", (e) => e.stopPropagation());
		textarea.addEventListener("blur", () => {
			void writeChapterPlot(app, bookFolderName, file.name, textarea.value);
		});
		const plot = await readChapterPlot(app, bookFolderName, file.name);
		if (options.isStale()) return;
		textarea.value = plot;
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

/** Small icon-only action button — shared by this panel's "go to chapter" jump and Story Context's
 * various list-row actions (RecommendationView.ts). */
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
