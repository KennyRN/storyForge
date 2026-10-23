import { getBookWordStats } from "../../core/history";
import { libraryChapterPath } from "../../core/paths";
import { formatWordCount } from "../../core/wordCount";
import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import { icon } from "../kit/icons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";

export type StatsMode = "daily" | "weekly" | "chapter" | "story";
export const MODE_ORDER: StatsMode[] = ["daily", "weekly", "chapter", "story"];
export const MODE_LABELS: Record<StatsMode, string> = { daily: "daily", weekly: "weekly", chapter: "chapter", story: "novel" };

/** Hover copy for the stats line: lowercase, with a blank line before chapter and novel (as in the harness). */
export function formatStatsHoverTooltip(counts: Record<StatsMode, number>): string {
	return ["wordcount", `daily: ${formatWordCount(counts.daily)}`, `weekly: ${formatWordCount(counts.weekly)}`, "", `chapter: ${formatWordCount(counts.chapter)}`, `novel: ${formatWordCount(counts.story)}`].join("\n");
}

/** The stats: the daily, weekly, chapter and novel counts, one at a time, with a switch. (The history view is v1.1.) */
export function mountStats(host: HTMLElement, model: AppModel): () => void {
	let mode: StatsMode = "daily";
	let counts: Record<StatsMode, number> = { daily: 0, weekly: 0, chapter: 0, story: 0 };
	let generation = 0;
	host.classList.add("sf-stats");

	const draw = (): void => {
		const tip = formatStatsHoverTooltip(counts);
		const chart = el("span", { class: "sf-stats-chart", attrs: { tabindex: "0", role: "img", "aria-label": tip.replace(/\n+/g, ", ") } }, icon("layers", 16));
		attachTooltip(chart, tip);
		const next = button({ icon: "switch", tooltip: "Switch wordcount", onClick: () => ((mode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]), draw()) });
		fill(host, chart, el("span", { class: "sf-stats-value", attrs: { "aria-live": "polite" }, text: `${MODE_LABELS[mode]}: ${formatWordCount(counts[mode])}` }), next);
	};

	const refresh = async (): Promise<void> => {
		const running = model.running;
		if (!running) return;
		const mine = ++generation;
		const project = running.opened.project;
		const { book, chapter } = model.nav;
		let daily = 0;
		let weekly = 0;
		let story = 0;
		if (book) {
			try {
				const s = await getBookWordStats(project, book);
				daily = s.todayNet;
				weekly = s.weekNet;
				story = s.current;
			} catch {
				/* a book whose details can't be read shows zeros */
			}
		}
		const chapterCount = book && chapter ? project.wordCount(libraryChapterPath(book, chapter)) : 0;
		if (mine !== generation) return;
		counts = { daily, weekly, chapter: chapterCount, story };
		if (host.isConnected) draw();
	};

	draw();
	void refresh();
	return model.subscribe(["stats", "nav", "library", "project"], () => void refresh());
}
