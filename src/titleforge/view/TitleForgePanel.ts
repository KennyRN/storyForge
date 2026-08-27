import { Notice, setIcon, setTooltip } from "obsidian";
import { ICON_ARROW_INSERT, ICON_DICE_DUAL, ICON_INFO_CIRCLE, ICON_STAR_FILL, ICON_STAR_OUTLINE } from "../../icons.js";
import { generateOne, generateSeries } from "../engine/generate.js";
import { toEntry } from "../engine/history.js";
import type { GeneratorSpec, HistoryEntry, LabelledOption, SeriesStrategy } from "../engine/types.js";
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

const SERIES_STRATEGY_OPTIONS: LabelledOption[] = [
	{ id: "echo", label: "Echo — one shape, repeated" },
	{ id: "anchor", label: "Anchor — one element fixed" },
	{ id: "free", label: "Free — label + loose volumes" },
];

const QUANTITY_OPTIONS = [3, 5, 10, 15, 25] as const;

/** Not a real generator id — the Tradition picker's own "Any" choice, and always what's
 * automatically selected whenever a tab with traditions of its own is shown. Generating in this
 * mode picks a fresh random tradition from the current tab for each of `quantity`'s results
 * (never persisted as a HistoryEntry's own generatorId — toEntry always records the real spec that
 * actually produced each title). */
const ANY_TRADITION_ID = "any";

// Tab titles are deliberately lowercase throughout, star included — matches the rest of the
// modal's understated chrome rather than reading as a shouted section header.
const TAB_LABELS: Record<TitleForgeTab, string> = {
	series: "series",
	webFiction: "web fiction & light novels",
	novels: "novels",
	kept: "★ kept titles",
};

/**
 * Which generators live under each generator tab (i.e. every tab but "kept titles" — that one
 * pools kept entries across a scope's own tabs rather than picking a tradition; see KeptEntry).
 * "series" is deliberately empty — there's no generator built specifically for series yet, so the
 * tab stays an honest placeholder rather than borrowing one that isn't really about series.
 * "novels" pairs `title-composer` (the Anglophone general-purpose bench) with
 * `non-western-literary` (the comparative world-literary one); everything serialised/episodic
 * goes under "web fiction & light novels".
 */
