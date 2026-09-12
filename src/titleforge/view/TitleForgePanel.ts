import { Notice, setIcon, setTooltip } from "obsidian";
import {
	ICON_ARROW_INSERT,
	ICON_BOOK_DUOTONE,
	ICON_COMPUTER,
	ICON_DICE,
	ICON_INFO_CIRCLE,
	ICON_PACKS,
	ICON_SERIES,
	ICON_STAR_FILL,
	ICON_STAR_OUTLINE,
} from "../../icons.js";
import { generateOne, generateSeries } from "../engine/generate.js";
import { toEntry } from "../engine/history.js";
import type { GeneratorSpec, GenreOption, HistoryEntry, LabelledOption } from "../engine/types.js";
import type { TitleForgeScope, TitleForgeTab } from "../settings.js";
import type { TitleForgeController } from "../TitleForgeController.js";
import { TitleShapeInfoModal } from "./TitleShapeInfoModal.js";

/** One kept entry as shown on the "kept titles" tab — a HistoryEntry plus which tradition it came
 * from, since kept titles are pooled across every generator rather than scoped to one. */
interface KeptEntry {
	generatorId: string;
	generatorName: string;
	entry: HistoryEntry;
}

/** TitleForgeModal always resolves `scope` before constructing this (defaulting to "all" itself),
 * so it's required here even though TitleForgeOpenOptions (settings.ts) — the params callers of
 * `TitleForgeController.openModal()` actually supply — leaves it optional. */
interface TitleForgePanelOptions {
	scope: TitleForgeScope;
	onUse?: (title: string) => void;
}

const QUANTITY_OPTIONS = [3, 5, 10, 15, 25] as const;

/** Not a real generator id — the Genre picker's own "Any" choice, and (see
 * `defaultGeneratorIdFor`) automatically selected whenever a tab with more than one tradition of
 * its own is shown; a tab with exactly one tradition (currently just "series") pins straight to
 * that tradition instead, since there's nothing to be "Any" among. Generating in this mode picks a
 * fresh random tradition from the current tab for each of `quantity`'s results (never persisted as
 * a HistoryEntry's own generatorId — toEntry always records the real spec that actually produced
 * each title). */
const ANY_TRADITION_ID = "any";

// Section names are deliberately lowercase throughout — matches the rest of the modal's
// understated chrome rather than reading as a shouted header. Shown as visible text in the
// section-switcher menu (renderSectionPicker) and doubling as its items' aria-label; "kept titles"
// is reached via its own star toggle (renderBottomBar) rather than this menu — see SECTION_ORDER.
const TAB_LABELS: Record<TitleForgeTab, string> = {
	series: "series",
	webFiction: "webnovels",
	novels: "novels",
	kept: "kept titles",
};

/** Each section's own icon, in the switcher menu (renderSectionPicker) — reuses storyForge's own
 * Series/Novel pane icons (StoryForgeView.ts's SF_LAYOUT_TAB_ICONS: ICON_SERIES,
 * ICON_BOOK_DUOTONE) so the two readings of "Series"/"Novel" match, and ICON_COMPUTER (a
 * screen-and-stand glyph, not a book) for "webnovels" — these are serialised, web-native titles.
 * `kept`'s entry is unused by that menu (see SECTION_ORDER) but kept here so this stays a total
 * map over TitleForgeTab; ICON_STAR_FILL/ICON_STAR_OUTLINE are used directly for its own toggle. */
const TAB_ICONS: Record<TitleForgeTab, string> = {
	series: ICON_SERIES,
	webFiction: ICON_COMPUTER,
	novels: ICON_BOOK_DUOTONE,
	kept: ICON_STAR_FILL,
};

/** Fixed reading order for the section-switcher menu, regardless of scope — "kept titles" isn't
 * offered here at all (see renderBottomBar's star toggle instead). `renderSectionPicker` filters
 * this down to whichever of the three a given scope actually reaches (SCOPE_TABS). */
const SECTION_ORDER: TitleForgeTab[] = ["series", "novels", "webFiction"];

/**
 * Which generators live under each generator tab (i.e. every tab but "kept titles" — that one
 * pools kept entries across a scope's own tabs rather than picking a tradition; see KeptEntry).
 * "series" runs `title-composer` in series mode with its shape family forced to "series" — the
 * corpus-grounded umbrella shape set (series corpus v1.0.0); see `handleGenerate`. "novels" pairs
 * `title-composer` (the Anglophone general-purpose bench) with `non-western-literary` (the
 * comparative world-literary one); everything serialised/episodic goes under "web fiction & light
 * novels".
 */
const TAB_TRADITIONS: Record<TitleForgeTab, string[]> = {
	series: ["title-composer"],
	webFiction: [
		"western-serial",
		"japanese-ln",
		"korean-web",
		"chinese-web",
		"vietnamese-web",
		"indonesian-web",
		"thai-web",
	],
	novels: ["title-composer", "non-western-literary"],
	kept: [],
};

/**
 * Tabs whose "Genre"/"Sub genre" pickers are built straight from their own generators' genre
 * trees (renderControls, mergedGenreOptions) rather than a Genre-as-tradition + Sub-genre-as-
 * hierarchical-genre-list pair — no tradition is itself a genre (the "Title composer"/"World
 * literary shapes" complaint this replaced), whether a tab has one tradition ("series") or several
 * ("novels"). "web fiction & light novels" is deliberately not here: each of its seven traditions
 * is a genuinely distinct regional/language market — "webnovel", "Japanese light novel", and so on
 * really do read as the top-level choice there — so it keeps the older pair.
 */
