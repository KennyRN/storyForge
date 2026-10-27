/**
 * The one object the interface reads from and acts through (docs/interface.md §1.1). It wraps the app
 * controller (open, create, watcher, backups, closing) and the notices, and tells regions which topic
 * changed so each redraws only its own subtree. Editors are never redrawn by a topic.
 */
import type { AppController, CoverTarget, OpenOutcome, Running } from "../app/appLife";
import type { MachineProjectState } from "../app/settings";
import type { PlotCardTier } from "../core/plotCardTier";
import { getBookChapters, removeBookCover, writeBookCoverName } from "../core/book";
import { createContinuingChapter } from "../core/chapterCreation";
import type { CreateProjectOptions } from "../core/openProject";
import { bookBackstagePath, libraryChapterPath, seriesBackstagePath } from "../core/paths";
import { getSeriesBooks, removeSeriesCover, writeSeriesCoverName } from "../core/series";
import { storytellingCodexClickAction } from "../view/codexOpenTarget";
import { NoticeCenter } from "./kit/notices";
import type { EditorHost } from "./editor/editorHost";

export type Topic = "project" | "library" | "codex" | "archive" | "stats" | "settings" | "face" | "notices" | "nav" | "sessions";

export type Face = "storytelling" | "storyforge";
/** What the workspace shows on the storyForge face: the open chapter, or the overview of the selected tab. */
export type CentreView = "chapter" | "overview";
export type ForgeTab = "codex" | "series" | "novel" | "archive";

/** Where the author is: the face, the storyForge tab, the selected novel and chapter, and the layout of the panels. */
export interface Nav {
	face: Face;
	forgeTab: ForgeTab;
	/** Not persisted: the app opens on the chapter. */
	centreView: CentreView;
	/** The selected novel's folder name. */
	book: string | null;
	/** The selected chapter's filename. */
	chapter: string | null;
	collapsedCodex: Set<string>;
	leftWidth: number;
	loreWidth: number;
	/** View ▸ Show or Hide Context. */
	loreHidden: boolean;
	/** Chapter card sizes, `<book>/<file>`; absent means extended. */
	cardTiers: Record<string, "bar" | "collapsed">;
}

/** What Story ▸ Archive and Rename… act on: the last thing the author picked in a list. */
export type Selection =
	| { kind: "chapter"; book: string; filename: string }
	| { kind: "codex-note"; path: string }
	| { kind: "codex-folder"; id: string; path?: string }
	| { kind: "novel"; book: string };

export const DEFAULT_LEFT_WIDTH = 288;
export const DEFAULT_LORE_WIDTH = 400;
const clampWidth = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const clampLeft = (n: number): number => clampWidth(n, 200, 480);
export const clampLore = (n: number): number => clampWidth(n, 280, 640);

const ALL: Topic[] = ["project", "library", "codex", "archive", "stats", "settings", "face", "sessions"];

export class AppModel {
	readonly notices = new NoticeCenter();
	/** Set by the shell once the slots exist. */
	editors: EditorHost | null = null;
	nav: Nav = { face: "storytelling", forgeTab: "novel", centreView: "chapter", book: null, chapter: null, collapsedCodex: new Set(), leftWidth: DEFAULT_LEFT_WIDTH, loreWidth: DEFAULT_LORE_WIDTH, loreHidden: false, cardTiers: {} };
	selection: Selection | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | undefined;
	private listeners = new Map<Topic, Set<() => void>>();

	constructor(readonly controller: AppController) {
		// Everything the controller does on its own (an outside change applied, a project opened) touches all topics.
		controller.onChange = () => this.touch(...ALL);
		// A writing session started or ended: the history view and the stats panel redraw.
		controller.onSessionChange = () => this.touch("sessions", "stats");
		// Quietly, once: writing is unaffected (docs/sessions.md §8).
		controller.onSessionFailure = () => this.notices.notify({ text: "Writing sessions couldn't be saved. Your writing is not affected.", key: "sessions-failed" });
	}

	get running(): Running | null {
		return this.controller.running;
	}

