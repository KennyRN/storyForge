import { ItemView, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { libraryChapterPath } from "../paths";
import { numberedBookTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { computeSpineWindow } from "../spineWindow";
import { renderContinuousReadThrough, type ContinuousReadThroughHandle } from "./ContinuousReadThrough";
import { renderIndicatorSlot, renderTransportRow } from "./navigatorControls";
import { ICON_CONTINUOUS_MODE } from "../icons";

export const STORYFORGE_CONTINUOUS_VIEW_TYPE = "storyforge-continuous-view";

interface ContinuousReadViewState {
	bookFolderName: string;
	/** Where to land on open — the reader's chapter at the moment they chose to read continuously. */
	entryFilename: string;
}

/**
 * Continuous read-and-write mode's own view (continuous-mode hand-off brief §2, corrected): the
 * manuscript, its live position indicator and its scroll-to transport all live in the main editor
 * pane here, not the sidebar — the sidebar (CodexFocusNavigator.ts) is menus only and merely opens
 * this view. Reading is strictly read-only (`cachedRead` + `MarkdownRenderer`, see
 * ContinuousReadThrough.ts); click-to-edit is CM-2.
 *
 * Exiting (the transport row's fifth control here, now showing the "cancel" icon) replaces this
 * same leaf with a real single-chapter editor on whichever chapter the reader last scrolled to —
 * symmetric with how entering lands them back at their place (hand-off brief §2.4).
 */
export class ContinuousReadView extends ItemView {
	private bookFolderName: string | null = null;
	private entryFilename: string | null = null;
	private readThrough: ContinuousReadThroughHandle | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: StoryForgePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return STORYFORGE_CONTINUOUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		if (!this.bookFolderName) return "Continuous read";
		const { title } = splitTitleSubtitle(numberedBookTitle(this.app, this.bookFolderName));
		return `Reading — ${title}`;
	}

	getIcon(): string {
		return ICON_CONTINUOUS_MODE;
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const s = state as Partial<ContinuousReadViewState> | undefined;
		if (s?.bookFolderName && s?.entryFilename) {
			this.bookFolderName = s.bookFolderName;
			this.entryFilename = s.entryFilename;
		}
		await super.setState(state, result);
		this.render();
	}

	getState(): Record<string, unknown> {
		return this.bookFolderName && this.entryFilename
			? { bookFolderName: this.bookFolderName, entryFilename: this.entryFilename }
			: {};
	}

	async onClose(): Promise<void> {
		this.readThrough?.dispose();
		this.readThrough = null;
	}

	private render(): void {
		this.readThrough?.dispose();
		this.readThrough = null;
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-continuous-view");

		if (!this.bookFolderName || !this.entryFilename) {
			container.createDiv({ cls: "sf-empty", text: "Nothing to read yet." });
			return;
		}
		const bookFolderName = this.bookFolderName;
		const { ordered } = getBookChapters(this.app, bookFolderName);
		if (!canEnterContinuousMode(ordered.length)) {
			container.createDiv({ cls: "sf-empty", text: "Not enough placed chapters to read continuously." });
			return;
		}

		const numbered = applyHashNumbering(ordered.map((file) => chapterDisplayTitle(this.app, bookFolderName, file.name)));
		const titleFor = (file: TFile) => numbered[ordered.indexOf(file)];
		// canEnterContinuousMode above guarantees ordered isn't empty, so this can only be null in
		// principle — the ordered[0] fallback is just belt-and-braces, never actually reached.
		const entryFilename =
			resolveEntryChapter(
				ordered.map((file) => file.name),
				this.entryFilename,
			) ?? ordered[0].name;

		const wrap = container.createDiv({ cls: "sf-continuous-view" });
		const indicatorEl = wrap.createDiv({ cls: "sf-top-list sf-navigator-window sf-navigator-indicator" });
		const scrollHost = wrap.createDiv({ cls: "sf-navigator-continuous-host" });
		const transportEl = wrap.createDiv({ cls: "sf-continuous-transport" });

		const highlightActiveChapter = this.plugin.getSettings().highlightActiveChapter;

		const exitToEditor = (filename: string): void => {
			const path = libraryChapterPath(bookFolderName, filename);
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) void this.leaf.openFile(file);
		};

		const paint = (currentFilename: string): void => {
			indicatorEl.empty();
			const win = computeSpineWindow(ordered, currentFilename, (file) => file.name);
			for (const slot of win.slots) {
				renderIndicatorSlot(indicatorEl, slot, titleFor, highlightActiveChapter, (filename) => this.readThrough?.scrollTo(filename));
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
					toStart: () => this.readThrough?.scrollTo(ordered[0].name),
					previous: () => {
						const previous = ordered[currentIndex - 1];
						if (previous) this.readThrough?.scrollTo(previous.name);
					},
					next: () => {
						const next = ordered[currentIndex + 1];
						if (next) this.readThrough?.scrollTo(next.name);
					},
					toEnd: () => this.readThrough?.scrollTo(ordered[ordered.length - 1].name),
				},
				{
					active: true,
					onToggle: () => exitToEditor(this.readThrough?.getCurrentFilename() ?? currentFilename),
				},
			);
		};

		this.readThrough = renderContinuousReadThrough(this.app, scrollHost, {
			ordered,
			titleFor,
			entryFilename,
			onPositionChange: paint,
		});

		paint(entryFilename);
	}
}
