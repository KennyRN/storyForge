import { App, Modal, setIcon } from "obsidian";
import { writeSeriesTitle } from "../series";
import { createBook } from "../book";
import { generateOne, generateSeries } from "../titleforge/engine/generate";
import { ICON_DICE, ICON_SETTINGS_GEAR } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import { TitleGenreSettingsModal } from "./TitleGenreSettingsModal";
import { TitleHistoryModal } from "./TitleHistoryModal";
import type StoryForgePlugin from "../main";

type OnboardingTab = "series" | "standalone" | "webfiction";

const TABS: { id: OnboardingTab; label: string }[] = [
	{ id: "series", label: "Series" },
	{ id: "standalone", label: "Standalone novel" },
	{ id: "webfiction", label: "Web fiction" },
];

/**
 * Shown exactly once, the very first time storyForge runs in a vault (series.md doesn't exist yet),
 * before ensureSeriesFile() would otherwise silently seed it with "Untitled Series". Lets the user
 * pick the shape of their project (series / standalone novel / web fiction) and name its first unit.
 * Dismissing (Escape/backdrop click) without submitting is a deliberate no-op - today's default
 * behavior (silent "Untitled Series", series pane visible) - nothing is forced on the user.
 *
 * Web fiction has no dedicated data model yet: its "series"/"first arc" fields are wired onto the
 * same series.md + createBook() primitives a series uses (arc == book folder) until real
 * webfiction/arc support exists.
 */
export class SeriesOnboardingModal extends Modal {
	private activeTab: OnboardingTab = "series";
	private tabButtons = new Map<OnboardingTab, HTMLElement>();
	private tabPanels = new Map<OnboardingTab, HTMLElement>();

	private seriesNameInput!: HTMLInputElement;
	private seriesFirstBookInput!: HTMLInputElement;
	private standaloneTitleInput!: HTMLInputElement;
	private webfictionSeriesNameInput!: HTMLInputElement;
	private webfictionFirstArcInput!: HTMLInputElement;

	/** Most-recent-first, capped at TITLE_HISTORY_LIMIT - shown in TitleGenreSettingsModal's
	 * "recently generated series name" list. Mutated in place (not reassigned) so that modal, holding
	 * the same array reference, sees every push without needing a change callback of its own. */
	private seriesNameHistory: string[] = [];
	/** Same idea as seriesNameHistory, but for the first book title field's own dice - shown in its
	 * standalone TitleHistoryModal (see createBookTitleField). */
	private bookTitleHistory: string[] = [];
	/** Same idea again, but for the standalone tab's novel title field (see createStandaloneTitleField) -
	 * its own history, independent of the series tab's fields. */
	private standaloneTitleHistory: string[] = [];
	private static readonly TITLE_HISTORY_LIMIT = 10;

	constructor(
		app: App,
		private plugin: StoryForgePlugin,
		private onResolved: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass("sf-onboarding-modal-el");
		contentEl.addClass("sf-onboarding-modal");
		contentEl.createEl("h2", { text: "Welcome to storyForge" });

		const tabBar = contentEl.createDiv({ cls: "sf-onboarding-tab-bar" });
		for (const tab of TABS) {
			const btn = tabBar.createEl("button", { cls: "sf-onboarding-tab-btn", text: tab.label });
			btn.addEventListener("click", () => this.setActiveTab(tab.id));
			this.tabButtons.set(tab.id, btn);
		}

		const panelHost = contentEl.createDiv({ cls: "sf-onboarding-tab-panels" });
		this.tabPanels.set("series", this.buildSeriesPanel(panelHost));
		this.tabPanels.set("standalone", this.buildStandalonePanel(panelHost));
		this.tabPanels.set("webfiction", this.buildWebfictionPanel(panelHost));

		const actionsRow = contentEl.createDiv({ cls: "sf-onboarding-actions" });
		const startBtn = actionsRow.createEl("button", { cls: "mod-cta", text: "tell your story" });
		startBtn.addEventListener("click", () => void this.handleSubmit());

		this.setActiveTab("series");
	}