	/**
	 * Works out where the author is when a project opens: the face and tab from the project's preferences
	 * (decision 23), the novel and chapter from where they were on this computer (or the first of each),
	 * and the panel widths. Opens nothing.
	 */
	initNav(): void {
		const running = this.running;
		if (!running) return;
		const project = running.opened.project;
		const settings = running.settings.values;
		const machine: MachineProjectState = running.machineState;
		const { ordered, unplaced } = getSeriesBooks(project);
		const books = [...ordered, ...unplaced].map((b) => b.name);
		const book = machine.selectedNovel && books.includes(machine.selectedNovel) ? machine.selectedNovel : (books[0] ?? null);
		let chapter: string | null = null;
		if (book) {
			const chapters = getBookChapters(project, book);
			const names = [...chapters.ordered, ...chapters.unplaced].map((c) => c.name);
			chapter = machine.selectedObject && names.includes(machine.selectedObject) ? machine.selectedObject : (chapters.ordered[0]?.name ?? null);
		}
		this.nav = {
			face: settings.autoFocus ? "storytelling" : "storyforge",
			forgeTab: settings.layout === "codex" ? "codex" : settings.layout === "seriesBrowse" ? "series" : "novel",
			centreView: "chapter",
			book,
			chapter,
			collapsedCodex: new Set(machine.collapsedCodexFolderIds),
			leftWidth: clampLeft(machine.leftWidth ?? DEFAULT_LEFT_WIDTH),
			loreWidth: clampLore(machine.loreWidth ?? DEFAULT_LORE_WIDTH),
			loreHidden: machine.loreHidden === true,
			cardTiers: { ...(machine.cardTiers ?? {}) },
		};
		this.selection = null;
	}

	/** Selects a novel (from the series tab): its last chapter, or its first, becomes the selection, and the novel tab shows it. */
	async selectBook(book: string): Promise<void> {
		const running = this.running;
		if (!running) return;
		const chapters = getBookChapters(running.opened.project, book);
		const first = chapters.ordered[0]?.name ?? chapters.unplaced[0]?.name ?? null;
		this.nav.book = book;
		this.nav.chapter = first;
		this.nav.forgeTab = "novel";
		this.persistSoon();
		this.touch("nav", "stats", "library", "face");
		const path = this.currentChapterPath();
		if (path) await this.editors?.open("centre", path);
		// Choosing a novel shows its overview, not its chapter (the chapter stays open underneath).
		this.setCentreView("overview");
	}

	/** File ▸ New Chapter, and the navigator's "add the next chapter": a chapter after the current one, opened. */
	async addNextChapter(): Promise<void> {
		const running = this.running;
		const { book, chapter } = this.nav;
		if (!running) return void this.notices.notify({ text: "Open a project first." });
		if (running.readOnlyReason) return void this.notices.notify({ text: "This project is open read-only." });
		if (!book) return void this.notices.notify({ text: "This project has no novel yet." });
		await this.guard(async () => {
			const created = await createContinuingChapter(running.opened.project, book, chapter);
			this.touch("library", "stats");
			await this.openChapter(book, created.filename);
		}, "create the chapter");
	}

	/** Remembers what the author picked, for the Story menu. */
	select(selection: Selection): void {
		this.selection = selection;
		this.touch("nav");
	}

	/** View ▸ Show or Hide Context. */
	toggleLoreSlot(): void {
		this.nav.loreHidden = !this.nav.loreHidden;
		this.persistSoon();
		this.touch("nav");
	}

	/** Moves between the faces. */
	flipFace(): void {
		// The storytelling face always shows the chapter; flipping back restores what the centre showed on leaving.
		if (this.nav.face === "storyforge") this.forgeCentreView = this.nav.centreView;
		else this.nav.centreView = this.forgeCentreView;
		this.nav.face = this.nav.face === "storytelling" ? "storyforge" : "storytelling";
		this.touch("face");
		// The workspace of the storytelling side is the chapter: a Codex note opened there from the library gives way to it.
		if (this.nav.face === "storytelling") void this.restoreChapter();
	}

