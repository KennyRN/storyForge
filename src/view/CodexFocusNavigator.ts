import { App, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { resolveCurrentChapterIndex } from "../spineWindow";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import type { NumberingStyle } from "../numberingStyle";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_ADD_CIRCLE } from "../icons";

export interface CodexFocusNavigatorOptions {
	currentBookFolderName: string | null;
	/** The chapter currently open in the editor, if any — need not be on the spine (an idea
	 * chapter may be open); resolveCurrentChapterIndex falls back to the first placed chapter then. */
	activeChapterFilename: string | null;
	/** Mirrors Hybrid's own toggle — the current-chapter highlight only shows while this is on. */
	highlightActiveChapter: boolean;
	chapterNumberingStyle: NumberingStyle;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	/** Forward-only: create a chapter, append it to the end of chapter-order, and open it. */
	onCreateContinuing: (bookFolderName: string) => void;
	/** Whether the single-chapter selector is expanded into its 5-tall scrollable chapter list.
	 * Lifted up to StoryForgeView (like `unplacedMode`) rather than kept locally, since this
	 * function re-renders from scratch on every call and has no state of its own. */
	chapterSelectorExpanded: boolean;
	onToggleChapterSelectorExpanded: () => void;
}

/**
 * Codex-focus's compact chapter selector (hand-off brief §5.2, since reworked): day-to-day it
 * shows only the current chapter from the placed spine — idea/unplaced chapters never appear here.
 * Clicking that row expands a scrollable list of the whole placed spine underneath it (5 rows
 * tall), ending in `[+]` (continue the story); picking a chapter there — or creating one — opens
 * it and collapses the list straight back down.
 *
 * Chapter tiles reuse Hybrid's own row classes (sf-top-list/sf-row/sf-row-text/sf-row-selected)
 * outright, so every bit of Hybrid's chapter-row styling — font, colour, highlight, hover — is
 * identical here by construction rather than approximated. Text is centred in the storyforge
 * navigator (no numbering column); storytelling mode left-aligns titles and Codex rows
 * to the same inset (see `.storyforge-storytelling-view` in styles.css).
 *
 * An empty column to the left of the selector keeps the layout where the continuous-mode toggle
 * used to sit.
 */
export function renderCodexFocusNavigator(app: App, container: HTMLElement, options: CodexFocusNavigatorOptions): void {
	container.empty();
	const wrap = container.createDiv({ cls: "sf-navigator" });

	if (!options.currentBookFolderName) {
		wrap.createDiv({ cls: "sf-empty", text: "Open a chapter to get started." });
		return;
	}
	const bookFolderName = options.currentBookFolderName;
	const { ordered } = getBookChapters(app, bookFolderName);

	if (ordered.length === 0) {
		wrap.createDiv({ cls: "sf-empty", text: "No placed chapters yet." });
		renderCreateTile(wrap, () => options.onCreateContinuing(bookFolderName));
		return;
	}

	const numbered = applyHashNumbering(
		ordered.map((file) => chapterDisplayTitle(app, bookFolderName, file.name)),
		options.chapterNumberingStyle,
	);
	const titleFor = (file: TFile) => numbered[ordered.indexOf(file)];

	renderSelectorBody(wrap, ordered, bookFolderName, titleFor, options);
}

function renderSelectorBody(
	wrap: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	options: CodexFocusNavigatorOptions,
): void {
	const currentIndex = resolveCurrentChapterIndex(ordered, options.activeChapterFilename, (file) => file.name);
	const currentFile = ordered[currentIndex];

	const body = wrap.createDiv({ cls: "sf-navigator-body" });
	body.createDiv({ cls: "sf-navigator-transport-col" });

	const chapterCol = body.createDiv({ cls: "sf-navigator-chapter-col" });
	const windowEl = chapterCol.createDiv({ cls: "sf-top-list sf-navigator-window" });
	// Deliberately comparing the real active filename, not just "is this the resolved current
	// chapter" — resolveCurrentChapterIndex falls back to the first placed chapter when nothing is
	// really active (no chapter open at all, or a Codex/idea note is), and highlighting that
	// fallback made the selector look like it was still pointing at a chapter after clicking off to
	// something else.
	const isCurrentHighlighted =
		options.highlightActiveChapter && options.activeChapterFilename !== null && currentFile.name === options.activeChapterFilename;
	renderCurrentRow(windowEl, currentFile, isCurrentHighlighted, titleFor, options.onToggleChapterSelectorExpanded);

	if (options.chapterSelectorExpanded) {
		renderExpandedChapterList(
			chapterCol,
			ordered,
			bookFolderName,
			titleFor,
			options.highlightActiveChapter,
			options.activeChapterFilename,
			options.onOpenChapter,
			() => options.onCreateContinuing(bookFolderName),
			options.onToggleChapterSelectorExpanded,
		);
	}
}

/** The single always-visible chapter row — day-to-day, the whole of the chapter selector. Its
 * click doesn't open the chapter (it already is the open one); it expands/collapses the scrollable
 * list of the rest of the spine underneath it. */
function renderCurrentRow(
	container: HTMLElement,
	file: TFile,
	isHighlighted: boolean,
	titleFor: (file: TFile) => string,
	onToggleExpanded: () => void,
): void {
	const tile = container.createDiv({ cls: "sf-row" });
	tile.dataset.key = file.name;
	if (isHighlighted) tile.addClass("sf-row-selected");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	// pointerdown, not click: this sidebar isn't always the focused pane (the editor usually is),
	// and a plain click's first firing is eaten by Obsidian focusing the pane — same as everywhere
	// else in this file.
	tile.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		onToggleExpanded();
	});
	makeAccessibleActivatable(tile, onToggleExpanded);
}

/** The chapter selector's expanded state: the whole placed spine, 5 rows tall and scrollable
 * (`.sf-navigator-expanded-list` in styles.css), ending in the `[+]` continue-the-story tile.
 * Picking a chapter — or creating one — opens/creates it and collapses the list straight back
 * down, mirroring how a dropdown closes once you've picked from it. */
function renderExpandedChapterList(
	container: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	highlightActiveChapter: boolean,
	activeChapterFilename: string | null,
	onOpenChapter: (bookFolderName: string, filename: string) => void,
	onCreate: () => void,
	onCollapse: () => void,
): void {
	const list = container.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-expanded-list" });
	for (const file of ordered) {
		const tile = list.createDiv({ cls: "sf-row" });
		tile.dataset.key = file.name;
		if (highlightActiveChapter && activeChapterFilename !== null && file.name === activeChapterFilename) {
			tile.addClass("sf-row-selected");
		}
		const { title } = splitTitleSubtitle(titleFor(file));
		tile.createDiv({ cls: "sf-row-text", text: title });
		const open = () => {
			onOpenChapter(bookFolderName, file.name);
			onCollapse();
		};
		tile.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			open();
		});
		makeAccessibleActivatable(tile, open);
	}
	renderCreateTile(list, () => {
		onCreate();
		onCollapse();
	});
}

/** The self-gating "continue the story" affordance — only ever shown after the last chapter of the
 * expanded list (or, with no placed chapters at all, standing in for the whole selector). */
function renderCreateTile(container: HTMLElement, onCreate: () => void): void {
	const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-create", attr: { "aria-label": "Continue the story" } });
	setIcon(tile.createSpan({ cls: "sf-icon" }), ICON_ADD_CIRCLE);
	tile.addEventListener("click", () => onCreate());
	makeAccessibleActivatable(tile, () => onCreate());
}
