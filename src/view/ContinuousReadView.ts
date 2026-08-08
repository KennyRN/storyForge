import { ItemView, MarkdownView, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { numberedBookTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { renderContinuousReadThrough, type ContinuousReadThroughHandle } from "./ContinuousReadThrough";
import { emitContinuousMode, onContinuousScrollTo } from "./continuousEvents";
import { ICON_CONTINUOUS_MODE } from "../icons";

export const STORYFORGE_CONTINUOUS_VIEW_TYPE = "storyforge-continuous-view";

interface ContinuousReadViewState {
	bookFolderName: string;
	/** Where to land on open — the reader's chapter at the moment they chose to read continuously. */
	entryFilename: string;
}

/**
 * Continuous read-and-write mode's own view (continuous-mode hand-off brief §2, corrected twice):
 * the sidebar is menus only, so this view holds the manuscript and nothing else — no indicator, no
 * transport row. Those live back in CodexFocusNavigator.ts (they're navigation, not story), talking
 * to this view via continuousEvents.ts's pair of custom workspace events rather than a direct
 * reference. Reading itself is strictly read-only (`cachedRead` + `MarkdownRenderer`).
 *
 * Click-to-edit (§2.6): Obsidian has no public API for mounting a real editor inline (Editor and
 * MarkdownView have no public standalone constructor, and createLeafInParent only accepts
 * Obsidian's own layout tree, not an arbitrary element) — so a deliberate click on a chapter's body
 * hands off to a real single-chapter editor by replacing this leaf, the same mechanism the
 * sidebar's own exit control uses, landing the caret at the exact clicked position via
 * clickToCaret.ts's source-offset mapping. This trades "stays inline in the scroll" for "always a
 * real, fully-featured Obsidian editor" — deliberately, given the alternative is either no public
 * API or guessing at undocumented internals.
 *
 * The sidebar's "exit" action replaces this same leaf with a real single-chapter editor on
 * whichever chapter the reader last scrolled to — symmetric with how entering lands them back at
 * their place (hand-off brief §2.4). This view has no exit control of its own.
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

	async onOpen(): Promise<void> {
		// The sidebar's live-position tiles and scroll-to transport command this view rather than
		// holding a direct reference to it — see continuousEvents.ts.
		this.registerEvent(
			onContinuousScrollTo(this.app, (payload) => {
				if (payload.bookFolderName === this.bookFolderName) this.readThrough?.scrollTo(payload.filename);
			}),
		);
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

	/** The chapter this view is currently centred on — the sidebar reads this synchronously
	 * (getLeavesOfType + a direct method call) to paint its live position indicator correctly on
	 * its own next render, without waiting for an event round-trip. */
	getCurrentFilename(): string | null {
		return this.readThrough?.getCurrentFilename() ?? this.entryFilename;
	}

	getBookFolderName(): string | null {
		return this.bookFolderName;
	}

	async onClose(): Promise<void> {
		this.readThrough?.dispose();
		this.readThrough = null;
		emitContinuousMode(this.app, { active: false });
	}

	private render(): void {
		this.readThrough?.dispose();
		this.readThrough = null;
		const container = this.contentEl;
		container.empty();
		container.addClass("storyforge-continuous-view");

		if (!this.bookFolderName || !this.entryFilename) {
			container.createDiv({ cls: "sf-empty", text: "Nothing to read yet." });
			emitContinuousMode(this.app, { active: false });
			return;
		}
		const bookFolderName = this.bookFolderName;
		const { ordered } = getBookChapters(this.app, bookFolderName);
		if (!canEnterContinuousMode(ordered.length)) {
			container.createDiv({ cls: "sf-empty", text: "Not enough placed chapters to read continuously." });
			emitContinuousMode(this.app, { active: false });
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

		const scrollHost = container.createDiv({ cls: "sf-continuous-view" });
		this.readThrough = renderContinuousReadThrough(this.app, scrollHost, this, {
			bookFolderName,
			ordered,
			titleFor,
			entryFilename,
			onPositionChange: (filename) => emitContinuousMode(this.app, { active: true, bookFolderName, filename }),
			onEditChapter: (file, sourceOffset) => void this.editChapter(file, sourceOffset),
			onChapterRenamed: () => this.render(),
		});

		emitContinuousMode(this.app, { active: true, bookFolderName, filename: entryFilename });
	}

	/** Click-to-edit's hand-off (hand-off brief §2.6, adapted — see the class doc comment): opens a
	 * real editor on `file` in this same leaf, caret landing exactly where the reader clicked. */
	private async editChapter(file: TFile, sourceOffset: number): Promise<void> {
		await this.leaf.openFile(file, { active: true });
		this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
		const view = this.leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor(view.editor.offsetToPos(sourceOffset));
			view.editor.focus();
		}
	}
}