	private forgeCentreView: CentreView = "chapter";

	setCentreView(view: CentreView): void {
		if (this.nav.centreView === view) return;
		this.nav.centreView = view;
		this.touch("nav");
	}

	/** True while an overview covers the workspace (the editor underneath is inert). */
	get centreCovered(): boolean {
		return this.nav.face === "storyforge" && this.nav.centreView === "overview" && (this.nav.forgeTab === "series" || this.nav.forgeTab === "novel");
	}

	/** Puts the selected chapter back in the workspace if something else (a Codex note opened from the library) is there. */
	async restoreChapter(): Promise<void> {
		const path = this.currentChapterPath();
		const shown = this.editors?.pathIn("centre");
		if (path && this.running?.opened.project.entry(path) && shown !== this.canonical(path)) await this.editors?.open("centre", path);
	}

	setForgeTab(tab: ForgeTab): void {
		this.nav.forgeTab = tab;
		this.touch("face");
	}

	/** The selected chapter's project path, if there is one. */
	currentChapterPath(): string | null {
		const { book, chapter } = this.nav;
		return book && chapter ? libraryChapterPath(book, chapter) : null;
	}

	/** Selects a chapter and opens it in the centre. */
	async openChapter(book: string, filename: string): Promise<void> {
		this.nav.book = book;
		this.nav.chapter = filename;
		this.select({ kind: "chapter", book, filename });
		this.persistSoon();
		this.setCentreView("chapter");
		this.touch("nav", "stats");
		await this.editors?.open("centre", libraryChapterPath(book, filename));
	}

	/** Opens the selected chapter in the centre, if the centre is empty (opening a project, or the selection changing under it). */
	async ensureCentre(): Promise<void> {
		const path = this.currentChapterPath();
		if (path && this.running && this.running.opened.project.entry(path) && !this.editors?.pathIn("centre")) await this.editors?.open("centre", path);
	}

	/** A click on a Codex entry: opens it in the lore slot; clicking the entry already there closes the slot (`storytellingCodexClickAction`). */
	async toggleLore(path: string): Promise<void> {
		const editors = this.editors;
		if (!editors) return;
		const showing = editors.pathIn("lore");
		if (storytellingCodexClickAction(showing ? this.canonical(showing) : null, this.canonical(path)) === "close") await editors.close("lore");
		else await editors.open("lore", path);
		this.touch("nav");
	}

	private canonical(path: string): string {
		return this.running?.opened.project.entry(path)?.path ?? path;
	}

	toggleCodexFolder(id: string): void {
		if (!this.nav.collapsedCodex.delete(id)) this.nav.collapsedCodex.add(id);
		this.persistSoon();
		this.touch("codex");
	}

	setWidths(left?: number, lore?: number): void {
		if (left !== undefined) this.nav.leftWidth = clampLeft(left);
		if (lore !== undefined) this.nav.loreWidth = clampLore(lore);
		this.persistSoon();
	}

	cardTier(book: string, file: string): PlotCardTier {
		return this.nav.cardTiers[`${book}/${file}`] ?? "extended";
	}

	/** Sets the size of the given cards; extended is stored as no entry. Navigation state: this computer only. */
	setCardTiers(book: string, files: string[], tier: PlotCardTier): void {
		const next = { ...this.nav.cardTiers };
		for (const f of files) {
			if (tier === "extended") delete next[`${book}/${f}`];
			else next[`${book}/${f}`] = tier;
		}
		this.nav.cardTiers = next;
		this.persistSoon();
		this.touch("nav");
	}

	/** Where you were is saved a moment after it changes, on this computer only. */
	persistSoon(): void {
		clearTimeout(this.persistTimer);
		this.persistTimer = setTimeout(() => void this.persistNow(), 400);
	}

