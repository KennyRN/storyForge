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
	type CodexRef,
} from "../book";
import { getCodexEntriesByType } from "../codex";
import { readChapterWordCount } from "../history";
import { ICON_MAP_PIN_PLUS, ICON_PERSON_FILL, ICON_PERSON_FILL_ADD, ICON_X, setNumberFillIcon } from "../icons";
import { bookBackstagePath } from "../paths";
import { resolveChapterNarrator } from "../story-context/narrator";
import type { CastMember } from "../story-context/types";
import { numberedBookTitle } from "../series";
import { splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { CodexEntryPickerModal } from "./CodexEntryPickerModal";
import { NovelTitleModal } from "./NovelTitleModal";
import { resolveChapterRowColor } from "./novelColor";
import { formatWordCount } from "../wordCount";
import { computeNovelLengthBarLayout, type NovelLengthBarLayout } from "./novelLengthBar";
import { nextPlotCardTier, plotCardTooltip, readPlotCardTier, withPlotCardTier, type PlotCardTier } from "./plotCardTier";

/**
 * A novel's cover/synopsis/chapter-by-chapter plot — the content Story Context's own Novel tab
 * (StoryContextView.ts) shows in the right sidebar, and the storyLibrary panel's Novel-layout
 * main-pane page (NovelOverviewView.ts) mirrors in the main editor area. One render function
 * shared by both hosts rather than two copies drifting apart (see SeriesOverviewView.ts's doc
 * comment for the duplication this project already learned not to repeat). Story Context's
 * sidebar omits the "Plot" heading. Neither host shows Default PoV any more — that row moved to
 * the storyLibrary panel's own left-sidebar Novel tab instead (TopPanel.ts's renderBookList,
 * alongside its Novel/Chapter Length rows), which is a different pane from either of these.
 */
export interface NovelPanelOptions {
	bookFolderName: string | null;
	/** Needed for settings (colour palette, plot-card collapse). */
	plugin: StoryForgePlugin;
	/** Shown in place of the panel when no novel is selected — hosts word this slightly differently. */
	emptyText: string;
	/** Story Context's own hydrated cast list, used to validate a PoV path still resolves to a
	 * live Codex person entry (see resolveChapterNarrator's doc comment). Omitted by simpler hosts —
	 * resolveChapterNarrator falls back to the stored PoV name directly without it. */
	castCache?: CastMember[];
	/** Re-render trigger after an edit made through this panel (cover, PoV/location pickers, …). */
	onChanged: () => void;
	/** Checked after every async read before it's applied to the DOM — true skips the write, so a
	 * closed view or a since-changed selection never lands a stale value. */
	isStale: () => boolean;
	/** "sidebar" (default, omit to get it) is Story Context's own stacked/centred layout: cover on
	 * top, title/subtitle beneath it, synopsis below that, then the plot cards.
	 * "wide" is the storyLibrary panel's Novel-overview page (NovelOverviewView.ts) — title/subtitle
	 * as a left-aligned page heading above a larger left-aligned cover, with the synopsis filling
	 * the rest of that column's height beside the cover instead of sitting under it. Both hosts
	 * share the same coloured plot cards and coloured chapter titles. */
	layout?: "sidebar" | "wide";
}

export function renderNovelPanel(app: App, container: HTMLElement, options: NovelPanelOptions): void {
	container.empty();
	const wide = options.layout === "wide";
	const body = container.createDiv({ cls: "sf-story-context-body" });

	if (!options.bookFolderName) {
		body.addClass("sf-story-context-body--scroll");
		body.createDiv({ cls: "sf-empty", text: options.emptyText });
		return;
	}

	const bookFolderName = options.bookFolderName;
	const fixed = body.createDiv({ cls: "sf-story-context-fixed sf-story-context-novel-fixed" });

	// "wide" shows the title as a page heading above the cover row; "sidebar" shows it centred
	// beneath the cover instead (below, once the cover/text-col split is set up).
	if (wide) {
		const numberedTitle = numberedBookTitle(app, bookFolderName, undefined, options.plugin.getSettings().seriesNumberingStyle);
		const { title, subtitle } = splitTitleSubtitle(numberedTitle);
		// Clicking the title or subtitle opens the name-only NovelTitleModal (rename, titleForge
		// dice, Novel Colour). The title carries the keyboard/button semantics; the subtitle is
		// just a second click target for the same modal.
		const openNameModal = () =>
			new NovelTitleModal(app, options.plugin, bookFolderName, options.onChanged, { nameOnly: true }).open();
		const titleEl = fixed.createDiv({
			cls: "sf-story-context-novel-title sf-story-context-novel-title--wide sf-story-context-novel-title--clickable",
			text: title,
		});
		titleEl.addEventListener("click", openNameModal);
		makeAccessibleActivatable(titleEl, openNameModal);
		if (subtitle) {
			const subtitleEl = fixed.createDiv({
				cls: "sf-story-context-novel-subtitle sf-story-context-novel-subtitle--wide sf-story-context-novel-title--clickable",
				text: subtitle,
			});
			subtitleEl.addEventListener("click", openNameModal);
		}
	}

	// "wide" splits into a cover-left/text-right row (cover, then synopsis beside it, filling the
	// full height of that column via flex — see .sf-story-context-novel-text-col's own synopsis
	// rule) — everything else (synopsis) still parents directly off `fixed` for "sidebar", one
	// column top to bottom same as before.
	const coverHost = wide ? fixed.createDiv({ cls: "sf-story-context-novel-cover-row" }) : fixed;

	const cover = coverHost.createDiv({ cls: "sf-synopsis-cover sf-story-context-novel-cover" });
	renderNovelCover(app, cover, bookFolderName);
	cover.addEventListener("click", () => pickNovelCover(app, cover, bookFolderName));

	const textHost = wide ? coverHost.createDiv({ cls: "sf-story-context-novel-text-col" }) : fixed;

	if (!wide) {
		const numberedTitle = numberedBookTitle(app, bookFolderName, undefined, options.plugin.getSettings().seriesNumberingStyle);
		const { title, subtitle } = splitTitleSubtitle(numberedTitle);
		fixed.createDiv({ cls: "sf-story-context-novel-title", text: title });
		if (subtitle) {
			fixed.createDiv({ cls: "sf-story-context-novel-subtitle", text: subtitle });
		}
	}

	const synopsis = textHost.createEl("textarea", {
		cls: "sf-story-context-synopsis sf-story-context-novel-synopsis",
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

	// Hoisted here (rather than inside renderNovelPlot, which used to compute both itself) so the
	// wide layout's novel length bar (below) and the chapter data bars can share one read instead
	// of each doing their own Promise.all over every placed chapter's content. getBookChapters()
	// is synchronous — only the per-chapter word-count read is async — so only that read needs a
	// shared promise; "sidebar" never creates one, so it never performs the extra read at all.
	const { ordered } = getBookChapters(app, bookFolderName);
	const wordCountsPromise: Promise<number[]> | null = wide
		? Promise.all(ordered.map((file) => readChapterWordCount(app, bookFolderName, file.name)))
		: null;

	// Novel length bar (wide only) — a new direct child of `fixed`, appended after coverHost so it
	// becomes the band's last child: it inherits the shared 60em/32px cap-and-inset rule the same
	// way the title/cover row above it do, and picks up the band's existing last-child 20px bottom
	// padding for free (coverHost's own margin-bottom, changed to 20px in styles.css, supplies the
	// matching gap above it). The bar itself renders empty here; segments/dividers are filled in
	// once wordCountsPromise resolves (see the fire-and-forget block below, after `scroll`).
	if (wide && wordCountsPromise) {
		const lengthBarWrap = fixed.createDiv({ cls: "sf-story-context-novel-length-bar-wrap" });
		const lengthBar = lengthBarWrap.createDiv({ cls: "sf-story-context-novel-length-bar" });
		// Background/border mirrored from the synopsis textarea directly, not guessed at via CSS
		// variable names — the synopsis sets neither itself (styles.css), so it's riding Obsidian's
		// own default <textarea> chrome, and measuring its actual computed style here is the only
		// way to be sure this bar matches it exactly, in every theme, without needing to know which
		// token Obsidian's own CSS happens to use internally. Corner radius is fixed 4px in CSS
		// instead (matching the chapter data bars and the synopsis's own explicit radius) — the
		// textarea's inherited radius turned out not to be a reliable thing to mirror.
		const synopsisStyle = synopsis.ownerDocument.defaultView?.getComputedStyle(synopsis);
		if (synopsisStyle) {
			lengthBar.setCssStyles({
				backgroundColor: synopsisStyle.backgroundColor,
				border: `${synopsisStyle.borderTopWidth} ${synopsisStyle.borderTopStyle} ${synopsisStyle.borderTopColor}`,
			});
		}
		void wordCountsPromise.then((wordCounts) => {
			if (options.isStale()) return;
			const plannedNovelLength = readBookFrontmatter(app, bookFolderName)?.plannedNovelLength ?? null;
			const layout = computeNovelLengthBarLayout(wordCounts, plannedNovelLength);
			renderNovelLengthBarContent(app, lengthBar, bookFolderName, ordered, wordCounts, layout, options);
		});
	}

	const scroll = body.createDiv({ cls: "sf-story-context-scroll" });
	// Wide only: the scroller itself stays full-width/unpadded (styles.css reserves a stable
	// scrollbar gutter on it instead), and this inner column carries the 60em cap/padding — see
	// measureNovelOverviewScrollbarGutter's own doc comment for why the split exists. Chapter cards
	// mount into whichever of the two is the right host; renderNovelPlot itself doesn't need to
	// know which.
	const scrollHost = wide ? scroll.createDiv({ cls: "sf-story-context-novel-scroll-column" }) : scroll;
	if (wide) measureNovelOverviewScrollbarGutter(container);
	void renderNovelPlot(app, scrollHost, bookFolderName, options, ordered, wordCountsPromise);
}

/**
 * Measures a scroller's actual reserved scrollbar gutter (its offsetWidth minus its clientWidth —
 * the width `scrollbar-gutter: stable` sets aside, whether or not a scrollbar is currently drawn)
 * and writes it onto `root` as the given custom property, which both a fixed header band's and the
 * scroller's own capped content columns (styles.css) subtract from their right padding. This is
 * what keeps a solid inset — exactly its own px value whether or not the scroller is tall enough
 * to actually show a scrollbar, and with the scrollbar (when shown) sitting inside that inset
 * rather than narrowing or widening it. Only writes the property when the measured value has
 * actually changed, so re-measuring on every render, on the scroller's own resize, and on
 * Obsidian's css-change event doesn't thrash layout. Queries for `scrollSelector` fresh each call
 * rather than taking an element reference, since the caller's own render typically rebuilds that
 * element from scratch each time — a stale reference from a resize/css-change listener set up once
 * in onOpen would otherwise measure a detached node.
 */
function measureScrollbarGutter(root: HTMLElement, scrollSelector: string, cssVarName: string): void {
	const scroll = root.querySelector<HTMLElement>(scrollSelector);
	if (!scroll) return;
	const gutter = Math.max(0, scroll.offsetWidth - scroll.clientWidth);
	const next = `${gutter}px`;
	if (root.style.getPropertyValue(cssVarName) !== next) {
		root.style.setProperty(cssVarName, next);
	}
}

/** The central Novel pane's own header band + chapter list — see measureScrollbarGutter's own doc
 * comment. Called from renderNovelPanel on every render and from NovelOverviewView.ts's own
 * resize/css-change listeners. */
export function measureNovelOverviewScrollbarGutter(root: HTMLElement): void {
	measureScrollbarGutter(root, ".sf-story-context-scroll", "--sf-novel-overview-scrollbar-gutter");
}

/** Same idea, for the Series overview page's own header band + novel list (SeriesOverviewView.ts) —
 * a separate custom property so the two pages' gutters never cross-contaminate each other's CSS. */
export function measureSeriesOverviewScrollbarGutter(root: HTMLElement): void {
	measureScrollbarGutter(root, ".sf-series-overview-scroll", "--sf-series-overview-scrollbar-gutter");
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

/** Exported for TopPanel.ts's Novel-tab chapter list, which shows this same row above its Novel
 * Length/Chapter Length fields — all three share one .sf-story-context-meta wrapper there (equal
 * spacing between all three rows), so this takes that wrapper directly rather than creating its
 * own nested one. */
export function renderDefaultPovRow(app: App, meta: HTMLElement, bookFolderName: string, onChanged: () => void): void {
	const fm = readBookFrontmatter(app, bookFolderName);
	const path = fm?.defaultPovPath ?? null;
	const name = fm?.defaultPovName ?? null;
	const row = meta.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: "Default PoV:" });
	renderMetaControl(row, {
		iconId: path ? ICON_PERSON_FILL : ICON_PERSON_FILL_ADD,
		value: path ? (name ?? path) : null,
		tooltip: path ? "change pov character" : "set pov character",
		onOpen: () => void openDefaultPovPicker(app, bookFolderName, !!path, onChanged),
	});
}

async function openDefaultPovPicker(app: App, bookFolderName: string, hasValue: boolean, onChanged: () => void): Promise<void> {
	const entries = getCodexEntriesByType(app, "person");
	new CodexEntryPickerModal(app, {
		title: "Set PoV",
		emptyMessage: "No person entries in the Codex yet.",
		entries,
		hasValue,
		onPick: async (entry) => {
			await writeDefaultPov(app, bookFolderName, entry.path, entry.name);
			onChanged();
		},
		onClear: async () => {
			await writeDefaultPov(app, bookFolderName, null, null);
			onChanged();
		},
	}).open();
}

/** Which of the Novel tab's two planned-length rows (if either) currently has its inline "push
 * down" number editor open — see renderPlannedLengthMetaRow. At most one at a time. Also reused
 * by NovelTitleModal, which shows the same two rows (its own local open/closed state, not a
 * shared one — TopPanel.ts's own editor closes independently of the modal's). */
export type PlannedLengthField = "novel" | "chapter";

/** Digits before the caret, ignoring any comma separators already in the value — used to
 * re-place the caret after reformatting adds/removes commas around it. */
function countDigitsBeforeCaret(input: HTMLInputElement): number {
	const pos = input.selectionStart ?? input.value.length;
	return (input.value.slice(0, pos).match(/\d/g) ?? []).length;
}

/** Inverse of countDigitsBeforeCaret: places the caret right after the Nth digit in the
 * (already reformatted) value, so typing/deleting in the middle of a grouped number doesn't
 * bounce the caret to the end every keystroke. */
function setCaretAfterDigitCount(input: HTMLInputElement, digitCount: number): void {
	if (digitCount <= 0) {
		input.setSelectionRange(0, 0);
		return;
	}
	let seen = 0;
	for (let i = 0; i < input.value.length; i++) {
		if (/\d/.test(input.value[i])) {
			seen++;
			if (seen === digitCount) {
				input.setSelectionRange(i + 1, i + 1);
				return;
			}
		}
	}
	input.setSelectionRange(input.value.length, input.value.length);
}

/** Shared comma-formatting/keyboard wiring for a planned-length numeric input — used by both
 * renderPlannedLengthEditorRow's "push down" editor and renderPlannedLengthAlwaysOpenRow's
 * permanently-visible field. Enter blurs (committing), Escape reverts to `value`, blur commits
 * whatever's left; `onDone` fires at most once (a fresh input from the next render carries its
 * own guard, so this only ever needs to protect a single element's own lifetime) — including when
 * a caller invokes the returned `finish` directly (the "x" clear button, which needs to commit
 * `null` regardless of whatever's currently typed, rather than blur's own read of the live value).
 * Does not focus the input — callers that want that (the "push down" editor, on open) do it
 * themselves. */
function bindPlannedLengthInput(input: HTMLInputElement, value: number | null, onDone: (next: number | null) => void): (next: number | null) => void {
	input.addEventListener("pointerdown", (e) => e.stopPropagation());
	input.addEventListener("input", () => {
		const caretDigits = countDigitsBeforeCaret(input);
		const digits = input.value.replace(/\D/g, "");
		input.value = digits ? Number(digits).toLocaleString("en-US") : "";
		setCaretAfterDigitCount(input, caretDigits);
	});
	let settled = false;
	const finish = (next: number | null) => {
		if (settled) return;
		settled = true;
		onDone(next);
	};
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") {
			event.preventDefault();
			input.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			finish(value);
		}
	});
	input.addEventListener("blur", () => {
		const digits = input.value.replace(/\D/g, "");
		finish(digits ? Number(digits) : null);
	});
	return finish;
}