const MERGED_GENRE_TABS: TitleForgeTab[] = ["series", "novels"];

/** Encodes a (generator id, genre id) pair as one composite option id for the merged "Genre"
 * picker (mergedGenreOptions), since two traditions in the same tab could in principle declare the
 * same genre id. Decoded by `decodeGenrePick`. */
function encodeGenrePick(generatorId: string, genreId: string): string {
	return `${generatorId}::${genreId}`;
}

/** Reverses `encodeGenrePick`. Returns undefined for any value that isn't one of our own encoded
 * ids (defensive only — every option `renderSelect` is given here comes from `encodeGenrePick`
 * itself, so this should never actually happen). */
function decodeGenrePick(value: string): { generatorId: string; genreId: string } | undefined {
	const i = value.indexOf("::");
	if (i === -1) return undefined;
	return { generatorId: value.slice(0, i), genreId: value.slice(i + 2) };
}

/**
 * Which tabs are reachable for each scope (see TitleForgeScope in settings.ts). "all" is every
 * tab, unchanged from before scopes existed. "series"/"novels" are the two fixed, narrower views
 * used when titleForge is opened from a specific naming context — a Series' or a Novel's dice
 * icon — restricted to the tabs/traditions relevant to that context; "kept titles" stays reachable
 * in both, but pools only from the generators reachable in that same scope (see
 * `scopedGeneratorIds`). "webFiction" is reachable from both "series" and "novels" — a series can
 * just as well be a run of web-fiction/light-novel volumes as a run of standalone novels.
 */
const SCOPE_TABS: Record<TitleForgeScope, TitleForgeTab[]> = {
	all: ["series", "webFiction", "novels", "kept"],
	series: ["series", "webFiction", "kept"],
	novels: ["novels", "webFiction", "kept"],
};

/**
 * The titleForge workbench itself: pick a genre and sub genre, generate titles or whole series,
 * see why a shape reads the way it does, and review every title kept across every tradition.
 *
 * The only host is TitleForgeModal — titleForge has no main-area workspace view (see
 * TitleForgeController's class doc for why) — but this still operates on any given container
 * element rather than reaching into the Modal directly, so the modal shell stays a thin wrapper:
 * it owns the container's lifecycle (empty it, remove it, whatever) and just calls
 * load()/render() into it.
 *
 * `opts.scope` (see SCOPE_TABS) fixes which sections are reachable and which traditions the "kept
 * titles" toggle pools from for this open; `opts.onUse`, when supplied, is what puts a "use this
 * title" arrow on every row — see `renderTitleRow`.
 *
 * Renders no header/blurb of its own (the modal has neither), groups the traditions into
 * "sections" (see TAB_TRADITIONS — the type/field names still say "tab" throughout, a holdover
 * from when these were literal tab-bar icons), and is only ever in series mode for the "series"
 * section itself (title-composer, shape family forced to "series") — "novels" and "webnovels"
 * never are; there's no way to opt a section into series mode any more, only to switch to the
 * series section outright. It always generates with `generateSeries`' own default strategy/volume
 * count, with no picker anywhere to change either. "kept titles" isn't a generator section at all
 * — see renderKeptTab. Generating writes straight into the history list — there's no separate
 * "just generated" preview; every row, old or new, carries the same info/short-list/use-this-title
 * actions (renderTitleRow).
 *
 * There is no separate "Tradition" picker. On "series" and "novels" (MERGED_GENRE_TABS), no
 * tradition is itself a genre: every tradition reachable from the section contributes its own
 * top-level genres (fantasy, science fiction, ...) straight into the "Genre" picker
 * (`mergedGenreOptions`), "any" first and always what's automatically selected — never a
 * remembered last pick — and picking one also picks its tradition (`this.generatorId`) behind the
 * scenes; whichever genre's own children it has (epic fantasy, heroic fantasy, ... under fantasy)
 * become the "Sub genre" picker below it (`subGenreOptions`), hidden entirely when it has none.
 * "webnovels" is the one section that still pairs a Tradition-as-"Genre" picker
 * (`traditionOptions`) with a flat, indentation-hierarchy "Sub genre" list
 * (`hierarchicalGenreOptions`) — each of its seven traditions is a genuinely distinct
 * regional/language market, not itself a genre's sibling. In "any" mode (either kind of section)
 * there's no single spec to source sub genre/family/platform from (so those pickers are hidden),
 * history pools across the whole section instead of one generator's file, and Generate draws a
 * fresh random tradition per result.
 *
 * There is no visible tab bar any more. Which section is active is switched from the
 * section-switcher menu (`renderSectionPicker`, `SECTION_ORDER`) opened by clicking the leading
 * icon on the Genre picker; "kept titles" is reached by its own star toggle beneath the generated
 * list instead (`renderBottomBar`), flipping back to whichever section was active before it.
 */
export class TitleForgePanel {
	private generatorId: string;
	private genre: string;
	private family: string;
	private platform: string;
	private quantity: number;
	/** Null until the user picks a section from the switcher menu (renderSectionPicker) — every
	 * fresh open starts here, deliberately not resuming whatever section was active last time (see
	 * `renderSectionPlaceholder`'s doc comment for why). */
	private activeTab: TitleForgeTab | null = null;
	/** Whether the section-switcher menu (renderSectionPicker) is currently open. */
	private showSectionPicker = false;
	/** Which section was active right before switching to "kept titles" (renderBottomBar's star
	 * toggle) — where the toggle switches back to. Null until the first switch into kept titles. */
	private preKeptTab: TitleForgeTab | null = null;

