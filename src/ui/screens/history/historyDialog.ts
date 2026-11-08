import { chapterDisplayTitle, getBookChapters, readBookFrontmatter } from "../../../core/book";
import { dayNetsFromStats, getBookWordStats, getProjectWordStats, heatmapStartMonday, weekNetsFromDayNets, type BookWordStats, type ProjectWordStats } from "../../../core/history";
import { addDaysISO, todayISOInEngland } from "../../../core/historyMath";
import { adjustDayNets, averagePace, excludedByDay, storytellingTodayAndWeek } from "../../../core/sessionFigures";
import type { SessionRecord } from "../../../core/sessions";
import { libraryChapterPath } from "../../../core/paths";
import { numberedBookTitle, readSeriesFrontmatter } from "../../../core/series";
import { applyHashNumbering } from "../../../core/titleNumbering";
import { formatWordCount } from "../../../core/wordCount";
import { novelWordsNow, seriesWordsNow } from "../../../core/wordTotals";
import { el, fill } from "../../kit/dom";
import { bringForward, openDialog } from "../../kit/dialog";
import type { AppModel } from "../../model";
import { debounced } from "../../overviews/refresh";
import { chapterNamer, sessionContext, sessionsInBook } from "../../sessionsContext";
import { dayHeatmap, dayLabel, heatScale, netLabel, weekHeatmap, weekLabel } from "./heatmap";
import { paceLabel, sessionsList } from "./sessionsList";

type Tab = "overview" | "stats";
type Sub = "days" | "weeks";

/** What the modal remembers until the app quits (Tweaks 3 §1.3): the tab, the sub-page and the chosen day or week. Nothing is stored. */
const remembered: { tab: Tab; sub: Sub; day: string | null; week: string | null } = { tab: "overview", sub: "days", day: null, week: null };

/**
 * A row of tabs (Tweaks 3 §1.3): each a proper tab to the screen reader, the arrow keys moving between them. `onChange` redraws; focus goes back to the chosen tab.
 */
function tabRow<T extends string>(label: string, items: readonly T[], current: T, onChange: (next: T) => void, cls: string): HTMLElement {
	const list = el("div", { class: cls, attrs: { role: "tablist", "aria-label": label } });
	for (const item of items) {
		const chosen = item === current;
		list.append(
			el("button", {
				class: `sf-history-tab${chosen ? " is-chosen" : ""}`,
				dataset: { tab: item },
				text: item,
				attrs: { type: "button", role: "tab", "aria-selected": String(chosen), tabindex: chosen ? "0" : "-1" },
				on: {
					click: () => onChange(item),
					keydown: (e) => {
						const move = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
						if (!move) return;
						e.preventDefault();
						onChange(items[(items.indexOf(item) + move + items.length) % items.length]);
					},
				},
			}),
		);
	}
	return list;
}

