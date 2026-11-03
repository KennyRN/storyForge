/**
 * The one object the interface reads from and acts through (docs/interface.md §1.1). It wraps the app
 * controller (open, create, watcher, backups, closing) and the notices, and tells regions which topic
 * changed so each redraws only its own subtree. Editors are never redrawn by a topic.
 */
import { clampPx, convertUnit, displayWidths, DEFAULT_LEFT_WIDTH_PX, DEFAULT_LORE_WIDTH_PX, DEFAULT_WIDTH_UNIT, fromPx, rangeIn, toPx, type Panel, type PanelWidths, type Range, type WidthUnit } from "./panelWidths";
import type { AppController, CoverTarget, OpenOutcome, Running } from "../app/appLife";
import type { MachineProjectState, StatsCount } from "../app/settings";
import type { PlotCardTier } from "../core/plotCardTier";
import type { TypingEditorOptions } from "./editor/typingAids";
import { buildNameIndex, EMPTY_NAMES, type NameIndex } from "../core/typing/names";
import { collectNameSources } from "../core/typing/nameSources";
import { withEntry } from "../core/typing/lists";
import { type SettingReplaced, setSetting } from "../app/settings";
import { settingName, settingValue } from "./screens/settingNames";
import { getBookChapters, removeBookCover, writeBookCoverName } from "../core/book";
import { createContinuingChapter } from "../core/chapterCreation";
import type { CreateProjectOptions } from "../core/openProject";
import { bookBackstagePath, libraryChapterPath, seriesBackstagePath } from "../core/paths";
import { getSeriesBooks, removeSeriesCover, writeSeriesCoverName } from "../core/series";
import { storytellingCodexClickAction } from "../view/codexOpenTarget";
import { commitFocusedFields, rescueFocusedFields } from "./commitOnClose";
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
	/** Panel widths in `widthUnit` (Fix 5): the left panel on each side, and the context panel. */
	storyWidth: number;
	libraryWidth: number;
	loreWidth: number;
	widthUnit: WidthUnit;
	/** "Keep the panels the same width". */
	widthsLinked: boolean;
	/** View ▸ Show or Hide Context. */
	loreHidden: boolean;
	/** Chapter card sizes, `<book>/<file>`; absent means extended. */
	cardTiers: Record<string, "bar" | "collapsed">;
	/** Which count the stats panel shows. */
	statsCount: StatsCount;
}

/** What Story ▸ Archive and Rename… act on: the last thing the author picked in a list. */
export type Selection =
	| { kind: "chapter"; book: string; filename: string }
	| { kind: "codex-note"; path: string }
	| { kind: "codex-folder"; id: string; path?: string }
	| { kind: "novel"; book: string };

const machineDefaults = (): MachineProjectState => ({ selectedNovel: null, selectedObject: null, collapsedCodexFolderIds: [] });

/**
 * The stored widths of a project (Fix 5). Before 1.5.0 only `leftWidth` (for both sides) and `loreWidth` were kept, in pixels;
 * with no switch stored the panels are linked, so all three take the storytelling side's width, shown in percent (decision 77).
 */
function initialWidths(m: MachineProjectState, win: number): Pick<Nav, "storyWidth" | "libraryWidth" | "loreWidth" | "widthUnit" | "widthsLinked"> {
	const unit: WidthUnit = m.widthUnit ?? DEFAULT_WIDTH_UNIT;
	const linked = m.widthsLinked ?? true;
	const fresh = m.widthUnit === undefined; // figures are pixels
	const asPx = (v: number | undefined, fallback: number): number => toPx(v ?? fallback, fresh ? "px" : unit, win);
	const story = asPx(m.leftWidth, DEFAULT_LEFT_WIDTH_PX);
	const library = linked ? story : asPx(m.libraryWidth, m.leftWidth === undefined ? DEFAULT_LEFT_WIDTH_PX : story);
	const lore = linked ? story : asPx(m.loreWidth, DEFAULT_LORE_WIDTH_PX);
	const out = (px: number, key: Panel): number => fromPx(clampPx(key, linked, px), unit, win);
	return { storyWidth: out(story, "story"), libraryWidth: out(library, "library"), loreWidth: out(lore, "lore"), widthUnit: unit, widthsLinked: linked };
}

