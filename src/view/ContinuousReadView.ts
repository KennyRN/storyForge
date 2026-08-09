import { ItemView, MarkdownView, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import { EditorView } from "@codemirror/view";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, getBookChapters } from "../book";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { numberedBookTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { renderContinuousReadThrough, type ContinuousReadThroughHandle } from "./ContinuousReadThrough";
import { emitContinuousMode, onContinuousScrollTo } from "./continuousEvents";
import { graftEditor, type GraftedEditorHandle } from "./graftedEditor";
import { ICON_CONTINUOUS_MODE } from "../icons";

export const STORYFORGE_CONTINUOUS_VIEW_TYPE = "storyforge-continuous-view";

interface ContinuousReadViewState {
	bookFolderName: string;
	/** Where to land on open — the reader's chapter at the moment they chose to read continuously. */
	entryFilename: string;
}

/** Cached across every ContinuousReadView instance for the life of the plugin session, not
 * per-view — the graft technique either works on this Obsidian build or it doesn't, so there's no
 * point re-attempting (and re-logging the failure) on every single click (inline-editor research
 * brief §3.5: "detect once per session at first use and cache the result"). Undefined means
 * "not yet attempted"; a real attempt sets it to true or false. */
let graftingSupported: boolean | undefined;

/**
 * Continuous read-and-write mode's own view (continuous-mode hand-off brief §2, corrected twice):
 * the sidebar is menus only, so this view holds the manuscript and nothing else — no indicator, no
 * transport row. Those live back in CodexFocusNavigator.ts (they're navigation, not story), talking
 * to this view via continuousEvents.ts's pair of custom workspace events rather than a direct
 * reference. Reading itself is strictly read-only (`cachedRead` + `MarkdownRenderer`).
 *
 * Click-to-edit (§2.6, resolved via the inline-editor research brief): a deliberate click on a
 * chapter's body grafts a real, live, auto-saving `MarkdownView` directly into that chapter's
 * rendered slot (graftedEditor.ts) — reading and light editing stay in the same continuous scroll,
 * "touch-edit here, touch-edit there", rather than leaving to a separate tab. Only one editor is
 * ever live at a time (`activeEdit` below); it commits (and reverts to rendered markup) when the
 * reader scrolls it out of view, clicks a different chapter, presses Escape, or the view itself
 * closes. If grafting isn't available on this Obsidian build, this falls back to the previous
 * behaviour — opening a real editor in this same leaf, leaving the continuous scroll — rather than
 * leaving the chapter half-mounted.
 *
 * The sidebar's "exit" action replaces this same leaf with a real single-chapter editor on
 * whichever chapter the reader last scrolled to — symmetric with how entering lands them back at
 * their place (hand-off brief §2.4). This view has no exit control of its own.
 */
export class ContinuousReadView extends ItemView {
	private bookFolderName: string | null = null;
	private entryFilename: string | null = null;
	private readThrough: ContinuousReadThroughHandle | null = null;
	private activeEdit: { filename: string; handle: GraftedEditorHandle; onKeydown: (e: KeyboardEvent) => void } | null = null;

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
		this.commitActiveEdit();
		this.readThrough?.dispose();
		this.readThrough = null;
		emitContinuousMode(this.app, { active: false });
	}

	private render(): void {
		this.commitActiveEdit();
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
			onEditChapter: (file, sourceOffset, clickedTop) => void this.editChapter(file, sourceOffset, clickedTop),
			onEditedSectionScrolledAway: (filename) => {
				if (this.activeEdit?.filename === filename) this.commitActiveEdit();
			},
			onChapterRenamed: () => this.render(),
		});

		emitContinuousMode(this.app, { active: true, bookFolderName, filename: entryFilename });
	}

	/**
	 * Click-to-edit (inline-editor research brief §2–§5): grafts a real editor into the clicked
	 * chapter's own slot in the scroll, caret landing exactly where the reader clicked. Falls back
	 * to opening a real editor in this leaf — leaving the continuous scroll — only if grafting isn't
	 * available on this Obsidian build.
	 */
	private async editChapter(file: TFile, sourceOffset: number, clickedTop: number): Promise<void> {
		if (this.activeEdit?.filename === file.name) return; // already live — nothing to do
		this.commitActiveEdit();
		if (!this.readThrough) return;

		if (graftingSupported === false) {
			await this.openInMainPaneFallback(file, sourceOffset);
			return;
		}

		const container = this.readThrough.lockSectionForEditing(file.name);
		if (!container) return;

		// The graft's own openFile can otherwise scroll the outer container — hold it steady around
		// the mount (inline-editor research brief §3.1) before the more precise correction below.
		const scrollEl = this.readThrough.getScrollElement();
		const savedScrollTop = scrollEl.scrollTop;
		const handle = await graftEditor(this.app, container, file, sourceOffset);
		scrollEl.scrollTop = savedScrollTop;

		if (!handle) {
			graftingSupported = false;
			this.readThrough.unlockSection(file.name);
			await this.openInMainPaneFallback(file, sourceOffset);
			return;
		}
		graftingSupported = true;

		// Anchor the clicked paragraph back to where the reader's eye already was (research brief
		// §7): the grafted editor's own chrome (Live Preview markers, line padding) rarely lands the
		// caret at exactly `clickedTop`, so measure the actual gap and correct the outer scroll for
		// it — then focus, so the editor's own scroll-into-view doesn't fight this correction (see
		// graftEditor's doc comment for why focus is deferred to here).
		await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
		const cmContent = handle.view.containerEl.querySelector(".cm-content");
		const cmView = cmContent instanceof HTMLElement ? EditorView.findFromDOM(cmContent) : null;
		const coords = cmView?.coordsAtPos(sourceOffset);
		if (coords) {
			const delta = coords.top - clickedTop;
			// A correction this large means `coordsAtPos` measured against a layout that hadn't
			// actually settled yet (one `requestAnimationFrame` isn't a hard guarantee CM6's own
			// measure pass has run) rather than a genuine small offset from the editor's own chrome —
			// applying it anyway would scroll the (perfectly fine) editor off-screen, which looks
			// exactly like the chapter having vanished. Skipping a wild delta is safer than a wrong
			// scroll; the reader just keeps their original scroll position instead.
			if (Math.abs(delta) < scrollEl.clientHeight) scrollEl.scrollTop += delta;
		}
		handle.view.editor.focus();

		const onKeydown = (e: KeyboardEvent): void => {
			if (e.key === "Escape") this.commitActiveEdit();
		};
		handle.view.containerEl.addEventListener("keydown", onKeydown);
		this.activeEdit = { filename: file.name, handle, onKeydown };
	}

	/** Commits and tears down the one live grafted editor, if any, reverting its chapter back to
	 * normal virtualised rendering. Idempotent — safe to call whether or not one is currently live. */
	private commitActiveEdit(): void {
		if (!this.activeEdit) return;
		const { filename, handle, onKeydown } = this.activeEdit;
		this.activeEdit = null;
		handle.view.containerEl.removeEventListener("keydown", onKeydown);
		handle.destroy();
		this.readThrough?.unlockSection(filename);
	}

	/** The pre-graft behaviour, kept as the fallback when grafting isn't available: opens a real
	 * editor in this same leaf, caret at the exact clicked position — this does leave the continuous
	 * scroll, unlike the grafted path, but is still a real, fully-featured Obsidian editor rather
	 * than nothing at all. */
	private async openInMainPaneFallback(file: TFile, sourceOffset: number): Promise<void> {
		await this.leaf.openFile(file, { active: true });
		this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
		const view = this.leaf.view;
		if (view instanceof MarkdownView) {
			view.editor.setCursor(view.editor.offsetToPos(sourceOffset));
			view.editor.focus();
		}
	}
}
