import { setIcon } from "obsidian";
import { ICON_CALENDAR, ICON_DASHBOARD_CHART, ICON_EXCHANGE } from "../icons";
import { makeAccessibleActivatable } from "./a11y";

export type StatsMode = "daily" | "weekly" | "chapter" | "story";

const MODE_ORDER: StatsMode[] = ["daily", "weekly", "chapter", "story"];

const MODE_LABELS: Record<StatsMode, string> = {
	daily: "daily wordcount",
	weekly: "weekly wordcount",
	chapter: "chapter wordcount",
	story: "story wordcount",
};

export function nextStatsMode(mode: StatsMode): StatsMode {
	return MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];
}

export interface StatsPanelOptions {
	mode: StatsMode;
	counts: Record<StatsMode, number>;
	onToggleMode: () => void;
}

export function renderStatsPanel(container: HTMLElement, options: StatsPanelOptions): void {
	container.empty();

	const header = container.createDiv({ cls: "sf-stats-header" });
	setIcon(header.createSpan({ cls: "sf-icon" }), ICON_DASHBOARD_CHART);
	header.createSpan({ cls: "sf-stats-title", text: "Stats" });

	const line = container.createDiv({ cls: "sf-stats-line" });
	line.createSpan({
		cls: "sf-stats-value",
		text: `${MODE_LABELS[options.mode]}: ${options.counts[options.mode]}`,
	});

	const actions = line.createDiv({ cls: "sf-stats-actions" });
	const exchangeBtn = actions.createSpan({
		cls: "sf-icon sf-stats-exchange",
		attr: { "aria-label": "switch wordcount" },
	});
	setIcon(exchangeBtn, ICON_EXCHANGE);
	exchangeBtn.addEventListener("click", () => options.onToggleMode());
	makeAccessibleActivatable(exchangeBtn, () => options.onToggleMode());

	setIcon(actions.createSpan({ cls: "sf-icon sf-stats-calendar" }), ICON_CALENDAR);
}