/** The inline "push down" number editor a planned-length row opens beneath itself — same idea as
 * the storytelling panel's chapter selector expanding its 5-row list below the current-chapter row
 * (CodexFocusNavigator.ts) rather than a modal. A `--ghost` label (identical text, hidden but still
 * taking up space) reserves the same width the real label above occupies, so the input's left edge
 * lands exactly where that row's own value/icon sits — visually aligned with the label's colon.
 * Comma-grouped as you type; Enter blurs (committing), Escape reverts to the original value, the
 * "x" (renderMetaClearButton) clears outright — all three close the editor via `onDone`, called at
 * most once per open (the "x" beside the box is the only place this row shows one; the collapsed
 * meta-control above never does). */
function renderPlannedLengthEditorRow(meta: HTMLElement, label: string, value: number | null, onDone: (value: number | null) => void): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-editor-row" });
	row.createSpan({
		cls: "sf-story-context-meta-label sf-story-context-meta-label--ghost",
		text: `${label}:`,
		attr: { "aria-hidden": "true" },
	});
	const input = row.createEl("input", {
		cls: "sf-planned-length-editor-input",
		attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": label },
	});
	input.value = value !== null ? value.toLocaleString("en-US") : "";
	const finish = bindPlannedLengthInput(input, value, onDone);
	renderMetaClearButton(row, `clear ${label.toLowerCase()}`, () => finish(null));
	window.setTimeout(() => {
		input.focus();
		input.select();
	}, 0);
}