	private buildSeriesPanel(host: HTMLElement): HTMLElement {
		const panel = host.createDiv({ cls: "sf-onboarding-tab-panel" });
		this.seriesNameInput = this.createSeriesNameField(panel);
		this.seriesFirstBookInput = this.createBookTitleField(panel);
		this.bindEnterToSubmit(this.seriesNameInput, this.seriesFirstBookInput);
		return panel;
	}

	/**
	 * Series name field, pre-filled from titleForge and with two icons to its right, both sized to
	 * the input's own height via `align-items: stretch` on the row (see .sf-onboarding-icon-btn):
	 * a dice that rolls a fresh name (titleForge's currently-selected generator, under whatever
	 * genre its settings modal - opened from the cog - last picked), and a cog that opens
	 * TitleGenreSettingsModal (genre picker + recent-rolls history), keyed to the "lastGenre" setting.
	 * Both are hover icons, not <button>s - same idiom as TopPanel's .sf-series-settings-btn.
	 *
	 * The genre picked in that settings modal also governs the first book title (generateBookTitle),
	 * so picking a new genre there rerolls both fields - they'd otherwise silently drift onto two
	 * different genres. Reusing a past roll from that modal's history, in contrast, only ever touches
	 * the series name - the first book title has nothing to do with which series name is showing.
	 */
	private createSeriesNameField(panel: HTMLElement): HTMLInputElement {
		const field = panel.createDiv({ cls: "sf-onboarding-field" });
		const row = field.createDiv({ cls: "sf-onboarding-input-row" });
		const input = row.createEl("input", {
			cls: "sf-modal-input",
			type: "text",
			attr: { placeholder: "e.g. The Ember Chronicles" },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());

		const diceBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Generate a series name" },
		});
		setIcon(diceBtn, ICON_DICE);
		const rollName = () => {
			this.rollSeriesName(input);
			input.focus();
		};
		diceBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			rollName();
		});
		makeAccessibleActivatable(diceBtn, rollName);

		const settingsBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Series name generator settings" },
		});
		setIcon(settingsBtn, ICON_SETTINGS_GEAR);
		settingsBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new TitleGenreSettingsModal(
				this.app,
				this.plugin.titleForge,
				"lastGenre",
				this.seriesNameHistory,
				"recently generated series name",
				{
					// A genre change affects both fields drawn from it, so both reroll.
					onGenreChanged: () => {
						this.rollSeriesName(input);
						this.rollBookTitle(this.seriesFirstBookInput);
					},
					// Reusing a past roll from history sets only the series name - the first book title is
					// independent of which series name is showing, so it's left untouched.
					onHistorySelect: (title) => {
						input.value = title;
						input.focus();
					},
				},
			).open();
		});

		field.createEl("label", { text: "Series name" });

		this.rollSeriesName(input);
		return input;
	}

	/** Draws a series name and records it into `seriesNameHistory`, capped at the last 10 rolls. */
	private rollSeriesName(input: HTMLInputElement): void {
		const title = this.generateSeriesName();
		input.value = title;
		this.recordRoll(this.seriesNameHistory, title);
	}

	/** Draws a book title and records it into `bookTitleHistory`, capped at the last 10 rolls. */
	private rollBookTitle(input: HTMLInputElement): void {
		const title = this.generateBookTitle();
		input.value = title;
		this.recordRoll(this.bookTitleHistory, title);
	}

	/** Draws a standalone novel title and records it into `standaloneTitleHistory`, capped at the last 10 rolls. */
	private rollStandaloneTitle(input: HTMLInputElement): void {
		const title = this.generateStandaloneNovelTitle();
		input.value = title;
		this.recordRoll(this.standaloneTitleHistory, title);
	}

	/** Pushes `title` onto the front of `history` (in place) and trims it to TITLE_HISTORY_LIMIT. */
	private recordRoll(history: string[], title: string): void {
		history.unshift(title);
		history.length = Math.min(history.length, SeriesOnboardingModal.TITLE_HISTORY_LIMIT);
	}

	/**
	 * Draws a series name from titleForge - the same generator/genre/family/platform its own view last
	 * used, but always under the "free" strategy regardless of titleForge's own last-used strategy.
	 * "echo" and "anchor" deliberately draw the series title from the *same* shape as its volumes (see
	 * generateSeries's doc comment) - that's correct for titleForge's own series-with-volumes workbench,
	 * but here it just reads as another novel title. "free" is the one strategy that specifically hunts
	 * for a collective-noun shape (Chronicles/Saga/Files/...), which is what actually reads as a series
	 * name rather than a book title.
	 */
	private generateSeriesName(): string {
		const controller = this.plugin.titleForge;
		const spec = controller.getGeneratorById(controller.settings.lastGeneratorId) ?? controller.generators[0];
		if (!spec) return "";
		const result = generateSeries(spec, {
			genre: controller.settings.lastGenre,
			family: controller.settings.lastFamily,
			platform: controller.settings.lastPlatform,
			strategy: "free",
			volumes: 1,
		});
		return result.series.title;
	}

	/**
	 * Draws a single book title from titleForge - same generator/genre/family/platform as the series
	 * name, but a plain `generateOne` (no series strategy): a "first book" is just a novel title, not
	 * a set of volumes.
	 */
	private generateBookTitle(): string {
		const controller = this.plugin.titleForge;
		const spec = controller.getGeneratorById(controller.settings.lastGeneratorId) ?? controller.generators[0];
		if (!spec) return "";
		const result = generateOne(spec, {
			genre: controller.settings.lastGenre,
			family: controller.settings.lastFamily,
			platform: controller.settings.lastPlatform,
		});
		return result.title;
	}

	/**
	 * Draws a standalone novel title from titleForge - same generator/family/platform as the other
	 * fields, but its own genre setting (`lastNovelGenre`, picked via the standalone tab's own
	 * TitleGenreSettingsModal) rather than the series fields' shared `lastGenre` - a standalone
	 * novel's genre has nothing to do with whatever series genre was last picked.
	 */
	private generateStandaloneNovelTitle(): string {
		const controller = this.plugin.titleForge;
		const spec = controller.getGeneratorById(controller.settings.lastGeneratorId) ?? controller.generators[0];
		if (!spec) return "";
		const result = generateOne(spec, {
			genre: controller.settings.lastNovelGenre,
			family: controller.settings.lastFamily,
			platform: controller.settings.lastPlatform,
		});
		return result.title;
	}

	/**
	 * First book title field - same dice + hover-icon treatment as the series name field, but a
	 * history icon in place of the cog (there's no per-field genre picker here; genre lives on the
	 * series name field's settings modal and applies to both, see createSeriesNameField's doc comment).
	 * The history icon opens a headerless TitleHistoryModal mirroring TitleGenreSettingsModal's
	 * "recently generated series name" pane, scoped to this field's own rolls.
	 */
	private createBookTitleField(panel: HTMLElement): HTMLInputElement {
		const field = panel.createDiv({ cls: "sf-onboarding-field" });
		const row = field.createDiv({ cls: "sf-onboarding-input-row" });
		const input = row.createEl("input", {
			cls: "sf-modal-input",
			type: "text",
			attr: { placeholder: "e.g. Novel One" },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());

		const diceBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Generate a novel title" },
		});
		setIcon(diceBtn, ICON_DICE);
		const rollTitle = () => {
			this.rollBookTitle(input);
			input.focus();
		};
		diceBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			rollTitle();
		});
		makeAccessibleActivatable(diceBtn, rollTitle);

		const historyBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Recently generated novel titles" },
		});
		setIcon(historyBtn, "history");
		historyBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new TitleHistoryModal(this.app, this.bookTitleHistory, (title) => {
				input.value = title;
				input.focus();
			}).open();
		});

		field.createEl("label", { text: "First novel title" });

		this.rollBookTitle(input);
		return input;
	}

	private buildStandalonePanel(host: HTMLElement): HTMLElement {
		const panel = host.createDiv({ cls: "sf-onboarding-tab-panel" });
		this.standaloneTitleInput = this.createStandaloneTitleField(panel);
		this.bindEnterToSubmit(this.standaloneTitleInput);
		return panel;
	}

	/**
	 * Novel title field for the standalone tab - same dice + cog layout as createSeriesNameField, but
	 * its own genre setting (TitleGenreSettingsModal keyed to "lastNovelGenre" rather than "lastGenre")
	 * and its own history, both independent of the series tab's fields.
	 */
	private createStandaloneTitleField(panel: HTMLElement): HTMLInputElement {
		const field = panel.createDiv({ cls: "sf-onboarding-field" });
		const row = field.createDiv({ cls: "sf-onboarding-input-row" });
		const input = row.createEl("input", {
			cls: "sf-modal-input",
			type: "text",
			attr: { placeholder: "e.g. Under a Borrowed Sky" },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());

		const diceBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Generate a novel title" },
		});
		setIcon(diceBtn, ICON_DICE);
		const rollTitle = () => {
			this.rollStandaloneTitle(input);
			input.focus();
		};
		diceBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			rollTitle();
		});
		makeAccessibleActivatable(diceBtn, rollTitle);

		const settingsBtn = row.createSpan({
			cls: "sf-onboarding-icon-btn",
			attr: { "aria-label": "Novel title generator settings" },
		});
		setIcon(settingsBtn, ICON_SETTINGS_GEAR);
		settingsBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new TitleGenreSettingsModal(
				this.app,
				this.plugin.titleForge,
				"lastNovelGenre",
				this.standaloneTitleHistory,
				"recently generated novel title",
				{
					onGenreChanged: () => this.rollStandaloneTitle(input),
					onHistorySelect: (title) => {
						input.value = title;
						input.focus();
					},
				},
			).open();
		});

		field.createEl("label", { text: "Novel title" });

		this.rollStandaloneTitle(input);
		return input;
	}

	private buildWebfictionPanel(host: HTMLElement): HTMLElement {
		const panel = host.createDiv({ cls: "sf-onboarding-tab-panel" });
		this.webfictionSeriesNameInput = this.createField(panel, "Series name", "e.g. The Ember Chronicles");
		this.webfictionFirstArcInput = this.createField(panel, "First arc title", "e.g. Arc One");
		this.bindEnterToSubmit(this.webfictionSeriesNameInput, this.webfictionFirstArcInput);
		return panel;
	}

	private createField(panel: HTMLElement, labelText: string, placeholder: string): HTMLInputElement {
		const field = panel.createDiv({ cls: "sf-onboarding-field" });
		const input = field.createEl("input", {
			cls: "sf-modal-input",
			type: "text",
			attr: { placeholder },
		});
		input.addEventListener("pointerdown", (e) => e.stopPropagation());
		field.createEl("label", { text: labelText });
		return input;
	}

	private bindEnterToSubmit(...inputs: HTMLInputElement[]): void {
		for (const input of inputs) {
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					void this.handleSubmit();
				}
			});
		}
	}

	private setActiveTab(tab: OnboardingTab): void {
		this.activeTab = tab;
		for (const [id, btn] of this.tabButtons) btn.toggleClass("is-active", id === tab);
		for (const [id, panel] of this.tabPanels) panel.toggleClass("is-active", id === tab);
		const firstInput = this.tabPanels.get(tab)?.querySelector("input");
		window.setTimeout(() => (firstInput as HTMLInputElement | null)?.focus(), 0);
	}

	private async handleSubmit(): Promise<void> {
		switch (this.activeTab) {
			case "series": {
				const title = this.seriesNameInput.value.trim();
				if (title) await writeSeriesTitle(this.app, title);
				await createBook(this.app, this.seriesFirstBookInput.value.trim() || undefined);
				break;
			}
			case "standalone": {
				await this.plugin.updateSetting("hideSeriesPane", true);
				await createBook(this.app, this.standaloneTitleInput.value.trim() || undefined);
				break;
			}
			case "webfiction": {
				const title = this.webfictionSeriesNameInput.value.trim();
				if (title) await writeSeriesTitle(this.app, title);
				await createBook(this.app, this.webfictionFirstArcInput.value.trim() || undefined);
				break;
			}
		}
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		this.onResolved();
	}
}