const windowWidth = (): number => (typeof window !== "undefined" && window.innerWidth > 0 ? window.innerWidth : 1440);

const ALL: Topic[] = ["project", "library", "codex", "archive", "stats", "settings", "face", "sessions"];

export class AppModel {
	readonly notices = new NoticeCenter();
	/** Set by the shell once the slots exist. */
	editors: EditorHost | null = null;
	nav: Nav = { face: "storytelling", forgeTab: "novel", centreView: "chapter", book: null, chapter: null, collapsedCodex: new Set(), ...initialWidths(machineDefaults(), windowWidth()), loreHidden: false, cardTiers: {}, statsCount: "day" };
	selection: Selection | null = null;
	private persistTimer: ReturnType<typeof setTimeout> | undefined;
	private listeners = new Map<Topic, Set<() => void>>();

	constructor(readonly controller: AppController) {
		// Everything the controller does on its own (an outside change applied, a project opened) touches all topics.
		controller.onChange = () => this.touch(...ALL);
		controller.onSettingsProblem = (kind, version) => {
			if (kind === "unreadable") this.notices.notify({ text: "The project’s settings file can’t be read, so settings stay as they were and can’t be changed until it can.", key: "settings-file", ms: 12000 });
			else if (kind === "absent") this.notices.notify({ text: "The project’s settings file has gone. Settings stay as they are for now, and return to their defaults when the project next opens.", key: "settings-file", ms: 12000 });
			else
				this.notices.notify({
					text: `This project was upgraded elsewhere by a newer storyForge (format ${version}). Settings can’t be changed now. Close and reopen it to open it read-only; what you have typed is saved first.`,
					key: "settings-file",
					sticky: true,
					actions: [{ label: "Close and Reopen", onClick: () => void this.openRecent(0) }],
				});
			this.touch("settings");
		};
		controller.onSettingsChanged = () => this.touch("settings", "library", "nav", "face", "stats");
		// The names the autocorrect knows come from the Codex: collect them again when it or the project changes.
		this.subscribe(["codex", "project", "library", "archive"], () => void this.namesVersion++);
		// A field being edited when the app closes is committed first (docs/story-shape.md §5.3).
		controller.registerCloseCommit({ commit: commitFocusedFields, rescue: rescueFocusedFields });
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
			...initialWidths(machine, windowWidth()),
			loreHidden: machine.loreHidden === true,
			cardTiers: { ...(machine.cardTiers ?? {}) },
			statsCount: machine.statsCount ?? "day",
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

	/** File ▸ New Chapter, and the navigator's "add the next chapter": a chapter at the end of the novel, opened. */
	async addNextChapter(): Promise<void> {
		const running = this.running;
		const { book, chapter } = this.nav;
		if (!running) return void this.notices.notify({ text: "Open a project first." });
		if (running.readOnlyReason) return void this.notices.notify({ text: "This project is open read-only." });
		if (!book) return void this.notices.notify({ text: "This project has no novel yet." });
		await this.guard(async () => {
			const created = await createContinuingChapter(running.opened.project, book, null); // a true append (decision 81): the end of the novel, whichever chapter is open
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

	/** The storytelling side's series and novel names: the library side, on that tab, with its overview in the workspace. */
	openLibraryTab(tab: ForgeTab): void {
		const overviewTab = tab === "series" || tab === "novel";
		this.nav.forgeTab = tab; // before the flip: the library side draws its tab when it is mounted
		if (this.nav.face === "storytelling") {
			if (overviewTab) this.forgeCentreView = "overview"; // flipFace restores this one; the editor stays mounted under the overview
			this.flipFace();
		} else {
			if (overviewTab) this.nav.centreView = "overview";
			this.touch("nav", "face");
		}
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
		return this.nav.face === "storyforge" && (this.libraryTabHasLayer || (this.nav.centreView === "overview" && (this.nav.forgeTab === "series" || this.nav.forgeTab === "novel")));
	}

	/** The library side's Codex and Archive tabs: the workspace is a layer showing that tab's selected entry, or blank. */
	get libraryTabHasLayer(): boolean {
		return this.nav.forgeTab === "codex" || this.nav.forgeTab === "archive";
	}

	/** An entry is being opened in a library tab's workspace: make sure that tab is the one showing. */
	showLibraryEntry(tab: "codex" | "archive"): void {
		if (this.nav.forgeTab === tab && this.nav.face === "storyforge") return;
		this.openLibraryTab(tab);
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

	/** The widths as stored, for the pure functions. */
	panelWidths(): PanelWidths {
		const { storyWidth: story, libraryWidth: library, loreWidth: lore, widthUnit: unit, widthsLinked: linked } = this.nav;
		return { story, library, lore, unit, linked };
	}

	/** The widths to draw, in pixels, at this window width: narrowed for display if the window is small, stored figures untouched. */
	displayWidths(win = windowWidth()): { left: number; lore: number } {
		return displayWidths(this.panelWidths(), this.nav.face, this.nav.loreHidden, win);
	}

	private storeWidths(w: PanelWidths, notify = true): void {
		Object.assign(this.nav, { storyWidth: w.story, libraryWidth: w.library, loreWidth: w.lore, widthUnit: w.unit, widthsLinked: w.linked });
		this.persistSoon();
		if (notify) this.touch("nav");
	}

	/** A divider was dragged or keyed: the new width, in pixels, of the left panel on the side shown, or of the context panel. */
	setPanelWidthPx(panel: "left" | "lore", px: number, win = windowWidth()): void {
		const w = this.panelWidths();
		const key: Panel = panel === "lore" ? "lore" : this.nav.face === "storytelling" ? "story" : "library";
		const value = fromPx(clampPx(key, w.linked, px), w.unit, win);
		this.storeWidths(w.linked ? { ...w, story: value, library: value, lore: value } : { ...w, [key]: value }, false); // the shell redraws the panels itself while dragging
	}

	/** A figure typed in settings, in the current unit. Refused, with the range, when outside the limits; nothing is stored then. */
	commitTypedWidth(panel: Panel | "shared", value: number, win = windowWidth()): { ok: true } | { ok: false; range: Range } {
		const w = this.panelWidths();
		const key: Panel = panel === "shared" ? "story" : panel;
		const range = rangeIn(key, w.linked, w.unit, win);
		if (!Number.isFinite(value) || value < range.min || value > range.max) return { ok: false, range };
		const v = w.unit === "px" ? Math.round(value) : Math.round(value * 10) / 10;
		this.storeWidths(w.linked ? { ...w, story: v, library: v, lore: v } : { ...w, [key]: v });
		return { ok: true };
	}

	/** The same-width switch. Turning it on gives all three the width of the left panel on the side shown. */
	setWidthsLinked(on: boolean): void {
		const w = this.panelWidths();
		if (w.linked === on) return;
		if (!on) return this.storeWidths({ ...w, linked: false });
		const px = clampPx("story", true, toPx(this.nav.face === "storytelling" ? w.story : w.library, w.unit, windowWidth()));
		const v = fromPx(px, w.unit, windowWidth());
		this.storeWidths({ ...w, linked: true, story: v, library: v, lore: v });
	}

	/** The unit switch: each stored figure is converted at the current window width, so nothing moves. */
	setWidthUnit(unit: WidthUnit): void {
		const w = this.panelWidths();
		if (w.unit !== unit) this.storeWidths(convertUnit(w, unit, windowWidth()));
	}

	private elisionCache: { source: readonly string[]; words: ReadonlySet<string> } = { source: [], words: new Set() };
	private namesCache: { wordList: readonly string[]; optOuts: readonly string[]; version: number; index: NameIndex } | null = null;
	/** Bumped whenever the Codex or the project changes, so the names are collected again. */
	private namesVersion = 0;
	/** Names already offered "stop correcting this?" in this session: once is enough. */
	private offeredOptOut = new Set<string>();

	/** The names the autocorrect knows (Codex titles and aliases, and the project's word list), rebuilt only when they change. */
	private nameIndex(): NameIndex {
		const running = this.running;
		const values = running?.settings.values;
		if (!running || !values) return EMPTY_NAMES;
		const c = this.namesCache;
		if (c && c.wordList === values.typingWordList && c.optOuts === values.typingNameOptOuts && c.version === this.namesVersion) return c.index;
		const index = buildNameIndex(collectNameSources(running.opened.project, values.typingWordList), values.typingNameOptOuts);
		this.namesCache = { wordList: values.typingWordList, optOuts: values.typingNameOptOuts, version: this.namesVersion, index };
		return index;
	}

	/**
	 * What the typing aids in a chapter, a Codex note, a plot note, the synopsis or the series description read at every
	 * keystroke: the switches and lists of the open project (docs/typing-aids.md §8; decision 53 put the fields on the same
	 * options as the chapters). The rename, settings and search boxes take none of it (decision 47).
	 */
	typingOptions(): TypingEditorOptions {
		const values = this.running?.settings.values;
		if (!values) return { smartPunctuation: false, elisions: new Set(), nameAutocorrect: false, names: EMPTY_NAMES, shortcodes: false, shortcodeList: {}, shortcodeNames: false };
		if (this.elisionCache.source !== values.typingElisions) this.elisionCache = { source: values.typingElisions, words: new Set(values.typingElisions.map((w) => w.toLowerCase())) };
		return {
			smartPunctuation: values.typingSmartPunctuation,
			elisions: this.elisionCache.words,
			nameAutocorrect: values.typingNameAutocorrect,
			names: this.nameIndex(),
			shortcodes: values.typingShortcodes,
			shortcodeList: values.typingShortcodeList,
			shortcodeNames: values.typingShortcodeNames,
			onLowercaseCorrectionUndone: (name) => this.offerToStopCorrecting(name),
		};
	}

	/** The author undid a lower-case correction: offer, quietly and once, to stop correcting that name. */
	private offerToStopCorrecting(name: string): void {
		const running = this.running;
		if (!running || running.readOnlyReason || this.offeredOptOut.has(name.toLowerCase())) return;
		this.offeredOptOut.add(name.toLowerCase());
		this.notices.notify({
			text: `Stop correcting “${name}” when it is typed in lower case?`,
			key: `opt-out-${name}`,
			actions: [
				{
					label: "Stop correcting",
					onClick: () => void this.guard(async () => {
						const current = running.settings.values.typingNameOptOuts;
						const next = withEntry(current, name, (s) => s.toLowerCase());
						this.reportReplaced(await setSetting(running.opened.project, running.settings, "typingNameOptOuts", next), next);
						this.touch("settings");
					}, "save the setting"),
				},
			],
		});
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

	/** The stats panel steps to the next count. Navigation state: this computer only, never `project.md`. */
	setStatsCount(count: StatsCount): void {
		this.nav.statsCount = count;
		this.persistSoon();
	}

	/** Where you were is saved a moment after it changes, on this computer only. */
	persistSoon(): void {
		clearTimeout(this.persistTimer);
		this.persistTimer = setTimeout(() => void this.persistNow(), 400);
	}

	async persistNow(): Promise<void> {
		clearTimeout(this.persistTimer);
		if (!this.running) return;
		const { book, chapter, collapsedCodex, storyWidth, libraryWidth, loreWidth, widthUnit, widthsLinked, loreHidden, cardTiers, statsCount } = this.nav;
		try {
			await this.controller.saveMachineState({ selectedNovel: book, selectedObject: chapter, collapsedCodexFolderIds: [...collapsedCodex], leftWidth: storyWidth, libraryWidth, loreWidth, widthUnit, widthsLinked, ...(loreHidden ? { loreHidden } : {}), ...(Object.keys(cardTiers).length ? { cardTiers } : {}), ...(statsCount !== "day" ? { statsCount } : {}) });
		} catch {
			/* where you were is a convenience: never worth a notice */
		}
	}

	/** Says so, quietly, when a setting the author just changed replaced a different value written elsewhere (decision 96). */
	reportReplaced(replaced: SettingReplaced | null, now: unknown): void {
		if (!replaced) return;
		const name = settingName(replaced.key);
		this.notices.notify({ text: `Changed “${name}” to ${settingValue(now)}. It had been changed to ${settingValue(replaced.replaced)} elsewhere; that change is replaced.`, key: `setting-replaced-${replaced.key}`, ms: 6000 });
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
		const outcome = await this.guard(() => this.controller.openDialog(kind, create), kind === "create" ? "create the project" : "open the project");
		// A standalone novel says so through the same setting the settings view changes (decision 81): no core change.
		const running = this.running;
		if (outcome && kind === "create" && create?.standalone && running && !running.readOnlyReason) {
			await this.guard(async () => {
				await setSetting(running.opened.project, running.settings, "storyKind", "standalone");
				this.touch("settings", "nav");
			}, "record that this is one novel");
		}
		return outcome;
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
