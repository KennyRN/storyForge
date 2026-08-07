import { App, Notice, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters, writeBookChapterOrder } from "../book";
import { computeSpineWindow, type NavigatorSlot } from "../spineWindow";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { makeReorderable, type DragZone } from "./dragReorder";
import { renderContinuousReadThrough } from "./ContinuousReadThrough";
import {
	ICON_ADD_CIRCLE,
	ICON_CONTINUOUS_MODE,
	ICON_CONTINUOUS_MODE_EXIT,
	ICON_TRANSPORT_NEXT,
	ICON_TRANSPORT_PREVIOUS,
	ICON_TRANSPORT_TO_END,
	ICON_TRANSPORT_TO_START,
} from "../icons";

export interface CodexFocusNavigatorOptions {
	currentBookFolderName: string | null;
	/** The chapter currently open in the editor, if any — need not be on the spine (an idea
	 * chapter may be open); computeSpineWindow falls back to the first placed chapter then. */
	activeChapterFilename: string | null;
	/** Mirrors Hybrid's own toggle — the current-chapter highlight only shows while this is on. */
	highlightActiveChapter: boolean;
	onOpenChapter: (bookFolderName: string, filename: string) => void;
	/** Forward-only: create a chapter, append it to the end of chapter-order, and open it. */
	onCreateContinuing: (bookFolderName: string) => void;
	/** Continuous read-and-write mode (continuous-mode hand-off brief §2) — a mode within the
	 * navigator, toggled by its transport row's fifth control. */
	continuousMode: boolean;
	/** Wherever the reader last scrolled to while in continuous mode, so an incidental re-render
	 * (a stats refresh, a rename elsewhere) lands back where they were rather than at the top.
	 * Null until the position observer's first callback, or once continuous mode is left. */
	continuousCurrentFilename: string | null;
	onToggleContinuousMode: () => void;
	/** The fifth control's "cancel" action while continuous mode is active: drop the reader into
	 * the single-chapter editor on whichever chapter they scrolled to (§2.4). */
	onExitContinuousMode: (bookFolderName: string, filename: string) => void;
	onContinuousPositionChange: (filename: string) => void;
	/** Registers the continuous view's teardown (observers, vault listener) so the caller can
	 * dispose of it before the next render tears down this DOM — see StoryForgeView.render(). */
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
 * instead of left-aligned, since there's no numbering column in this view. The drag handle carries
 * over too: the visible window's real chapter rows are drag-reorderable exactly like Hybrid's
 * list, just constrained to whichever chapters are currently in view.
 *
 * A fifth control on the transport row (continuous-mode hand-off brief §2) flips this navigator
 * into a continuous read-and-write surface: the window becomes a read-only live position
 * indicator and the transport row's four buttons become scroll-to actions, while the manuscript
 * itself renders into one long, virtualised scroll (see ContinuousReadThrough.ts).
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

	const numbered = applyHashNumbering(ordered.map((file) => chapterDisplayTitle(app, bookFolderName, file.name)));
	const titleFor = (file: TFile) => numbered[ordered.indexOf(file)];
	const canGoContinuous = canEnterContinuousMode(ordered.length);

	if (options.continuousMode && canGoContinuous) {
		renderContinuousModeBody(app, wrap, container, ordered, bookFolderName, titleFor, options);
	} else {
		renderWindowModeBody(app, wrap, container, ordered, bookFolderName, titleFor, canGoContinuous, options);
	}
}

