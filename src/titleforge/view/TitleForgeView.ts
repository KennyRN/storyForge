import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { ICON_NOTEBOOK } from "../../icons.js";
import { generateOne, generateSeries } from "../engine/generate.js";
import { replay, toEntry } from "../engine/history.js";
import type {
	GeneratorSpec,
	HistoryEntry,
	LabelledOption,
	SeriesResult,
	SeriesStrategy,
	TitleResult,
} from "../engine/types.js";
import type { TitleForgeController } from "../TitleForgeController.js";

export const TITLEFORGE_VIEW_TYPE = "titleforge-view";

type LastGeneration =
	| { kind: "single"; result: TitleResult }
	| { kind: "series"; result: SeriesResult };

const SERIES_STRATEGY_OPTIONS: LabelledOption[] = [
	{ id: "echo", label: "Echo — one shape, repeated" },
	{ id: "anchor", label: "Anchor — one element fixed" },
	{ id: "free", label: "Free — label + loose volumes" },
];

/**
 * The titleForge workbench: pick a tradition and genre, generate a title or a
 * whole series, see why the shape reads the way it does, and browse what's
 * been generated before.
 *
 * A plain main-area `ItemView`, opened via ribbon icon or command — same
 * shape as `NewChapterView`/`StorytellingView` — not a right-rail panel,
 * because the shape picker plus "Why this shape" plus history wants the width.
 */
export class TitleForgeView extends ItemView {
	private generatorId: string;
	private genre: string;
	private family: string;
	private platform: string;
	private seriesMode: boolean;
	private seriesStrategy: SeriesStrategy;
	private seriesVolumes: number;

	private last: LastGeneration | null = null;
	private history: HistoryEntry[] = [];

	constructor(
		leaf: WorkspaceLeaf,
		private controller: TitleForgeController,
	) {
		super(leaf);
		const s = controller.settings;
		this.generatorId = s.lastGeneratorId;
		this.genre = s.lastGenre;
		this.family = s.lastFamily;
		this.platform = s.lastPlatform;
		this.seriesMode = s.seriesMode;
		this.seriesStrategy = s.seriesStrategy;
		this.seriesVolumes = s.seriesVolumes;
	}

	getViewType(): string {
		return TITLEFORGE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "titleForge";
	}

	getIcon(): string {
		return ICON_NOTEBOOK;
	}

