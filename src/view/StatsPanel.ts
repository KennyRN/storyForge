import { setIcon, setTooltip } from "obsidian";
import { ICON_DASHBOARD_CHART } from "../icons";
import { formatWordCount } from "../wordCount";
import { makeAccessibleActivatable } from "./a11y";

export type StatsMode = "daily" | "weekly" | "chapter" | "story";

export const MODE_ORDER: StatsMode[] = ["daily", "weekly", "chapter", "story"];

export const MODE_LABELS: Record<StatsMode, string> = {
	daily: "daily",
	weekly: "weekly",
	chapter: "chapter",
	story: "novel",
};

export function isStatsMode(value: string): value is StatsMode {
	return MODE_ORDER.includes(value as StatsMode);
}

export interface StatsPanelOptions {
	mode: StatsMode;
	counts: Record<StatsMode, number>;
	onOpenHistory?: () => void;
}

/** Hover copy for the storytelling stats chart — lowercase, with a blank line before chapter/novel. */
export function formatStatsHoverTooltip(counts: Record<StatsMode, number>): string {
	return [
		"wordcount",
		`daily: ${formatWordCount(counts.daily)}`,
		`weekly: ${formatWordCount(counts.weekly)}`,
		"",
		`chapter: ${formatWordCount(counts.chapter)}`,
		`novel: ${formatWordCount(counts.story)}`,
	].join("\n");
}

export function renderStatsPanel(container: HTMLElement, options: StatsPanelOptions): void {
	container.empty();

	const line = container.createDiv({ cls: "sf-stats-line" });
	const chart = line.createSpan({
		cls: options.onOpenHistory ? "sf-icon sf-stats-chart sf-stats-chart--button" : "sf-icon sf-stats-chart",
		attr: { "aria-label": options.onOpenHistory ? "wordcount history" : "stats" },
	});
	setIcon(chart, ICON_DASHBOARD_CHART);
	setTooltip(chart, formatStatsHoverTooltip(options.counts), { classes: ["sf-stats-wordcount-tooltip"] });
	if (options.onOpenHistory) {
		chart.addEventListener("click", () => options.onOpenHistory?.());
		makeAccessibleActivatable(chart, () => options.onOpenHistory?.());
	}
	line.createSpan({
		cls: "sf-stats-value",
		text: `${MODE_LABELS[options.mode]}: ${formatWordCount(options.counts[options.mode])}`,
	});
}
