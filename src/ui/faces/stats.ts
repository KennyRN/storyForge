import { getBookWordStats } from "../../core/history";
import { todayISOInEngland } from "../../core/historyMath";
import { excludedByDay, storytellingTodayAndWeek } from "../../core/sessionFigures";
import { libraryChapterPath } from "../../core/paths";
import { formatWordCount } from "../../core/wordCount";
import { STATS_COUNTS, type StatsCount } from "../../app/settings";
import { readoutState } from "../../core/sessionReadout";
import { el } from "../kit/dom";
import { clockIcon, countIcon, graphIcon, type ClockKind } from "../kit/statsIcons";
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

/** How often the readout (and the session count) is redrawn: a fresh `live()` read, so the words follow the typing within a quarter of a second. */
const READOUT_MS = 250;

const figure = (n: number): string => (n < 0 ? netLabel(n) : formatWordCount(n));

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

	// The live readout (an option, off by default; decision 68). With it on the row is always there: the clock, the
	// session's length so far (first edit to last, so it holds still while paused) and, unless session is the count
	// on display above, its words. Redrawn once a second, quietly.
	const clock = el("span", { class: "sf-stats-clock" });
	const length = el("span", { class: "sf-stats-length" });
	const words = el("span", { class: "sf-stats-words" });
	const readout = el("div", { class: "sf-stats-session", attrs: { "data-testid": "session-readout", role: "group", "aria-label": "Current session" } }, clock, length, words);
	let clockKind: ClockKind | null = null;
	const drawReadout = (): void => {
		const on = model.running?.settings.values.showSessionReadout === true;
		readout.hidden = !on;
		if (!on) return;
		const state = readoutState(model.running?.sessions?.live() ?? null, Date.now());
		const kind: ClockKind = state.net === null ? "idle" : state.paused ? "paused" : "session";
		if (kind !== clockKind) {
			clockKind = kind;
			clock.dataset.clock = kind;
			clock.replaceChildren(clockIcon(kind));
		}
		length.textContent = state.length;
		// The words are shown only while a session runs, and not twice when session is the count above.
		const show = state.net !== null && model.nav.statsCount !== "session";
		words.hidden = !show;
		words.replaceChildren(...(show ? [figure(state.net as number), el("span", { class: "sf-visually-hidden", text: " words" })] : []));
	};

	const draw = (): void => {
		const c = model.nav.statsCount;
		step.replaceChildren(countIcon(c));
		step.setAttribute("aria-label", countButtonLabel(c));
		numberName.textContent = `${countLabel(c)}: `;
		numberText.textContent = figure(current());
		drawReadout();
	};
	const drawNumber = (): void => {
		numberText.textContent = figure(current());
	};
	const ticker = setInterval(() => (drawReadout(), model.nav.statsCount === "session" && drawNumber()), READOUT_MS);

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