function renderWindowModeBody(
	app: App,
	wrap: HTMLElement,
	container: HTMLElement,
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
			options.onOpenChapter,
			() => options.onCreateContinuing(bookFolderName),
		);
	}

	// Real chapter rows only — the create/empty placeholders carry no .sf-row class, so they're
	// naturally excluded from the drag zone. The window's leading real row is always ordered[startIndex]
	// (see spineWindow.ts: non-chapter slots only ever trail, never lead), which is all that's needed
	// to splice a reordered window back into the full chapter-order array.
	const startIndex = win.slots[0].file ? ordered.indexOf(win.slots[0].file) : 0;
	const zones: DragZone[] = [{ key: "window", container: windowEl }];
	makeReorderable(zones, ".sf-row", ".sf-drag-handle", (zoneRowKeys) => {
		void (async () => {
			try {
				const nextOrder = ordered.map((file) => file.name);
				const windowKeys = (zoneRowKeys.window ?? []).filter(Boolean);
				nextOrder.splice(startIndex, windowKeys.length, ...windowKeys);
				await writeBookChapterOrder(app, bookFolderName, nextOrder);
				renderCodexFocusNavigator(app, container, options);
			} catch (err) {
				new Notice(`storyForge: could not save the new order — ${(err as Error).message}`);
				renderCodexFocusNavigator(app, container, options);
			}
		})();
	});

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
		canGoContinuous ? { active: false, onToggle: options.onToggleContinuousMode } : null,
	);
}

/**
 * Continuous mode's body (continuous-mode hand-off brief §2.1–2.5): the same window slot and
 * transport row scaffolding as window mode, but repurposed as a read-only live position indicator
 * and scroll-to actions, wrapped around the actual virtualised manuscript scroll.
 */
function renderContinuousModeBody(
	app: App,
	wrap: HTMLElement,
	container: HTMLElement,
	ordered: TFile[],
	bookFolderName: string,
	titleFor: (file: TFile) => string,
	options: CodexFocusNavigatorOptions,
): void {
	const entryFilename =
		options.continuousCurrentFilename ??
		resolveEntryChapter(
			ordered.map((file) => file.name),
			options.activeChapterFilename,
		) ??
		ordered[0].name;

	const indicatorEl = wrap.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-indicator" });
	const scrollHost = wrap.createDiv({ cls: "sf-navigator-continuous-host" });
	const transportEl = wrap.createDiv();

	const handle = renderContinuousReadThrough(app, scrollHost, {
		ordered,
		titleFor,
		entryFilename,
		onPositionChange: (filename) => {
			options.onContinuousPositionChange(filename);
			paintIndicatorAndTransport(filename);
		},
	});
	options.registerContinuousCleanup(handle.dispose);

	function paintIndicatorAndTransport(currentFilename: string): void {
		indicatorEl.empty();
		const win = computeSpineWindow(ordered, currentFilename, (file) => file.name);
		for (const slot of win.slots) {
			renderIndicatorSlot(indicatorEl, slot, titleFor, options.highlightActiveChapter, handle.scrollTo);
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
				toStart: () => handle.scrollTo(ordered[0].name),
				previous: () => {
					const previous = ordered[currentIndex - 1];
					if (previous) handle.scrollTo(previous.name);
				},
				next: () => {
					const next = ordered[currentIndex + 1];
					if (next) handle.scrollTo(next.name);
				},
				toEnd: () => handle.scrollTo(ordered[ordered.length - 1].name),
			},
			{
				active: true,
				onToggle: () => options.onExitContinuousMode(bookFolderName, handle.getCurrentFilename() ?? currentFilename),
			},
		);
	}

	paintIndicatorAndTransport(entryFilename);
}

function renderSlot(
	container: HTMLElement,
	slot: NavigatorSlot<TFile>,
	titleFor: (file: TFile) => string,
	bookFolderName: string,
	highlightActiveChapter: boolean,
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
	const file = slot.file as TFile;
	const tile = container.createDiv({ cls: "sf-row" });
	tile.dataset.key = file.name;
	if (slot.isCurrent && highlightActiveChapter) tile.addClass("sf-row-selected");
	const handle = tile.createSpan({ cls: "sf-drag-handle" });
	setIcon(handle, "grip-vertical");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	tile.addEventListener("click", (e) => {
		if (tile.querySelector(".sf-drag-handle")?.contains(e.target as Node)) return;
		onOpenChapter(bookFolderName, file.name);
	});
	makeAccessibleActivatable(tile, () => onOpenChapter(bookFolderName, file.name));
}