	private history: HistoryEntry[] = [];
	private keptEntries: KeptEntry[] = [];

	constructor(
		private container: HTMLElement,
		private controller: TitleForgeController,
		private opts: TitleForgePanelOptions,
	) {
		const s = controller.settings;
		this.genre = s.lastGenre;
		this.family = s.lastFamily;
		this.platform = s.lastPlatform;
		this.quantity = s.lastQuantity;
		// "any" is always what's automatically selected within a section (or, on a section with
		// exactly one tradition, that tradition itself — see defaultGeneratorIdFor); there's nothing
		// to remember here across opens, so unlike genre/family/platform this never reads a
		// persisted "last tradition". `activeTab` itself starts null regardless of
		// `lastTabByScope` — see that field's own doc comment.
		this.generatorId = ANY_TRADITION_ID;
	}

	/** Loads history for the starting tab (or, on the "kept titles" tab, this scope's kept
	 * entries) and renders — the host (TitleForgeModal.onOpen) calls this once. `activeTab` is
	 * always null at this point (a fresh open), so there's nothing to load yet — `render()` shows
	 * the section placeholder instead. */
	async load(): Promise<void> {
		if (this.activeTab === null) {
			this.render();
			return;
		}
		await this.loadHistoryForCurrentGenerator();
		if (this.activeTab === "kept") await this.loadKeptEntries();
		this.render();
	}

	/** Redraw against the controller's current generators — called when the user-additions file is
	 * re-scanned (see `TitleForgeController.onGeneratorsReloaded`). The panel reads generators off
	 * the controller by reference, so a plain re-render picks up the new words. */
	refresh(): void {
		this.render();
	}

	private currentSpec(): GeneratorSpec | undefined {
		return this.controller.getGeneratorById(this.generatorId);
	}

	/** `this.activeTab`, asserted non-null — for the handful of methods only ever reachable once a
	 * section is actually active (everything `renderControls` calls or draws from, and
	 * `handleGenerate`, all unreachable while the section placeholder is showing). `render()`'s own
	 * early return for `activeTab === null` is the one place that's genuinely null. */
	private section(): TitleForgeTab {
		if (this.activeTab === null) throw new Error("titleForge: no section active yet");
		return this.activeTab;
	}

	private tabOrder(): TitleForgeTab[] {
		return SCOPE_TABS[this.opts.scope];
	}

	/** "novels" is the most useful default landing tab when it's reachable — falls back to the
	 * scope's own first tab when it isn't (the "series" scope, which never reaches "novels", lands
	 * on its own "series" tab). */
	private defaultTab(): TitleForgeTab {
		const order = this.tabOrder();
		return order.includes("novels") ? "novels" : order[0];
	}

	/** Which generator id a tab should default (and, for a one-tradition tab, always stay) pinned
	 * to. A tab with exactly one tradition — currently just "series" (title-composer alone) — pins
	 * to that tradition itself rather than "Any": offering an Any-vs-one-real-choice picker among a
	 * pool of one is nothing but the old Tradition-as-genre picker in disguise, and a tab's genre
	 * model only splits into its own Genre/Sub genre pair (renderControls) against a known, fixed
	 * spec. Every other tab keeps defaulting to "Any", unchanged. */
	private defaultGeneratorIdFor(tab: TitleForgeTab): string {
		const ids = TAB_TRADITIONS[tab];
		return ids.length === 1 ? ids[0] : ANY_TRADITION_ID;
	}

	/** The effective series-mode for generation/display: on for the "series" section only — the
	 * dedicated place for series generation now that its own section exists; "novels" no longer
	 * has a checkbox to opt into it, and "web fiction & light novels"/"kept titles" never did. */
	private effectiveSeriesMode(): boolean {
		return this.activeTab === "series";
	}

	/** In "Any" mode there's no single generator's file to read — pool every tradition reachable
	 * from the current tab instead, oldest first (same order loadHistory's own file already comes
	 * in), so renderHistory's `.reverse()` still shows newest first regardless of which mode. */
	private async loadHistoryForCurrentGenerator(): Promise<void> {
		if (this.generatorId !== ANY_TRADITION_ID) {
			this.history = await this.controller.storage.loadHistory(this.generatorId);
			return;
		}
		// Only ever called once a section is active (load()/switchToSection() both guard this),
		// but defensively: nothing to pool from the section placeholder itself.
		if (this.activeTab === null) {
			this.history = [];
			return;
		}
		const ids = TAB_TRADITIONS[this.activeTab];
		if (ids.length === 0) {
			this.history = [];
			return;
		}
		const lists = await Promise.all(ids.map((id) => this.controller.storage.loadHistory(id)));
		this.history = lists.flat().sort((a, b) => a.at.localeCompare(b.at));
	}

	/** Every generator id reachable under the current scope's own tabs (excluding "kept" itself,
	 * which doesn't own any traditions of its own). */
	private scopedGeneratorIds(): Set<string> {
		const ids = new Set<string>();
		for (const tab of this.tabOrder()) {
			if (tab === "kept") continue;
			for (const id of TAB_TRADITIONS[tab]) ids.add(id);
		}
		return ids;
	}

	/** Every kept entry across this scope's own generators, newest first — reuses the in-memory
	 * history for whichever generator is currently active rather than re-reading its file. */
	private async loadKeptEntries(): Promise<void> {
		const scoped = this.scopedGeneratorIds();
		const pooled: KeptEntry[] = [];
		for (const spec of this.controller.generators) {
			if (!scoped.has(spec.id)) continue;
			const history =
				spec.id === this.generatorId
					? this.history
					: await this.controller.storage.loadHistory(spec.id);
			for (const entry of history) {
				if (entry.kept) pooled.push({ generatorId: spec.id, generatorName: spec.name, entry });
			}
		}
		pooled.sort((a, b) => b.entry.at.localeCompare(a.entry.at));
		this.keptEntries = pooled;
	}