/** A planned-length row with no collapsed state at all — the real (non-ghost) label sits directly
 * beside its own always-visible input, rather than a separate clickable meta-control toggling
 * renderPlannedLengthEditorRow open/closed beneath it. NovelTitleModal's Novel Length/Chapter
 * Length rows use this: those two fields stay expanded permanently with no way to collapse them. */
export function renderPlannedLengthAlwaysOpenRow(meta: HTMLElement, label: string, value: number | null, onCommit: (value: number | null) => void): void {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-editor-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: `${label}:` });
	const input = row.createEl("input", {
		cls: "sf-planned-length-editor-input",
		attr: { type: "text", inputmode: "numeric", autocomplete: "off", "aria-label": label },
	});
	input.value = value !== null ? value.toLocaleString("en-US") : "";
	const finish = bindPlannedLengthInput(input, value, onCommit);
	renderMetaClearButton(row, `clear ${label.toLowerCase()}`, () => finish(null));
}

/** Reads every ordered chapter's live word count in parallel — the source for both the Novel
 * Length row's "current of target" figure and the Chapter Length editor's average/median stats. */
export async function readOrderedChapterWordCounts(app: App, bookFolderName: string, ordered: TFile[]): Promise<number[]> {
	return Promise.all(ordered.map((file) => readChapterWordCount(app, bookFolderName, file.name)));
}

