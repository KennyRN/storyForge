import { App, Modal, setIcon, setTooltip } from "obsidian";
import { chapterDisplayTitle } from "../book";
import { bookDisplayTitle } from "../series";
import { formatSingleLine } from "../titleNumbering";
import { ICON_CALENDAR, ICON_DASHBOARD_CHART } from "../icons";
import { makeAccessibleActivatable } from "./a11y";
import {
	addDaysISO,
	dayNetsFromStats,
	defaultHeatmapRange,
	getBookWordStats,
	getProjectWordStats,
	mostRecentMondayISO,
	todayISOInEngland,
	weekNetsFromDayNets,
	type BookWordStats,
	type DayNet,
	type ProjectWordStats,
	type WeekNet,
} from "../history";

/**
 * Wordcount history modal: series rollup, current-book summary, day + week heatmaps,
 * and per-chapter breakdown for the selected day.
 */
export class WordCountModal extends Modal {
	private bookFolderName: string;
	private selectedDate: string;
	private selectedWeekStart: string | null = null;
	private bookStats: BookWordStats | null = null;
	private projectStats: ProjectWordStats | null = null;

	constructor(app: App, bookFolderName: string) {
		super(app);
		this.bookFolderName = bookFolderName;
		this.selectedDate = todayISOInEngland();
	}

