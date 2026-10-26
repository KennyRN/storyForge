import { getBookWordStats } from "../../core/history";
import { todayISOInEngland } from "../../core/historyMath";
import { excludedByDay, storytellingTodayAndWeek } from "../../core/sessionFigures";
import { libraryChapterPath } from "../../core/paths";
import { formatWordCount } from "../../core/wordCount";
import { button } from "../kit/button";
import { el, fill } from "../kit/dom";
import { icon } from "../kit/icons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";
import { openHistoryDialog } from "../screens/history/historyDialog";
import { netLabel } from "../screens/history/heatmap";
import { sessionContext } from "../sessionsContext";

export type StatsMode = "daily" | "weekly" | "chapter" | "story";
export const MODE_ORDER: StatsMode[] = ["daily", "weekly", "chapter", "story"];
export const MODE_LABELS: Record<StatsMode, string> = { daily: "daily", weekly: "weekly", chapter: "chapter", story: "novel" };

/** Hover copy for the stats line: lowercase, with a blank line before chapter and novel (as in the harness). */
export function formatStatsHoverTooltip(counts: Record<StatsMode, number>): string {
	return ["wordcount", `daily: ${formatWordCount(counts.daily)}`, `weekly: ${formatWordCount(counts.weekly)}`, "", `chapter: ${formatWordCount(counts.chapter)}`, `novel: ${formatWordCount(counts.story)}`].join("\n");
}

/** `12:34`, or `1:02:03` past the hour: how long the current session has run. */
export function elapsedLabel(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = String(total % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** The stats: the daily, weekly, chapter and novel counts, one at a time, with a switch. Clicking the chart opens the history view. */
export function mountStats(host: HTMLElement, model: AppModel): () => void {
	let mode: StatsMode = "daily";
	let counts: Record<StatsMode, number> = { daily: 0, weekly: 0, chapter: 0, story: 0 };
	let generation = 0;
	host.classList.add("sf-stats");
	// The live readout (an option, off by default): the session so far, redrawn at most once a second, quietly.
	const readout = el("span", { class: "sf-stats-session sf-muted", attrs: { "data-testid": "session-readout" } });
	const drawReadout = (): void => {
		const on = model.running?.settings.values.showSessionReadout === true;
		const live = on ? model.running?.sessions?.live() ?? null : null;
		readout.hidden = !live;
		if (!live) return void readout.replaceChildren();
		readout.textContent = `session ${elapsedLabel(Date.now() - live.startMs)}, ${live.net < 0 ? netLabel(live.net) : formatWordCount(live.net)} words`;
	};
	const ticker = setInterval(drawReadout, 1000);

	const draw = (): void => {
		const tip = formatStatsHoverTooltip(counts);
		const chart = el("span", { class: "sf-stats-chart", attrs: { tabindex: "0", role: "button", "aria-label": `${tip.replace(/\n+/g, ", ")}. Open the history` } }, icon("layers", 16));
		chart.addEventListener("click", () => openHistoryDialog(model));
		chart.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") (e.preventDefault(), openHistoryDialog(model));
		});
		attachTooltip(chart, tip);
		const next = button({ icon: "switch", tooltip: "Switch wordcount", onClick: () => ((mode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]), draw()) });
		fill(host, chart, el("span", { class: "sf-stats-value", attrs: { "aria-live": "polite" }, text: `${MODE_LABELS[mode]}: ${formatWordCount(counts[mode])}` }), next, readout);
		drawReadout();
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
				// The storytelling figures: editing and unreliable sessions are left out (docs/sessions.md §7).
				const sessions = sessionContext(model);
				const figures = storytellingTodayAndWeek(s.todayNet, s.weekNet, sessions ? excludedByDay(sessions.read.sessions, sessions.settings, book) : {}, todayISOInEngland());
				daily = figures.today;
				weekly = figures.week;
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
	const off = model.subscribe(["stats", "nav", "library", "project", "sessions"], () => void refresh());
	const offReadout = model.subscribe(["sessions", "settings", "project"], drawReadout);
	return () => (off(), offReadout(), clearInterval(ticker));
}