/** One of the two plain (non-interactive) stat rows shown beneath the open Chapter Length editor —
 * "average:"/"median:", comma-grouped like the length fields themselves. `ghostLabelText` is the
 * real "Chapter Length" label text: an invisible copy of it reserves a label column exactly as
 * wide as that row's own label, and the real (much shorter) "average"/"median" text is right-
 * aligned within that same reserved width — same font, so this lines their own colon up with
 * Chapter Length's, matching a fixed number column rather than a fixed label-start column (compare
 * renderPlannedLengthEditorRow's ghost, which instead reserves space *before* its input). Returns
 * the value span so the caller can patch in the live figure once its async word-count read resolves.
 */
export function renderPlannedLengthStatRow(meta: HTMLElement, ghostLabelText: string, label: string): HTMLElement {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row sf-planned-length-stat-row" });
	const labelSlot = row.createSpan({ cls: "sf-story-context-meta-label sf-planned-length-stat-label" });
	labelSlot.createSpan({
		cls: "sf-planned-length-stat-label-ghost",
		text: `${ghostLabelText}:`,
		attr: { "aria-hidden": "true" },
	});
	labelSlot.createSpan({ cls: "sf-planned-length-stat-label-text", text: `${label}:` });
	return row.createSpan({ cls: "sf-story-context-meta-value" });
}

/** A planned novel/chapter length row, styled identically to Default PoV's own meta row (same
 * label + icon-control pieces, renderMetaControl above) rather than a persistent text box:
 * clicking the control (setNumberFillIcon when unset — a stroke-drawn glyph, so it can't go
 * through Obsidian's fill-only `setIcon` — or just the number itself once set, `hideIconWhenValue`
 * dropping the icon then) opens the inline editor below (renderPlannedLengthEditorRow) instead of a
 * modal. Clearing (the "x") lives only in that editor, not on this collapsed row. Returns the
 * created value span (or null if `value` is unset) — Novel Length's row uses this to patch in the
 * live "current of target" text once that async total resolves (see TopPanel.ts's renderBookList
 * and NovelTitleModal, both of which call this). */
export function renderPlannedLengthMetaRow(
	meta: HTMLElement,
	field: PlannedLengthField,
	label: string,
	value: number | null,
	isEditorOpen: boolean,
	onSetEditor: (field: PlannedLengthField | null) => void,
	onCommit: (value: number | null) => void,
): HTMLElement | null {
	const row = meta.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: `${label}:` });
	const valueEl = renderMetaControl(row, {
		paintIcon: setNumberFillIcon,
		value: value !== null ? value.toLocaleString("en-US") : null,
		hideIconWhenValue: true,
		tooltip: isEditorOpen ? `close ${label.toLowerCase()}` : value !== null ? `change ${label.toLowerCase()}` : `set ${label.toLowerCase()}`,
		onOpen: () => onSetEditor(isEditorOpen ? null : field),
	});
	if (isEditorOpen) {
		renderPlannedLengthEditorRow(meta, label, value, onCommit);
	}
	return valueEl;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Significant figures in a positive integer, found by stripping trailing zeros — e.g.
 * 1500 -> 2 (from "15"), 1050 -> 3 (from "105"), 1234 -> 4 (nothing to strip). */
function countSignificantFigures(value: number): number {
	const digits = String(Math.abs(Math.round(value)));
	const trimmed = digits.replace(/0+$/, "");
	return trimmed.length || 1;
}

/** Rounds `value` to the same number of significant figures as `reference` — i.e. to the same
 * place value as reference's own least-significant digit. Used to decide whether a chapter's
 * word count "matches" its configured target length without treating a handful of words'
 * difference as meaningful: 1,493 against a 1,500 target (2 sig figs) rounds to 1,500 and
 * reads as a match; 1,443 rounds to 1,400 (short); 1,561 rounds to 1,600 (over). */
function roundToSignificantFigures(value: number, reference: number): number {
	const totalDigits = String(Math.abs(Math.round(reference))).length;
	const sigFigs = countSignificantFigures(reference);
	const increment = 10 ** Math.max(0, totalDigits - sigFigs);
	return Math.round(value / increment) * increment;
}

/**
 * The in-cell data bar (main-pane Novel overview only) — appended into `headerRow` as plain,
 * absolutely-positioned solid-colour `<div>`s whose left/width are computed here in JS and set as
 * inline styles, not via CSS custom properties/gradients/masks: this is the most bulletproof way
 * to guarantee the fill actually paints, with nothing that can silently no-op if a `var()`
 * reference or a `mask-image` doesn't resolve the way expected. `headerRow` itself carries no
 * padding for --databar cards (see its own CSS) — these segments span its true 0%–100% width, and
 * `nameEl`'s own padding (also in that CSS) only insets its *text*, not the background box the
 * gradient below paints into, so the two stay aligned without any shared-box trickery.
 */
