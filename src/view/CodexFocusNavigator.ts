import { App, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { resolveCurrentChapterIndex } from "../spineWindow";
import { canEnterContinuousMode } from "../continuousMode";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import type { NumberingStyle } from "../numberingStyle";
import { makeAccessibleActivatable } from "./a11y";
import { renderContinuousToggle, renderIndicatorSlot } from "./navigatorControls";
import { onContinuousMode } from "./continuousEvents";
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
	/** Non-null while the continuous read view (main editor pane) is open on this book — the
	 * chapter it's currently centred on. The sidebar renders the live position indicator instead of
	 * the normal chapter selector while this is set (continuous-mode hand-off brief §2, corrected:
	 * the manuscript lives in the main pane, but the navigation around it is still this sidebar's
	 * job, same as everywhere else in the app). */
	continuousActiveFilename: string | null;
	/** Opens the continuous read view in the main editor pane. */
	onOpenContinuousRead: (bookFolderName: string) => void;
	/** Exits continuous mode: replaces the read view's leaf with a real single-chapter editor on
	 * whichever chapter it's currently centred on. */
	onExitContinuousRead: (bookFolderName: string) => void;
	/** Commands the read view to scroll to a chapter — the live indicator's row and, when
	 * expanded, its own chapter list while continuous mode is active. */
	onContinuousScrollTo: (bookFolderName: string, filename: string) => void;
	/** Registers the live position indicator's event-listener teardown — must run before the next
	 * render discards this DOM (see StoryForgeView.render()). */
	registerContinuousCleanup: (dispose: () => void) => void;
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
 * The continuous-mode toggle sits in its own column to the left of the selector (the transport
 * chevrons that used to live either side of it are gone). While the continuous read view is open,
 * this sidebar swaps its own selector for a read-only live position indicator that expands the
 * same way, scrolling the manuscript instead of opening files — the manuscript itself never
 * renders here, only the navigation around it.
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
	const canGoContinuous = canEnterContinuousMode(ordered.length);

	if (options.continuousActiveFilename && canGoContinuous) {
		renderContinuousIndicator(app, wrap, ordered, bookFolderName, titleFor, options);
	} else {
		renderSelectorBody(wrap, ordered, bookFolderName, titleFor, canGoContinuous, options);
	}
}

function renderSelectorBody(
	wrap: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	canGoContinuous: boolean,
	options: CodexFocusNavigatorOptions,
): void {
	const currentIndex = resolveCurrentChapterIndex(ordered, options.activeChapterFilename, (file) => file.name);
	const currentFile = ordered[currentIndex];

	const body = wrap.createDiv({ cls: "sf-navigator-body" });
	const toggleCol = body.createDiv({ cls: "sf-navigator-transport-col" });
	renderContinuousToggle(
		toggleCol,
		canGoContinuous ? { active: false, onToggle: () => options.onOpenContinuousRead(bookFolderName) } : null,
	);

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

/**
 * The sidebar's half of continuous mode (continuous-mode hand-off brief §2, corrected): a
 * read-only live position row standing in for the current-chapter selector, expanding the same
 * way into a scroll-to list. Painted immediately from `options.continuousActiveFilename` (a
 * synchronous read of the read view's own state — see StoryForgeView.render()), then kept live via
 * the position-change event for as long as this DOM survives, independent of the sidebar's own
 * re-render cycle. Expand/collapse is a discrete user click, not a hot path, so it goes through the
 * normal top-level re-render (options.onToggleChapterSelectorExpanded) rather than being painted
 * locally — only the live position itself needs the cheaper local repaint below.
 */
function renderContinuousIndicator(
	app: App,
	wrap: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	options: CodexFocusNavigatorOptions,
): void {
	const body = wrap.createDiv({ cls: "sf-navigator-body" });
	const toggleCol = body.createDiv({ cls: "sf-navigator-transport-col" });
	renderContinuousToggle(toggleCol, { active: true, onToggle: () => options.onExitContinuousRead(bookFolderName) });

	const chapterCol = body.createDiv({ cls: "sf-navigator-chapter-col" });

	const paint = (currentFilename: string): void => {
		chapterCol.empty();
		const indicatorEl = chapterCol.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-indicator" });
		const currentFile = ordered.find((file) => file.name === currentFilename) ?? ordered[0];
		renderIndicatorSlot(indicatorEl, currentFile, true, titleFor, options.highlightActiveChapter, () =>
			options.onToggleChapterSelectorExpanded(),
		);

		if (options.chapterSelectorExpanded) {
			const list = chapterCol.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-expanded-list sf-navigator-indicator" });
			for (const file of ordered) {
				renderIndicatorSlot(list, file, file.name === currentFilename, titleFor, options.highlightActiveChapter, (filename) => {
					options.onContinuousScrollTo(bookFolderName, filename);
					options.onToggleChapterSelectorExpanded();
				});
			}
		}
	};

	paint(options.continuousActiveFilename as string);

	const ref = onContinuousMode(app, (payload) => {
		if (payload.active && payload.bookFolderName === bookFolderName) paint(payload.filename);
	});
	options.registerContinuousCleanup(() => app.workspace.offref(ref));
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
