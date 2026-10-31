import { getBookWordStats } from "../../core/history";
import { todayISOInEngland } from "../../core/historyMath";
import { excludedByDay, storytellingTodayAndWeek } from "../../core/sessionFigures";
import { libraryChapterPath } from "../../core/paths";
import { formatWordCount } from "../../core/wordCount";
import { STATS_COUNTS, type StatsCount } from "../../app/settings";
import { el } from "../kit/dom";
import { countIcon, graphIcon } from "../kit/statsIcons";
import { attachTooltip } from "../kit/tooltip";
import type { AppModel } from "../model";
import { openHistoryDialog } from "../screens/history/historyDialog";
import { netLabel } from "../screens/history/heatmap";
import { sessionContext } from "../sessionsContext";

/** What each count is called in its icon's name and tooltip (decision 69: "Words today; press for this week"). */
const NOUN: Record<StatsCount, string> = { day: "today", week: "this week", session: "this session", chapter: "this chapter", novel: "this novel" };

export const nextCount = (c: StatsCount): StatsCount => STATS_COUNTS[(STATS_COUNTS.indexOf(c) + 1) % STATS_COUNTS.length]!;
export const countLabel = (c: StatsCount): string => `Words ${NOUN[c]}`;
export const countButtonLabel = (c: StatsCount): string => `${countLabel(c)}; press for ${NOUN[nextCount(c)]}`;

const figure = (n: number): string => (n < 0 ? netLabel(n) : formatWordCount(n));

/** `12:34`, or `1:02:03` past the hour: how long the current session has run. */
export function elapsedLabel(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = String(total % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * The stats (decision 68): the graph icon (opens the history view), the icon of the count on display, and its number.
 * Clicking the count icon steps day, week, session, chapter, novel. The row is built once and updated in place, so
 * stepping with the keyboard keeps focus.
 */
export function mountStats(host: HTMLElement, model: AppModel): () => void {
	let counts: Record<Exclude<StatsCount, "session">, number> = { day: 0, week: 0, chapter: 0, novel: 0 };
	let generation = 0;
	host.classList.add("sf-stats");

	const sessionNet = (): number => model.running?.sessions?.live()?.net ?? 0;
	const current = (): number => (model.nav.statsCount === "session" ? sessionNet() : counts[model.nav.statsCount]);

	const history = el("button", { class: "sf-stats-chart", attrs: { type: "button", "aria-label": "Open the history" } }, graphIcon());
	history.addEventListener("click", () => openHistoryDialog(model));
	attachTooltip(history, "Word-count history");

	const step = el("button", { class: "sf-stats-count", attrs: { type: "button" } });
	step.addEventListener("click", () => {
		step.focus({ preventScroll: true }); // WebKit doesn't focus a button on click
		model.setStatsCount(nextCount(model.nav.statsCount));
		draw();
	});
	attachTooltip(step, () => countButtonLabel(model.nav.statsCount));

	// The number is the live region: its hidden text names what it counts, so a change is announced whole.
	const number = el("span", { class: "sf-stats-value", attrs: { "aria-live": "polite" } });
	const numberText = el("span", { attrs: { "aria-hidden": "true" } });
	const numberName = el("span", { class: "sf-visually-hidden" });
	number.append(numberName, numberText);

	// The live readout (an option, off by default): the session so far, redrawn at most once a second, quietly.
	const readout = el("span", { class: "sf-stats-session", attrs: { "data-testid": "session-readout" } });
	const drawReadout = (): void => {
		const on = model.running?.settings.values.showSessionReadout === true;
		const live = on ? model.running?.sessions?.live() ?? null : null;
		readout.hidden = !live;
		if (!live) return void readout.replaceChildren();
		readout.textContent = `session ${elapsedLabel(Date.now() - live.startMs)}, ${figure(live.net)} words`;
	};

	const draw = (): void => {
		const c = model.nav.statsCount;
		step.replaceChildren(countIcon(c));
		step.setAttribute("aria-label", countButtonLabel(c));
		numberName.textContent = `${countLabel(c)}: `;
		numberText.textContent = figure(current());
	};
	const drawNumber = (): void => {
		numberText.textContent = figure(current());
	};
	const ticker = setInterval(() => (drawReadout(), model.nav.statsCount === "session" && drawNumber()), 1000);

	const refresh = async (): Promise<void> => {
		const running = model.running;
		if (!running) return;
		const mine = ++generation;
		const project = running.opened.project;
		const { book, chapter } = model.nav;
		let day = 0;
		let week = 0;
		let novel = 0;
		if (book) {
			try {
				const s = await getBookWordStats(project, book);
				// The storytelling figures: editing and unreliable sessions are left out (docs/sessions.md §7).
				const sessions = sessionContext(model);
				const figures = storytellingTodayAndWeek(s.todayNet, s.weekNet, sessions ? excludedByDay(sessions.read.sessions, sessions.settings, book) : {}, todayISOInEngland());
				day = figures.today;
				week = figures.week;
				novel = s.current;
			} catch {
				/* a book whose details can't be read shows zeros */
			}
		}
		const chapterCount = book && chapter ? project.wordCount(libraryChapterPath(book, chapter)) : 0;
		if (mine !== generation) return;
		counts = { day, week, chapter: chapterCount, novel };
		if (host.isConnected) draw();
	};

	host.replaceChildren(history, step, number, readout);
	draw();
	drawReadout();
	void refresh();
	const off = model.subscribe(["stats", "nav", "library", "project", "sessions"], () => void refresh());
	const offReadout = model.subscribe(["sessions", "settings", "project"], () => (drawReadout(), drawNumber()));
	return () => (off(), offReadout(), clearInterval(ticker));
}