/** Continuous mode's read-only equivalent of `renderSlot` — no drag handle, and a click scrolls
 * the read-through to that chapter rather than opening an editor. The create/empty slots collapse
 * to the same plain placeholder; creating a new chapter stays a window-mode-only affordance. */
function renderIndicatorSlot(
	container: HTMLElement,
	slot: NavigatorSlot<TFile>,
	titleFor: (file: TFile) => string,
	highlightActiveChapter: boolean,
	onScrollTo: (filename: string) => void,
): void {
	if (slot.kind !== "chapter" || !slot.file) {
		const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-empty" });
		tile.createDiv({ cls: "sf-empty sf-empty-inline", text: "—" });
		return;
	}
	const file = slot.file;
	const tile = container.createDiv({ cls: "sf-row" });
	if (slot.isCurrent && highlightActiveChapter) tile.addClass("sf-row-selected");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-row-text", text: title });
	tile.addEventListener("click", () => onScrollTo(file.name));
	makeAccessibleActivatable(tile, () => onScrollTo(file.name));
}

/** The self-gating "continue the story" affordance — only ever shown in the slot immediately
 * after the last placed chapter. */
function renderCreateTile(container: HTMLElement, onCreate: () => void): void {
	const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-create", attr: { "aria-label": "Continue the story" } });
	setIcon(tile.createSpan({ cls: "sf-icon" }), ICON_ADD_CIRCLE);
	tile.addEventListener("click", () => onCreate());
	makeAccessibleActivatable(tile, () => onCreate());
}

interface TransportActions {
	toStart: () => void;
	previous: () => void;
	next: () => void;
	toEnd: () => void;
}

interface ContinuousToggle {
	/** Whether continuous mode is currently on — decides which of the two icons shows. */
	active: boolean;
	onToggle: () => void;
}

/**
 * The four transport buttons, shared between window mode (open-file) and continuous mode
 * (scroll-to) — only what each button *does* differs; see the two call sites. The optional fifth
 * control is continuous mode's toggle (continuous-mode hand-off brief §2), deliberately set apart
 * from the four transport buttons with its own divider rather than reading as a fifth step among
 * them. Omitted entirely below the self-gate (fewer than two placed chapters).
 */
function renderTransportRow(
	container: HTMLElement,
	currentIndex: number,
	lastIndex: number,
	actions: TransportActions,
	toggle: ContinuousToggle | null,
): void {
	const atStart = currentIndex <= 0;
	const atEnd = currentIndex >= lastIndex;

	const buttons = container.createDiv({ cls: "sf-navigator-transport-buttons" });

	addTransportButton(buttons, ICON_TRANSPORT_TO_START, "To start", !atStart, actions.toStart);
	addTransportButton(buttons, ICON_TRANSPORT_PREVIOUS, "Previous chapter", !atStart, actions.previous);
	if (toggle) {
		const label = toggle.active ? "Exit continuous mode" : "Read continuously";
		const btn = buttons.createSpan({
			cls: "sf-navigator-transport-btn sf-navigator-transport-toggle",
			attr: { "aria-label": label },
		});
		setIcon(btn, toggle.active ? ICON_CONTINUOUS_MODE_EXIT : ICON_CONTINUOUS_MODE);
		btn.addEventListener("click", toggle.onToggle);
		makeAccessibleActivatable(btn, toggle.onToggle);
	}
	addTransportButton(buttons, ICON_TRANSPORT_NEXT, "Next chapter", !atEnd, actions.next);
	addTransportButton(buttons, ICON_TRANSPORT_TO_END, "To end", !atEnd, actions.toEnd);
}

function addTransportButton(container: HTMLElement, iconId: string, label: string, enabled: boolean, onClick: () => void): void {
	const btn = container.createSpan({ cls: "sf-navigator-transport-btn", attr: { "aria-label": label } });
	if (!enabled) btn.addClass("sf-navigator-transport-btn-disabled");
	setIcon(btn, iconId);
	if (enabled) {
		btn.addEventListener("click", onClick);
		makeAccessibleActivatable(btn, onClick);
	}
}
