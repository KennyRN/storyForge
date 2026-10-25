import { addDaysISO, isoWeekNumber, mostRecentMondayISO, type DayNet, type WeekNet } from "../../../core/historyMath";
import { formatWordCount } from "../../../core/wordCount";
import { el } from "../../kit/dom";
import { attachTooltip } from "../../kit/tooltip";

/** 0 for a day with no writing; 1-4 by the day's share of the largest absolute value in the range, rounded up. */
export function heatStep(net: number, maxAbs: number): number {
	if (net === 0 || maxAbs <= 0) return 0;
	return Math.min(4, Math.max(1, Math.ceil((Math.abs(net) / maxAbs) * 4)));
}

/** Days and weeks share one scale (as in 0.17.1). */
export function heatScale(days: DayNet[], weeks: WeekNet[]): number {
	return Math.max(0, ...days.map((d) => Math.abs(d.net)), ...weeks.map((w) => Math.abs(w.net)));
}

export function heatClass(net: number, maxAbs: number): string {
	const step = heatStep(net, maxAbs);
	if (step === 0) return "sf-heat--empty";
	return net < 0 ? `sf-heat--loss-${step}` : `sf-heat--${step}`;
}

/** "1,240 words", or "net loss of 120 words": colour is never the only way to read a cell. */
export function netLabel(net: number): string {
	if (net < 0) return `net loss of ${formatWordCount(-net)}`;
	return formatWordCount(net);
}

export function dayLabel(dateISO: string, net: number): string {
	const date = new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
	return `${date}: ${netLabel(net)}`;
}

export function weekLabel(weekStart: string, net: number): string {
	const date = new Date(`${weekStart}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
	return `Week ${isoWeekNumber(weekStart)}, from ${date}: ${netLabel(net)}`;
}

export interface DayHeatmapOptions {
	days: DayNet[];
	maxAbs: number;
	selected: string | null;
	onSelect: (dateISO: string) => void;
}

/** Weeks as columns (Monday first), weekdays as rows. Arrow keys move between days. */
export function dayHeatmap(opts: DayHeatmapOptions): HTMLElement {
	const byDate = new Map(opts.days.map((d) => [d.date, d.net]));
	const first = opts.days.length ? mostRecentMondayISO(opts.days[0].date) : null;
	const grid = el("div", { class: "sf-heat-grid", attrs: { role: "grid", "aria-label": "Words per day" } });
	if (!first) return grid;
	const last = opts.days[opts.days.length - 1].date;
	const weekCount = Math.round((Date.parse(mostRecentMondayISO(last)) - Date.parse(first)) / (7 * 86400000)) + 1;
	const focusable = opts.selected && byDate.has(opts.selected) ? opts.selected : last;
	for (let row = 0; row < 7; row++) {
		const r = el("div", { class: "sf-heat-row", attrs: { role: "row" } });
		for (let col = 0; col < weekCount; col++) {
			const date = addDaysISO(first, col * 7 + row);
			const net = byDate.get(date);
			if (net === undefined) {
				r.append(el("span", { class: "sf-heat-cell sf-heat--none", attrs: { "aria-hidden": "true" } }));
				continue;
			}
			const label = dayLabel(date, net);
			const cell = el("button", {
				class: `sf-heat-cell ${heatClass(net, opts.maxAbs)}`,
				dataset: { date },
				attrs: { type: "button", role: "gridcell", "aria-label": label, "aria-selected": String(opts.selected === date), tabindex: date === focusable ? "0" : "-1" },
				on: {
					click: () => opts.onSelect(date),
					keydown: (e) => {
						const move = e.key === "ArrowLeft" ? -7 : e.key === "ArrowRight" ? 7 : e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
						if (!move) return;
						const next = grid.querySelector<HTMLElement>(`[data-date="${addDaysISO(date, move)}"]`);
						if (!next) return;
						e.preventDefault();
						(e.currentTarget as HTMLElement).tabIndex = -1;
						next.tabIndex = 0;
						next.focus();
					},
				},
			});
			attachTooltip(cell, label);
			r.append(cell);
		}
		grid.append(r);
	}
	return grid;
}

/** One row of weeks. */
export function weekHeatmap(weeks: WeekNet[], maxAbs: number): HTMLElement {
	const row = el("div", { class: "sf-heat-row sf-heat-weeks", attrs: { role: "row" } });
	const grid = el("div", { class: "sf-heat-grid", attrs: { role: "grid", "aria-label": "Words per week" } }, row);
	weeks.forEach((w, i) => {
		const label = weekLabel(w.weekStart, w.net);
		const cell = el("span", { class: `sf-heat-cell ${heatClass(w.net, maxAbs)}`, attrs: { role: "gridcell", tabindex: i === weeks.length - 1 ? "0" : "-1", "aria-label": label } });
		attachTooltip(cell, label);
		row.append(cell);
	});
	return grid;
}
