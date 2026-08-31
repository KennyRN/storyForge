import { setIcon } from "obsidian";
import { ICON_CALENDAR, ICON_DASHBOARD_CHART } from "../icons";
import { makeAccessibleActivatable } from "./a11y";

export type StatsMode = "daily" | "weekly" | "chapter" | "story";

export const MODE_ORDER: StatsMode[] = ["daily", "weekly", "chapter", "story"];

export const MODE_LABELS: Record<StatsMode, string> = {
	daily: "daily wordcount",
	weekly: "weekly wordcount",
	chapter: "chapter wordcount",
	story: "story wordcount",
};

export function isStatsMode(value: string): value is StatsMode {
	return MODE_ORDER.includes(value as StatsMode);
}

export interface StatsPanelOptions {
	mode: StatsMode;
	counts: Record<StatsMode, number>;
	onOpenHistory?: () => void;
}

export function renderStatsPanel(container: HTMLElement, options: StatsPanelOptions): void {
	container.empty();

	const line = container.createDiv({ cls: "sf-stats-line" });
	setIcon(line.createSpan({ cls: "sf-icon sf-stats-chart", attr: { "aria-label": "stats" } }), ICON_DASHBOARD_CHART);
	line.createSpan({
		cls: "sf-stats-value",
		text: `${MODE_LABELS[options.mode]}: ${options.counts[options.mode]}`,
	});

	const calendarBtn = line.createSpan({
		cls: "sf-icon sf-stats-calendar",
		attr: { "aria-label": "wordcount history" },
	});
	setIcon(calendarBtn, ICON_CALENDAR);
	if (options.onOpenHistory) {
		calendarBtn.addEventListener("click", () => options.onOpenHistory?.());
		makeAccessibleActivatable(calendarBtn, () => options.onOpenHistory?.());
	}
}
