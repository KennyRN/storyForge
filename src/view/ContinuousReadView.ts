import { ItemView, Notice, Platform, TAbstractFile, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, getBookChapters, renameChapterTitle } from "../book";
import { createContinuingChapter } from "../chapterCreation";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { runContentBackup } from "../backup";
import { bookFilePath, bookFolderNameFromChapterPath } from "../paths";
import { numberedBookTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { emitContinuousMode, onContinuousScrollTo } from "./continuousEvents";
import { attachInlineRename } from "./inlineRename";
import { ManuscriptSurface } from "./manuscript/ManuscriptSurface";
import { ManuscriptWriter } from "./manuscript/manuscriptWriter";
import { ICON_CONTINUOUS_MODE } from "../icons";

export const STORYFORGE_CONTINUOUS_VIEW_TYPE = "storyforge-continuous-view";

interface ContinuousReadViewState {
	bookFolderName: string;
	/** Where to land on open — the reader's chapter at the moment they chose to read continuously. */
	entryFilename: string;
}

/**
 * Continuous mode's own view: the manuscript editor (continuous-mode manuscript brief §3), one
 * CodeMirror editor holding every placed chapter of the book, in spine order (see
 * manuscript/ManuscriptSurface.ts). The sidebar is menus only, so this view holds the manuscript
 * and nothing else — the live position indicator and the transport live in CodexFocusNavigator.ts,
 * talking to this view through continuousEvents.ts's pair of workspace events rather than a
 * direct reference.
 *
 * Editing is desktop only; on mobile the same surface opens read-only. The author's typing is
 * saved per chapter by manuscript/manuscriptWriter.ts, the one module allowed to write prose.
 *
 * The sidebar's "exit" action replaces this same leaf with the normal chapter editor (see
 * `getExitTarget`, and `flushPending`, which exit awaits first). This view has no exit control of
 * its own.
 */
export class ContinuousReadView extends ItemView {
	private bookFolderName: string | null = null;
	private entryFilename: string | null = null;
	private surface: ManuscriptSurface | null = null;
	private writer: ManuscriptWriter | null = null;
	/** The once-per-session content backup taken before the first save (brief §3.5), shared by
	 * every chapter that saves while it runs. A session is this view's life, across book switches. */
	private sessionBackup: Promise<void> | null = null;
	private lastRefusalNotice = 0;
	/** Spine rebuilds run one at a time, in order. */
	private spineWork: Promise<void> = Promise.resolve();
	/** A chapter just created from here, to put the caret in once it reaches the manuscript. */
	private pendingFocus: string | null = null;
	/** The spine the surface was built from, by filename — a different list means a rebuild. */
	private spine: string[] = [];
	/** Bumped on every render so a render still reading files can tell it's been overtaken. */
	private renderToken = 0;

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
		if (!this.bookFolderName) return "continuous mode";
		const { title } = splitTitleSubtitle(
			numberedBookTitle(this.app, this.bookFolderName, undefined, this.plugin.getSettings().seriesNumberingStyle),
		);
		return `continuous mode: ${title}`;
	}

	getIcon(): string {
		return ICON_CONTINUOUS_MODE;
	}

	async onOpen(): Promise<void> {
		// The sidebar's live-position tiles and scroll-to transport command this view rather than
		// holding a direct reference to it — see continuousEvents.ts.
		this.registerEvent(
			onContinuousScrollTo(this.app, (payload) => {
				if (payload.bookFolderName !== this.bookFolderName) return;
				const file = this.surface?.files().find((f) => f.name === payload.filename);
				if (file) this.surface?.scrollToChapter(file);
			}),
		);
		this.registerEvent(this.app.vault.on("modify", (file) => void this.onChapterModified(file)));
		// Quitting mid-sentence loses nothing: Obsidian waits for these tasks before closing.
		this.registerEvent(this.app.workspace.on("quit", (tasks) => tasks.add(() => this.flushPending())));
		this.registerEvent(this.app.vault.on("create", (file) => this.onBookFileSetChanged(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.onBookFileSetChanged(file)));
		this.registerEvent(this.app.vault.on("rename", (file) => this.onBookFileSetChanged(file)));
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.bookFolderName && file.path === bookFilePath(this.bookFolderName)) this.onBookMetadataChanged();
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
		await this.render();
	}

	getState(): Record<string, unknown> {
		return this.bookFolderName && this.entryFilename
			? { bookFolderName: this.bookFolderName, entryFilename: this.getCurrentFilename() ?? this.entryFilename }
			: {};
	}

	/** The chapter at the top of the screen — the sidebar reads this synchronously
	 * (getLeavesOfType + a direct method call) to paint its live position indicator correctly on
	 * its own next render, without waiting for an event round-trip. */
	getCurrentFilename(): string | null {
		return this.surface?.topFile()?.name ?? this.entryFilename;
	}

	getBookFolderName(): string | null {
		return this.bookFolderName;
	}

	/** Where exit lands (brief §3.7): the caret's chapter and file offset when the caret is on
	 * screen, otherwise the chapter at the top of the screen with no offset. */
	getExitTarget(): { filename: string; offset: number | null } | null {
		const target = this.surface?.exitTarget();
		if (target) return { filename: target.file.name, offset: target.offset };
		return this.entryFilename ? { filename: this.entryFilename, offset: null } : null;
	}

	/** Whether chapters can be created from here: editing is desktop only (brief §3.13). */
	canCreateChapters(): boolean {
		return Platform.isDesktopApp && this.surface !== null;
	}

	/** The 'New chapter after this one' command: after the caret's chapter (or, with the caret on a
	 * break, the chapter at the top of the screen). */
	createChapterAfterCaret(): Promise<void> {
		return this.createChapterAfter(this.surface?.caretFile() ?? this.surface?.topFile() ?? null);
	}

	/**
	 * New chapters (brief §3.10), one behaviour for all three entry points: create the file and place
	 * it on the spine after `anchor` (or at the end) through the existing creation path, without
	 * opening it; the spine change then brings it into the manuscript as a structural, non-undoable
	 * insert, and the caret goes into it. Whatever the author types there saves to the new file.
	 */
	async createChapterAfter(anchor: TFile | null): Promise<void> {
		if (!this.bookFolderName || !this.canCreateChapters()) return;
		try {
			const created = await createContinuingChapter(this.app, this.bookFolderName, anchor?.name ?? null, { openFile: false });
			this.pendingFocus = created.filename;
			// The metadata cache may not have the new spine yet; its 'changed' event rebuilds again
			// when it does, and the caret goes in then.
			await this.rebuildSpine();
		} catch (err) {
			new Notice(`storyForge: could not create chapter — ${(err as Error).message}`);
		}
	}

	/** The guide settings changed: reconfigure the manuscript live. */
	applyGuideSettings(): void {
		this.surface?.setGuides(this.plugin.manuscriptGuideSettings());
	}

	/** Saves every unsaved chapter now. Exit, book switch, close, plugin unload and quit all
	 * come through here. */
	async flushPending(): Promise<void> {
		await this.writer?.flushAll();
	}

	async onClose(): Promise<void> {
		this.renderToken++;
		await this.teardownSurface();
		emitContinuousMode(this.app, { active: false });
	}

	/** Flushes, then tears the editor down. The surface stays readable until the flush is done,
	 * since saving reads the chapters' text from it. */
	private async teardownSurface(): Promise<void> {
		const writer = this.writer;
		const surface = this.surface;
		this.writer = null;
		this.surface = null;
		if (writer) {
			await writer.flushAll();
			writer.dispose();
		}
		surface?.destroy();
	}

	private ensureSessionBackup(): Promise<void> {
		if (!this.sessionBackup) {
			this.sessionBackup = runContentBackup(this.app, true).then(
				() => undefined,
				(err) => {
					new Notice(`storyForge: the backup before continuous-mode saves failed — ${(err as Error).message}. Saving anyway.`);
				},
			);
		}
		return this.sessionBackup;
	}

	private numberedTitles(bookFolderName: string, ordered: TFile[]): Map<TFile, string> {
		const numbered = applyHashNumbering(
			ordered.map((file) => chapterDisplayTitle(this.app, bookFolderName, file.name)),
			this.plugin.getSettings().chapterNumberingStyle,
		);
		return new Map(ordered.map((file, i) => [file, numbered[i]]));
	}

	private async render(): Promise<void> {
		const token = ++this.renderToken;
		await this.teardownSurface();
		if (token !== this.renderToken) return; // overtaken while flushing
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

		// canEnterContinuousMode above guarantees ordered isn't empty, so the ordered[0] fallback is
		// belt-and-braces only.
		const entryFilename =
			resolveEntryChapter(
				ordered.map((file) => file.name),
				this.entryFilename,
			) ?? ordered[0].name;
		const entryFile = ordered.find((file) => file.name === entryFilename) ?? ordered[0];
		const titles = this.numberedTitles(bookFolderName, ordered);
		const raws = await Promise.all(ordered.map((file) => this.app.vault.read(file)));
		if (token !== this.renderToken) return; // overtaken while reading

		// Obsidian's own editor container classes, so the manuscript picks up exactly the typography
		// the chapter editor has — Obsidian's, the theme's, storyForge's and formatForge's — with no
		// copied values (brief §3.12). `.view-content > .markdown-source-view.mod-cm6 > .cm-editor`
		// is also what gives the scroller Obsidian's file margins.
		const host = container.createDiv({ cls: "markdown-source-view mod-cm6 is-live-preview is-readable-line-width sf-manuscript" });
		this.spine = ordered.map((file) => file.name);
		this.entryFilename = entryFile.name;
		this.surface = new ManuscriptSurface(host, {
			chapters: ordered.map((file, i) => ({ file, raw: raws[i], title: titles.get(file) ?? file.basename })),
			entryFile,
			guides: this.plugin.manuscriptGuideSettings(),
			// Editing is desktop only (brief §3.13); mobile opens the same surface read-only.
			editable: Platform.isDesktopApp,
			lockInput: !Platform.isDesktopApp,
			onChaptersEdited: (files) => this.writer?.noteEdited(files),
			onEditRefused: () => {
				const now = Date.now();
				if (now - this.lastRefusalNotice < 2000) return;
				this.lastRefusalNotice = now;
				new Notice("Edits can't cross a chapter break.");
			},
			onAppendChapter: Platform.isDesktopApp ? () => void this.createChapterAfter(null) : null,
			onTopChapterChange: (file) => {
				this.entryFilename = file.name;
				emitContinuousMode(this.app, { active: true, bookFolderName, filename: file.name });
			},
			decorateHeader: (row, label, file) => {
				// Inert to left-click (the widget sees to that); renamed only via this right-click menu,
				// through the same path the chapter tree uses.
				attachInlineRename({
					row,
					label,
					getCurrentTitle: () => chapterDisplayTitle(this.app, bookFolderName, file.name),
					onCommit: async (newTitle) => {
						await renameChapterTitle(this.app, bookFolderName, file.name, newTitle);
						this.refreshTitles();
					},
					extraMenuItems: Platform.isDesktopApp
						? [{ title: "New chapter after this", onClick: () => this.createChapterAfter(file) }]
						: undefined,
				});
			},
		});

		this.writer = new ManuscriptWriter({
			app: this.app,
			bookFolderName,
			surface: this.surface,
			ensureSessionBackup: () => this.ensureSessionBackup(),
		});

		emitContinuousMode(this.app, { active: true, bookFolderName, filename: entryFile.name });
	}

	/** Redraws the headers only: the document is untouched (brief §3.4). */
	private refreshTitles(): void {
		if (!this.surface || !this.bookFolderName) return;
		const titles = this.numberedTitles(this.bookFolderName, this.surface.files());
		this.surface.setTitles((file) => titles.get(file) ?? file.basename);
	}

	/** novel.md changed: a title, or the spine itself (placement, reorder, unplace, archive). */
	private onBookMetadataChanged(): void {
		if (!this.surface || !this.bookFolderName) return;
		if (this.spineChanged()) {
			void this.rebuildSpine();
			return;
		}
		this.refreshTitles();
	}

	/** A file appeared, vanished or moved in this book's folder: the spine may have changed. */
	private onBookFileSetChanged(file: TAbstractFile): void {
		if (!this.surface || !this.bookFolderName) return;
		if (bookFolderNameFromChapterPath(file.path) !== this.bookFolderName && !this.surface.files().includes(file as TFile)) return;
		if (this.spineChanged()) void this.rebuildSpine();
	}

	/**
	 * The spine changed (brief §3.6): flush pending saves — a chapter that has left the spine or the
	 * vault can no longer be saved, so its unsaved text goes to a recovery file — then rebuild the
	 * document in place, keeping the caret's chapter and offset and what's at the top of the screen.
	 * Falls back to a full render when the book can no longer be read continuously.
	 */
	private rebuildSpine(): Promise<void> {
		this.spineWork = this.spineWork.then(
			() => this.rebuildSpineNow(),
			() => this.rebuildSpineNow(),
		);
		return this.spineWork;
	}

	private async rebuildSpineNow(): Promise<void> {
		const token = this.renderToken;
		await this.flushPending();
		if (token !== this.renderToken || !this.surface || !this.bookFolderName) return;
		const { ordered } = getBookChapters(this.app, this.bookFolderName);
		if (!canEnterContinuousMode(ordered.length)) {
			await this.render();
			return;
		}
		const surface = this.surface;
		const titles = this.numberedTitles(this.bookFolderName, ordered);
		const raws = await Promise.all(ordered.map((file) => (surface.has(file) ? null : this.app.vault.read(file))));
		if (token !== this.renderToken || this.surface !== surface) return;
		this.spine = ordered.map((file) => file.name);
		surface.rebuild(ordered.map((file, i) => ({ file, raw: raws[i], title: titles.get(file) ?? file.basename })));
		const focus = this.pendingFocus && ordered.find((file) => file.name === this.pendingFocus);
		if (focus) {
			this.pendingFocus = null;
			surface.focusChapter(focus);
		}
	}

	private spineChanged(): boolean {
		if (!this.bookFolderName) return false;
		const { ordered } = getBookChapters(this.app, this.bookFolderName);
		const next = ordered.map((file) => file.name);
		return next.length !== this.spine.length || next.some((name, i) => name !== this.spine[i]);
	}

	/** A chapter of this book was modified elsewhere: bring its text in from disk (brief §3.6).
	 * bookFolderNameFromChapterPath rejects the vast majority of vault-wide writes in O(1). */
	private async onChapterModified(file: TAbstractFile): Promise<void> {
		if (!(file instanceof TFile) || !this.surface || !this.bookFolderName) return;
		if (bookFolderNameFromChapterPath(file.path) !== this.bookFolderName) return;
		if (!this.surface.has(file)) return;
		const writer = this.writer;
		const raw = await this.app.vault.read(file);
		if (writer && writer === this.writer) await writer.onDiskChanged(file, raw);
	}
}