function renderDataBar(
	headerRow: HTMLElement,
	nameEl: HTMLElement,
	rowColor: { background: string; text: string } | null,
	wordCount: number,
	fillPercent: number,
	targetPercent: number | null,
	targetLength: number | null,
): void {
	const color = rowColor?.background ?? "var(--background-modifier-border)";
	// Matches headerRow's own border-radius (styles.css) — the right end's rounding (when it's the
	// bar's actual visual end) is meant to read as the same corner as the row's own left corners,
	// not a separate, bigger pill cap.
	const cornerRadius = 4;

	/** A solid-colour segment. `roundedEnd` rounds its right edge by `cornerRadius` — only for a
	 * segment that's the bar's actual visual end (never the solid portion ahead of a dotted one,
	 * which ends in a dot-bisected seam instead — see addDots). The row's own left edge already
	 * reads as rounded for free, via headerRow's own border-radius + overflow: hidden. */
	const addSolid = (left: string, width: string, roundedEnd: boolean): void => {
		const seg = headerRow.createDiv({ cls: "sf-story-context-plot-databar-segment" });
		seg.setCssStyles({
			left,
			width,
			backgroundColor: color,
			borderRadius: roundedEnd ? `0 ${cornerRadius}px ${cornerRadius}px 0` : "0",
		});
	};

	/**
	 * The "target reached" overflow: a diamond/staggered dot lattice from `leftPercent` to
	 * `leftPercent + widthPercent`, built as individual small circles (not a CSS background
	 * pattern). Fixed grid, matching the bar's own fixed 34px height (see
	 * .sf-story-context-plot-block--databar .sf-story-context-plot-header-row in styles.css):
	 * 2px dots on a 4px row-to-row vertical step, alternating horizontal offset by half the 8px
	 * column pitch each row (the standard way to describe a single diamond lattice as two
	 * interleaved columns) — 9 rows total: the "on-seam" column (row 0, 2, 4, 6, 8) gets 5 dots at
	 * centres 1/9/17/25/33px, flush with the bar's own top and bottom edges; the offset column
	 * (row 1, 3, 5, 7) gets 4 dots at 5/13/21/29px, inset one 4px step from each end. `dotRadius +
	 * 8 * rowPitch + dotRadius` works out to exactly 34px, so no special-casing is needed for
	 * either vertical edge. 8px horizontal pitch (centre-to-centre) with a 2px dot leaves a 6px
	 * edge-to-edge gap, matching the vertical gap.
	 * The one deliberate exception is the seam column (the dot pattern's own left edge, where it
	 * meets the solid segment before it): drawn as a half-circle (flat edge on the left, so only
	 * its right half ever actually shows), in every row it appears in.
	 * At the right edge (how far the chapter's actually been written), a dot is kept whole if its
	 * centre falls at or before that edge (more than half of it would be visible) and dropped
	 * entirely otherwise — never partially clipped.
	 * Needs the row's real pixel width (word-count-driven percentages alone can't place a fixed
	 * 8px grid), so this measures `headerRow` once via getBoundingClientRect() — a one-time read,
	 * not re-measured if the pane is resized afterward.
	 */
	const addDots = (leftPercent: number, widthPercent: number): void => {
		const rowRect = headerRow.getBoundingClientRect();
		const segmentWidthPx = (widthPercent / 100) * rowRect.width;
		const segmentLeftPx = (leftPercent / 100) * rowRect.width;
		if (rowRect.height <= 0 || segmentWidthPx <= 0) return;

		const dotDiameter = 2;
		const dotRadius = dotDiameter / 2;
		const colPitch = 8; // horizontal, centre-to-centre
		const rowPitch = 4; // vertical, row-to-row step (each row alternates horizontal offset)
		const rowsInBar = 9;

		for (let row = 0; row < rowsInBar; row++) {
			const centerY = dotRadius + row * rowPitch;
			const xOffset = row % 2 === 0 ? 0 : colPitch / 2;
			for (let centerX = xOffset; centerX <= segmentWidthPx; centerX += colPitch) {
				const isSeamColumn = xOffset === 0 && centerX === 0;
				const dot = headerRow.createDiv({ cls: "sf-story-context-plot-databar-dot" });
				dot.setCssStyles({ backgroundColor: color });
				if (isSeamColumn) {
					dot.setCssStyles({
						left: `${segmentLeftPx}px`,
						top: `${centerY - dotRadius}px`,
						width: `${dotRadius}px`,
						height: `${dotDiameter}px`,
						borderRadius: `0 ${dotRadius}px ${dotRadius}px 0`,
					});
				} else {
					dot.setCssStyles({
						left: `${segmentLeftPx + centerX - dotRadius}px`,
						top: `${centerY - dotRadius}px`,
						width: `${dotDiameter}px`,
						height: `${dotDiameter}px`,
						borderRadius: "50%",
					});
				}
			}
		}
	};

	/** The "not yet reached" target marker: a 2px, round-capped, dashed (3px dash, 3px gap)
	 * vertical line at `targetPct`, centred on that x position. An SVG <line> rather than a CSS
	 * background — there's no CSS-only way to get rounded caps on individual dashes, only real
	 * solid/dashed borders (square-cut) or `stroke-linecap`, which is SVG/canvas-only. */
	const addMarker = (targetPct: number): void => {
		const svg = headerRow.createSvg("svg", {
			cls: "sf-story-context-plot-databar-marker",
			attr: { width: "2", height: "100%" },
		});
		svg.setCssStyles({ left: `calc(${targetPct}% - 1px)` });
		svg.createSvg("line", {
			attr: {
				x1: "1",
				y1: "0",
				x2: "1",
				y2: "100%",
				stroke: color,
				"stroke-width": "2",
				"stroke-linecap": "round",
				"stroke-dasharray": "3 3",
			},
		});
	};

	if (wordCount === 0) {
		// No words yet: a 3px sliver at the start, no target marker even if one is configured.
		addSolid("0", "3px", true);
	} else if (targetLength != null && targetPercent != null) {
		// Round the chapter's actual word count to the target length's own significant figures
		// before comparing — a handful of words either side of the target (e.g. 1,493 against a
		// 1,500 target) reads as "close enough" rather than firing a marker/dots for noise.
		const roundedWordCount = roundToSignificantFigures(wordCount, targetLength);
		if (roundedWordCount === targetLength) {
			// Close enough at the target's own precision: plain fill, no marker, no dots.
			addSolid("0", `${fillPercent}%`, true);
		} else if (roundedWordCount > targetLength) {
			// Past target: solid 0 -> target, diamond-dotted target -> fill, no marker.
			addSolid("0", `${targetPercent}%`, false);
			if (fillPercent > targetPercent) {
				addDots(targetPercent, fillPercent - targetPercent);
			}
		} else {
			// Still short: solid 0 -> fill (rounded end — nothing follows it), plus a dashed
			// target marker.
			addSolid("0", `${fillPercent}%`, true);
			addMarker(targetPercent);
		}
	} else {
		// No target configured: plain fill, nothing else.
		addSolid("0", `${fillPercent}%`, true);
	}

	// Title text-colour split: rowColor.text where the bar covers the title, rowColor.background
	// (the thread's own accent, as plain coloured text) past it — a hard cutover at the same
	// fillPercent the bar itself uses. Set directly here (not through a CSS class referencing a
	// custom property) for the same reason the segments above are: no var() to fail to resolve.
	if (rowColor) {
		nameEl.style.setProperty(
			"background-image",
			`linear-gradient(to right, ${rowColor.text} 0%, ${rowColor.text} ${fillPercent}%, ${rowColor.background} ${fillPercent}%, ${rowColor.background} 100%)`,
		);
		nameEl.style.setProperty("background-clip", "text");
		nameEl.style.setProperty("-webkit-background-clip", "text");
		nameEl.style.setProperty("color", "transparent");
		nameEl.style.setProperty("-webkit-text-fill-color", "transparent");
	}
}