	async persistNow(): Promise<void> {
		clearTimeout(this.persistTimer);
		if (!this.running) return;
		const { book, chapter, collapsedCodex, leftWidth, loreWidth, loreHidden, cardTiers } = this.nav;
		try {
			await this.controller.saveMachineState({ selectedNovel: book, selectedObject: chapter, collapsedCodexFolderIds: [...collapsedCodex], leftWidth, loreWidth, ...(loreHidden ? { loreHidden } : {}), ...(Object.keys(cardTiers).length ? { cardTiers } : {}) });
		} catch {
			/* where you were is a convenience: never worth a notice */
		}
	}

	subscribe(topics: Topic | Topic[], listener: () => void): () => void {
		const list = Array.isArray(topics) ? topics : [topics];
		for (const t of list) {
			const set = this.listeners.get(t) ?? new Set();
			set.add(listener);
			this.listeners.set(t, set);
		}
		return () => list.forEach((t) => this.listeners.get(t)?.delete(listener));
	}

	touch(...topics: Topic[]): void {
		const fire = new Set<() => void>();
		for (const t of topics) for (const l of this.listeners.get(t) ?? []) fire.add(l);
		for (const l of fire) l();
	}

	async openProject(kind: "open" | "create", create?: CreateProjectOptions): Promise<OpenOutcome | null> {
		return this.guard(() => this.controller.openDialog(kind, create), kind === "create" ? "create the project" : "open the project");
	}

	async openRecent(index: number): Promise<OpenOutcome | null> {
		return this.guard(() => this.controller.openRecent(index), "open the project");
	}

	/** Reveals a project-relative file in Finder (Rust checks the path and only reveals). */
	async reveal(path: string): Promise<void> {
		try {
			await this.controller.revealInFinder(path);
		} catch (e) {
			this.notices.notify({ text: `Could not show the file in Finder: ${(e as Error)?.message ?? String(e)}` });
		}
	}

	/** Runs an action; a failure becomes a plain notice that says what could not be done. */
	private coverFolder(target: CoverTarget): string {
		return target.kind === "series" ? seriesBackstagePath() : bookBackstagePath(target.code);
	}

	/** Lets the index see covers that Rust placed or retired (the window doesn't hear about its own picker's writes). */
	private async refreshCovers(target: CoverTarget): Promise<void> {
		const project = this.running?.opened.project;
		if (!project) return;
		for (const ext of ["png", "jpg", "gif", "webp"]) await project.refresh(`${this.coverFolder(target)}/cover.${ext}`).catch(() => undefined);
	}

	/** The cover box was clicked: Rust shows the open panel and installs the image (retiring the old cover); the name is recorded here. */
	async chooseCover(target: CoverTarget): Promise<void> {
		const running = this.running;
		if (!running || running.readOnlyReason) return;
		await this.guard(async () => {
			const name = await this.controller.pickCover(target);
			if (!name) return;
			const project = running.opened.project;
			await this.refreshCovers(target);
			try {
				if (target.kind === "series") await writeSeriesCoverName(project, name);
				else await writeBookCoverName(project, target.code, name);
			} catch (e) {
				this.notices.notify({ text: `The cover image was saved, but it could not be recorded in the project's details: ${(e as Error)?.message ?? String(e)}`, sticky: true });
			}
			this.touch("library", "nav");
		}, "set the cover");
	}

	/** Clears the cover and retires its file to `.trash/`. */
	async removeCover(target: CoverTarget): Promise<void> {
		const running = this.running;
		if (!running || running.readOnlyReason) return;
		await this.guard(async () => {
			if (target.kind === "series") await removeSeriesCover(running.opened.project);
			else await removeBookCover(running.opened.project, target.code);
			await this.refreshCovers(target);
			this.touch("library", "nav");
		}, "remove the cover");
	}

	async guard<T>(action: () => Promise<T>, what: string): Promise<T | null> {
		try {
			const out = await action();
			if (out && typeof out === "object" && "kind" in out && (out as { kind: string }).kind === "not-a-project") {
				this.notices.notify({ text: (out as unknown as { message: string }).message });
			}
			return out;
		} catch (e) {
			this.notices.notify({ text: `Could not ${what}: ${(e as Error)?.message ?? String(e)}` });
			return null;
		}
	}
}