	private async persistUiState(): Promise<void> {
		Object.assign(this.controller.settings, {
			lastGenre: this.genre,
			lastFamily: this.family,
			lastPlatform: this.platform,
			lastQuantity: this.quantity,
			// Only once a section is actually active — `activeTab` is null before that (the section
			// placeholder), and every fresh open starts there regardless of what's stored here now,
			// so there's nothing meaningful to persist yet.
			...(this.activeTab
				? { lastTabByScope: { ...this.controller.settings.lastTabByScope, [this.opts.scope]: this.activeTab } }
				: {}),
		});
		await this.controller.saveSettings();
	}

	private render(): void {
		const container = this.container;
		container.empty();
		container.addClass("titleforge-view");

		if (this.activeTab === null) {
			this.renderSectionPlaceholder(container);
			this.renderBottomBar(container);
			return;
		}

		if (this.activeTab === "kept") {
			this.renderKeptTab(container);
			this.renderBottomBar(container);
			return;
		}

		const traditionIds = TAB_TRADITIONS[this.activeTab];
		if (!this.controller.generators.some((g) => traditionIds.includes(g.id))) {
			container.createDiv({
				cls: "titleforge-empty",
				text: "No title generators are loaded.",
			});
			this.renderBottomBar(container);
			return;
		}
		// A specific tradition can go stale (a hand-edited lexicon dropped it) — fall back to this
		// section's default rather than an error, same spirit as renderSelect's own stale-value
		// handling.
		if (this.generatorId !== ANY_TRADITION_ID && !this.currentSpec()) {
			this.generatorId = this.defaultGeneratorIdFor(this.activeTab);
		}
		const spec = this.generatorId === ANY_TRADITION_ID ? undefined : this.currentSpec();

		this.renderControls(container, spec);
		this.renderHistory(container);
		this.renderBottomBar(container);
	}

	/** Switches to `tab`, resetting genre/family/platform and reloading its history — the section
	 * change every entry point (the section-switcher menu; a stale-tradition fallback elsewhere)
	 * needs, factored out so there's exactly one place that does it. */
	private switchToSection(tab: TitleForgeTab): void {
		this.activeTab = tab;
		void this.persistUiState();
		if (TAB_TRADITIONS[tab].length > 0) this.generatorId = this.defaultGeneratorIdFor(tab);
		this.genre = "all";
		this.family = "all";
		this.platform = "all";
		void this.loadHistoryForCurrentGenerator().then(() => this.render());
	}

	/** What renders instead of the real Genre picker while `activeTab` is still null — a fresh
	 * open, every time, deliberately never resuming a remembered section (see `activeTab`'s own
	 * doc comment). A disabled, single-option select carrying only the prompt itself, built from
	 * the same `renderSelect` the real Genre picker uses so it's the exact same size/position —
	 * the binder icon beside it is the only interactive part, opening the same section-switcher
	 * menu (`renderSectionPicker`) that a real Genre picker's icon does. */
	private renderSectionPlaceholder(container: HTMLElement): void {
		const row = container.createDiv({ cls: "titleforge-row" });
		const select = this.renderSelect(
			row,
			"Genre",
			[{ id: "placeholder", label: "← pick type of titles to generate" }],
			"placeholder",
			() => {},
			true,
			ICON_PACKS,
			() => {
				this.showSectionPicker = !this.showSectionPicker;
				this.render();
			},
		);
		select.disabled = true;
		if (this.showSectionPicker) this.renderSectionPicker(container);
	}

