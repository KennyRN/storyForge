import { App, TFile, setIcon } from "obsidian";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { computeSpineWindow, type NavigatorSlot, type SpineWindow } from "../spineWindow";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { makeAccessibleActivatable } from "./a11y";
import { ICON_PLUS_SQUARE, TRANSPORT_ICON_SETS } from "../icons";

export interface CodexFocusNavigatorOptions {
	currentBookFolderName: string | null;
	/** The chapter currently open in the editor, if any — need not be on the spine (an idea
	 * chapter may be open); computeSpineWindow falls back to the first placed chapter then. */
	activeChapterFilename: string | null;
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
 * TEMPORARY (hand-off brief H1): the transport row renders all three candidate icon sets side by
 * side, each fully wired, so Kenny can compare them live before picking one. Once chosen, collapse
 * this to a single row using TRANSPORT_ICON_SETS[chosen] and delete the other two sets from
 * icons.ts.
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

	const windowEl = wrap.createDiv({ cls: "sf-navigator-window" });
	for (const slot of win.slots) {
		renderSlot(windowEl, slot, titleFor, bookFolderName, options.onOpenChapter, () => options.onCreateContinuing(bookFolderName));
	}

	const transportZone = wrap.createDiv({ cls: "sf-navigator-transport-zone" });
	for (const [setName, icons] of Object.entries(TRANSPORT_ICON_SETS)) {
		renderTransportRow(transportZone, setName, icons, ordered, win, bookFolderName, options.onOpenChapter);
	}
}

function renderSlot(
	container: HTMLElement,
	slot: NavigatorSlot<TFile>,
	titleFor: (file: TFile) => string,
	bookFolderName: string,
	onOpenChapter: (bookFolderName: string, filename: string) => void,
	onCreate: () => void,
): void {
	if (slot.kind === "create") {
		renderCreateTile(container, onCreate);
		return;
	}
	const tile = container.createDiv({ cls: "sf-navigator-tile" });
	if (slot.kind === "empty") {
		tile.addClass("sf-navigator-tile-empty");
		tile.createDiv({ cls: "sf-empty sf-empty-inline", text: "—" });
		return;
	}
	const file = slot.file as TFile;
	if (slot.isCurrent) tile.addClass("sf-navigator-tile-current");
	const { title } = splitTitleSubtitle(titleFor(file));
	tile.createDiv({ cls: "sf-navigator-tile-title", text: title });
	tile.addEventListener("click", () => onOpenChapter(bookFolderName, file.name));
	makeAccessibleActivatable(tile, () => onOpenChapter(bookFolderName, file.name));
}

/** The self-gating "continue the story" affordance — only ever shown in the slot immediately
 * after the last placed chapter. */
function renderCreateTile(container: HTMLElement, onCreate: () => void): void {
	const tile = container.createDiv({ cls: "sf-navigator-tile sf-navigator-tile-create" });
	setIcon(tile.createSpan({ cls: "sf-icon" }), ICON_PLUS_SQUARE);
	tile.createSpan({ text: "Continue the story" });
	tile.addEventListener("click", () => onCreate());
	makeAccessibleActivatable(tile, () => onCreate());
}

function renderTransportRow(
	container: HTMLElement,
	setName: string,
	icons: { toStart: string; previous: string; next: string; toEnd: string },
	ordered: TFile[],
	win: SpineWindow<TFile>,
	bookFolderName: string,
	onOpenChapter: (bookFolderName: string, filename: string) => void,
): void {
	const currentSlot = win.slots.find((slot) => slot.isCurrent) ?? null;
	const currentIndex = currentSlot?.file ? ordered.indexOf(currentSlot.file) : 0;
	const atStart = currentIndex <= 0;
	const atEnd = currentIndex >= ordered.length - 1;

	const row = container.createDiv({ cls: "sf-navigator-transport-row" });
	row.createSpan({ cls: "sf-navigator-transport-label", text: setName });

	const buttons = row.createDiv({ cls: "sf-navigator-transport-buttons" });

	addTransportButton(buttons, icons.toStart, "To start", !atStart, () => {
		const first = ordered[0];
		if (first) onOpenChapter(bookFolderName, first.name);
	});
	addTransportButton(buttons, icons.previous, "Previous chapter", !atStart, () => {
		const previous = ordered[currentIndex - 1];
		if (previous) onOpenChapter(bookFolderName, previous.name);
	});
	addTransportButton(buttons, icons.next, "Next chapter", !atEnd, () => {
		const next = ordered[currentIndex + 1];
		if (next) onOpenChapter(bookFolderName, next.name);
	});
	addTransportButton(buttons, icons.toEnd, "To end", !atEnd, () => {
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