	async onOpen(): Promise<void> {
		if (!this.currentSpec() && this.controller.generators.length > 0) {
			this.generatorId = this.controller.generators[0]!.id;
		}
		await this.loadHistoryForCurrentGenerator();
		this.render();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private currentSpec(): GeneratorSpec | undefined {
		return this.controller.getGeneratorById(this.generatorId);
	}

	private async loadHistoryForCurrentGenerator(): Promise<void> {
		this.history = await this.controller.storage.loadHistory(this.generatorId);
	}

	private async persistUiState(): Promise<void> {
		Object.assign(this.controller.settings, {
			lastGeneratorId: this.generatorId,
			lastGenre: this.genre,
			lastFamily: this.family,
			lastPlatform: this.platform,
			seriesMode: this.seriesMode,
			seriesStrategy: this.seriesStrategy,
			seriesVolumes: this.seriesVolumes,
		});
		await this.controller.saveSettings();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("titleforge-view");

		const spec = this.currentSpec();
		if (!spec) {
			contentEl.createDiv({
				cls: "titleforge-empty",
				text: "No title generators are loaded.",
			});
			return;
		}

		contentEl.createEl("h2", { text: "titleForge" });
		contentEl.createDiv({ cls: "titleforge-blurb", text: spec.blurb });

		this.renderControls(contentEl, spec);
		this.renderResult(contentEl, spec);
		this.renderHistory(contentEl, spec);
	}

	private renderControls(container: HTMLElement, spec: GeneratorSpec): void {
		const row = container.createDiv({ cls: "titleforge-row" });

		this.renderSelect(
			row,
			"Tradition",
			this.controller.generators.map((g) => ({ id: g.id, label: g.name })),
			this.generatorId,
			(value) => {
				this.generatorId = value;
				this.genre = "all";
				this.family = "all";
				this.platform = "all";
				this.last = null;
				void this.persistUiState();
				void this.loadHistoryForCurrentGenerator().then(() => this.render());
			},
		);

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

		const seriesRow = container.createDiv({ cls: "titleforge-row" });
		const seriesLabel = seriesRow.createEl("label", { cls: "titleforge-series-toggle" });
		const seriesCheckbox = seriesLabel.createEl("input", { type: "checkbox" });
		seriesCheckbox.checked = this.seriesMode;
		seriesLabel.createSpan({ text: " Series" });
		seriesCheckbox.addEventListener("change", () => {
			this.seriesMode = seriesCheckbox.checked;
			void this.persistUiState();
			this.render();
		});

		if (this.seriesMode) {
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

		const actions = container.createDiv({ cls: "titleforge-actions" });
		const generateButton = actions.createEl("button", {
			text: this.seriesMode ? "Generate series" : "Generate title",
			cls: "mod-cta",
		});
		generateButton.addEventListener("click", () => void this.handleGenerate());
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

	private async handleGenerate(): Promise<void> {
		const spec = this.currentSpec();
		if (!spec) return;
		const baseOptions = { genre: this.genre, family: this.family, platform: this.platform };
		const exclude = this.history.map((e) => e.title);

		try {
			if (this.seriesMode) {
				const result = generateSeries(spec, {
					...baseOptions,
					strategy: this.seriesStrategy,
					volumes: this.seriesVolumes,
					exclude,
				});
				this.last = { kind: "series", result };
				await this.controller.storage.appendHistory(toEntry(result.series));
				for (const volume of result.volumes) {
					await this.controller.storage.appendHistory(toEntry(volume));
				}
			} else {
				const result = generateOne(spec, { ...baseOptions, exclude });
				this.last = { kind: "single", result };
				await this.controller.storage.appendHistory(toEntry(result));
			}
			await this.loadHistoryForCurrentGenerator();
			this.render();
		} catch (err) {
			new Notice(`titleForge: could not generate a title — ${(err as Error).message}`);
		}
	}

	private async toggleKept(entry: HistoryEntry): Promise<void> {
		const index = this.history.findIndex(
			(e) => e.seed === entry.seed && e.title === entry.title && e.at === entry.at,
		);
		if (index === -1) return;
		this.history[index] = { ...this.history[index]!, kept: !this.history[index]!.kept };
		await this.controller.storage.saveHistory(this.generatorId, this.history);
		this.render();
	}

	private renderResult(container: HTMLElement, spec: GeneratorSpec): void {
		if (!this.last) return;
		const panel = container.createDiv({ cls: "titleforge-result" });

		if (this.last.kind === "single") {
			this.renderTitleCard(panel, spec, this.last.result);
			return;
		}

		const series = this.last.result;
		panel.createDiv({
			cls: "titleforge-series-label",
			text: `${series.strategy[0]!.toUpperCase()}${series.strategy.slice(1)} series`,
		});
		this.renderTitleCard(panel, spec, series.series, "Series title");
		const volumesEl = panel.createDiv({ cls: "titleforge-volumes-list" });
		series.volumes.forEach((volume, i) => {
			this.renderTitleCard(volumesEl, spec, volume, `Volume ${i + 1}`);
		});
		if (series.anchorWord) {
			panel.createDiv({
				cls: "titleforge-anchor-note",
				text: `Anchored on "${series.anchorWord}"${series.anchorSlot ? ` (${series.anchorSlot})` : ""}.`,
			});
		}
	}

	private renderTitleCard(
		container: HTMLElement,
		spec: GeneratorSpec,
		result: TitleResult,
		label?: string,
	): void {
		const card = container.createDiv({ cls: "titleforge-card" });
		if (label) card.createDiv({ cls: "titleforge-card-label", text: label });
		card.createDiv({ cls: "titleforge-title", text: result.title || "(nothing eligible)" });
		if (result.constraintRelaxed) {
			card.createDiv({
				cls: "titleforge-warning",
				text: "The requested constraint couldn't be fully satisfied — closest attempt shown.",
			});
		}

		const pattern = spec.patterns.find((p) => p.id === result.patternId);
		if (pattern) {
			const why = card.createEl("details", { cls: "titleforge-why" });
			why.createEl("summary", { text: `Why this shape — ${pattern.label}` });
			const body = why.createDiv();
			body.createEl("p", { text: pattern.note });
			body.createEl("p", { cls: "titleforge-exemplar", text: `Modelled on: ${pattern.exemplar}` });
		}

		const entry = this.history.find((e) => e.seed === result.seed && e.title === result.title);
		if (entry) {
			const keepButton = card.createEl("button", {
				text: entry.kept ? "★ Kept" : "☆ Keep",
				cls: "titleforge-keep-button",
			});
			keepButton.addEventListener("click", () => void this.toggleKept(entry));
		}
	}

	private renderHistory(container: HTMLElement, spec: GeneratorSpec): void {
		const section = container.createDiv({ cls: "titleforge-history" });
		section.createEl("h3", { text: "History" });
		if (this.history.length === 0) {
			section.createDiv({
				cls: "titleforge-empty",
				text: "Nothing generated yet for this tradition.",
			});
			return;
		}
		const list = section.createEl("ul", { cls: "titleforge-history-list" });
		const recent = [...this.history].reverse().slice(0, 30);
		for (const entry of recent) {
			const item = list.createEl("li", { cls: "titleforge-history-item" });
			item.createSpan({ cls: "titleforge-history-title", text: entry.title });
			if (entry.kept) item.createSpan({ cls: "titleforge-history-kept", text: " ★" });
			const replayButton = item.createEl("button", {
				text: "Replay",
				cls: "titleforge-history-replay",
			});
			replayButton.addEventListener("click", () => {
				const replayed = replay(spec, entry);
				this.last = { kind: "single", result: replayed };
				this.render();
			});
		}
	}
}