	onOpen(): void {
		this.titleEl.remove();
		void this.loadAndRender();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async loadAndRender(): Promise<void> {
		this.bookStats = await getBookWordStats(this.app, this.bookFolderName);
		this.projectStats = await getProjectWordStats(this.app);
		this.render();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sf-wordcount-modal");

		const headerRow = contentEl.createDiv({ cls: "sf-wordcount-modal-header" });
		setIcon(headerRow.createSpan({ cls: "sf-icon" }), ICON_CALENDAR);
		headerRow.createEl("h2", { text: "Wordcount History" });

		if (!this.bookStats || !this.projectStats) {
			contentEl.createDiv({ cls: "sf-empty", text: "Loading…" });
			return;
		}

		this.renderSeriesRollup(contentEl, this.projectStats);
		this.renderBookSummary(contentEl, this.bookStats);
		this.renderHeatmaps(contentEl, this.bookStats);
		this.renderChapterBreakdown(contentEl, this.bookStats);
	}

	private renderSeriesRollup(parent: HTMLElement, project: ProjectWordStats): void {
		const strip = parent.createDiv({ cls: "sf-wordcount-rollup" });
		strip.createSpan({ cls: "sf-wordcount-rollup-label", text: "All novels" });
		strip.createSpan({
			cls: "sf-wordcount-rollup-values",
			text: `current ${project.current} · written ${project.lifetimeWritten} · removed ${project.lifetimeRemoved}`,
		});
	}

	private renderBookSummary(parent: HTMLElement, stats: BookWordStats): void {
		const section = parent.createDiv({ cls: "sf-wordcount-section" });
		const title = bookDisplayTitle(this.app, this.bookFolderName) || this.bookFolderName;
		const head = section.createDiv({ cls: "sf-wordcount-section-header" });
		setIcon(head.createSpan({ cls: "sf-icon" }), ICON_DASHBOARD_CHART);
		head.createSpan({ cls: "sf-wordcount-section-title", text: title });

		section.createDiv({
			cls: "sf-wordcount-summary-line",
			text: `current ${stats.current} · written ${stats.lifetimeWritten} · removed ${stats.lifetimeRemoved}`,
		});
		section.createDiv({
			cls: "sf-wordcount-summary-line",
			text: `today ${stats.todayNet} · this week ${stats.weekNet}`,
		});
	}

	private renderHeatmaps(parent: HTMLElement, stats: BookWordStats): void {
		const today = todayISOInEngland();
		const { fromISO, toISO } = defaultHeatmapRange(today);
		const dayNets = dayNetsFromStats(stats, fromISO, toISO);
		const weekNets = weekNetsFromDayNets(dayNets);
		const maxAbs = Math.max(1, ...dayNets.map((d) => Math.abs(d.net)), ...weekNets.map((w) => Math.abs(w.net)));

		const section = parent.createDiv({ cls: "sf-wordcount-section" });
		section.createDiv({ cls: "sf-wordcount-section-title", text: "Days" });
		this.renderDayHeatmap(section, dayNets, maxAbs);

		section.createDiv({ cls: "sf-wordcount-section-title sf-wordcount-weeks-title", text: "Weeks" });
		this.renderWeekHeatmap(section, weekNets, maxAbs);
	}

	private renderDayHeatmap(parent: HTMLElement, dayNets: DayNet[], maxAbs: number): void {
		const grid = parent.createDiv({ cls: "sf-wordcount-heatmap sf-wordcount-heatmap-days" });
		// Column-major GitHub style: weeks as columns, Mon–Sun as rows.
		const byDate = new Map(dayNets.map((d) => [d.date, d.net]));
		if (dayNets.length === 0) return;

		const start = mostRecentMondayISO(dayNets[0].date);
		const end = dayNets[dayNets.length - 1].date;
		const weeks: string[] = [];
		for (let monday = start; monday <= end; monday = addDaysISO(monday, 7)) {
			weeks.push(monday);
		}

		for (const monday of weeks) {
			const col = grid.createDiv({ cls: "sf-wordcount-heatmap-col" });
			for (let i = 0; i < 7; i++) {
				const date = addDaysISO(monday, i);
				if (date > end || date < dayNets[0].date) {
					col.createDiv({ cls: "sf-wordcount-heat-cell sf-wordcount-heat-empty" });
					continue;
				}
				const net = byDate.get(date) ?? 0;
				const cell = col.createDiv({
					cls: `sf-wordcount-heat-cell ${heatClass(net, maxAbs)}${date === this.selectedDate ? " is-selected" : ""}`,
					attr: {
						"aria-label": `${date}: ${net} words`,
						role: "button",
						tabindex: "0",
					},
				});
				setTooltip(cell, `${date}: ${net >= 0 ? "+" : ""}${net}`);
				const select = () => {
					this.selectedDate = date;
					this.selectedWeekStart = null;
					this.render();
				};
				cell.addEventListener("click", select);
				makeAccessibleActivatable(cell, select);
			}
		}
	}

	private renderWeekHeatmap(parent: HTMLElement, weekNets: WeekNet[], maxAbs: number): void {
		const row = parent.createDiv({ cls: "sf-wordcount-heatmap sf-wordcount-heatmap-weeks" });
		for (const { weekStart, net } of weekNets) {
			const cell = row.createDiv({
				cls: `sf-wordcount-heat-cell sf-wordcount-heat-week ${heatClass(net, maxAbs)}${this.selectedWeekStart === weekStart ? " is-selected" : ""}`,
				attr: {
					"aria-label": `Week of ${weekStart}: ${net} words`,
					role: "button",
					tabindex: "0",
				},
			});
			setTooltip(cell, `Week of ${weekStart}: ${net >= 0 ? "+" : ""}${net}`);
			const select = () => {
				this.selectedWeekStart = weekStart;
				// Land on the most recent day in the week that has data, else the Monday.
				const weekEnd = addDaysISO(weekStart, 6);
				const today = todayISOInEngland();
				const cappedEnd = weekEnd < today ? weekEnd : today;
				let pick = weekStart;
				if (this.bookStats) {
					for (let d = cappedEnd; d >= weekStart; d = addDaysISO(d, -1)) {
						if ((this.bookStats.daily[d]?.net ?? 0) !== 0) {
							pick = d;
							break;
						}
					}
					if (pick === weekStart && cappedEnd >= weekStart) pick = cappedEnd;
				}
				this.selectedDate = pick;
				this.render();
			};
			cell.addEventListener("click", select);
			makeAccessibleActivatable(cell, select);
		}
	}

	private renderChapterBreakdown(parent: HTMLElement, stats: BookWordStats): void {
		const section = parent.createDiv({ cls: "sf-wordcount-section" });
		const label =
			this.selectedWeekStart != null
				? `Chapters · ${this.selectedDate} (week of ${this.selectedWeekStart})`
				: `Chapters · ${this.selectedDate}`;
		section.createDiv({ cls: "sf-wordcount-section-title", text: label });

		const entry = stats.daily[this.selectedDate];
		const chapters = entry?.chapters ?? {};
		const names = Object.keys(chapters).sort();
		if (names.length === 0) {
			section.createDiv({ cls: "sf-empty", text: "No chapter activity this day." });
			return;
		}

		const list = section.createDiv({ cls: "sf-wordcount-chapter-list" });
		for (const filename of names) {
			const row = list.createDiv({ cls: "sf-wordcount-chapter-row" });
			const title = formatSingleLine(chapterDisplayTitle(this.app, this.bookFolderName, filename));
			row.createSpan({ cls: "sf-wordcount-chapter-title", text: title });
			const net = chapters[filename] ?? 0;
			row.createSpan({
				cls: "sf-wordcount-chapter-net",
				text: `${net >= 0 ? "+" : ""}${net}`,
			});
		}

		if (entry) {
			section.createDiv({
				cls: "sf-wordcount-day-total",
				text: `Day net: ${entry.net >= 0 ? "+" : ""}${entry.net}`,
			});
		}
	}
}

function heatClass(net: number, maxAbs: number): string {
	if (net === 0) return "sf-heat-0";
	const intensity = Math.min(4, Math.max(1, Math.ceil((Math.abs(net) / maxAbs) * 4)));
	return net > 0 ? `sf-heat-pos-${intensity}` : `sf-heat-neg-${intensity}`;
}
