import { App, Notice, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters, writeBookChapterOrder } from "../book";
import { computeSpineWindow, type NavigatorSlot, type SpineWindow } from "../spineWindow";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { makeReorderable, type DragZone } from "./dragReorder";
import { ICON_ADD_CIRCLE, ICON_TRANSPORT_NEXT, ICON_TRANSPORT_PREVIOUS, ICON_TRANSPORT_TO_END, ICON_TRANSPORT_TO_START } from "../icons";

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

	const win = computeSpineWindow(ordered, options.activeChapterFilename, (file) => file.name);
	const numbered = applyHashNumbering(ordered.map((file) => chapterDisplayTitle(app, bookFolderName, file.name)));
	const titleFor = (file: TFile) => numbered[ordered.indexOf(file)];

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

	renderTransportRow(wrap, ordered, win, bookFolderName, options.onOpenChapter);
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

/** The self-gating "continue the story" affordance — only ever shown in the slot immediately
 * after the last placed chapter. */
function renderCreateTile(container: HTMLElement, onCreate: () => void): void {
	const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-create", attr: { "aria-label": "Continue the story" } });
	setIcon(tile.createSpan({ cls: "sf-icon" }), ICON_ADD_CIRCLE);
	tile.addEventListener("click", () => onCreate());
	makeAccessibleActivatable(tile, () => onCreate());
}

function renderTransportRow(
	container: HTMLElement,
	ordered: TFile[],
	win: SpineWindow<TFile>,
	bookFolderName: string,
	onOpenChapter: (bookFolderName: string, filename: string) => void,
): void {
	const currentSlot = win.slots.find((slot) => slot.isCurrent) ?? null;
	const currentIndex = currentSlot?.file ? ordered.indexOf(currentSlot.file) : 0;
	const atStart = currentIndex <= 0;
	const atEnd = currentIndex >= ordered.length - 1;

	const buttons = container.createDiv({ cls: "sf-navigator-transport-buttons" });

	addTransportButton(buttons, ICON_TRANSPORT_TO_START, "To start", !atStart, () => {
		const first = ordered[0];
		if (first) onOpenChapter(bookFolderName, first.name);
	});
	addTransportButton(buttons, ICON_TRANSPORT_PREVIOUS, "Previous chapter", !atStart, () => {
		const previous = ordered[currentIndex - 1];
		if (previous) onOpenChapter(bookFolderName, previous.name);
	});
	addTransportButton(buttons, ICON_TRANSPORT_NEXT, "Next chapter", !atEnd, () => {
		const next = ordered[currentIndex + 1];
		if (next) onOpenChapter(bookFolderName, next.name);
	});
	addTransportButton(buttons, ICON_TRANSPORT_TO_END, "To end", !atEnd, () => {
		const last = ordered[ordered.length - 1];
		if (last) onOpenChapter(bookFolderName, last.name);
	});
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