const TAB_TRADITIONS: Record<TitleForgeTab, string[]> = {
	series: [],
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
 * The titleForge workbench itself: pick a tradition and genre, generate titles or whole series,
 * see why a shape reads the way it does, and review every title kept across every tradition.
 *
 * The only host is TitleForgeModal — titleForge has no main-area workspace view (see
 * TitleForgeController's class doc for why) — but this still operates on any given container
 * element rather than reaching into the Modal directly, so the modal shell stays a thin wrapper:
 * it owns the container's lifecycle (empty it, remove it, whatever) and just calls
 * load()/render() into it.
 *
 * `opts.scope` (see SCOPE_TABS) fixes which tabs are reachable and which traditions the "kept
 * titles" tab pools from for this open; `opts.onUse`, when supplied, is what puts a "use this
 * title" arrow on every row — see `renderTitleRow`.
 *
 * Renders no header/blurb of its own (the modal has neither), groups the traditions into tabs
 * (see TAB_TRADITIONS), and only ever shows the series checkbox under the "novels" tab — the
 * "series" tab (once it has a generator) will always be in series mode, "web fiction & light
 * novels" never is. "kept titles" isn't a generator tab at all — see renderKeptTab. Generating
 * writes straight into the history list — there's no separate "just generated" preview; every row,
 * old or new, carries the same info/short-list/use-this-title actions (renderTitleRow).
 *
 * Every Tradition picker offers "Any" (ANY_TRADITION_ID) first, and it's always what's
 * automatically selected — never a remembered last pick. In that mode there's no single spec to
 * source genre/family/platform from (so those pickers are hidden), history pools across the whole
 * tab instead of one generator's file, and Generate draws a fresh random tradition per result.
 */
export class TitleForgePanel {
	private generatorId: string;
	private genre: string;
	private family: string;
	private platform: string;
	private seriesMode: boolean;
	private seriesStrategy: SeriesStrategy;
	private seriesVolumes: number;
	private quantity: number;
	private activeTab: TitleForgeTab;

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
		this.seriesMode = s.seriesMode;
		this.seriesStrategy = s.seriesStrategy;
		this.seriesVolumes = s.seriesVolumes;
		this.quantity = s.lastQuantity;
		const lastTab = s.lastTabByScope[this.opts.scope];
		this.activeTab = this.tabOrder().includes(lastTab) ? lastTab : this.defaultTab();
		// "Any" is always what's automatically selected — there's nothing to remember here across
		// opens, so unlike genre/family/platform this never reads a persisted "last tradition".
		this.generatorId = ANY_TRADITION_ID;
	}

	/** Loads history for the starting tab (or, on the "kept titles" tab, this scope's kept
	 * entries) and renders — the host (TitleForgeModal.onOpen) calls this once. */
	async load(): Promise<void> {
		await this.loadHistoryForCurrentGenerator();
		if (this.activeTab === "kept") await this.loadKeptEntries();
		this.render();
	}

	private currentSpec(): GeneratorSpec | undefined {
		return this.controller.getGeneratorById(this.generatorId);
	}

	private tabOrder(): TitleForgeTab[] {
		return SCOPE_TABS[this.opts.scope];
	}

	/** "novels" is the most useful default landing tab when it's reachable (not the empty "series"
	 * placeholder) — falls back to the scope's own first tab when it isn't (e.g. the "series"
	 * scope, which never reaches "novels" at all). */
	private defaultTab(): TitleForgeTab {
		const order = this.tabOrder();
		return order.includes("novels") ? "novels" : order[0]!;
	}

	/** The effective series-mode for generation/display: forced on for the "series" tab,
	 * checkbox-controlled for "novels", and never on for "web fiction & light novels" (which has
	 * no checkbox) or "kept titles" (which never generates). */
	private effectiveSeriesMode(): boolean {
		if (this.activeTab === "series") return true;
		if (this.activeTab === "novels") return this.seriesMode;
		return false;
	}

	/** In "Any" mode there's no single generator's file to read — pool every tradition reachable
	 * from the current tab instead, oldest first (same order loadHistory's own file already comes
	 * in), so renderHistory's `.reverse()` still shows newest first regardless of which mode. */
	private async loadHistoryForCurrentGenerator(): Promise<void> {
		if (this.generatorId !== ANY_TRADITION_ID) {
			this.history = await this.controller.storage.loadHistory(this.generatorId);
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
			seriesMode: this.seriesMode,
			seriesStrategy: this.seriesStrategy,
			seriesVolumes: this.seriesVolumes,
			lastQuantity: this.quantity,
			lastTabByScope: { ...this.controller.settings.lastTabByScope, [this.opts.scope]: this.activeTab },
		});
		await this.controller.saveSettings();
	}

	private render(): void {
		const container = this.container;
		container.empty();
		container.addClass("titleforge-view");
		this.renderTabs(container);

		if (this.activeTab === "kept") {
			this.renderKeptTab(container);
			return;
		}

		if (this.activeTab === "series") {
			// Left deliberately empty — see TAB_TRADITIONS.
			container.createDiv({
				cls: "titleforge-empty",
				text: "No series generators yet.",
			});
			return;
		}

		const traditionIds = TAB_TRADITIONS[this.activeTab];
		if (!this.controller.generators.some((g) => traditionIds.includes(g.id))) {
			container.createDiv({
				cls: "titleforge-empty",
				text: "No title generators are loaded.",
			});
			return;
		}
		// A specific tradition can go stale (a hand-edited lexicon dropped it) — fall back to "Any"
		// rather than an error, same spirit as renderSelect's own stale-value handling.
		if (this.generatorId !== ANY_TRADITION_ID && !this.currentSpec()) {
			this.generatorId = ANY_TRADITION_ID;
		}
		const spec = this.generatorId === ANY_TRADITION_ID ? undefined : this.currentSpec();

		this.renderControls(container, spec);
		this.renderHistory(container);
	}

	private renderTabs(container: HTMLElement): void {
		const tabs = container.createDiv({ cls: "titleforge-tabs" });
		for (const tab of this.tabOrder()) {
			const button = tabs.createEl("button", {
				text: TAB_LABELS[tab],
				cls: "titleforge-tab" + (tab === this.activeTab ? " is-active" : ""),
			});
			button.addEventListener("click", () => {
				if (tab === this.activeTab) return;
				this.activeTab = tab;
				void this.persistUiState();

				if (tab === "kept") {
					void this.loadKeptEntries().then(() => this.render());
					return;
				}

				if (TAB_TRADITIONS[tab].length > 0) this.generatorId = ANY_TRADITION_ID;
				this.genre = "all";
				this.family = "all";
				this.platform = "all";
				void this.loadHistoryForCurrentGenerator().then(() => this.render());
			});
		}
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

	/** The traditions the "Tradition" picker should offer: "Any" first, then the current tab's own. */
	private traditionOptions(): LabelledOption[] {
		const ids = TAB_TRADITIONS[this.activeTab];
		const specific = this.controller.generators
			.filter((g) => ids.includes(g.id))
			.map((g) => ({ id: g.id, label: g.name }));
		return [{ id: ANY_TRADITION_ID, label: "Any" }, ...specific];
	}

	/** `spec` is undefined in "Any" mode — genre/shape-family/platform are one tradition's own
	 * vocabulary, so there's nothing meaningful to offer until a specific one is picked. */
	private renderControls(container: HTMLElement, spec: GeneratorSpec | undefined): void {
		const row = container.createDiv({ cls: "titleforge-row" });

		// Always has "Any" plus at least one real tradition by the time renderControls is reached
		// (render() already bailed out above if this tab has none loaded at all).
		this.renderSelect(row, "Tradition", this.traditionOptions(), this.generatorId, (value) => {
			this.generatorId = value;
			this.genre = "all";
			this.family = "all";
			this.platform = "all";
			void this.persistUiState();
			void this.loadHistoryForCurrentGenerator().then(() => this.render());
		});

		if (spec) {
			this.renderSelect(row, "Genre", spec.genres, this.genre, (value) => {
				this.genre = value;
				void this.persistUiState();
			});

			if (spec.families && spec.families.length > 0) {
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

		const seriesRow = container.createDiv({ cls: "titleforge-row" });
		// The checkbox itself only matters where series-mode is a genuine choice: the "novels" tab.
		// The "series" tab is always in series mode and "web fiction & light novels" never is, so
		// neither shows it.
		if (this.activeTab === "novels") {
			const seriesLabel = seriesRow.createEl("label", { cls: "titleforge-series-toggle" });
			const seriesCheckbox = seriesLabel.createEl("input", { type: "checkbox" });
			seriesCheckbox.checked = this.seriesMode;
			seriesLabel.createSpan({ text: " Series" });
			seriesCheckbox.addEventListener("change", () => {
				this.seriesMode = seriesCheckbox.checked;
				void this.persistUiState();
				this.render();
			});
		}

		if (this.effectiveSeriesMode()) {
			this.renderSelect(
				seriesRow,
				"Strategy",
				SERIES_STRATEGY_OPTIONS,
				this.seriesStrategy,
				(value) => {
					this.seriesStrategy = value as SeriesStrategy;
					void this.persistUiState();
				},
			);

			const volumesLabel = seriesRow.createEl("label", { cls: "titleforge-field" });
			volumesLabel.createSpan({ text: "Volumes" });
			const volumesInput = volumesLabel.createEl("input", { type: "number" });
			volumesInput.min = "1";
			volumesInput.max = "12";
			volumesInput.value = String(this.seriesVolumes);
			volumesInput.addEventListener("change", () => {
				const n = Math.max(1, Math.min(12, Number(volumesInput.value) || 3));
				this.seriesVolumes = n;
				volumesInput.value = String(n);
				void this.persistUiState();
			});
		}

		this.renderQuantity(container);

		const actions = container.createDiv({ cls: "titleforge-actions" });
		const generateButton = actions.createEl("button", {
			cls: "titleforge-generate-button",
			attr: { title: this.effectiveSeriesMode() ? "Generate series" : "Generate title" },
		});
		setIcon(generateButton, ICON_DICE_DUAL);
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

	private renderSelect(
		container: HTMLElement,
		labelText: string,
		options: LabelledOption[],
		value: string,
		onChange: (value: string) => void,
	): HTMLSelectElement {
		const label = container.createEl("label", { cls: "titleforge-field" });
		label.createSpan({ text: labelText });
		const select = label.createEl("select");
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
		const pool = isAny
			? this.controller.generators.filter((g) => TAB_TRADITIONS[this.activeTab].includes(g.id))
			: undefined;
		if (isAny ? pool!.length === 0 : !this.currentSpec()) return;

		const baseOptions = isAny
			? { genre: "all", family: "all", platform: "all" }
			: { genre: this.genre, family: this.family, platform: this.platform };
		const exclude = new Set(this.history.map((e) => e.title.toLowerCase()));

		try {
			for (let i = 0; i < this.quantity; i++) {
				const spec = isAny ? pool![Math.floor(Math.random() * pool!.length)]! : this.currentSpec()!;
				if (this.effectiveSeriesMode()) {
					const result = generateSeries(spec, {
						...baseOptions,
						strategy: this.seriesStrategy,
						volumes: this.seriesVolumes,
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
		updated[index] = { ...updated[index]!, kept: !updated[index]!.kept };
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
		item.createSpan({ cls: "titleforge-row-title", text: entry.title });
		if (opts.showTradition) {
			item.createSpan({ cls: "titleforge-row-tradition", text: opts.showTradition });
		}

		const actions = item.createDiv({ cls: "titleforge-row-actions" });

		const infoButton = actions.createEl("button", { cls: "titleforge-row-icon-button" });
		setIcon(infoButton, ICON_INFO_CIRCLE);
		setTooltip(infoButton, "about this title");
		infoButton.addEventListener("click", () => {
			new TitleShapeInfoModal(this.controller.app, spec, entry).open();
		});

		const starButton = actions.createEl("button", {
			cls: "titleforge-row-icon-button" + (entry.kept ? " is-kept" : ""),
		});
		setIcon(starButton, entry.kept ? ICON_STAR_FILL : ICON_STAR_OUTLINE);
		setTooltip(starButton, entry.kept ? "remove from short list" : "short list title");
		starButton.addEventListener("click", () => void this.toggleKeptEntry(spec.id, entry));

		if (this.opts.onUse) {
			const useButton = actions.createEl("button", { cls: "titleforge-row-icon-button" });
			setIcon(useButton, ICON_ARROW_INSERT);
			setTooltip(useButton, this.useTooltipFor(spec.id));
			useButton.addEventListener("click", () => this.opts.onUse!(entry.title));
		}
	}

	/** In "Any" mode `this.history` is already pooled across every tradition in the current tab
	 * (loadHistoryForCurrentGenerator), so each row resolves its own generator rather than sharing
	 * one — and gets a tradition label, same as a kept-tab row, since they're no longer all the
	 * same tradition. */
	private renderHistory(container: HTMLElement): void {
		const section = container.createDiv({ cls: "titleforge-history" });
		section.createEl("h3", { text: "History" });
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
