import { chapterDisplayTitle, getBookChapters } from "../../../core/book";
import { dayNetsFromStats, defaultHeatmapRange, getBookWordStats, getProjectWordStats, weekNetsFromDayNets, type BookWordStats, type ProjectWordStats } from "../../../core/history";
import { todayISOInEngland } from "../../../core/historyMath";
import { adjustDayNets, averagePace, excludedByDay, storytellingTodayAndWeek } from "../../../core/sessionFigures";
import { libraryChapterPath } from "../../../core/paths";
import { applyHashNumbering } from "../../../core/titleNumbering";
import { formatWordCount } from "../../../core/wordCount";
import { el, fill } from "../../kit/dom";
import { openDialog } from "../../kit/dialog";
import type { AppModel } from "../../model";
import { debounced } from "../../overviews/refresh";
import { chapterNamer, sessionContext, sessionsInBook } from "../../sessionsContext";
import { dayHeatmap, dayLabel, heatScale, netLabel, weekHeatmap } from "./heatmap";
import { paceLabel, sessionsList } from "./sessionsList";

/** The word-count history: series total, this novel's summary, day and week heatmaps, and a day's chapters. Read-only. */
export function openHistoryDialog(model: AppModel): void {
	const running = model.running;
	if (!running) return;
	const body = el("div", { class: "sf-history" });
	let selected: string | null = null;
	let generation = 0;
	let focusDate: string | null = null;

	const draw = async (): Promise<void> => {
		const mine = ++generation;
		const project = model.running?.opened.project;
		if (!project) return;
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
		const active = body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.date : undefined;
		const today = todayISOInEngland();
		const { fromISO, toISO } = defaultHeatmapRange(today);
		// The storytelling figures: the history's own days, less the words of editing and unreliable sessions (docs/sessions.md §7).
		const sessions = sessionContext(model);
		const bookSessions = book && sessions ? sessionsInBook(sessions.read.sessions, book) : [];
		const excluded = book && sessions ? excludedByDay(sessions.read.sessions, sessions.settings, book) : {};
		const days = stats ? adjustDayNets(dayNetsFromStats(stats, fromISO, toISO), excluded) : [];
		const weeks = weekNetsFromDayNets(days);
		const max = heatScale(days, weeks);
		const stat = (label: string, value: string): HTMLElement => el("div", { class: "sf-history-stat" }, el("span", { class: "sf-muted", text: label }), el("span", { text: value }));
		const parts: (HTMLElement | null)[] = [
			el("h3", { class: "sf-overview-sub", text: "All novels" }),
			el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(all?.current ?? 0)), stat("Written, ever", formatWordCount(all?.lifetimeWritten ?? 0)), stat("Removed, ever", formatWordCount(all?.lifetimeRemoved ?? 0))),
		];
		if (stats && book) {
			const figures = storytellingTodayAndWeek(stats.todayNet, stats.weekNet, excluded, today);
			const inRange = bookSessions.filter((r) => r.day >= fromISO && r.day <= toISO);
			const average = sessions ? averagePace(inRange, sessions.settings) : { wpm: null, sessions: 0 };
			const averageLabel = average.wpm === null ? "no sessions yet" : `${paceLabel(average.wpm)} (${average.sessions} ${average.sessions === 1 ? "session" : "sessions"})`;
			parts.push(
				el("h3", { class: "sf-overview-sub", text: "This novel" }),
				el("div", { class: "sf-history-stats" }, stat("Words now", formatWordCount(stats.current)), stat("Today", netLabel(figures.today)), stat("This week", netLabel(figures.week)), stat("Average pace", averageLabel), stat("Written, ever", formatWordCount(stats.lifetimeWritten)), stat("Removed, ever", formatWordCount(stats.lifetimeRemoved))),
				el("h3", { class: "sf-overview-sub", text: "Days" }),
				dayHeatmap({ days, maxAbs: max, selected, onSelect: (d) => ((selected = d), (focusDate = d), void draw()) }),
				el("h3", { class: "sf-overview-sub", text: "Weeks" }),
				weekHeatmap(weeks, max),
				el("div", { class: "sf-muted sf-history-note", text: "Days, weeks and today leave out editing sessions and sessions with large pastes. Chapter and novel counts count every word." }),
				...(sessions && sessions.read.unreadable.length > 0 ? [el("div", { class: "sf-muted sf-history-note", attrs: { role: "note" }, text: `${sessions.read.unreadable.length === 1 ? "One session file" : `${sessions.read.unreadable.length} session files`} couldn't be read, so ${sessions.read.unreadable.length === 1 ? "its sessions are" : "their sessions are"} not shown: ${sessions.read.unreadable.map((p) => p.slice(p.lastIndexOf("/") + 1)).join(", ")}.` })] : []),
			);
			if (selected) {
				const entry = stats.daily[selected];
				const rows = Object.entries(entry?.chapters ?? {}).filter(([, n]) => n !== 0);
				const dayFigure = days.find((d) => d.date === selected)?.net ?? entry?.net ?? 0;
				const detail = el("div", { class: "sf-history-day", attrs: { "aria-live": "polite" } }, el("h3", { class: "sf-overview-sub", text: dayLabel(selected, dayFigure) }));
				if (rows.length === 0) detail.append(el("div", { class: "sf-muted", text: "No chapter changed that day." }));
				const chapters = getBookChapters(project, book);
				const names = [...chapters.ordered, ...chapters.unplaced].map((c) => c.name);
				const numbered = applyHashNumbering(names.map((f) => chapterDisplayTitle(project, book, f)), model.running?.settings.values.chapterNumberingStyle ?? "none");
				const live = new Set(chapters.ordered.map((c) => c.name));
				for (const [file, n] of rows) {
					const exists = live.has(file) || project.exists(libraryChapterPath(book, file));
					detail.append(el("div", { class: "sf-history-chapter" }, el("span", { class: exists ? "" : "sf-muted", text: exists ? (names.includes(file) ? numbered[names.indexOf(file)] : chapterDisplayTitle(project, book, file)) : file }), el("span", { text: netLabel(n) })));
				}
				const left = excluded[selected] ?? 0;
				if (left !== 0) detail.append(el("div", { class: "sf-muted sf-history-note", text: `${formatWordCount(Math.abs(left))} words ${left < 0 ? "lost" : "written"} in editing or unreliable sessions are left out of the figure above.` }));
				if (sessions) {
					const nameOf = chapterNamer(project, model.running?.settings.values.chapterNumberingStyle ?? "none");
					const day = bookSessions.filter((r) => r.day === selected);
					detail.append(el("h3", { class: "sf-overview-sub", text: "Sessions" }), sessionsList(day, sessions.settings, (r) => r.chapters.map((c) => nameOf(c).text)));
				}
				parts.push(detail);
			}
		} else parts.push(el("div", { class: "sf-muted", text: "Select a novel to see its days." }));
		fill(body, ...parts);
		const refocus = focusDate ?? active;
		focusDate = null;
		if (refocus) body.querySelector<HTMLElement>(`[data-date="${refocus}"]`)?.focus();
	};

	const refresh = debounced(() => void draw());
	const offs = [model.subscribe(["stats", "library", "project", "sessions"], refresh), () => refresh.cancel()];
	openDialog({ title: "Word count history", body, buttons: [{ label: "Close", kind: "primary" }], onClose: () => offs.forEach((o) => o()) });
	void draw();
}