/**
 * Fills the empty novel length bar shell (renderNovelPanel, wide only) with one solid segment per
 * placed chapter with more than 0 words, plus dividers — from `layout` (computeNovelLengthBarLayout,
 * novelLengthBar.ts), in the same "plain absolutely positioned divs, inline left/width percentages"
 * style as renderDataBar()'s own segments (addSolid) above, for the same reason: no CSS custom
 * property/gradient to silently fail to resolve.
 */
function renderNovelLengthBarContent(
	app: App,
	bar: HTMLElement,
	bookFolderName: string,
	ordered: TFile[],
	wordCounts: number[],
	layout: NovelLengthBarLayout,
	options: NovelPanelOptions,
): void {
	bar.empty();
	for (const segment of layout.segments) {
		const file = ordered[segment.chapterIndex];
		const rowColor = resolveChapterRowColor(app, bookFolderName, file.name, options.plugin.getSettings());
		const seg = bar.createDiv({ cls: "sf-story-context-novel-length-bar-segment" });
		seg.setCssStyles({
			left: `${segment.leftPercent}%`,
			width: `${segment.widthPercent}%`,
			backgroundColor: rowColor?.background ?? "var(--background-modifier-border)",
		});
		// Built the same way the chapter card's own title reads (numberedChapterTitle +
		// splitTitleSubtitle, subtitle in brackets when present) so the tooltip always matches.
		const { title, subtitle } = splitTitleSubtitle(
			numberedChapterTitle(app, bookFolderName, file.name, options.plugin.getSettings().chapterNumberingStyle),
		);
		const titleText = subtitle ? `${title} (${subtitle})` : title;
		setTooltip(seg, `${titleText}: ${formatWordCount(wordCounts[segment.chapterIndex])}`);
	}
	for (const dividerPercent of layout.dividerPercents) {
		const divider = bar.createDiv({ cls: "sf-story-context-novel-length-bar-divider" });
		divider.setCssStyles({ left: `${dividerPercent}%` });
	}
}