/** The word-count history (Tweaks 3 §1.3): two tabs, overview and stats (days and weeks), a fixed size. Read-only. */
export function openHistoryDialog(model: AppModel): void {
	if (bringForward("history")) return;
	const running = model.running;
	if (!running) return;
	const body = el("div", { class: "sf-history" });
	let generation = 0;
	let focusSelector: string | null = null; // what to put focus back on after a redraw
	let userMove = false; // a choice by the author starts the sessions pane at its top; a refresh from the data keeps its place

	const draw = async (): Promise<void> => {
		const mine = ++generation;
		const project = model.running?.opened.project;
		if (!project) return;
		const settings = model.running!.settings.values;
		const book = model.nav.book;
		let all: ProjectWordStats | null = null;
		let stats: BookWordStats | null = null;
		try {
			all = await getProjectWordStats(project);
			if (book) stats = await getBookWordStats(project, book);
		} catch {
			/* unreadable history shows what it can */
		}
		if (mine !== generation) return;
		if (!focusSelector && body.contains(document.activeElement)) {
			const a = document.activeElement as HTMLElement;
			if (a.dataset.date) focusSelector = `[data-date="${a.dataset.date}"]`;
			else if (a.dataset.week) focusSelector = `[data-week="${a.dataset.week}"]`;
			else if (a.dataset.tab) focusSelector = `.sf-history-tab[data-tab="${a.dataset.tab}"][aria-selected="true"]`;
		}
		// Scroll positions survive a redraw: the sessions pane and the heat maps' sideways scroll.
		const paneTop = userMove ? 0 : (body.querySelector<HTMLElement>(".sf-history-pane")?.scrollTop ?? 0);
		userMove = false;
		const heatLeft = body.querySelector<HTMLElement>(".sf-heat-scroll")?.scrollLeft ?? null;

		const today = todayISOInEngland();
		const sessions = sessionContext(model);
		const bookSessions = book && sessions ? sessionsInBook(sessions.read.sessions, book) : [];
		const excluded = book && sessions ? excludedByDay(sessions.read.sessions, sessions.settings, book) : {};
		// The maps start in the week of the earliest recorded word or session for the novel (a stored start date is the first choice once there is one).
		// A day with nothing recorded (no net change, no chapter changed) is not a record, so a stray empty entry never pads the map's left.
		const recorded = [...Object.entries(stats?.daily ?? {}).filter(([, e]) => e.net !== 0 || Object.values(e.chapters ?? {}).some((n) => n !== 0)).map(([d]) => d), ...bookSessions.map((r) => r.day)];
		const fromISO = heatmapStartMonday(today, recorded, book ? readBookFrontmatter(project, book)?.started : null);
		// "Words now" is the words on the page, from the index, at both levels (the series' is the sum of its novels' and never less than one).
		const nowNovel = book ? novelWordsNow(project, book) : 0;
		const nowSeries = seriesWordsNow(project);
		const days = stats ? adjustDayNets(dayNetsFromStats(stats, fromISO, today), excluded) : [];
		const weeks = weekNetsFromDayNets(days);
		const max = heatScale(days, weeks);
		const stat = (label: string, value: string): HTMLElement => el("div", { class: "sf-history-stat" }, el("span", { class: "sf-muted", text: label }), el("span", { text: value }));
		const standalone = settings.storyKind === "standalone";
		const seriesTitle = readSeriesFrontmatter(project).seriesTitle;
		const novelTitle = book ? numberedBookTitle(project, book, undefined, settings.seriesNumberingStyle) : "";

		const choose = (tab: Tab, sub?: Sub): void => {
			userMove = true;
			remembered.tab = tab;
			if (sub) remembered.sub = sub;
			focusSelector = `.sf-history-tab[data-tab="${sub ?? tab}"][aria-selected="true"]`;
			void draw();
		};
		const selectDay = (d: string): void => {
			userMove = true;
			remembered.day = d;
			focusSelector = `[data-date="${d}"]`;
			void draw();
		};
		const selectWeek = (w: string): void => {
			userMove = true;
			remembered.week = w;
			focusSelector = `[data-week="${w}"]`;
			void draw();
		};
		/** Clicking a day or a week on overview opens stats on that sub-page with it chosen. */
		const fromOverviewDay = (d: string): void => {
			userMove = true;
			remembered.day = d;
			remembered.tab = "stats";
			remembered.sub = "days";
			focusSelector = `[data-date="${d}"]`;
			void draw();
		};
		const fromOverviewWeek = (w: string): void => {
			userMove = true;
			remembered.week = w;
			remembered.tab = "stats";
			remembered.sub = "weeks";
			focusSelector = `[data-week="${w}"]`;
			void draw();
		};
		const heatCard = (...children: HTMLElement[]): HTMLElement => {
			const scroller = el("div", { class: "sf-heat-scroll" }, ...children);
			return el("div", { class: "sf-heat-card" }, scroller);
		};
		const unreadable =
			sessions && sessions.read.unreadable.length > 0
				? [el("div", { class: "sf-muted sf-history-note", attrs: { role: "note" }, text: `${sessions.read.unreadable.length === 1 ? "One session file" : `${sessions.read.unreadable.length} session files`} couldn't be read, so ${sessions.read.unreadable.length === 1 ? "its sessions are" : "their sessions are"} not shown: ${sessions.read.unreadable.map((p) => p.slice(p.lastIndexOf("/") + 1)).join(", ")}.` })]
				: [];

		let panel: HTMLElement;
		if (remembered.tab === "overview") {
			const parts: HTMLElement[] = [];
			const figures = (s: BookWordStats): HTMLElement => {
				const f = storytellingTodayAndWeek(s.todayNet, s.weekNet, excluded, today);
				const inRange = bookSessions.filter((r) => r.day >= fromISO && r.day <= today);
				const average = sessions ? averagePace(inRange, sessions.settings) : { wpm: null, sessions: 0 };
				const averageLabel = average.wpm === null ? "no sessions yet" : `${paceLabel(average.wpm)} (${average.sessions} ${average.sessions === 1 ? "session" : "sessions"})`;
				return el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(nowNovel)), stat("Today", netLabel(f.today)), stat("This week", netLabel(f.week)), stat("Average pace", averageLabel), stat("Written, ever", formatWordCount(s.lifetimeWritten)), stat("Removed, ever", formatWordCount(s.lifetimeRemoved)));
			};
			// A series shows its total under the series' name, then the novel's figures under its numbered title; a standalone project shows one summary.
			if (!standalone) parts.push(el("h3", { class: "sf-overview-sub", text: seriesTitle }), el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(nowSeries)), stat("Written, ever", formatWordCount(all?.lifetimeWritten ?? 0)), stat("Removed, ever", formatWordCount(all?.lifetimeRemoved ?? 0))));
			if (stats && book) {
				parts.push(el("h3", { class: "sf-overview-sub", text: novelTitle }), figures(stats));
				parts.push(
					el("h3", { class: "sf-overview-sub", text: "Days" }),
					heatCard(dayHeatmap({ days, maxAbs: max, selected: remembered.day, onSelect: fromOverviewDay })),
					el("h3", { class: "sf-overview-sub", text: "Weeks" }),
					heatCard(weekHeatmap({ weeks, maxAbs: max, selected: remembered.week, onSelect: fromOverviewWeek })),
					...unreadable,
				);
			} else parts.push(el("div", { class: "sf-muted", text: "Select a novel to see its days." }));
			panel = el("div", { class: "sf-history-panel sf-history-pane", attrs: { role: "tabpanel", "aria-label": "overview" } }, ...parts);
		} else {
			const subTabs = tabRow("stats", ["days", "weeks"] as const, remembered.sub, (s) => choose("stats", s), "sf-history-subtabs");
			let top: HTMLElement;
			const pane = el("div", { class: "sf-history-pane", attrs: { "aria-live": "polite" } });
			if (!stats || !book) {
				top = el("div", { class: "sf-muted", text: "Select a novel to see its days." });
			} else if (remembered.sub === "days") {
				top = heatCard(dayHeatmap({ days, maxAbs: max, selected: remembered.day, onSelect: selectDay }));
				const sel = remembered.day;
				if (!sel) pane.append(el("div", { class: "sf-muted", text: "Choose a day to see its chapters and sessions." }));
				else {
					const entry = stats.daily[sel];
					const rows = Object.entries(entry?.chapters ?? {}).filter(([, n]) => n !== 0);
					const dayFigure = days.find((d) => d.date === sel)?.net ?? entry?.net ?? 0;
					pane.append(el("h3", { class: "sf-overview-sub", text: dayLabel(sel, dayFigure) }));
					if (rows.length === 0) pane.append(el("div", { class: "sf-muted", text: "No chapter changed that day." }));
					const chapters = getBookChapters(project, book);
					const names = [...chapters.ordered, ...chapters.unplaced].map((c) => c.name);
					const numbered = applyHashNumbering(names.map((f) => chapterDisplayTitle(project, book, f)), settings.chapterNumberingStyle ?? "none");
					const live = new Set(chapters.ordered.map((c) => c.name));
					for (const [file, n] of rows) {
						const exists = live.has(file) || project.exists(libraryChapterPath(book, file));
						pane.append(el("div", { class: "sf-history-chapter" }, el("span", { class: exists ? "" : "sf-muted", text: exists ? (names.includes(file) ? numbered[names.indexOf(file)] : chapterDisplayTitle(project, book, file)) : file }), el("span", { text: netLabel(n) })));
					}
					const left = excluded[sel] ?? 0;
					if (left !== 0) pane.append(el("div", { class: "sf-muted sf-history-note", text: `${formatWordCount(Math.abs(left))} words ${left < 0 ? "lost" : "written"} in editing or unreliable sessions are left out of the figure above.` }));
					if (sessions) {
						const nameOf = chapterNamer(project, settings.chapterNumberingStyle ?? "none");
						pane.append(el("h3", { class: "sf-overview-sub", text: "Sessions" }), sessionsList(bookSessions.filter((r) => r.day === sel), sessions.settings, (r) => r.chapters.map((c) => nameOf(c).text)));
					}
				}
			} else {
				top = heatCard(weekHeatmap({ weeks, maxAbs: max, selected: remembered.week, onSelect: selectWeek }));
				const sel = remembered.week;
				if (!sel) pane.append(el("div", { class: "sf-muted", text: "Choose a week to see its sessions." }));
				else {
					const week = weeks.find((w) => w.weekStart === sel);
					pane.append(el("h3", { class: "sf-overview-sub", text: weekLabel(sel, week?.net ?? 0) }));
					if (sessions) {
						const nameOf = chapterNamer(project, settings.chapterNumberingStyle ?? "none");
						const end = addDaysISO(sel, 6);
						const inWeek = bookSessions.filter((r) => r.day >= sel && r.day <= end);
						const byDay = new Map<string, SessionRecord[]>();
						for (const r of inWeek) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
						if (byDay.size === 0) pane.append(el("div", { class: "sf-muted", text: "No sessions this week." }));
						for (const day of [...byDay.keys()].sort()) {
							const date = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
							pane.append(el("h4", { class: "sf-history-day-head", text: date }), sessionsList(byDay.get(day)!, sessions.settings, (r) => r.chapters.map((c) => nameOf(c).text)));
						}
					}
				}
			}
			const note = el("div", { class: "sf-muted sf-history-note", text: "Days, weeks and today leave out editing sessions and sessions with large pastes. Chapter and novel counts count every word." });
			panel = el("div", { class: "sf-history-panel", attrs: { role: "tabpanel", "aria-label": "stats" } }, subTabs, top, pane, note, ...unreadable);
		}
		fill(body, tabRow("Word count history", ["overview", "stats"] as const, remembered.tab, (t) => choose(t), "sf-history-tabs"), panel);
		// The heat maps open at the latest weeks (the end of their sideways scroll), then keep their place across redraws.
		for (const scroller of body.querySelectorAll<HTMLElement>(".sf-heat-scroll")) scroller.scrollLeft = heatLeft === null ? scroller.scrollWidth : heatLeft;
		for (const pane of body.querySelectorAll<HTMLElement>(".sf-history-pane")) pane.scrollTop = paneTop;
		const refocus = focusSelector;
		focusSelector = null;
		if (refocus) body.querySelector<HTMLElement>(refocus)?.focus();
	};

	const refresh = debounced(() => void draw());
	const offs = [model.subscribe(["stats", "library", "project", "sessions"], refresh), () => refresh.cancel()];
	openDialog({ title: "Word count history", key: "history", body, buttons: [{ label: "Close", kind: "primary" }], onClose: () => offs.forEach((o) => o()) });
	void draw();
}
