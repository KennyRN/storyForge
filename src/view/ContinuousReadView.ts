import { ItemView, Platform, TAbstractFile, TFile, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type StoryForgePlugin from "../main";
import { chapterDisplayTitle, getBookChapters, renameChapterTitle } from "../book";
import { canEnterContinuousMode, resolveEntryChapter } from "../continuousMode";
import { bookFilePath, bookFolderNameFromChapterPath } from "../paths";
import { numberedBookTitle } from "../series";
import { applyHashNumbering, splitTitleSubtitle } from "../titleNumbering";
import { emitContinuousMode, onContinuousScrollTo } from "./continuousEvents";
import { attachInlineRename } from "./inlineRename";
import { ManuscriptSurface } from "./manuscript/ManuscriptSurface";
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
 * The sidebar's "exit" action replaces this same leaf with the normal chapter editor (see
 * `exitTarget`). This view has no exit control of its own.
 */
export class ContinuousReadView extends ItemView {
	private bookFolderName: string | null = null;
	private entryFilename: string | null = null;
	private surface: ManuscriptSurface | null = null;
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
		if (!this.bookFolderName) return "Continuous read";
		const { title } = splitTitleSubtitle(
			numberedBookTitle(this.app, this.bookFolderName, undefined, this.plugin.getSettings().seriesNumberingStyle),
		);
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
				if (payload.bookFolderName !== this.bookFolderName) return;
				const file = this.surface?.files().find((f) => f.name === payload.filename);
				if (file) this.surface?.scrollToChapter(file);
			}),
		);
		this.registerEvent(this.app.vault.on("modify", (file) => void this.onChapterModified(file)));
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

	async onClose(): Promise<void> {
		this.renderToken++;
		this.teardownSurface();
		emitContinuousMode(this.app, { active: false });
	}

	private teardownSurface(): void {
		this.surface?.destroy();
		this.surface = null;
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
		this.teardownSurface();
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
			// Editing switches on in a later stage of the build; read-only for now.
			editable: false,
			lockInput: !Platform.isDesktopApp,
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
				});
			},
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
			void this.render();
			return;
		}
		this.refreshTitles();
	}

	/** A file appeared, vanished or moved in this book's folder: the spine may have changed. */
	private onBookFileSetChanged(file: TAbstractFile): void {
		if (!this.surface || !this.bookFolderName) return;
		if (bookFolderNameFromChapterPath(file.path) !== this.bookFolderName && !this.surface.files().includes(file as TFile)) return;
		if (this.spineChanged()) void this.render();
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
		if (!this.surface.files().includes(file)) return;
		const raw = await this.app.vault.read(file);
		this.surface?.reloadFromDisk(file, raw);
	}
}