async function renderNovelPlot(
	app: App,
	scroll: HTMLElement,
	bookFolderName: string,
	options: NovelPanelOptions,
	ordered: TFile[],
	wordCountsPromise: Promise<number[]> | null,
): Promise<void> {
	scroll.empty();
	if (ordered.length === 0) {
		scroll.createDiv({ cls: "sf-empty", text: "no placed chapters" });
		return;
	}
	// The in-cell data bar (wide/central-pane host only — see below) needs every chapter's word
	// count up front to find the book's own max before any single card's fill % can be computed —
	// wordCountsPromise is that shared read, hoisted (and, when wide, shared with the novel length
	// bar) by renderNovelPanel rather than started fresh here.
	const wide = options.layout === "wide";
	let wordCounts: number[] = [];
	let maxWordCount = 0;
	let targetLength: number | null = null;
	if (wide && wordCountsPromise) {
		wordCounts = await wordCountsPromise;
		if (options.isStale()) return;
		maxWordCount = wordCounts.reduce((max, n) => Math.max(max, n), 0);
		targetLength = readBookFrontmatter(app, bookFolderName)?.plannedChapterLength ?? null;
	}
	for (let i = 0; i < ordered.length; i++) {
		const file = ordered[i];
		const block = scroll.createDiv({ cls: "sf-story-context-plot-block sf-story-context-plot-block--plain" });
		if (wide) block.addClass("sf-story-context-plot-block--databar");
		const headerRow = block.createDiv({ cls: "sf-story-context-plot-header-row" });
		const { title, subtitle } = splitTitleSubtitle(
			numberedChapterTitle(app, bookFolderName, file.name, options.plugin.getSettings().chapterNumberingStyle),
		);
		// Sidebar: the title itself is the card's expand/collapse control (no separate chevron
		// button) — clicking or activating it toggles .sf-story-context-plot-block--collapsed below.
		// Wide: the title is plain text and the whole header row (the data bar) is the control
		// instead, cycling the card's three tiers — see the tier wiring below. The title also sits
		// on top of the data bar there (see renderDataBar below) — headerRow itself carries no
		// padding for --databar cards any more, nameEl's own does, so the bar (a plain
		// absolutely-positioned child of headerRow) spans the row's true full width.
		const nameEl = headerRow.createDiv({
			cls: wide
				? "sf-story-context-plot-chapter-name"
				: "sf-story-context-plot-chapter-name sf-story-context-plot-chapter-name--clickable",
			text: subtitle ? `${title} (${subtitle})` : title,
			...(wide ? {} : { attr: { role: "button", tabindex: "0" } }),
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
			headerRow.setCssStyles({ color: rowColor.text });
			// Outline colour is `--sf-plot-card-outline` (see .sf-story-context-plot-block--plain) —
			// an inset box-shadow, not a real border, so nothing measured against this card's
			// content edge needs to compensate for a border's width. Wide/--databar cards have no
			// outline at all (the data bar is their only chrome), so it's left unset for them — a
			// dead custom property here would just invite some later rule to accidentally reuse it.
			block.setCssProps({
				"--sf-plot-card-header-bg": rowColor.background,
				"--sf-plot-card-header-fg": rowColor.text,
				...(wide ? {} : { "--sf-plot-card-outline": rowColor.background }),
			});
			// Wide: renderDataBar sets the title's own colour directly instead (split between
			// rowColor.text where the bar covers it and rowColor.background where it doesn't).
			if (!wide) nameEl.setCssStyles({ color: rowColor.text });
		}

		if (wide) {
			const wordCount = wordCounts[i];
			const fillPercent = maxWordCount > 0 ? clamp((wordCount / maxWordCount) * 100, 0, 100) : 0;
			const targetPercent =
				targetLength != null && maxWordCount > 0 ? clamp((targetLength / maxWordCount) * 100, 0, 100) : null;
			renderDataBar(headerRow, nameEl, rowColor, wordCount, fillPercent, targetPercent, targetLength);
		}

		const chapterKey = plotChapterCollapseKey(bookFolderName, file.name);
		if (wide) {
			// The centre pane's own three tiers (plotCardTier.ts), stored in their own setting —
			// never collapsedPlotChapterKeys, which is the sidebar's alone. The header row is the
			// single click/keyboard target, so a click on the title text simply bubbles up to it.
			let tier = readPlotCardTier(options.plugin.getSettings().novelOverviewPlotCardTiers, chapterKey);
			applyPlotCardTier(block, headerRow, tier);
			const cycleTier = () => {
				const revealsDescription = tier === "bar";
				tier = nextPlotCardTier(tier);
				applyPlotCardTier(block, headerRow, tier);
				// A hidden textarea measures as zero height, and the card's width-only
				// ResizeObserver (below) won't fire on reveal, so re-measure it here or it
				// reappears collapsed to nothing. resizeToContent is declared further down this
				// same synchronous card build, so it always exists by the time this can run.
				if (revealsDescription) resizeToContent();
				persistPlotCardTier(options.plugin, chapterKey, tier);
			};
			headerRow.addEventListener("click", cycleTier);
			makeAccessibleActivatable(headerRow, cycleTier);
			// Count only for now — completed once the description loads, and refreshed after each
			// blur-and-write (both below), so an edit shows without a re-render.
			setTooltip(headerRow, plotCardTooltip(wordCounts[i], ""));
		} else {
			const applyCollapsed = (collapsed: boolean) =>
				applyPlotCardCollapsed(block, nameEl, collapsed);
			applyCollapsed((options.plugin.getSettings().collapsedPlotChapterKeys ?? []).includes(chapterKey));
			const toggleCollapsed = () => {
				const next = !block.hasClass("sf-story-context-plot-block--collapsed");
				applyCollapsed(next);
				persistPlotCardCollapsed(options.plugin, chapterKey, next);
			};
			nameEl.addEventListener("click", toggleCollapsed);
			makeAccessibleActivatable(nameEl, toggleCollapsed);
		}

		const entry = getChapterEntry(app, bookFolderName, file.name);
		const narrator = resolveChapterNarrator(
			app,
			bookFolderName,
			file.name,
			options.castCache?.length ? options.castCache : undefined,
		);
		const chapterPov = entry?.pov ?? [];
		const displayPov =
			chapterPov.length > 0
				? chapterPov
				: narrator
					? [{ path: narrator.path, name: narrator.name }]
					: [];
		const meta = block.createDiv({ cls: "sf-story-context-meta" });
		renderMetaRefList(
			meta,
			"PoV:",
			displayPov,
			ICON_PERSON_FILL_ADD,
			() => void openNovelChapterPovPicker(app, bookFolderName, file.name, chapterPov, options.onChanged),
			chapterPov.length > 0 || narrator ? "change pov character" : "set pov character",
		);
		renderMetaRefList(
			meta,
			"Location:",
			entry?.location ?? [],
			ICON_MAP_PIN_PLUS,
			() => void openNovelChapterLocationPicker(app, bookFolderName, file.name, entry?.location ?? [], options.onChanged),
			(entry?.location.length ?? 0) > 0 ? "change location" : "set location",
		);
		// Central pane only — the sidebar Story Context Novel tab shares this same loop but never
		// computed wordCounts (see the `wide` guard at the top of this function).
		if (wide) {
			const lengthRow = meta.createDiv({ cls: "sf-story-context-meta-row" });
			lengthRow.createSpan({ cls: "sf-story-context-meta-label", text: "Length:" });
			// A plain (non-clickable) value — same classes/layout as the PoV/Location rows'
			// `.sf-story-context-meta-values`, minus the click affordance those rows' `--static`
			// modifier strips (styles.css): word count isn't something to open a picker on.
			const lengthValues = lengthRow.createSpan({
				cls: "sf-story-context-meta-values sf-story-context-meta-values--static",
			});
			lengthValues.createSpan({ cls: "sf-story-context-meta-value", text: formatWordCount(wordCounts[i]) });
		}

		// A plain divider line, not the textarea's own border-top (an earlier version's approach):
		// that border spanned the textarea's own bled-out width, the same width as the card's
		// outline itself, so the two crossed right at the card's left/right edges and left a visible
		// mark wherever the (opaque) border-top passed over the (inset) outline. This divider sits
		// in the card's ordinary padded content area instead — well clear of the outline on both
		// sides — so nothing crosses it at all. Wide/--databar cards have no outline to clear any
		// more (the data bar is the card's only chrome), so they skip this divider entirely.
		if (!wide) block.createDiv({ cls: "sf-story-context-plot-textarea-divider" });
		const textarea = block.createEl("textarea", {
			cls: "sf-story-context-synopsis sf-story-context-plot-textarea",
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
			if (wide) setTooltip(headerRow, plotCardTooltip(wordCounts[i], trimmed));
		});
		resizeToContent();
		const plot = await readChapterPlot(app, bookFolderName, file.name);
		if (options.isStale()) return;
		textarea.value = plot.replace(/\s+$/, "");
		resizeToContent();
		if (wide) setTooltip(headerRow, plotCardTooltip(wordCounts[i], textarea.value));
	}
}

async function openNovelChapterPovPicker(
	app: App,
	bookFolderName: string,
	filename: string,
	current: CodexRef[],
	onChanged: () => void,
): Promise<void> {
	const entries = getCodexEntriesByType(app, "person");
	new CodexEntryPickerModal(app, {
		mode: "multi",
		label: "PoV:",
		emptyMessage: "No person entries in the Codex yet.",
		entries,
		initiallySelected: current,
		onAccept: async (selected) => {
			await writeChapterPov(app, bookFolderName, filename, selected);
			onChanged();
		},
	}).open();
}

async function openNovelChapterLocationPicker(
	app: App,
	bookFolderName: string,
	filename: string,
	current: CodexRef[],
	onChanged: () => void,
): Promise<void> {
	const entries = getCodexEntriesByType(app, "place");
	new CodexEntryPickerModal(app, {
		mode: "multi",
		label: "Location:",
		emptyMessage: "No place entries in the Codex yet.",
		entries,
		initiallySelected: current,
		onAccept: async (selected) => {
			await writeChapterLocation(app, bookFolderName, filename, selected);
			onChanged();
		},
	}).open();
}

function plotChapterCollapseKey(bookFolderName: string, filename: string): string {
	return `${bookFolderName}/${filename}`;
}

function applyPlotCardCollapsed(block: HTMLElement, titleControl: HTMLElement, collapsed: boolean): void {
	block.toggleClass("sf-story-context-plot-block--collapsed", collapsed);
	titleControl.setAttribute("aria-expanded", collapsed ? "false" : "true");
	setTooltip(titleControl, collapsed ? "expand chapter card" : "collapse chapter card");
}

function persistPlotCardCollapsed(plugin: StoryForgePlugin, key: string, collapsed: boolean): void {
	const current = plugin.getSettings().collapsedPlotChapterKeys ?? [];
	if (collapsed === current.includes(key)) return;
	const next = collapsed ? [...current, key] : current.filter((k) => k !== key);
	void plugin.updateSetting("collapsedPlotChapterKeys", next);
}

/** Wide (centre pane) only. Tier 2 ("collapsed") is exactly the sidebar's collapsed state; tier 1
 * ("bar") adds --bar on top of it, whose only extra job is hiding the description. */
function applyPlotCardTier(block: HTMLElement, headerRow: HTMLElement, tier: PlotCardTier): void {
	block.toggleClass("sf-story-context-plot-block--collapsed", tier !== "extended");
	block.toggleClass("sf-story-context-plot-block--bar", tier === "bar");
	headerRow.setAttribute("aria-expanded", tier === "bar" ? "false" : "true");
}

function persistPlotCardTier(plugin: StoryForgePlugin, key: string, tier: PlotCardTier): void {
	const current = plugin.getSettings().novelOverviewPlotCardTiers;
	if (readPlotCardTier(current, key) === tier) return;
	void plugin.updateSetting("novelOverviewPlotCardTiers", withPlotCardTier(current, key, tier));
}

/** Icon (+ optional value) as a single interactive control — shared by this panel's Default PoV /
 * per-chapter PoV+location rows, Story Context's own Chapter tab (StoryContextView.ts), and
 * TopPanel.ts's Novel/Chapter Length rows. `paintIcon` is an escape hatch for an icon that can't
 * go through Obsidian's `setIcon` (fill-only `.svg-icon`) — a stroke-drawn glyph, say — takes
 * priority over `iconId` when both are given. `hideIconWhenValue` drops the icon entirely once
 * `value` is set, leaving just the value text as the control (TopPanel.ts's length rows want the
 * number alone once there's a number to show; Default PoV/PoV/location keep their icon alongside
 * the value, so this defaults to off). */
/** Returns the created value span (or null if `opts.value` was falsy and none was created) — so a
 * caller with a live async figure to layer in later (TopPanel.ts's Novel Length row prefixing the
 * current word count) can patch its text in place once that resolves, without a full re-render. */
export function renderMetaControl(
	row: HTMLElement,
	opts: {
		iconId?: string;
		paintIcon?: (el: HTMLElement) => void;
		value: string | null;
		tooltip: string;
		onOpen: () => void;
		hideIconWhenValue?: boolean;
	},
): HTMLElement | null {
	const control = row.createSpan({
		cls: "sf-story-context-meta-control",
		attr: { role: "button", tabindex: "0", "aria-label": opts.tooltip },
	});
	setTooltip(control, opts.tooltip);
	if (!(opts.hideIconWhenValue && opts.value)) {
		const iconEl = control.createSpan({ cls: "sf-story-context-meta-icon" });
		if (opts.paintIcon) opts.paintIcon(iconEl);
		else if (opts.iconId) setIcon(iconEl, opts.iconId);
	}
	let valueEl: HTMLElement | null = null;
	if (opts.value) {
		valueEl = control.createSpan({ cls: "sf-story-context-meta-value", text: opts.value });
	}
	control.addEventListener("click", (e) => {
		e.stopPropagation();
		opts.onOpen();
	});
	makeAccessibleActivatable(control, opts.onOpen);
	return valueEl;
}

/** A small "x" button beside a meta control's value — clears it directly, no picker/modal needed.
 * Used by TopPanel.ts's planned novel/chapter length rows (unlike Default PoV/PoV/location, whose
 * clearing lives inside their own picker modal instead — see CodexEntryPickerModal's "— Clear —"
 * row). */
export function renderMetaClearButton(row: HTMLElement, tooltip: string, onClear: () => void): void {
	const btn = row.createSpan({
		cls: "sf-story-context-meta-clear",
		attr: { role: "button", tabindex: "0", "aria-label": tooltip },
	});
	setTooltip(btn, tooltip);
	setIcon(btn, ICON_X);
	btn.addEventListener("click", (e) => {
		e.stopPropagation();
		onClear();
	});
	makeAccessibleActivatable(btn, onClear);
}

/** Comma-separated Codex refs that wrap under the first line; empty state keeps the add-icon control. */
export function renderMetaRefList(
	parent: HTMLElement,
	label: string,
	refs: CodexRef[],
	emptyIconId: string,
	onOpen: () => void,
	tooltip: string,
): void {
	const row = parent.createDiv({ cls: "sf-story-context-meta-row" });
	row.createSpan({ cls: "sf-story-context-meta-label", text: label });
	if (refs.length === 0) {
		renderMetaControl(row, { iconId: emptyIconId, value: null, tooltip, onOpen });
		return;
	}
	const values = row.createSpan({
		cls: "sf-story-context-meta-values",
		attr: { role: "button", tabindex: "0", "aria-label": tooltip },
	});
	setTooltip(values, tooltip);
	refs.forEach((ref, index) => {
		const text = index < refs.length - 1 ? `${ref.name || ref.path},` : ref.name || ref.path;
		values.createSpan({ cls: "sf-story-context-meta-value", text });
	});
	values.addEventListener("click", (e) => {
		e.stopPropagation();
		onOpen();
	});
	makeAccessibleActivatable(values, onOpen);
}

/** Small icon-only action button — Story Context list-row actions (StoryContextView.ts). */
export function iconAction(parent: HTMLElement, iconId: string, label: string, onActivate: () => void): HTMLElement {
	const btn = parent.createSpan({
		cls: "sf-story-context-icon-btn",
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
