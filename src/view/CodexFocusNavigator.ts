import { App, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { computeSpineWindow, type NavigatorSlot } from "../spineWindow";
import { canEnterContinuousMode } from "../continuousMode";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import type { NumberingStyle } from "../numberingStyle";
import { makeAccessibleActivatable } from "./a11y";
import { renderIndicatorSlot, renderTransportRow } from "./navigatorControls";
import { onContinuousMode } from "./continuousEvents";
import { ICON_ADD_CIRCLE } from "../icons";

export interface CodexFocusNavigatorOptions {
	currentBookFolderName: string | null;
	/** The chapter currently open in the editor, if any — need not be on the spine (an idea
	 * chapter may be open); computeSpineWindow falls back to the first placed chapter then. */
	activeChapterFilename: string | null;
	/** Mirrors Hybrid's own toggle — the current-chapter highlight only shows while this is on. */
	highlightActiveChapter: boolean;
	chapterNumberingStyle: NumberingStyle;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	/** Forward-only: create a chapter, append it to the end of chapter-order, and open it. */
	onCreateContinuing: (bookFolderName: string) => void;
	/** Non-null while the continuous read view (main editor pane) is open on this book — the
	 * chapter it's currently centred on. The sidebar renders the live position indicator and the
	 * scroll-to transport instead of the normal window while this is set (continuous-mode hand-off
	 * brief §2, corrected: the manuscript lives in the main pane, but the navigation around it is
	 * still this sidebar's job, same as everywhere else in the app). */
	continuousActiveFilename: string | null;
	/** Opens the continuous read view in the main editor pane. */
	onOpenContinuousRead: (bookFolderName: string) => void;
	/** Exits continuous mode: replaces the read view's leaf with a real single-chapter editor on
	 * whichever chapter it's currently centred on. */
	onExitContinuousRead: (bookFolderName: string) => void;
	/** Commands the read view to scroll to a chapter — the live indicator's tiles and the
	 * transport row's four buttons while continuous mode is active. */
	onContinuousScrollTo: (bookFolderName: string, filename: string) => void;
	/** Registers the live position indicator's event-listener teardown — must run before the next
	 * render discards this DOM (see StoryForgeView.render()). */
	registerContinuousCleanup: (dispose: () => void) => void;
}

/**
 * Codex-focus's compact three-chapter navigator (hand-off brief §5.2): a vertical top/middle/
 * bottom stack drawn from the placed spine only — idea/unplaced chapters never appear here. While
 * there's no previous chapter, the current chapter stays pinned in the top slot rather than
 * leaving a gap above it; the window only slides once a chapter has a real previous and the shift
 * is needed to show it (see spineWindow.ts). At the tail end, the slot after the last placed
 * chapter is `[+]` (continue the story) instead of a gap.
 *
 * Chapter tiles reuse Hybrid's own row classes (sf-top-list/sf-row/sf-row-text/sf-row-selected)
 * outright, so every bit of Hybrid's chapter-row styling — font, colour, highlight, hover — is
 * identical here by construction rather than approximated. The only override is centred text
 * instead of left-aligned, since there's no numbering column in this view. Unlike Hybrid's list,
 * these tiles are not drag-reorderable — the visible window is too small and shifts underneath
 * the cursor as the current chapter changes, so dragging never had a stable target here.
 *
 * A fifth control on the transport row (continuous-mode hand-off brief §2) opens the continuous
 * read view in the main editor pane. While that view is open, this sidebar swaps its own window
 * for a read-only live position indicator and turns the transport into scroll-to commands — the
 * manuscript itself never renders here, only the navigation around it.
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
		renderWindowBody(wrap, ordered, bookFolderName, titleFor, canGoContinuous, options);
	}
}

function renderWindowBody(
	wrap: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	canGoContinuous: boolean,
	options: CodexFocusNavigatorOptions,
): void {
	const win = computeSpineWindow(ordered, options.activeChapterFilename, (file) => file.name);

	const windowEl = wrap.createDiv({ cls: "sf-top-list sf-navigator-window" });
	for (const slot of win.slots) {
		renderSlot(
			windowEl,
			slot,
			titleFor,
			bookFolderName,
			options.highlightActiveChapter,
			options.activeChapterFilename,
			options.onOpenChapter,
			() => options.onCreateContinuing(bookFolderName),
		);
	}

	const currentSlot = win.slots.find((slot) => slot.isCurrent) ?? null;
	const currentIndex = currentSlot?.file ? ordered.indexOf(currentSlot.file) : 0;

	renderTransportRow(
		wrap,
		currentIndex,
		ordered.length - 1,
		{
			toStart: () => {
				const first = ordered[0];
				if (first) options.onOpenChapter(bookFolderName, first.name);
			},
			previous: () => {
				const previous = ordered[currentIndex - 1];
				if (previous) options.onOpenChapter(bookFolderName, previous.name);
			},
			next: () => {
				const next = ordered[currentIndex + 1];
				if (next) options.onOpenChapter(bookFolderName, next.name);
			},
			toEnd: () => {
				const last = ordered[ordered.length - 1];
				if (last) options.onOpenChapter(bookFolderName, last.name);
			},
		},
		canGoContinuous ? { active: false, onToggle: () => options.onOpenContinuousRead(bookFolderName) } : null,
	);
}

/**
 * The sidebar's half of continuous mode (continuous-mode hand-off brief §2, corrected): a
 * read-only live position indicator standing in for the window, and a transport row whose four
 * buttons scroll the main-pane read view instead of opening files. Painted immediately from
 * `options.continuousActiveFilename` (a synchronous read of the read view's own state — see
 * StoryForgeView.render()), then kept live via the position-change event for as long as this DOM
 * survives, independent of the sidebar's own re-render cycle.
 */
function renderContinuousIndicator(
	app: App,
	wrap: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	options: CodexFocusNavigatorOptions,
): void {
	const indicatorEl = wrap.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-indicator" });
	const transportEl = wrap.createDiv({ cls: "sf-continuous-transport" });

	const paint = (currentFilename: string): void => {
		indicatorEl.empty();
		const win = computeSpineWindow(ordered, currentFilename, (file) => file.name);
		for (const slot of win.slots) {
			renderIndicatorSlot(indicatorEl, slot, titleFor, options.highlightActiveChapter, (filename) =>
				options.onContinuousScrollTo(bookFolderName, filename),
			);
		}

		transportEl.empty();
		const currentIndex = Math.max(
			0,
			ordered.findIndex((file) => file.name === currentFilename),
		);
		renderTransportRow(
			transportEl,
			currentIndex,
			ordered.length - 1,
			{
				toStart: () => options.onContinuousScrollTo(bookFolderName, ordered[0].name),
				previous: () => {
					const previous = ordered[currentIndex - 1];
					if (previous) options.onContinuousScrollTo(bookFolderName, previous.name);
				},
				next: () => {
					const next = ordered[currentIndex + 1];
					if (next) options.onContinuousScrollTo(bookFolderName, next.name);
				},
				toEnd: () => options.onContinuousScrollTo(bookFolderName, ordered[ordered.length - 1].name),
			},
			{ active: true, onToggle: () => options.onExitContinuousRead(bookFolderName) },
		);
	};

	paint(options.continuousActiveFilename as string);

	const ref = onContinuousMode(app, (payload) => {
		if (payload.active && payload.bookFolderName === bookFolderName) paint(payload.filename);
	});
	options.registerContinuousCleanup(() => app.workspace.offref(ref));
}

function renderSlot(
	container: HTMLElement,
	slot: NavigatorSlot<TFile>,
	titleFor: (file: TFile) => string,
	bookFolderName: string,
	highlightActiveChapter: boolean,
	activeChapterFilename: string | null,
	onOpenChapter: (bookFolderName: string, filename: string) => void,
	onCreate: () => void,
): void {
	if (slot.kind === "create") {
		renderCreateTile(container, onCreate);
		return;
	}
	if (slot.kind === "empty") {
		const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-empty" });
		tile.createDiv({ cls: "sf-empty sf-empty-inline", text: "—" });
		return;
	}
	// slot.file is typed T | null regardless of kind (NavigatorSlot isn't a discriminated union) —
	// only actually null for "create"/"empty" slots, both already returned above, so this is a
	// narrowing guard rather than a real "can this happen" check.
	const { file } = slot;
	if (!(file instanceof TFile)) return;
	const tile = container.createDiv({ cls: "sf-row" });
	tile.dataset.key = file.name;
	// Deliberately not slot.isCurrent — that's true even when computeSpineWindow fell back to
	// centring on the first chapter because nothing is really active (no chapter open at all, or
	// a Codex/idea note is). Highlighting that fallback made the window look like it was still
	// pointing at a chapter after you'd clicked off to something else. Comparing the real active
	// filename directly only lights up a slot when a chapter genuinely is the active file.
	if (highlightActiveChapter && activeChapterFilename !== null && file.name === activeChapterFilename) {
		tile.addClass("sf-row-selected");
	}
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	tile.addEventListener("click", () => onOpenChapter(bookFolderName, file.name));
	makeAccessibleActivatable(tile, () => onOpenChapter(bookFolderName, file.name));
}

/** The self-gating "continue the story" affordance — only ever shown in the slot immediately
 * after the last placed chapter. */
function renderCreateTile(container: HTMLElement, onCreate: () => void): void {
	const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-create", attr: { "aria-label": "Continue the story" } });
	setIcon(tile.createSpan({ cls: "sf-icon" }), ICON_ADD_CIRCLE);
	tile.addEventListener("click", () => onCreate());
	makeAccessibleActivatable(tile, () => onCreate());
}
