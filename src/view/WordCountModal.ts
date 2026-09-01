import { App, Modal, setIcon, setTooltip } from "obsidian";
import { numberedChapterTitle } from "../book";
import { numberedBookTitle } from "../series";
import type { NumberingStyle } from "../numberingStyle";
import { formatSingleLine, splitTitleSubtitle } from "../titleNumbering";
import {
	ICON_BOOK_DUOTONE,
	ICON_BOOK_OPEN_FILLED,
	ICON_CALENDAR_EVENT,
	ICON_CALENDAR_WEEK,
} from "../icons";
import { formatWordCount } from "../wordCount";
import { makeAccessibleActivatable } from "./a11y";
import { MODE_ORDER, type StatsMode } from "./StatsPanel";
import {
	addDaysISO,
	dayNetsFromStats,
	defaultHeatmapRange,
	getBookWordStats,
	getProjectWordStats,
	isoWeekNumber,
	mostRecentMondayISO,
	todayISOInEngland,
	weekNetsFromDayNets,
	type BookWordStats,
	type DayNet,
	type ProjectWordStats,
	type WeekNet,
} from "../history";

export interface WordCountModalOptions {
	statsMode?: StatsMode;
	seriesNumberingStyle?: NumberingStyle;
	chapterNumberingStyle?: NumberingStyle;
	onSelectStatsMode?: (mode: StatsMode) => void;
}

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
	private statsMode: StatsMode;
	private seriesNumberingStyle: NumberingStyle;
	private chapterNumberingStyle: NumberingStyle;
	private onSelectStatsMode?: (mode: StatsMode) => void;

	constructor(app: App, bookFolderName: string, options: WordCountModalOptions = {}) {
		super(app);
		this.bookFolderName = bookFolderName;
		this.selectedDate = todayISOInEngland();
		this.statsMode = options.statsMode ?? "daily";
		this.seriesNumberingStyle = options.seriesNumberingStyle ?? "arabic";
		this.chapterNumberingStyle = options.chapterNumberingStyle ?? "arabic";
		this.onSelectStatsMode = options.onSelectStatsMode;
	}

	onOpen(): void {
		this.modalEl.addClass("sf-wordcount-modal");
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

		if (!this.bookStats || !this.projectStats) {
			contentEl.createDiv({ cls: "sf-empty", text: "Loading…" });
			return;
		}

		const body = contentEl.createDiv({ cls: "sf-wordcount-modal-body" });
		this.renderBookSummary(body, this.bookStats);
		this.renderHeatmaps(body, this.bookStats);
		const explore = body.createDiv({ cls: "sf-wordcount-explore-row" });
		this.renderChapterBreakdown(explore, this.bookStats);
		this.renderStatsModePicker(explore);
		this.renderSeriesRollup(body, this.projectStats);
	}

	private renderSeriesRollup(parent: HTMLElement, project: ProjectWordStats): void {
		const strip = parent.createDiv({ cls: "sf-wordcount-rollup" });
		strip.createSpan({ cls: "sf-wordcount-rollup-label", text: "all novels" });
		strip.createSpan({
			cls: "sf-wordcount-rollup-values",
			text: `current ${project.current} · written ${project.lifetimeWritten} · removed ${project.lifetimeRemoved}`,
		});
	}

	private renderBookSummary(parent: HTMLElement, stats: BookWordStats): void {
		const section = parent.createDiv({ cls: "sf-wordcount-section sf-wordcount-book-summary" });
		const { title, subtitle } = splitTitleSubtitle(
			numberedBookTitle(this.app, this.bookFolderName, undefined, this.seriesNumberingStyle),
		);
		const titleEl = section.createDiv({ cls: "sf-wordcount-book-title" });
		titleEl.createSpan({ cls: "sf-wordcount-book-name", text: title });
		if (subtitle) {
			titleEl.createSpan({ cls: "sf-wordcount-book-subtitle", text: ` (${subtitle})` });
		}

		section.createDiv({
			cls: "sf-wordcount-summary-line",
			text: `current ${stats.current} · written ${stats.lifetimeWritten} · removed ${stats.lifetimeRemoved}`,
		});
	}

	private renderHeatmaps(parent: HTMLElement, stats: BookWordStats): void {
		const today = todayISOInEngland();
		const { fromISO, toISO } = defaultHeatmapRange(today);
		const dayNets = dayNetsFromStats(stats, fromISO, toISO);
		const weekNets = weekNetsFromDayNets(dayNets);
		const maxAbs = Math.max(1, ...dayNets.map((d) => Math.abs(d.net)), ...weekNets.map((w) => Math.abs(w.net)));

		const section = parent.createDiv({ cls: "sf-wordcount-section sf-wordcount-heatmaps" });
		this.renderDayHeatmap(section, dayNets, maxAbs);
		this.renderWeekHeatmap(section, weekNets, maxAbs);
	}

	private renderDayHeatmap(parent: HTMLElement, dayNets: DayNet[], maxAbs: number): void {
		const box = parent.createDiv({
			cls: "sf-wordcount-heatmap-box",
			attr: { "aria-label": "days" },
		});
		const icon = box.createSpan({ cls: "sf-wordcount-heatmap-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, ICON_CALENDAR_EVENT);
		const grid = box.createDiv({ cls: "sf-wordcount-heatmap sf-wordcount-heatmap-days" });
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
				const selected = this.selectedWeekStart == null && date === this.selectedDate;
				const cell = col.createDiv({
					cls: `sf-wordcount-heat-cell ${heatClass(net, maxAbs)}${selected ? " is-selected" : ""}`,
					attr: {
						"aria-label": `${date}: ${formatSignedWordCount(net)}`,
						role: "button",
						tabindex: "0",
					},
				});
				setTooltip(cell, `${date}: ${formatSignedWordCount(net)}`);
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
		const box = parent.createDiv({
			cls: "sf-wordcount-heatmap-box sf-wordcount-heatmap-box-weeks",
			attr: { "aria-label": "weeks" },
		});
		const icon = box.createSpan({ cls: "sf-wordcount-heatmap-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, ICON_CALENDAR_WEEK);
		const row = box.createDiv({ cls: "sf-wordcount-heatmap sf-wordcount-heatmap-weeks" });
		for (const { weekStart, net } of weekNets) {
			const cell = row.createDiv({
				cls: `sf-wordcount-heat-cell sf-wordcount-heat-week ${heatClass(net, maxAbs)}${this.selectedWeekStart === weekStart ? " is-selected" : ""}`,
				attr: {
					"aria-label": `week of ${weekStart}: ${formatSignedWordCount(net)}`,
					role: "button",
					tabindex: "0",
				},
			});
			setTooltip(cell, `week of ${weekStart}: ${formatSignedWordCount(net)}`);
			const select = () => {
				this.selectedWeekStart = weekStart;
				this.render();
			};
			cell.addEventListener("click", select);
			makeAccessibleActivatable(cell, select);
		}
	}

	private renderChapterBreakdown(parent: HTMLElement, stats: BookWordStats): void {
		const section = parent.createDiv({ cls: "sf-wordcount-section sf-wordcount-chapters" });
		const weekStart = this.selectedWeekStart;
		const label =
			weekStart != null
				? `w/c ${weekStart} (week ${isoWeekNumber(weekStart)})`
				: this.selectedDate;
		const { chapters, net } =
			weekStart != null
				? chapterNetsForRange(stats, weekStart, addDaysISO(weekStart, 6))
				: {
						chapters: stats.daily[this.selectedDate]?.chapters ?? {},
						net: stats.daily[this.selectedDate]?.net ?? 0,
					};
		const header = section.createDiv({ cls: "sf-wordcount-chapters-header" });
		header.createSpan({ cls: "sf-wordcount-section-title", text: label });
		header.createSpan({ cls: "sf-wordcount-running-total", text: formatSignedWordCount(net) });
		const list = section.createDiv({ cls: "sf-wordcount-chapter-list" });
		const names = Object.keys(chapters).sort();
		if (names.length === 0) {
			list.createDiv({
				cls: "sf-empty",
				text: weekStart != null ? "No chapter activity this week." : "No chapter activity this day.",
			});
		} else {
			for (const filename of names) {
				const row = list.createDiv({ cls: "sf-wordcount-chapter-row" });
				const title = formatSingleLine(
					numberedChapterTitle(this.app, this.bookFolderName, filename, this.chapterNumberingStyle),
				);
				row.createSpan({ cls: "sf-wordcount-chapter-title", text: title });
				const chapterNet = chapters[filename] ?? 0;
				row.createSpan({
					cls: "sf-wordcount-chapter-net",
					text: formatSignedWordCount(chapterNet),
				});
			}
		}
	}

	private renderStatsModePicker(parent: HTMLElement): void {
		const wrap = parent.createDiv({ cls: "sf-wordcount-mode-picker" });
		wrap.createSpan({ cls: "sf-wordcount-section-title", text: "display" });
		const icons = wrap.createDiv({ cls: "sf-wordcount-mode-icons" });
		for (const mode of MODE_ORDER) {
			const choice = MODE_CHOICES[mode];
			const btn = icons.createSpan({
				cls: `sf-wordcount-mode-btn${this.statsMode === mode ? " is-active" : ""}`,
				attr: {
					"aria-label": choice.tooltip,
					"aria-pressed": this.statsMode === mode ? "true" : "false",
				},
			});
			setIcon(btn, choice.icon);
			setTooltip(btn, choice.tooltip);
			const select = () => {
				this.statsMode = mode;
				this.onSelectStatsMode?.(mode);
				for (const child of Array.from(icons.children)) {
					const on = child === btn;
					child.classList.toggle("is-active", on);
					child.setAttribute("aria-pressed", on ? "true" : "false");
				}
			};
			btn.addEventListener("click", select);
			makeAccessibleActivatable(btn, select);
		}
	}
}

function heatClass(net: number, maxAbs: number): string {
	if (net === 0) return "sf-heat-0";
	const intensity = Math.min(4, Math.max(1, Math.ceil((Math.abs(net) / maxAbs) * 4)));
	return net > 0 ? `sf-heat-pos-${intensity}` : `sf-heat-neg-${intensity}`;
}

const MODE_CHOICES: Record<StatsMode, { icon: string; tooltip: string }> = {
	daily: { icon: ICON_CALENDAR_EVENT, tooltip: "daily wordcount" },
	weekly: { icon: ICON_CALENDAR_WEEK, tooltip: "weekly wordcount" },
	chapter: { icon: ICON_BOOK_OPEN_FILLED, tooltip: "chapter wordcount" },
	story: { icon: ICON_BOOK_DUOTONE, tooltip: "novel wordcount" },
};

function formatSignedWordCount(n: number): string {
	const formatted = formatWordCount(Math.abs(n));
	if (n > 0) return `+${formatted}`;
	if (n < 0) return `-${formatted}`;
	return formatted;
}

function chapterNetsForRange(
	stats: BookWordStats,
	fromISO: string,
	toISO: string,
): { chapters: Record<string, number>; net: number } {
	const chapters: Record<string, number> = {};
	let net = 0;
	for (let date = fromISO; date <= toISO; date = addDaysISO(date, 1)) {
		const entry = stats.daily[date];
		if (!entry) continue;
		net += entry.net;
		for (const [filename, chapterNet] of Object.entries(entry.chapters)) {
			chapters[filename] = (chapters[filename] ?? 0) + chapterNet;
		}
	}
	return { chapters, net };
}