	/** The series/novels/webnovels switcher, opened by clicking the leading icon on the Genre
	 * picker (renderSelect's `onIconClick`) — this is the only way to change section now that
	 * there's no visible tab bar. Offers `SECTION_ORDER` filtered to whatever this scope actually
	 * reaches (SCOPE_TABS); "kept titles" is deliberately not offered here, see renderBottomBar. */
	private renderSectionPicker(container: HTMLElement): void {
		const menu = container.createDiv({ cls: "titleforge-section-menu" });
		for (const tab of SECTION_ORDER) {
			if (!this.tabOrder().includes(tab)) continue;
			const item = menu.createDiv({
				cls: "titleforge-section-menu-item" + (tab === this.activeTab ? " is-active" : ""),
				attr: { role: "button", tabindex: "0", "aria-label": TAB_LABELS[tab] },
			});
			setIcon(item.createSpan({ cls: "titleforge-section-menu-icon" }), TAB_ICONS[tab]);
			item.createSpan({ text: TAB_LABELS[tab] });
			const choose = () => {
				this.showSectionPicker = false;
				if (tab === this.activeTab) {
					this.render();
					return;
				}
				this.switchToSection(tab);
			};
			item.addEventListener("click", choose);
			item.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" || evt.key === " ") {
					evt.preventDefault();
					choose();
				}
			});
		}
	}

	/** The short-list toggle beneath the generated pane, replacing the old "kept titles" tab icon:
	 * a single star (renderTitleRow's own hover-icon treatment) that switches into "kept titles"
	 * and — filled, once there — switches back to whichever section was active before. Shown in
	 * both the normal and kept-titles views, always at the bottom. */
	private renderBottomBar(container: HTMLElement): void {
		const bar = container.createDiv({ cls: "titleforge-bottom-bar" });
		const isKept = this.activeTab === "kept";
		this.addRowIcon(
			bar,
			isKept ? ICON_STAR_FILL : ICON_STAR_OUTLINE,
			isKept ? "back to generator" : "kept titles",
			() => {
				if (isKept) {
					// A plain return to wherever we came from, not a fresh section switch — leaves
					// genre/family/platform exactly as the user had them, unlike switchToSection.
					this.activeTab = this.preKeptTab ?? this.defaultTab();
					void this.persistUiState();
					void this.loadHistoryForCurrentGenerator().then(() => this.render());
					return;
				}
				this.preKeptTab = this.activeTab;
				this.activeTab = "kept";
				void this.persistUiState();
				void this.loadKeptEntries().then(() => this.render());
			},
			isKept ? "is-kept" : undefined,
		);
	}

	private renderKeptTab(container: HTMLElement): void {
		const section = container.createDiv({ cls: "titleforge-kept" });
		if (this.keptEntries.length === 0) {
			section.createDiv({
				cls: "titleforge-empty",
				text: "nothing kept yet; tap the star on any title to short-list it",
			});
			return;
		}
		const list = section.createEl("ul", { cls: "titleforge-kept-list" });
		for (const kept of this.keptEntries) {
			const spec = this.controller.getGeneratorById(kept.generatorId);
			if (!spec) continue; // a hand-edited/removed lexicon — nothing sensible to show
			this.renderTitleRow(list, spec, kept.entry, { showTradition: kept.generatorName });
		}
	}

	/** The traditions the "Genre" picker should offer on a `!MERGED_GENRE_TABS` tab (currently just
	 * "web fiction & light novels"): "Any" first, then the current tab's own — each shown under its
	 * own name (e.g. "webnovel"), since a tradition (generator) is presented as a top-level genre
	 * rather than through a separate picker of its own. */
	private traditionOptions(): LabelledOption[] {
		const ids = TAB_TRADITIONS[this.section()];
		const specific = this.controller.generators
			.filter((g) => ids.includes(g.id))
			.map((g) => ({ id: g.id, label: g.name }));
		return [{ id: ANY_TRADITION_ID, label: "any" }, ...specific];
	}

	/** Options for the "Sub genre" picker on a `!MERGED_GENRE_TABS` tab (currently just "web
	 * fiction & light novels" — see renderControls): top-level genres in declaration order, each
	 * immediately followed by its own subgenres (also in declaration order), visually indented — a
	 * single flat, hierarchy-aware `<select>` rather than a dependent parent->child pair of pickers,
	 * per the two-level genre model (`GenreOption.parent`, `engine/generate.ts`'s `genreScope`).
	 * "Any genre" (`all`) has no parent and no children, so it is unaffected and stays first.
	 * `this.genre` itself is always just a plain subgenre/genre id — indentation is presentation
	 * only. */
	private hierarchicalGenreOptions(spec: GeneratorSpec): LabelledOption[] {
		const byParent = new Map<string, GenreOption[]>();
		for (const genre of spec.genres) {
			if (!genre.parent) continue;
			const siblings = byParent.get(genre.parent) ?? [];
			siblings.push(genre);
			byParent.set(genre.parent, siblings);
		}
		const out: LabelledOption[] = [];
		for (const genre of spec.genres) {
			if (genre.parent) continue; // emitted under its own parent below
			out.push(genre);
			for (const child of byParent.get(genre.id) ?? []) {
				out.push({ id: child.id, label: ` ${child.label}` });
			}
		}
		return out;
	}

	/** The top-level ancestor of genre `id` within `spec` — `id` itself when it has no parent, or
	 * when `id` isn't one of `spec`'s own genres at all (a stale cross-tradition value; renderSelect
	 * downstream self-heals that the same way it already does any other stale picker value). Used
	 * by the `MERGED_GENRE_TABS` pickers (renderControls) to figure out which top genre a possibly-
	 * already-leaf `this.genre` (e.g. read back from settings) actually belongs to. */
	private topGenreId(spec: GeneratorSpec, id: string): string {
		return spec.genres.find((g) => g.id === id)?.parent ?? id;
	}

	/** `spec`'s own top-level genres only (no `parent`) — e.g. Fantasy, Science fiction, Historical
	 * — never the leaf/subgenres themselves. Every `MERGED_GENRE_TABS` tradition's own top-level
	 * genres, gathered this way, are what feeds the shared "Genre" picker (`mergedGenreOptions`). */
	private topGenreOptions(spec: GeneratorSpec): LabelledOption[] {
		return spec.genres.filter((g) => !g.parent);
	}

	/** A `MERGED_GENRE_TABS` tab's own "Sub genre" picker, dependent on whichever top genre `topId`
	 * is currently selected within `spec`: an "Any" entry standing for `topId` itself (no narrower
	 * pick) followed by its children (e.g. under Fantasy: Epic fantasy, Heroic fantasy, Sword &
	 * Sorcery, Urban fantasy). Empty when `topId` has no children at all — the caller skips the
	 * picker entirely rather than show a pointless single "Any" choice. */
	private subGenreOptions(spec: GeneratorSpec, topId: string): LabelledOption[] {
		const children = spec.genres.filter((g) => g.parent === topId);
		if (children.length === 0) return [];
		return [{ id: topId, label: "any" }, ...children];
	}

	/** The merged "Genre" picker for a `MERGED_GENRE_TABS` tab: "Any" (`ANY_TRADITION_ID`) first,
	 * then every tradition reachable from the current tab contributes its own top-level genres in
	 * turn (`topGenreOptions`), each encoded as `(generator id, genre id)` via `encodeGenrePick` so
	 * two traditions sharing a genre id can't collide — decoded back in the picker's own `onChange`
	 * (renderControls). Each spec's own "Any ..." entry (`all`) is skipped since the one shared
	 * "Any" above already covers it. On "series" (one tradition) this is just a merge of one. */
	private mergedGenreOptions(): LabelledOption[] {
		const ids = TAB_TRADITIONS[this.section()];
		const out: LabelledOption[] = [{ id: ANY_TRADITION_ID, label: "any" }];
		for (const gen of this.controller.generators) {
			if (!ids.includes(gen.id)) continue;
			for (const genre of this.topGenreOptions(gen)) {
				if (genre.id === "all") continue;
				out.push({ id: encodeGenrePick(gen.id, genre.id), label: genre.label });
			}
		}
		return out;
	}

	/** `spec` is undefined in "Any" mode — sub genre/shape-family/platform are one tradition's own
	 * vocabulary, so there's nothing meaningful to offer until a specific one is picked. */
	private renderControls(container: HTMLElement, spec: GeneratorSpec | undefined): void {
		const row = container.createDiv({ cls: "titleforge-row" });
		// The Genre picker's leading icon doubles as an obvious "you're here" indicator once a
		// section is chosen — the same glyph the section-switcher menu shows beside that section's
		// name (TAB_ICONS) — rather than staying the neutral binder glyph forever.
		const sectionIcon = TAB_ICONS[this.section()];

		if (MERGED_GENRE_TABS.includes(this.section())) {
			// No separate tradition step — no tradition is itself a genre (the "Title
			// composer"/"World literary shapes" complaint this replaced). Every tradition reachable
			// from this tab contributes its own top-level genres straight into "Genre"
			// (mergedGenreOptions); picking one also picks its tradition (this.generatorId) behind
			// the scenes, and its own children, if it has any, become "Sub genre" below it.
			const selected = spec ? encodeGenrePick(spec.id, this.topGenreId(spec, this.genre)) : ANY_TRADITION_ID;
			this.renderSelect(row, "Genre", this.mergedGenreOptions(), selected, (value) => {
				if (value === ANY_TRADITION_ID) {
					this.generatorId = ANY_TRADITION_ID;
					this.genre = "all";
				} else {
					const pick = decodeGenrePick(value);
					if (!pick) return; // defensive only — see decodeGenrePick
					this.generatorId = pick.generatorId;
					this.genre = pick.genreId;
				}
				this.family = "all";
				this.platform = "all";
				void this.persistUiState();
				void this.loadHistoryForCurrentGenerator().then(() => this.render());
			}, true, sectionIcon, () => {
				this.showSectionPicker = !this.showSectionPicker;
				this.render();
			});

			if (spec) {
				const subOptions = this.subGenreOptions(spec, this.topGenreId(spec, this.genre));
				if (subOptions.length > 0) {
					this.renderSelect(row, "Sub genre", subOptions, this.genre, (value) => {
						this.genre = value;
						void this.persistUiState();
					}, true);
				}
			}
		} else {
			// A tradition is a top-level "Genre" choice rather than a separate "Tradition" picker —
			// always has "Any" plus at least one real tradition by the time renderControls is
			// reached (render() already bailed out above if this tab has none loaded at all).
			this.renderSelect(row, "Genre", this.traditionOptions(), this.generatorId, (value) => {
				this.generatorId = value;
				this.genre = "all";
				this.family = "all";
				this.platform = "all";
				void this.persistUiState();
				void this.loadHistoryForCurrentGenerator().then(() => this.render());
			}, true, sectionIcon, () => {
				this.showSectionPicker = !this.showSectionPicker;
				this.render();
			});

			if (spec) {
				// A generator's own genres (with their two-level parent/subgenre structure) are
				// what "Sub genre" now offers — the old flat "Genre" picker, one level down.
				this.renderSelect(row, "Sub genre", this.hierarchicalGenreOptions(spec), this.genre, (value) => {
					this.genre = value;
					void this.persistUiState();
				}, true);
			}
		}

		if (spec) {
			// In series mode the shape family is forced to "series" (the corpus-grounded umbrella
			// set — see handleGenerate), so the picker would only mislead.
			if (spec.families && spec.families.length > 0 && !this.effectiveSeriesMode()) {
				this.renderSelect(row, "Shape family", spec.families, this.family, (value) => {
					this.family = value;
					void this.persistUiState();
				});
			}

			if (spec.platforms && spec.platforms.length > 0) {
				this.renderSelect(row, "Platform", spec.platforms, this.platform, (value) => {
					this.platform = value;
					void this.persistUiState();
				});
			}
		}

		if (this.showSectionPicker) this.renderSectionPicker(container);

		this.renderQuantity(container);

		const actions = container.createDiv({ cls: "titleforge-actions" });
		const generateButton = actions.createEl("button", {
			cls: "titleforge-generate-button",
			attr: { title: this.effectiveSeriesMode() ? "Generate series" : "Generate title" },
		});
		setIcon(generateButton, ICON_DICE);
		generateButton.addEventListener("click", () => void this.handleGenerate());
	}

	/** How many titles (or, in series mode, how many whole series) one click of Generate produces
	 * — a pill toggle modelled on nameForge's own quantity selector, re-deriving every button's
	 * active state from `this.quantity` on each render rather than tracking it per-button. */
	private renderQuantity(container: HTMLElement): void {
		const wrap = container.createDiv({ cls: "titleforge-quantity-toggle" });
		for (const n of QUANTITY_OPTIONS) {
			const button = wrap.createEl("button", {
				text: String(n),
				cls: "titleforge-quantity-button" + (n === this.quantity ? " is-active" : ""),
			});
			button.addEventListener("click", () => {
				if (n === this.quantity) return;
				this.quantity = n;
				void this.persistUiState();
				this.render();
			});
		}
	}

	/** `wide`, when true, stretches this field (and its select) across the whole row — Genre and Sub
	 * genre (renderControls) use it so they read at the same full width as the Generate button
	 * below them, rather than sizing to their own selected option's text like Shape family/Platform
	 * still do — and hides the visible text label (Genre/Sub genre read as a pair of plain boxes,
	 * not labelled fields); `labelText` survives as the select's accessible name/tooltip instead.
	 * It also always reserves a leading icon slot (`.titleforge-field-icon`, CSS-sized 24x24
	 * regardless of content) so Genre and Sub genre are the exact same size and start at the exact
	 * same x position whether or not that slot actually holds a glyph.
	 *
	 * `leadingIcon`, when given, fills that slot (only Genre uses it — the section placeholder's
	 * own picker (`renderSectionPlaceholder`) shows nameForge's own "packs" glyph before anything's
	 * chosen; once a section is active, `renderControls` swaps it for that section's own icon —
	 * TAB_ICONS — as a visual "you're here" indicator). Sub genre leaves the slot empty, sitting
	 * underneath as a plain, unmarked box.
	 *
	 * `onIconClick`, when given (Genre only), makes that icon the section switcher's trigger —
	 * see `renderSectionPicker`. */
	private renderSelect(
		container: HTMLElement,
		labelText: string,
		options: LabelledOption[],
		value: string,
		onChange: (value: string) => void,
		wide = false,
		leadingIcon?: string,
		onIconClick?: () => void,
	): HTMLSelectElement {
		const label = container.createEl("label", {
			cls: "titleforge-field" + (wide ? " titleforge-field--wide" : ""),
		});
		if (wide) {
			const iconSlot = label.createSpan({ cls: "titleforge-field-icon" });
			if (leadingIcon) setIcon(iconSlot, leadingIcon);
			if (onIconClick) {
				iconSlot.addClass("titleforge-field-icon--clickable");
				iconSlot.setAttribute("role", "button");
				iconSlot.tabIndex = 0;
				iconSlot.setAttribute("aria-label", "change section");
				setTooltip(iconSlot, "change section");
				iconSlot.addEventListener("click", onIconClick);
				iconSlot.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter" || evt.key === " ") {
						evt.preventDefault();
						onIconClick();
					}
				});
			} else {
				iconSlot.setAttribute("aria-hidden", "true");
			}
		} else {
			label.createSpan({ text: labelText });
		}
		const select = label.createEl("select");
		if (wide) {
			select.setAttribute("aria-label", labelText);
			setTooltip(select, labelText);
		}
		for (const opt of options) {
			select.createEl("option", { text: opt.label, value: opt.id });
		}
		// A persisted value can go stale (e.g. a hand-edited lexicon dropped a
		// genre) — fall back to the first option and resync the caller's state
		// to match what's actually displayed, rather than letting the two drift.
		const resolved = options.some((o) => o.id === value) ? value : (options[0]?.id ?? value);
		select.value = resolved;
		if (resolved !== value) onChange(resolved);
		select.addEventListener("change", () => onChange(select.value));
		return select;
	}

	/** Generates `this.quantity` independent results (single titles, or whole series-with-volumes
	 * bundles in series mode) per click, writing each straight into history — there's no separate
	 * "just generated" preview, the history reload at the end is the only render. Exclusions
	 * accumulate across the whole batch (not just against prior history) so one click of, say,
	 * quantity 10 doesn't produce duplicates against itself. In "Any" mode, each of the `quantity`
	 * results draws its own fresh random tradition from the current tab (genre/family/platform
	 * have nothing to offer here — see renderControls — so those go to "all"); the entry it writes
	 * still records that specific tradition's own id, never "any" itself (toEntry reads it off the
	 * generated TitleResult). */
	private async handleGenerate(): Promise<void> {
		const isAny = this.generatorId === ANY_TRADITION_ID;
		const pool = this.controller.generators.filter((g) => TAB_TRADITIONS[this.section()].includes(g.id));
		if (isAny ? pool.length === 0 : !this.currentSpec()) return;

		const baseOptions = isAny
			? { genre: "all", family: "all", platform: "all" }
			: { genre: this.genre, family: this.family, platform: this.platform };
		const exclude = new Set(this.history.map((e) => e.title.toLowerCase()));

		try {
			for (let i = 0; i < this.quantity; i++) {
				const spec = isAny ? pool[Math.floor(Math.random() * pool.length)] : this.currentSpec();
				if (!spec) return;
				if (this.effectiveSeriesMode()) {
					const result = generateSeries(spec, {
						...baseOptions,
						// Draw the umbrella and its volumes from the corpus-grounded series shape
						// set, not the novel patterns (invariant 2 of the Stage 5 brief). Generators
						// with no "series" family fall through untouched — eligiblePatterns treats an
						// empty family match as a soft no-op. `strategy`/`volumes` are omitted —
						// there's no picker for either any more, so this always takes generateSeries'
						// own defaults (echo, 3).
						family: "series",
						exclude,
					});
					await this.controller.storage.appendHistory(toEntry(result.series));
					exclude.add(result.series.title.toLowerCase());
					for (const volume of result.volumes) {
						await this.controller.storage.appendHistory(toEntry(volume));
						exclude.add(volume.title.toLowerCase());
					}
				} else {
					const result = generateOne(spec, { ...baseOptions, exclude });
					await this.controller.storage.appendHistory(toEntry(result));
					exclude.add(result.title.toLowerCase());
				}
			}
			await this.loadHistoryForCurrentGenerator();
			this.render();
		} catch (err) {
			new Notice(`titleForge: could not generate a title — ${(err as Error).message}`);
		}
	}

	/** Flips one entry's "kept" flag, in whichever generator's history file it actually lives in
	 * — not necessarily the currently active one, since the "kept titles" tab pools entries from
	 * every tradition reachable in this scope. */
	private async toggleKeptEntry(generatorId: string, entry: HistoryEntry): Promise<void> {
		const history =
			generatorId === this.generatorId ? this.history : await this.controller.storage.loadHistory(generatorId);
		const index = history.findIndex(
			(e) => e.seed === entry.seed && e.title === entry.title && e.at === entry.at,
		);
		if (index === -1) return;
		const updated = [...history];
		updated[index] = { ...updated[index], kept: !updated[index].kept };
		await this.controller.storage.saveHistory(generatorId, updated);
		if (generatorId === this.generatorId) this.history = updated;
		if (this.activeTab === "kept") await this.loadKeptEntries();
		this.render();
	}

	/** Which tooltip a row's "use this title" arrow should show, derived from the row's own
	 * generator's tab category — not the panel's active scope, since a "kept titles" row can come
	 * from a different category than whichever tab happens to be selected. Only "series" gets its
	 * own wording; "novels" and "web fiction & light novels" both just say "title" rather than
	 * naming the category. */
	private useTooltipFor(generatorId: string): string {
		if (TAB_TRADITIONS.series.includes(generatorId)) return "use this series name";
		return "use this title";
	}

	/** One row — used by both renderHistory and renderKeptTab. `spec` is the entry's own
	 * generator (kept rows can differ from the currently active one), `opts.showTradition` adds a
	 * tradition-name label (kept rows only — history rows are already scoped to one generator).
	 * Every row gets an info icon (opens TitleShapeInfoModal) and a short-list star; a "use this
	 * title" arrow is added only when this panel was opened with an `onUse` callback. */
	private renderTitleRow(
		list: HTMLElement,
		spec: GeneratorSpec,
		entry: HistoryEntry,
		opts: { showTradition?: string },
	): void {
		const item = list.createEl("li", { cls: "titleforge-row-item" });

		const head = item.createDiv({ cls: "titleforge-row-head" });
		head.createSpan({ cls: "titleforge-row-title", text: entry.title });
		if (opts.showTradition) {
			head.createSpan({ cls: "titleforge-row-tradition", text: opts.showTradition });
		}

		// The row's actions sit on their own line beneath the title, as plain hover-icons (a
		// coloured glyph that brightens on hover/focus) rather than button chips — same treatment
		// as the section-switcher menu (renderSectionPicker) and the bottom-bar star (renderBottomBar).
		const actions = item.createDiv({ cls: "titleforge-row-actions" });

		this.addRowIcon(actions, ICON_INFO_CIRCLE, "about this title", () => {
			new TitleShapeInfoModal(this.controller.app, spec, entry).open();
		});

		this.addRowIcon(
			actions,
			entry.kept ? ICON_STAR_FILL : ICON_STAR_OUTLINE,
			entry.kept ? "remove from short list" : "short list title",
			() => void this.toggleKeptEntry(spec.id, entry),
			entry.kept ? "is-kept" : undefined,
		);

		if (this.opts.onUse) {
			this.addRowIcon(actions, ICON_ARROW_INSERT, this.useTooltipFor(spec.id), () =>
				this.opts.onUse!(entry.title),
			);
		}
	}

	/** One hover-icon in a row's action line — a `<span>` (not a `<button>`), made
	 * keyboard-activatable the same way the section-switcher menu's own items are. */
	private addRowIcon(
		container: HTMLElement,
		icon: string,
		label: string,
		onActivate: () => void,
		extraClass?: string,
	): void {
		const el = container.createSpan({
			cls: "titleforge-row-icon" + (extraClass ? ` ${extraClass}` : ""),
			attr: { role: "button", tabindex: "0", "aria-label": label },
		});
		setIcon(el, icon);
		setTooltip(el, label);
		el.addEventListener("click", onActivate);
		el.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				onActivate();
			}
		});
	}

	/** In "Any" mode `this.history` is already pooled across every tradition in the current tab
	 * (loadHistoryForCurrentGenerator), so each row resolves its own generator rather than sharing
	 * one — and gets a tradition label, same as a kept-tab row, since they're no longer all the
	 * same tradition. */
	private renderHistory(container: HTMLElement): void {
		const section = container.createDiv({ cls: "titleforge-history" });
		if (this.history.length === 0) {
			section.createDiv({
				cls: "titleforge-empty",
				text:
					this.generatorId === ANY_TRADITION_ID
						? "Nothing generated yet."
						: "Nothing generated yet for this tradition.",
			});
			return;
		}
		const list = section.createEl("ul", { cls: "titleforge-history-list" });
		const recent = [...this.history].reverse().slice(0, 30);
		const showTradition = this.generatorId === ANY_TRADITION_ID;
		for (const entry of recent) {
			const spec = this.controller.getGeneratorById(entry.generatorId);
			if (!spec) continue; // a hand-edited/removed lexicon — nothing sensible to show
			this.renderTitleRow(list, spec, entry, showTradition ? { showTradition: spec.name } : {});
		}
	}
}
